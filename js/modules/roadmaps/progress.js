(() => {
  'use strict';

  const CUSTOM_KEY = 'qol_roadmap_profiles_v1';
  const ASSIGNMENT_PREFIX = 'qol_roadmap_assignments_v1';
  const PANEL_ID = 'qol-roadmap-runner';
  const STABLE_VERSION = 1;

  let wrappedRoadmaps = false;
  let wrappedRunner = false;
  let syncTimer = null;
  let syncQueued = false;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed == null ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('[APES Roadmaps Stable IDs] Save failed.', error);
      return false;
    }
  }

  function newStepId() {
    const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12)
      || Math.random().toString(36).slice(2, 14);
    return `step_${Date.now().toString(36)}_${random}`;
  }

  function builtinStepId(roadmapId, index) {
    return `builtin_${String(roadmapId).replace(/[^a-z0-9_-]/gi, '_')}_${index + 1}`;
  }

  function ensureCustomStepIds() {
    const custom = readJson(CUSTOM_KEY, {});
    if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return false;
    let changed = false;

    Object.values(custom).forEach(roadmap => {
      if (!Array.isArray(roadmap?.steps)) return;
      const seen = new Set();
      roadmap.steps.forEach(step => {
        if (!step || typeof step !== 'object') return;
        let id = clean(step.id);
        if (!id || seen.has(id)) {
          id = newStepId();
          step.id = id;
          changed = true;
        }
        seen.add(id);
      });
    });

    if (changed) writeJson(CUSTOM_KEY, custom);
    return changed;
  }

  function installRoadmapWrapper() {
    if (wrappedRoadmaps) return true;
    const base = window.APES?.roadmaps;
    if (!base || typeof base.getAllRoadmaps !== 'function') return false;
    if (base.__stableIdsWrapped) {
      wrappedRoadmaps = true;
      return true;
    }

    const baseGetAll = base.getAllRoadmaps.bind(base);
    const getAllRoadmaps = () => {
      ensureCustomStepIds();
      const all = baseGetAll() || {};
      const rawCustom = readJson(CUSTOM_KEY, {});

      Object.entries(all).forEach(([roadmapId, roadmap]) => {
        if (!Array.isArray(roadmap?.steps)) return;
        const rawSteps = Array.isArray(rawCustom?.[roadmapId]?.steps) ? rawCustom[roadmapId].steps : null;
        roadmap.steps = roadmap.steps.map((step, index) => ({
          ...step,
          id: clean(rawSteps?.[index]?.id) || clean(step?.id) || builtinStepId(roadmapId, index)
        }));
      });

      return all;
    };

    window.APES.roadmaps = Object.freeze({
      ...base,
      __stableIdsWrapped: true,
      getAllRoadmaps
    });
    wrappedRoadmaps = true;
    return true;
  }

  function routeSignature(roadmap) {
    return Array.isArray(roadmap?.steps) ? roadmap.steps.map(step => clean(step?.id)).join('|') : '';
  }

  function numericSignature(slot) {
    const currentStep = Math.max(0, Number(slot?.currentStep) || 0);
    const skipped = Array.isArray(slot?.skipped)
      ? slot.skipped.map(Number).filter(Number.isInteger).sort((a, b) => a - b)
      : [];
    return `${currentStep}|${skipped.join(',')}`;
  }

  function deriveStableFromNumeric(slot, roadmap) {
    const steps = Array.isArray(roadmap?.steps) ? roadmap.steps : [];
    const total = steps.length;
    const current = Math.max(0, Math.min(total, Number(slot?.currentStep) || 0));
    const skippedIndexes = new Set(
      Array.isArray(slot?.skipped)
        ? slot.skipped.map(Number).filter(index => Number.isInteger(index) && index >= 0 && index < current)
        : []
    );

    const completedIds = [];
    const skippedIds = [];
    for (let index = 0; index < current; index += 1) {
      const id = clean(steps[index]?.id);
      if (!id) continue;
      if (skippedIndexes.has(index)) skippedIds.push(id);
      else completedIds.push(id);
    }

    slot.stableVersion = STABLE_VERSION;
    slot.completedStepIds = completedIds;
    slot.skippedStepIds = skippedIds;
    slot.currentStepId = clean(steps[current]?.id);
  }

  function reindexFromStable(slot, roadmap) {
    const steps = Array.isArray(roadmap?.steps) ? roadmap.steps : [];
    const validIds = new Set(steps.map(step => clean(step?.id)).filter(Boolean));
    const completed = new Set(
      Array.isArray(slot?.completedStepIds)
        ? slot.completedStepIds.map(clean).filter(id => id && validIds.has(id))
        : []
    );
    const skipped = new Set(
      Array.isArray(slot?.skippedStepIds)
        ? slot.skippedStepIds.map(clean).filter(id => id && validIds.has(id))
        : []
    );

    skipped.forEach(id => completed.delete(id));
    slot.completedStepIds = [...completed];
    slot.skippedStepIds = [...skipped];

    let current = steps.findIndex(step => {
      const id = clean(step?.id);
      return id && !completed.has(id) && !skipped.has(id);
    });
    if (current < 0) current = steps.length;

    slot.currentStep = current;
    slot.currentStepId = clean(steps[current]?.id);
    slot.skipped = steps
      .map((step, index) => skipped.has(clean(step?.id)) ? index : -1)
      .filter(index => index >= 0)
      .sort((a, b) => a - b);
  }

  function syncSlot(slot, roadmap) {
    if (!slot || typeof slot !== 'object' || !roadmap) return false;
    const before = JSON.stringify(slot);
    const routeSig = routeSignature(roadmap);
    const numSig = numericSignature(slot);

    if (Number(slot.stableVersion) !== STABLE_VERSION) {
      deriveStableFromNumeric(slot, roadmap);
    } else if (clean(slot._stableRouteSignature) !== routeSig) {
      reindexFromStable(slot, roadmap);
    } else if (clean(slot._stableNumericSignature) !== numSig) {
      deriveStableFromNumeric(slot, roadmap);
    } else {
      reindexFromStable(slot, roadmap);
    }

    slot._stableRouteSignature = routeSig;
    slot._stableNumericSignature = numericSignature(slot);
    return before !== JSON.stringify(slot);
  }

  function assignmentStorageKeys() {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${ASSIGNMENT_PREFIX}:`)) keys.push(key);
    }
    return keys;
  }

  function migrateLegacyAll(state, key) {
    if (state?.defaultAssignment?.scope !== 'all') return false;
    const roadmapId = clean(state.defaultAssignment.roadmapId);
    state.defaultAssignment.scope = 'every';
    state.defaultAssignment.detection = state.defaultAssignment.detection === 'manual' ? 'manual' : 'automatic';

    const ctx = window.APES?.context?.snapshot?.() || {};
    const expectedKey = /^\d+$/.test(String(ctx.playerId || ''))
      ? `${ASSIGNMENT_PREFIX}:${clean(ctx.server || location.hostname.toLowerCase())}:${clean(ctx.playerId)}`
      : '';
    const villageId = clean(ctx.villageId);
    const shared = state.progress?.shared?.[roadmapId];
    if (key === expectedKey && /^\d+$/.test(villageId) && shared) {
      state.progress = state.progress || { shared: {}, villages: {} };
      state.progress.villages = state.progress.villages || {};
      state.progress.villages[villageId] = state.progress.villages[villageId] || {};
      if (!state.progress.villages[villageId][roadmapId]) {
        state.progress.villages[villageId][roadmapId] = JSON.parse(JSON.stringify(shared));
      }
    }
    return true;
  }

  function syncAllProgress() {
    syncQueued = false;
    if (!installRoadmapWrapper()) return;
    ensureCustomStepIds();
    const roadmaps = window.APES.roadmaps.getAllRoadmaps();
    let anyChanged = false;

    assignmentStorageKeys().forEach(key => {
      const state = readJson(key, {});
      if (!state || typeof state !== 'object' || Array.isArray(state)) return;
      let changed = migrateLegacyAll(state, key);

      const shared = state.progress?.shared;
      if (shared && typeof shared === 'object') {
        Object.entries(shared).forEach(([roadmapId, slot]) => {
          if (roadmaps[roadmapId] && syncSlot(slot, roadmaps[roadmapId])) changed = true;
        });
      }

      const villages = state.progress?.villages;
      if (villages && typeof villages === 'object') {
        Object.values(villages).forEach(byRoadmap => {
          if (!byRoadmap || typeof byRoadmap !== 'object') return;
          Object.entries(byRoadmap).forEach(([roadmapId, slot]) => {
            if (roadmaps[roadmapId] && syncSlot(slot, roadmaps[roadmapId])) changed = true;
          });
        });
      }

      if (changed && writeJson(key, state)) anyChanged = true;
    });

    if (anyChanged) window.APES?.roadmapsRunner?.refresh?.();
  }

  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(syncAllProgress);
  }

  function rawRuntime() {
    const runner = window.APES?.roadmapsRunner;
    return runner?.getRawContextState?.() || runner?.getContextState?.() || null;
  }

  function runtimeStorageKey(runtime) {
    const server = clean(runtime?.ctx?.server);
    const playerId = clean(runtime?.ctx?.playerId);
    if (!server || !/^\d+$/.test(playerId)) return '';
    return `${ASSIGNMENT_PREFIX}:${server}:${playerId}`;
  }

  function runtimeSlot(runtime, create = false) {
    const { state, assignment } = runtime || {};
    if (!state || !assignment) return null;
    state.progress = state.progress || { shared: {}, villages: {} };
    state.progress.villages = state.progress.villages || {};
    const villageId = clean(assignment.villageId || runtime.ctx?.villageId);
    if (!/^\d+$/.test(villageId)) return null;
    if (create && !state.progress.villages[villageId]) state.progress.villages[villageId] = {};
    if (create && !state.progress.villages[villageId][assignment.roadmapId]) {
      state.progress.villages[villageId][assignment.roadmapId] = { currentStep: 0, skipped: [] };
    }
    return state.progress.villages[villageId]?.[assignment.roadmapId] || null;
  }

  function saveRuntime(runtime) {
    const key = runtimeStorageKey(runtime);
    return key ? writeJson(key, runtime.state) : false;
  }

  function performRunnerAction(action) {
    const runtime = rawRuntime();
    if (!runtime?.roadmap || !runtime?.assignment) return false;
    const slot = runtimeSlot(runtime, true);
    if (!slot) return false;
    syncSlot(slot, runtime.roadmap);

    const steps = runtime.roadmap.steps || [];
    const current = Math.max(0, Math.min(steps.length, Number(slot.currentStep) || 0));
    const completed = new Set(Array.isArray(slot.completedStepIds) ? slot.completedStepIds.map(clean).filter(Boolean) : []);
    const skipped = new Set(Array.isArray(slot.skippedStepIds) ? slot.skippedStepIds.map(clean).filter(Boolean) : []);

    if (action === 'complete' || action === 'skip') {
      if (current >= steps.length) return false;
      const id = clean(steps[current]?.id);
      if (!id) return false;
      if (action === 'skip') {
        skipped.add(id);
        completed.delete(id);
      } else {
        completed.add(id);
        skipped.delete(id);
      }
    } else if (action === 'back') {
      if (current <= 0) return false;
      const previousId = clean(steps[current - 1]?.id);
      completed.delete(previousId);
      skipped.delete(previousId);
    } else if (action === 'restart') {
      const name = clean(runtime.roadmap.name) || 'this roadmap';
      if (!window.confirm(`Restart “${name}” from Step 1?`)) return true;
      completed.clear();
      skipped.clear();
    } else {
      return false;
    }

    slot.stableVersion = STABLE_VERSION;
    slot.completedStepIds = [...completed];
    slot.skippedStepIds = [...skipped];
    reindexFromStable(slot, runtime.roadmap);
    slot._stableRouteSignature = routeSignature(runtime.roadmap);
    slot._stableNumericSignature = numericSignature(slot);

    if (!saveRuntime(runtime)) return true;
    window.APES?.roadmapsRunner?.refresh?.();
    window.APES?.roadmapsRunnerControls?.refresh?.();
    return true;
  }

  function detectionMode(runtime = rawRuntime()) {
    if (!runtime?.assignment || !runtime?.state) return 'automatic';
    if (runtime.assignment.scope === 'village') {
      const villageId = clean(runtime.assignment.villageId || runtime.ctx?.villageId);
      return runtime.state.villages?.[villageId]?.detection === 'manual' ? 'manual' : 'automatic';
    }
    return runtime.state.defaultAssignment?.detection === 'manual' ? 'manual' : 'automatic';
  }

  function installRunnerWrapper() {
    if (wrappedRunner) return true;
    const base = window.APES?.roadmapsRunner;
    if (!base || typeof base.getContextState !== 'function') return false;
    if (base.__stableIdsWrapped) {
      wrappedRunner = true;
      return true;
    }

    const rawGet = base.getContextState.bind(base);
    const getContextState = () => {
      const runtime = rawGet();
      if (!runtime?.assignment) return runtime;
      const mode = detectionMode(runtime);
      const result = { ...runtime, assignment: { ...runtime.assignment, detection: mode } };

      if (mode === 'manual' && runtime.roadmap && runtime.progress) {
        const index = Math.max(0, Number(runtime.progress.currentStep) || 0);
        if (index < runtime.roadmap.steps.length) {
          const steps = [...runtime.roadmap.steps];
          const current = steps[index] || {};
          steps[index] = { ...current, type: 'manual' };
          result.roadmap = { ...runtime.roadmap, steps };
        }
      }
      return result;
    };

    window.APES.roadmapsRunner = Object.freeze({
      ...base,
      __stableIdsWrapped: true,
      getRawContextState: rawGet,
      getContextState
    });
    wrappedRunner = true;
    return true;
  }

  function interceptRunnerAction(event) {
    const control = event.target.closest?.(`#${PANEL_ID} [data-rmr-action], #${PANEL_ID} [data-action]`);
    if (!control || control.classList.contains('disabled')) return;
    const action = clean(control.getAttribute('data-rmr-action') || control.getAttribute('data-action'));
    if (!['complete', 'skip', 'back', 'restart'].includes(action)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    performRunnerAction(action);
  }

  function init() {
    installRoadmapWrapper();
    ensureCustomStepIds();
    syncAllProgress();

    document.addEventListener('click', interceptRunnerAction, true);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      interceptRunnerAction(event);
    }, true);

    const observer = new MutationObserver(() => {
      installRoadmapWrapper();
      installRunnerWrapper();
      scheduleSync();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    syncTimer = setInterval(() => {
      installRoadmapWrapper();
      installRunnerWrapper();
      syncAllProgress();
    }, 500);

    window.APES = window.APES || {};
    window.APES.roadmapsStableIds = Object.freeze({
      newStepId,
      ensure: ensureCustomStepIds,
      syncNow: syncAllProgress,
      perform: performRunnerAction,
      getDetectionMode: detectionMode
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
