(() => {
  'use strict';

  const CUSTOM_KEY = 'qol_roadmap_profiles_v1';
  const SELECTED_KEY = 'qol_roadmap_selected_v1';
  const ASSIGNMENT_PREFIX = 'qol_roadmap_assignments_v1';
  const HUB_ID = 'qol-roadmaps-container';
  const RUNNER_ID = 'qol-roadmap-runner';
  const PANEL_ID = 'qol-resource-upgrade-planner-overlay';
  const IMPORT_BUTTON_SELECTOR = '[data-rup-import-roadmap]';
  const UI_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_UI';
  const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
  const REQUEST_TYPE = 'REQUEST_SNAPSHOT';
  const RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';
  const REQUIRED_CONFIRMATIONS = 2;
  const STYLE_ID = 'qol-roadmap-resource-planner-import-styles';

  const RESOURCE_TYPES = Object.freeze({ wood: 1, clay: 2, iron: 3, crop: 4 });
  const RESOURCE_LABELS = Object.freeze({ wood: 'Wood', clay: 'Clay', iron: 'Iron', crop: 'Crop' });
  const PRODUCTION_BUILDINGS = Object.freeze({
    sawmill: { label: 'Sawmill', id: 5 },
    brickyard: { label: 'Brickyard', id: 6 },
    foundry: { label: 'Iron Foundry', id: 7 },
    mill: { label: 'Grain Mill', id: 8 },
    bakery: { label: 'Bakery', id: 9 }
  });

  let previousAutoComplete = null;
  let confirmationKey = '';
  let confirmationCount = 0;
  let queued = false;
  let completing = false;
  let importing = false;

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
      console.warn('[APES Roadmaps Planner Import] Save failed.', error);
      return false;
    }
  }

  function parseImportedFieldText(text) {
    const value = clean(text);
    let match = value.match(/^(Wood|Clay|Iron|Crop)\s+Fields\s*:\s*(\d+)\s*\/\s*(\d+)\s*(?:→|->)\s*Level\s*(\d+)$/i);
    if (match) {
      const resource = match[1].toLowerCase();
      const requiredCount = Number(match[2]);
      const totalCount = Number(match[3]);
      const level = Number(match[4]);
      if (!RESOURCE_TYPES[resource] || !Number.isInteger(requiredCount) || requiredCount < 1 || !Number.isInteger(totalCount) || totalCount < requiredCount || !Number.isInteger(level) || level < 1 || level > 20) return null;
      return {
        mode: 'count',
        resource,
        resourceLabel: RESOURCE_LABELS[resource],
        typeId: RESOURCE_TYPES[resource],
        requiredCount,
        totalCount,
        level
      };
    }

    // Compatibility with Roadmaps imported by APES QoL 2.0.0.95.
    match = value.match(/^(Wood|Clay|Iron|Crop)\s+Field\s+#(\d+)\s*(?:→|->)\s*Level\s*(\d+)$/i);
    if (!match) return null;
    const resource = match[1].toLowerCase();
    const fieldNumber = Number(match[2]);
    const level = Number(match[3]);
    if (!RESOURCE_TYPES[resource] || !Number.isInteger(fieldNumber) || fieldNumber < 1 || !Number.isInteger(level) || level < 1 || level > 20) return null;
    return {
      mode: 'exact',
      resource,
      resourceLabel: RESOURCE_LABELS[resource],
      typeId: RESOURCE_TYPES[resource],
      fieldNumber,
      index: fieldNumber - 1,
      level
    };
  }

  function selectedId() {
    try { return clean(localStorage.getItem(SELECTED_KEY)); }
    catch (_) { return ''; }
  }

  function selectedRawRoadmap() {
    const custom = readJson(CUSTOM_KEY, {});
    return custom && typeof custom === 'object' && !Array.isArray(custom) ? custom[selectedId()] || null : null;
  }

  function runtime() {
    return window.APES?.roadmapsRunner?.getContextState?.() || window.APES?.roadmapsRunner?.getRawContextState?.() || null;
  }

  function currentImportedResource() {
    const rt = runtime();
    if (!rt?.roadmap || !rt?.progress || !Array.isArray(rt.roadmap.steps)) return null;
    const index = Math.max(0, Number(rt.progress.currentStep) || 0);
    const step = rt.roadmap.steps[index];
    if (!step || step.type !== 'instruction') return null;
    const info = parseImportedFieldText(step.text);
    return info ? { rt, index, step, info } : null;
  }

  function storageKey(ctx) {
    const server = clean(ctx?.server);
    const playerId = clean(ctx?.playerId);
    if (!server || !/^\d+$/.test(playerId)) return '';
    return `${ASSIGNMENT_PREFIX}:${server}:${playerId}`;
  }

  function progressSlot(rt, create = false) {
    const { state, assignment } = rt || {};
    if (!state || !assignment) return null;
    state.progress = state.progress || { shared: {}, villages: {} };
    state.progress.shared = state.progress.shared || {};
    state.progress.villages = state.progress.villages || {};

    if (assignment.scope === 'all') {
      if (create && !state.progress.shared[assignment.roadmapId]) state.progress.shared[assignment.roadmapId] = { currentStep: 0, skipped: [] };
      return state.progress.shared[assignment.roadmapId] || null;
    }

    const villageId = clean(assignment.villageId || rt.ctx?.villageId);
    if (!/^\d+$/.test(villageId)) return null;
    if (create && !state.progress.villages[villageId]) state.progress.villages[villageId] = {};
    if (create && !state.progress.villages[villageId][assignment.roadmapId]) state.progress.villages[villageId][assignment.roadmapId] = { currentStep: 0, skipped: [] };
    return state.progress.villages[villageId]?.[assignment.roadmapId] || null;
  }

  function resetConfirmation() {
    confirmationKey = '';
    confirmationCount = 0;
  }

  function detectionNode() {
    const card = document.querySelector(`#${RUNNER_ID} .qol-rmr-step-card`);
    if (!card) return null;
    let node = card.querySelector('.qol-rmpi-detection');
    if (!node) {
      node = document.createElement('div');
      node.className = 'qol-rmpi-detection waiting';
      card.appendChild(node);
    }
    return node;
  }

  function renderDetection(text, tone = 'waiting') {
    const node = detectionNode();
    if (!node) return;
    node.className = `qol-rmpi-detection ${tone}`;
    node.textContent = text;
  }

  function completeCurrent(current) {
    if (completing) return false;
    const rt = current?.rt;
    const slot = progressSlot(rt, true);
    const total = Array.isArray(rt?.roadmap?.steps) ? rt.roadmap.steps.length : 0;
    if (!slot || current.index >= total) return false;
    const stored = Math.max(0, Math.min(total, Number(slot.currentStep) || 0));
    if (stored !== current.index) return false;

    completing = true;
    try {
      const skipped = new Set(Array.isArray(slot.skipped) ? slot.skipped.map(Number) : []);
      skipped.delete(stored);
      slot.skipped = [...skipped].filter(index => Number.isInteger(index) && index >= 0 && index < total).sort((a, b) => a - b);
      slot.currentStep = stored + 1;
      const key = storageKey(rt.ctx);
      if (!key || !writeJson(key, rt.state)) return false;
      resetConfirmation();
      window.APES?.roadmapsRunner?.refresh?.();
      window.APES?.roadmapsRunnerControls?.refresh?.();
      setTimeout(checkNow, 120);
      return true;
    } finally {
      completing = false;
    }
  }

  function checkNow() {
    const current = currentImportedResource();
    if (!current) {
      resetConfirmation();
      previousAutoComplete?.checkNow?.();
      scheduleEnhance();
      return;
    }
    enhanceRunner();
    window.postMessage({ source: UI_SOURCE, type: REQUEST_TYPE }, location.origin);
  }

  function onSnapshot(event) {
    if (event.source !== window) return;
    if (event.data?.source !== BRIDGE_SOURCE || event.data?.type !== RESPONSE_TYPE) return;
    const current = currentImportedResource();
    if (!current) return;

    const villageId = clean(current.rt.ctx?.villageId);
    if (!/^\d+$/.test(villageId)) return;
    const villages = Array.isArray(event.data?.payload?.villages) ? event.data.payload.villages : [];
    const village = villages.find(item => String(item?.villageId) === villageId);
    if (!village) {
      resetConfirmation();
      renderDetection('Waiting for live village data…', 'waiting');
      return;
    }

    const matches = (Array.isArray(village.buildings) ? village.buildings : [])
      .filter(building => Number(building?.buildingType) === current.info.typeId)
      .sort((a, b) => Number(a?.locationId || 0) - Number(b?.locationId || 0));

    if (current.info.mode === 'count') {
      if (matches.length < current.info.totalCount) {
        resetConfirmation();
        renderDetection(`Loading ${current.info.resourceLabel.toLowerCase()} fields… ${matches.length}/${current.info.totalCount} detected`, 'waiting');
        return;
      }

      const atTarget = matches.filter(field => Math.max(0, Number(field?.lvl) || 0) >= current.info.level).length;
      if (atTarget < current.info.requiredCount) {
        resetConfirmation();
        renderDetection(`${atTarget}/${current.info.totalCount} at Lv ${current.info.level}+ · needs ${current.info.requiredCount}/${current.info.totalCount}`, 'waiting');
        return;
      }

      const key = `${current.rt.ctx?.server}|${current.rt.ctx?.playerId}|${villageId}|${current.rt.assignment?.roadmapId}|${current.index}|count|${current.info.typeId}|${current.info.requiredCount}|${current.info.totalCount}|${current.info.level}`;
      if (confirmationKey === key) confirmationCount += 1;
      else { confirmationKey = key; confirmationCount = 1; }

      if (confirmationCount < REQUIRED_CONFIRMATIONS) {
        renderDetection(`${atTarget}/${current.info.totalCount} at Lv ${current.info.level}+ · confirming…`, 'confirming');
        return;
      }

      renderDetection(`${atTarget}/${current.info.totalCount} at Lv ${current.info.level}+ · complete`, 'complete');
      completeCurrent(current);
      return;
    }

    // Legacy exact-field behavior for roadmaps already imported in 2.0.0.95.
    const field = matches[current.info.index];
    if (!field) {
      resetConfirmation();
      renderDetection(`${current.info.resourceLabel} Field #${current.info.fieldNumber} has not been detected yet.`, 'waiting');
      return;
    }
    const currentLevel = Math.max(0, Number(field?.lvl) || 0);
    if (currentLevel < current.info.level) {
      resetConfirmation();
      renderDetection(`${current.info.resourceLabel} Field #${current.info.fieldNumber} Lv ${currentLevel} · needs Lv ${current.info.level}`, 'waiting');
      return;
    }
    const key = `${current.rt.ctx?.server}|${current.rt.ctx?.playerId}|${villageId}|${current.rt.assignment?.roadmapId}|${current.index}|exact|${current.info.typeId}|${current.info.index}|${current.info.level}`;
    if (confirmationKey === key) confirmationCount += 1;
    else { confirmationKey = key; confirmationCount = 1; }
    if (confirmationCount < REQUIRED_CONFIRMATIONS) {
      renderDetection(`${current.info.resourceLabel} field reached Lv ${current.info.level} · confirming…`, 'confirming');
      return;
    }
    renderDetection(`${current.info.resourceLabel} field reached Lv ${current.info.level} · complete`, 'complete');
    completeCurrent(current);
  }

  function currentVillageIdentity() {
    const contextName = clean(window.APES?.context?.getVillageName?.());
    const domName = clean(document.querySelector('.currentVillageName .dropdownHead .selectedItem .villageEntry, #villageList .dropdownHead .selectedItem .villageEntry')?.textContent);
    const villageName = contextName && contextName !== 'Unknown village' ? contextName : domName || 'Village';
    const hashId = String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
    const contextId = clean(window.APES?.context?.getVillageId?.());
    return { villageName, villageId: /^\d+$/.test(hashId || contextId) ? (hashId || contextId) : '' };
  }

  function newStepId() {
    return window.APES?.roadmapsStableIds?.newStepId?.() || `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function newRoadmapId() {
    return `custom_resources_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function checkpointStep(villageName) {
    return {
      id: newStepId(),
      type: 'instruction',
      text: `[Checkpoint] This Roadmap was made for ${villageName} - Make sure you're at the right village before starting`
    };
  }

  function importedBuildingStep(row) {
    const meta = PRODUCTION_BUILDINGS[String(row?.building || '')];
    if (!meta) return null;
    return {
      id: newStepId(),
      type: 'building',
      building: meta.label,
      buildingId: meta.id,
      level: Math.max(1, Number(row?.toLevel) || 1),
      exact: true
    };
  }

  function resourceCountStep(row, simulatedFields) {
    const resource = String(row?.resource || '').toLowerCase();
    const label = RESOURCE_LABELS[resource];
    const fieldIndex = Number(row?.index);
    const level = Number(row?.toLevel);
    const levels = simulatedFields?.[resource];
    if (!label || !Array.isArray(levels) || !levels.length || !Number.isInteger(fieldIndex) || fieldIndex < 0 || fieldIndex >= levels.length || !Number.isInteger(level) || level < 1) return null;

    // The optimizer may care which internal field it picked, but the player does not.
    // Apply that recommendation to the simulated state, then express the objective as
    // a count. Any field of the same resource type may satisfy the roadmap step.
    levels[fieldIndex] = level;
    const requiredCount = levels.filter(value => Number(value) >= level).length;
    return {
      id: newStepId(),
      type: 'instruction',
      text: `${label} Fields: ${requiredCount}/${levels.length} → Level ${level}`
    };
  }

  function showImportToast(message, tone = 'success') {
    document.querySelector('.qol-rup-import-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `qol-rup-import-toast ${tone}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  async function importCountBasedRoadmap(button) {
    if (importing) return;
    importing = true;
    try {
      const planner = window.APES_RESOURCE_UPGRADE_PLANNER;
      if (!planner?.calculate || !planner?.getState) {
        showImportToast('Resource Upgrade Planner data is unavailable.', 'error');
        return;
      }

      let plan;
      let plannerState;
      try {
        plan = planner.calculate();
        plannerState = planner.getState();
      } catch (error) {
        showImportToast(error?.message || 'Could not calculate the current resource plan.', 'error');
        return;
      }

      const selectedSteps = Math.max(1, Math.min(100, Number.parseInt(plannerState?.steps, 10) || 15));
      const rows = Array.isArray(plan?.results) ? plan.results.slice(0, selectedSteps) : [];
      if (!rows.length) {
        showImportToast('Calculate a resource plan before importing it.', 'error');
        return;
      }

      const simulatedFields = {};
      for (const resource of Object.keys(RESOURCE_TYPES)) {
        simulatedFields[resource] = Array.isArray(plannerState?.fields?.[resource]) ? plannerState.fields[resource].map(value => Math.max(0, Number(value) || 0)) : [];
      }

      const imported = [];
      for (const row of rows) {
        const step = row?.kind === 'building' ? importedBuildingStep(row) : resourceCountStep(row, simulatedFields);
        if (step) imported.push(step);
      }
      if (!imported.length) {
        showImportToast('No compatible resource steps were available to import.', 'error');
        return;
      }

      const identity = currentVillageIdentity();
      const villageName = identity.villageName || 'Village';
      const roadmapId = newRoadmapId();
      const custom = readJson(CUSTOM_KEY, {});
      const roadmaps = custom && typeof custom === 'object' && !Array.isArray(custom) ? custom : {};
      const roadmapName = `${villageName} ${selectedSteps} Steps Resources Roadmap`;
      roadmaps[roadmapId] = {
        name: roadmapName,
        description: `Imported from APES Resource Upgrade Planner for ${villageName}. ${imported.length} calculated upgrades plus a starting checkpoint. Resource-field objectives are count based, so any matching field can satisfy each step.`,
        steps: [checkpointStep(villageName), ...imported]
      };

      if (!writeJson(CUSTOM_KEY, roadmaps)) {
        showImportToast('Could not save the imported Roadmap.', 'error');
        return;
      }

      try { localStorage.setItem(SELECTED_KEY, roadmapId); } catch (_) {}
      window.APES?.roadmapsStableIds?.syncNow?.();
      window.APES?.roadmaps?.refresh?.();
      window.APES?.roadmapsEditor?.enhance?.();
      window.dispatchEvent(new CustomEvent('apes_roadmap_imported', {
        detail: { roadmapId, villageId: identity.villageId, villageName, selectedSteps, importedSteps: imported.length, fieldTracking: 'count' }
      }));

      if (button) {
        const original = button.textContent;
        button.textContent = 'Imported ✓';
        button.classList.add('success');
        setTimeout(() => {
          if (!button.isConnected) return;
          button.textContent = original;
          button.classList.remove('success');
        }, 1800);
      }
      showImportToast(`Imported “${roadmapName}”.`);
    } finally {
      importing = false;
    }
  }

  function interceptPlannerImport(event) {
    const button = event.target?.closest?.(IMPORT_BUTTON_SELECTOR);
    if (!button || !document.getElementById(PANEL_ID)?.contains(button)) return;
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void importCountBasedRoadmap(button);
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${RUNNER_ID}.qol-rmpi-current .qol-rmac-detection,#${RUNNER_ID}.qol-rmpi-current .qol-rmrf-detection{display:none!important}
      #${RUNNER_ID} .qol-rmpi-detection{margin-top:7px!important;padding:6px 8px!important;border:1px solid #cbbd9f!important;border-radius:4px!important;background:#f4eee2!important;color:#725f48!important;font-size:8.5px!important;font-weight:700!important}
      #${RUNNER_ID} .qol-rmpi-detection.confirming{border-color:#cfaa59!important;background:#fff3d8!important;color:#8b6418!important}
      #${RUNNER_ID} .qol-rmpi-detection.complete{border-color:#91ac73!important;background:#edf5e5!important;color:#4d6d2d!important}
      #${HUB_ID} .qol-rmpi-resource-row .qol-rm-step-type.resource{border-color:#9cae7e!important;background:#edf3df!important;color:#4e6928!important}
    `;
    document.head.appendChild(style);
  }

  function enhanceHub() {
    const hub = document.getElementById(HUB_ID);
    const roadmap = selectedRawRoadmap();
    if (!hub || !Array.isArray(roadmap?.steps)) return;

    hub.querySelectorAll('.qol-rm-route .qol-rm-step').forEach((row, index) => {
      const step = roadmap.steps[index];
      const info = step?.type === 'instruction' ? parseImportedFieldText(step.text) : null;
      if (!info) return;
      row.classList.add('qol-rmpi-resource-row');
      const badge = row.querySelector('.qol-rm-step-type');
      if (badge) {
        badge.textContent = 'Resource';
        badge.classList.remove('instruction', 'building', 'checkpoint');
        badge.classList.add('resource');
      }
    });

    const summary = hub.querySelector('.qol-rm-summary');
    if (summary) {
      const spans = summary.querySelectorAll(':scope > span');
      if (spans.length >= 4) {
        const groupParser = window.APES?.roadmapsResourceFields?.parse;
        const total = roadmap.steps.length;
        const buildings = roadmap.steps.filter(step => step?.type === 'building').length;
        const resources = roadmap.steps.filter(step => step?.type === 'instruction' && (parseImportedFieldText(step.text) || groupParser?.(step.text))).length;
        const instructions = Math.max(0, total - buildings - resources);
        spans[0].innerHTML = `<strong>${total}</strong>Total steps`;
        spans[1].innerHTML = `<strong>${buildings}</strong>Building steps`;
        spans[2].innerHTML = `<strong>${resources}</strong>Resource steps`;
        spans[3].innerHTML = `<strong>${instructions}</strong>Instructions`;
      }
    }
  }

  function enhanceRunner() {
    const panel = document.getElementById(RUNNER_ID);
    if (!panel) return;
    const current = currentImportedResource();
    panel.classList.toggle('qol-rmpi-current', Boolean(current));
    if (!current) {
      panel.querySelector('.qol-rmpi-detection')?.remove();
      return;
    }

    const type = panel.querySelector('.qol-rmr-type');
    if (type) {
      type.textContent = 'Resource Field';
      type.classList.remove('building', 'checkpoint');
      type.classList.add('resource');
    }
    const stepText = panel.querySelector('.qol-rmr-step-text');
    if (stepText) {
      stepText.textContent = current.info.mode === 'count'
        ? `${current.info.requiredCount}/${current.info.totalCount} ${current.info.resourceLabel} Fields → Level ${current.info.level}`
        : `${current.info.resourceLabel} Field #${current.info.fieldNumber} → Level ${current.info.level}`;
    }
    if (!panel.querySelector('.qol-rmpi-detection')) {
      renderDetection(current.info.mode === 'count' ? 'Counting matching resource fields…' : 'Checking legacy exact resource field…', 'waiting');
    }
  }

  function scheduleEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhanceHub();
      enhanceRunner();
    });
  }

  function wrapAutoComplete() {
    const current = window.APES?.roadmapsAutoComplete;
    if (!current || current.__resourcePlannerCountWrapped) return Boolean(current);
    previousAutoComplete = current;
    window.APES = window.APES || {};
    window.APES.roadmapsAutoComplete = Object.freeze({
      __resourceFieldsWrapped: true,
      __resourcePlannerExactWrapped: true,
      __resourcePlannerCountWrapped: true,
      checkNow,
      reset: () => {
        resetConfirmation();
        previousAutoComplete?.reset?.();
      }
    });
    return true;
  }

  function init() {
    injectStyles();
    document.addEventListener('click', interceptPlannerImport, true);
    document.addEventListener('keydown', interceptPlannerImport, true);
    window.addEventListener('message', onSnapshot);
    window.addEventListener('hashchange', () => {
      resetConfirmation();
      setTimeout(checkNow, 150);
    });
    window.addEventListener('apes_roadmap_imported', () => setTimeout(scheduleEnhance, 0));

    const observer = new MutationObserver(() => {
      wrapAutoComplete();
      scheduleEnhance();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    wrapAutoComplete();
    scheduleEnhance();
    setInterval(() => {
      wrapAutoComplete();
      if (currentImportedResource()) checkNow();
      scheduleEnhance();
    }, 2500);

    window.APES = window.APES || {};
    window.APES.roadmapsResourcePlannerImports = Object.freeze({
      parse: parseImportedFieldText,
      checkNow
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();