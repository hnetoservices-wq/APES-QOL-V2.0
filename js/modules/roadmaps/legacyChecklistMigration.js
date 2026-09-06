(() => {
  'use strict';

  const VERSION = 1;
  const CHECKLIST_CUSTOM_KEY = 'qol_custom_checklists';
  const CHECKLIST_PROGRESS_KEY = 'qol_checklist_progress';
  const CHECKLIST_SELECTED_KEY = 'qol_checklist_selected';
  const ROADMAP_CUSTOM_KEY = 'qol_roadmap_profiles_v1';
  const ROADMAP_SELECTED_KEY = 'qol_roadmap_selected_v1';
  const ASSIGNMENT_PREFIX = 'qol_roadmap_assignments_v1';
  const MIGRATION_KEY = 'qol_roadmap_checklist_migration_v1';

  const BUILTIN_TARGETS = Object.freeze({
    x3_speedsettle: 'x3_speedsettle',
    x1_support_500cp: 'x1_support_500cp'
  });

  let seedQueued = false;

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
      console.warn('[APES Roadmaps Legacy Migration] Could not save data.', error);
      return false;
    }
  }

  function objectValue(value, fallback = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
  }

  function sanitizeIndices(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(Number).filter(index => Number.isInteger(index) && index >= 0))]
      .sort((a, b) => a - b);
  }

  function hashText(value) {
    let hash = 0x811c9dc5;
    const text = String(value ?? '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
  }

  function roadmapIdFor(checklistId) {
    return `migrated_checklist_${hashText(checklistId)}`;
  }

  function stepIdFor(checklistId, index) {
    return `legacy_checklist_${hashText(checklistId)}_${index + 1}`;
  }

  function registry() {
    const stored = objectValue(readJson(MIGRATION_KEY, {}));
    return {
      version: VERSION,
      customMap: objectValue(stored.customMap),
      progress: objectValue(stored.progress),
      sourceNames: objectValue(stored.sourceNames),
      migratedAt: Number(stored.migratedAt) || 0,
      completedAt: Number(stored.completedAt) || 0,
      status: clean(stored.status) || 'pending'
    };
  }

  function normalizeChecklist(value, fallbackName = 'Migrated Checklist') {
    const source = objectValue(value);
    return {
      name: clean(source.name) || fallbackName,
      description: clean(source.pretext || source.description),
      steps: Array.isArray(source.steps) ? source.steps.map(clean).filter(Boolean) : []
    };
  }

  function uniqueTargetId(checklistId, customRoadmaps, migration) {
    const mapped = clean(migration.customMap[checklistId]);
    if (mapped) return mapped;
    const base = roadmapIdFor(checklistId);
    let candidate = base;
    let suffix = 2;
    while (customRoadmaps[candidate]) {
      if (clean(customRoadmaps[candidate]?.migrationSourceChecklistId) === checklistId) break;
      candidate = `${base}_${suffix++}`;
    }
    return candidate;
  }

  function targetFor(checklistId, customChecklists, migration) {
    if (Object.prototype.hasOwnProperty.call(customChecklists, checklistId)) {
      return clean(migration.customMap[checklistId]);
    }
    return BUILTIN_TARGETS[checklistId] || '';
  }

  function migrateOnce() {
    const previous = registry();
    if (previous.status === 'complete' && Number(previous.version) >= VERSION) return previous;

    const customChecklists = objectValue(readJson(CHECKLIST_CUSTOM_KEY, {}));
    const oldProgress = objectValue(readJson(CHECKLIST_PROGRESS_KEY, {}));
    const customRoadmaps = objectValue(readJson(ROADMAP_CUSTOM_KEY, {}));
    let roadmapsChanged = false;

    Object.entries(customChecklists).forEach(([checklistId, raw]) => {
      const checklist = normalizeChecklist(raw);
      const targetId = uniqueTargetId(checklistId, customRoadmaps, previous);
      previous.customMap[checklistId] = targetId;
      previous.sourceNames[checklistId] = checklist.name;

      if (!customRoadmaps[targetId]) {
        customRoadmaps[targetId] = {
          name: checklist.name,
          description: checklist.description,
          steps: checklist.steps.map((text, index) => ({
            id: stepIdFor(checklistId, index),
            type: 'instruction',
            text
          })),
          migrationSourceChecklistId: checklistId,
          migrationVersion: VERSION,
          migratedFrom: 'APES Checklists'
        };
        roadmapsChanged = true;
      }

      if (!Array.isArray(previous.progress[targetId])) previous.progress[targetId] = [];
    });

    Object.entries(oldProgress).forEach(([checklistId, indices]) => {
      const targetId = targetFor(checklistId, customChecklists, previous);
      if (targetId) previous.progress[targetId] = sanitizeIndices(indices);
    });

    if (roadmapsChanged && !writeJson(ROADMAP_CUSTOM_KEY, customRoadmaps)) return previous;

    try {
      if (!clean(localStorage.getItem(ROADMAP_SELECTED_KEY))) {
        const oldSelected = clean(localStorage.getItem(CHECKLIST_SELECTED_KEY));
        const selectedTarget = targetFor(oldSelected, customChecklists, previous);
        if (selectedTarget) localStorage.setItem(ROADMAP_SELECTED_KEY, selectedTarget);
      }
    } catch (_) {}

    previous.migratedAt = previous.migratedAt || Date.now();
    previous.completedAt = Date.now();
    previous.status = 'complete';
    writeJson(MIGRATION_KEY, previous);

    window.APES?.roadmapsStableIds?.ensure?.();
    window.APES?.roadmapsStableIds?.syncNow?.();
    window.APES?.roadmaps?.refresh?.();
    return previous;
  }

  function rawRuntime() {
    const runner = window.APES?.roadmapsRunner;
    return runner?.getRawContextState?.() || runner?.getContextState?.() || null;
  }

  function progressSlot(runtime, create = false) {
    const { state, assignment } = runtime || {};
    if (!state || !assignment) return null;
    state.progress = state.progress || { shared: {}, villages: {} };
    state.progress.shared = state.progress.shared || {};
    state.progress.villages = state.progress.villages || {};

    if (assignment.scope === 'all') {
      if (create && !state.progress.shared[assignment.roadmapId]) {
        state.progress.shared[assignment.roadmapId] = { currentStep: 0, skipped: [] };
      }
      return state.progress.shared[assignment.roadmapId] || null;
    }

    const villageId = clean(assignment.villageId || runtime.ctx?.villageId);
    if (!/^\d+$/.test(villageId)) return null;
    if (create && !state.progress.villages[villageId]) state.progress.villages[villageId] = {};
    if (create && !state.progress.villages[villageId][assignment.roadmapId]) {
      state.progress.villages[villageId][assignment.roadmapId] = { currentStep: 0, skipped: [] };
    }
    return state.progress.villages[villageId]?.[assignment.roadmapId] || null;
  }

  function hasRoadmapProgress(slot) {
    if (!slot || typeof slot !== 'object') return false;
    return (Number(slot.currentStep) || 0) > 0
      || (Array.isArray(slot.skipped) && slot.skipped.length > 0)
      || (Array.isArray(slot.completedStepIds) && slot.completedStepIds.length > 0)
      || (Array.isArray(slot.skippedStepIds) && slot.skippedStepIds.length > 0);
  }

  function saveRuntime(runtime) {
    const server = clean(runtime?.ctx?.server);
    const playerId = clean(runtime?.ctx?.playerId);
    if (!server || !/^\d+$/.test(playerId) || !runtime?.state) return false;
    return writeJson(`${ASSIGNMENT_PREFIX}:${server}:${playerId}`, runtime.state);
  }

  function seedCurrentAssignment() {
    seedQueued = false;
    const runtime = rawRuntime();
    if (!runtime?.assignment || !runtime?.roadmap || !runtime?.state) return false;

    const migration = registry();
    const roadmapId = clean(runtime.assignment.roadmapId);
    if (!Object.prototype.hasOwnProperty.call(migration.progress, roadmapId)) return false;

    const slot = progressSlot(runtime, true);
    if (!slot || Number(slot.legacyChecklistSeededVersion) >= VERSION) return false;

    if (hasRoadmapProgress(slot)) {
      slot.legacyChecklistSeededVersion = VERSION;
      slot.legacyChecklistSeedSkipped = true;
    } else {
      const steps = Array.isArray(runtime.roadmap.steps) ? runtime.roadmap.steps : [];
      const completedIndices = sanitizeIndices(migration.progress[roadmapId]).filter(index => index < steps.length);
      const completedStepIds = completedIndices.map(index => clean(steps[index]?.id)).filter(Boolean);
      const completedSet = new Set(completedStepIds);
      let currentStep = steps.findIndex(step => !completedSet.has(clean(step?.id)));
      if (currentStep < 0) currentStep = steps.length;

      slot.stableVersion = 1;
      slot.completedStepIds = completedStepIds;
      slot.skippedStepIds = [];
      slot.currentStep = currentStep;
      slot.currentStepId = clean(steps[currentStep]?.id);
      slot.skipped = [];
      slot.legacyChecklistSeededVersion = VERSION;
      slot.legacyChecklistCompletedCount = completedStepIds.length;
    }

    if (!saveRuntime(runtime)) return false;
    window.APES?.roadmapsStableIds?.syncNow?.();
    window.APES?.roadmapsRunner?.refresh?.();
    window.APES?.roadmapsRunnerControls?.refresh?.();
    return true;
  }

  function scheduleSeed(delay = 0) {
    if (delay > 0) {
      setTimeout(() => scheduleSeed(), delay);
      return;
    }
    if (seedQueued) return;
    seedQueued = true;
    requestAnimationFrame(seedCurrentAssignment);
  }

  function relevantControl(target) {
    return target?.closest?.('[data-rma-load],[data-load],[data-rma-open],[data-rmr-action="hub"],[data-action="hub"]');
  }

  function init() {
    migrateOnce();

    window.addEventListener('hashchange', () => scheduleSeed(120));
    document.addEventListener('click', event => {
      if (relevantControl(event.target)) scheduleSeed(120);
    }, true);
    document.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && relevantControl(event.target)) scheduleSeed(120);
    }, true);

    scheduleSeed(250);
    scheduleSeed(900);

    window.APES = window.APES || {};
    window.APES.roadmapsLegacyChecklistMigration = Object.freeze({
      version: VERSION,
      migrateNow: migrateOnce,
      seedNow: seedCurrentAssignment,
      getStatus: registry
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
