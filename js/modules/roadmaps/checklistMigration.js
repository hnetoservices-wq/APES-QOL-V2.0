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

  let seedTimer = null;
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
      console.warn('[APES Roadmaps Checklist Migration] Could not save data.', error);
      return false;
    }
  }

  function objectValue(value, fallback = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
  }

  function normalizeChecklist(value, fallbackName = 'Untitled Checklist') {
    const source = objectValue(value);
    return {
      name: clean(source.name) || fallbackName,
      description: clean(source.pretext || source.description),
      steps: Array.isArray(source.steps) ? source.steps.map(clean).filter(Boolean) : []
    };
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

  function migratedRoadmapId(checklistId) {
    return `migrated_checklist_${hashText(checklistId)}`;
  }

  function migratedStepId(checklistId, index) {
    return `legacy_checklist_${hashText(checklistId)}_${index + 1}`;
  }

  function migrationRegistry() {
    const stored = objectValue(readJson(MIGRATION_KEY, {}));
    return {
      version: VERSION,
      customMap: objectValue(stored.customMap),
      progress: objectValue(stored.progress),
      sourceNames: objectValue(stored.sourceNames),
      migratedAt: Number(stored.migratedAt) || 0,
      lastSyncedAt: Number(stored.lastSyncedAt) || 0,
      status: clean(stored.status) || 'migration-ready'
    };
  }

  function sourceForTarget(registry, targetId) {
    return Object.entries(registry.customMap).find(([, mapped]) => mapped === targetId)?.[0] || '';
  }

  function targetForChecklistId(checklistId, customChecklists, registry) {
    if (Object.prototype.hasOwnProperty.call(customChecklists, checklistId)) {
      return clean(registry.customMap[checklistId]);
    }
    return BUILTIN_TARGETS[checklistId] || '';
  }

  function uniqueTargetId(checklistId, customRoadmaps, registry) {
    const mapped = clean(registry.customMap[checklistId]);
    if (mapped) return mapped;

    const base = migratedRoadmapId(checklistId);
    let candidate = base;
    let suffix = 2;
    while (customRoadmaps[candidate]) {
      const existingSource = clean(customRoadmaps[candidate]?.migrationSourceChecklistId);
      if (existingSource === checklistId) break;
      candidate = `${base}_${suffix++}`;
    }
    return candidate;
  }

  function migrateChecklistData() {
    const customChecklists = objectValue(readJson(CHECKLIST_CUSTOM_KEY, {}));
    const checklistProgress = objectValue(readJson(CHECKLIST_PROGRESS_KEY, {}));
    const customRoadmaps = objectValue(readJson(ROADMAP_CUSTOM_KEY, {}));
    const registry = migrationRegistry();
    let roadmapsChanged = false;

    Object.entries(customChecklists).forEach(([checklistId, rawChecklist]) => {
      const checklist = normalizeChecklist(rawChecklist, 'Migrated Checklist');
      const targetId = uniqueTargetId(checklistId, customRoadmaps, registry);
      registry.customMap[checklistId] = targetId;
      registry.sourceNames[checklistId] = checklist.name;

      if (!customRoadmaps[targetId]) {
        customRoadmaps[targetId] = {
          name: checklist.name,
          description: checklist.description,
          steps: checklist.steps.map((text, index) => ({
            id: migratedStepId(checklistId, index),
            type: 'instruction',
            text
          })),
          migrationSourceChecklistId: checklistId,
          migrationVersion: VERSION,
          migratedFrom: 'APES Checklists'
        };
        roadmapsChanged = true;
      }
    });

    Object.entries(checklistProgress).forEach(([checklistId, indices]) => {
      const targetId = targetForChecklistId(checklistId, customChecklists, registry);
      if (!targetId) return;
      registry.progress[targetId] = sanitizeIndices(indices);
      if (!registry.sourceNames[checklistId]) registry.sourceNames[checklistId] = checklistId;
    });

    // Keep an explicit empty progress entry for migrated custom checklists too. This
    // lets the seeding layer know that the migration has been considered even when
    // the old checklist had no checked tasks.
    Object.keys(customChecklists).forEach(checklistId => {
      const targetId = registry.customMap[checklistId];
      if (targetId && !Array.isArray(registry.progress[targetId])) registry.progress[targetId] = [];
    });

    registry.migratedAt = registry.migratedAt || Date.now();
    registry.lastSyncedAt = Date.now();
    registry.status = 'ready-for-retirement-verification';

    if (roadmapsChanged && !writeJson(ROADMAP_CUSTOM_KEY, customRoadmaps)) return false;
    if (!writeJson(MIGRATION_KEY, registry)) return false;

    // Preserve the old selection only when Roadmaps has never had its own selection.
    try {
      if (!clean(localStorage.getItem(ROADMAP_SELECTED_KEY))) {
        const oldSelected = clean(localStorage.getItem(CHECKLIST_SELECTED_KEY));
        const target = targetForChecklistId(oldSelected, customChecklists, registry);
        if (target) localStorage.setItem(ROADMAP_SELECTED_KEY, target);
      }
    } catch (_) {}

    window.APES?.roadmapsStableIds?.ensure?.();
    window.APES?.roadmapsStableIds?.syncNow?.();
    window.APES?.roadmaps?.refresh?.();
    return true;
  }

  function rawRuntime() {
    const runner = window.APES?.roadmapsRunner;
    return runner?.getRawContextState?.() || runner?.getContextState?.() || null;
  }

  function accountStorageKey(runtime) {
    const server = clean(runtime?.ctx?.server);
    const playerId = clean(runtime?.ctx?.playerId);
    if (!server || !/^\d+$/.test(playerId)) return '';
    return `${ASSIGNMENT_PREFIX}:${server}:${playerId}`;
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

  function slotHasRoadmapProgress(slot) {
    if (!slot || typeof slot !== 'object') return false;
    if ((Number(slot.currentStep) || 0) > 0) return true;
    if (Array.isArray(slot.skipped) && slot.skipped.length) return true;
    if (Array.isArray(slot.completedStepIds) && slot.completedStepIds.length) return true;
    if (Array.isArray(slot.skippedStepIds) && slot.skippedStepIds.length) return true;
    return false;
  }

  function seedCurrentAssignment() {
    seedQueued = false;
    const runtime = rawRuntime();
    if (!runtime?.assignment || !runtime?.roadmap || !runtime?.state) return false;

    const registry = migrationRegistry();
    const roadmapId = clean(runtime.assignment.roadmapId);
    if (!Object.prototype.hasOwnProperty.call(registry.progress, roadmapId)) return false;

    const slot = progressSlot(runtime, true);
    if (!slot || Number(slot.legacyChecklistSeededVersion) >= VERSION) return false;

    // Existing Roadmap work always wins. The migration never rewinds or replaces it.
    if (slotHasRoadmapProgress(slot)) {
      slot.legacyChecklistSeededVersion = VERSION;
      slot.legacyChecklistSeedSkipped = true;
    } else {
      const steps = Array.isArray(runtime.roadmap.steps) ? runtime.roadmap.steps : [];
      const completedIndices = sanitizeIndices(registry.progress[roadmapId]).filter(index => index < steps.length);
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
      slot.legacyChecklistSource = sourceForTarget(registry, roadmapId) || roadmapId;
      slot.legacyChecklistCompletedCount = completedStepIds.length;
    }

    const key = accountStorageKey(runtime);
    if (!key || !writeJson(key, runtime.state)) return false;
    window.APES?.roadmapsStableIds?.syncNow?.();
    window.APES?.roadmapsRunner?.refresh?.();
    window.APES?.roadmapsRunnerControls?.refresh?.();
    return true;
  }

  function scheduleSeed() {
    if (seedQueued) return;
    seedQueued = true;
    requestAnimationFrame(seedCurrentAssignment);
  }

  function init() {
    migrateChecklistData();

    const observer = new MutationObserver(scheduleSeed);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('hashchange', scheduleSeed);

    seedTimer = setInterval(() => {
      migrateChecklistData();
      seedCurrentAssignment();
    }, 1500);

    setTimeout(scheduleSeed, 250);
    setTimeout(scheduleSeed, 900);

    window.APES = window.APES || {};
    window.APES.roadmapsChecklistMigration = Object.freeze({
      version: VERSION,
      migrateNow: migrateChecklistData,
      seedNow: seedCurrentAssignment,
      getStatus: migrationRegistry
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
