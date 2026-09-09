(() => {
  'use strict';

  const CUSTOM_KEY = 'qol_roadmap_profiles_v1';
  const ASSIGNMENT_PREFIX = 'qol_roadmap_assignments_v1';
  const ROADMAP_DIALOG_ID = 'qol-roadmaps-dialog-layer';
  const ASSIGN_DIALOG_ID = 'qol-roadmap-assignment-dialog';

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function clone(value) {
    try { return JSON.parse(JSON.stringify(value)); }
    catch (_) { return null; }
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
      console.warn('[APES Roadmaps Progress Isolation] Save failed.', error);
      return false;
    }
  }

  function rawCustom() {
    const value = readJson(CUSTOM_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function contextSnapshot() {
    const source = window.APES?.context?.snapshot?.() || {};
    const server = clean(source.server || location.hostname.toLowerCase());
    const playerId = clean(source.playerId);
    return { server, playerId };
  }

  function assignmentKey() {
    const ctx = contextSnapshot();
    if (!ctx.server || !/^\d+$/.test(ctx.playerId)) return '';
    return `${ASSIGNMENT_PREFIX}:${ctx.server}:${ctx.playerId}`;
  }

  function mergeStepMetadata(beforeStep, afterStep) {
    if (!beforeStep || typeof beforeStep !== 'object' || !afterStep || typeof afterStep !== 'object') return afterStep;
    // Keep structural edits made by the current operation, while restoring metadata
    // that older Roadmaps normalization code does not know about (stable IDs,
    // comments, exact-step flags and future extension metadata).
    return { ...beforeStep, ...afterStep };
  }

  function restoreSurvivingRoadmapMetadata(beforeCustom) {
    if (!beforeCustom || typeof beforeCustom !== 'object') return false;
    const afterCustom = rawCustom();
    let changed = false;

    Object.entries(afterCustom).forEach(([roadmapId, afterRoadmap]) => {
      const beforeRoadmap = beforeCustom[roadmapId];
      if (!beforeRoadmap || !Array.isArray(beforeRoadmap.steps) || !Array.isArray(afterRoadmap?.steps)) return;

      const mergedSteps = afterRoadmap.steps.map((step, index) => {
        const previous = beforeRoadmap.steps[index];
        if (!previous) return step;
        const merged = mergeStepMetadata(previous, step);
        if (JSON.stringify(merged) !== JSON.stringify(step)) changed = true;
        return merged;
      });

      if (changed) afterRoadmap.steps = mergedSteps;
    });

    if (!changed) return false;
    if (!writeJson(CUSTOM_KEY, afterCustom)) return false;
    window.APES?.roadmapsStableIds?.syncNow?.();
    requestAnimationFrame(() => {
      window.APES?.roadmaps?.refresh?.();
      window.APES?.roadmapsEditor?.enhance?.();
    });
    return true;
  }

  function mergeProgressPreservingExisting(beforeState, afterState) {
    if (!beforeState || typeof beforeState !== 'object' || !afterState || typeof afterState !== 'object') return afterState;

    const merged = afterState;
    merged.progress = merged.progress && typeof merged.progress === 'object'
      ? merged.progress
      : { shared: {}, villages: {} };
    merged.progress.shared = merged.progress.shared && typeof merged.progress.shared === 'object'
      ? merged.progress.shared
      : {};
    merged.progress.villages = merged.progress.villages && typeof merged.progress.villages === 'object'
      ? merged.progress.villages
      : {};

    const oldShared = beforeState.progress?.shared;
    if (oldShared && typeof oldShared === 'object') {
      Object.entries(oldShared).forEach(([roadmapId, slot]) => {
        // Existing progress always wins. Loading a Roadmap is an assignment action,
        // not a restart action.
        merged.progress.shared[roadmapId] = clone(slot) || slot;
      });
    }

    const oldVillages = beforeState.progress?.villages;
    if (oldVillages && typeof oldVillages === 'object') {
      Object.entries(oldVillages).forEach(([villageId, byRoadmap]) => {
        if (!byRoadmap || typeof byRoadmap !== 'object') return;
        if (!merged.progress.villages[villageId] || typeof merged.progress.villages[villageId] !== 'object') {
          merged.progress.villages[villageId] = {};
        }
        Object.entries(byRoadmap).forEach(([roadmapId, slot]) => {
          merged.progress.villages[villageId][roadmapId] = clone(slot) || slot;
        });
      });
    }

    return merged;
  }

  function protectRoadmapMutation(event) {
    const confirm = event.target.closest?.(`#${ROADMAP_DIALOG_ID} [data-rm-confirm]`);
    if (!confirm) return;

    const beforeCustom = clone(rawCustom());
    if (!beforeCustom) return;

    // Queue before the base handler runs. It executes after the full click event,
    // but before the next render/sync frame can regenerate stable IDs.
    queueMicrotask(() => restoreSurvivingRoadmapMetadata(beforeCustom));
  }

  function protectRoadmapLoad(event) {
    const load = event.target.closest?.(`#${ASSIGN_DIALOG_ID} [data-load]`);
    if (!load) return;

    const key = assignmentKey();
    if (!key) return;
    const beforeState = clone(readJson(key, {}));
    if (!beforeState) return;

    queueMicrotask(() => {
      const afterState = readJson(key, {});
      if (!afterState || typeof afterState !== 'object' || Array.isArray(afterState)) return;
      const merged = mergeProgressPreservingExisting(beforeState, afterState);
      if (!writeJson(key, merged)) return;
      window.APES?.roadmapsStableIds?.syncNow?.();
      window.APES?.roadmapsRunner?.refresh?.();
      window.APES?.roadmapsRunnerControls?.refresh?.();
    });
  }

  function init() {
    // This module intentionally loads immediately after roadmaps.js so these
    // capture listeners run before later Roadmaps assignment/editor interceptors.
    document.addEventListener('click', protectRoadmapMutation, true);
    document.addEventListener('click', protectRoadmapLoad, true);
    document.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      protectRoadmapMutation(event);
      protectRoadmapLoad(event);
    }, true);

    window.APES = window.APES || {};
    window.APES.roadmapsProgressIsolation = Object.freeze({
      restoreMetadata: restoreSurvivingRoadmapMetadata,
      preserveProgress: mergeProgressPreservingExisting
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
