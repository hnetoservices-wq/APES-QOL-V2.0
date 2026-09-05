(() => {
  'use strict';

  const UI_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_UI';
  const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
  const REQUEST_TYPE = 'REQUEST_SNAPSHOT';
  const RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';
  const STORAGE_PREFIX = 'qol_roadmap_assignments_v1';
  const CHECK_INTERVAL_MS = 2500;
  const REQUIRED_CONFIRMATIONS = 2;
  const PANEL_ID = 'qol-roadmap-runner';

  const BUILDING_TYPES = Object.freeze({
    'sawmill': 5,
    'brickyard': 6,
    'iron foundry': 7,
    'grain mill': 8,
    'bakery': 9,
    'warehouse': 10,
    'granary': 11,
    'smithy': 12,
    'tournament square': 14,
    'main building': 15,
    'rally point': 16,
    'marketplace': 17,
    'embassy': 18,
    'barracks': 19,
    'stable': 20,
    'workshop': 21,
    'academy': 22,
    'town hall': 24,
    'residence': 25,
    'palace': 26,
    'treasury': 27,
    'trade office': 28,
    'great barracks': 29,
    'great stable': 30,
    'stonemason': 34,
    'brewery': 35,
    'trapper': 36,
    "hero's mansion": 37,
    'great warehouse': 38,
    'great granary': 39,
    'wonder of the world': 40,
    'horse drinking trough': 41,
    'healing tent': 46
  });

  const REPEATABLE_BUILDINGS = new Set(['cranny']);

  let timer = null;
  let confirmationKey = '';
  let confirmationCount = 0;
  let lastRequestedKey = '';
  let completing = false;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function norm(value) {
    return clean(value).toLowerCase();
  }

  function runtime() {
    return window.APES?.roadmapsRunner?.getContextState?.() || null;
  }

  function currentStep(rt = runtime()) {
    if (!rt?.roadmap || !rt?.progress) return null;
    const index = Number(rt.progress.currentStep) || 0;
    if (!Array.isArray(rt.roadmap.steps) || index < 0 || index >= rt.roadmap.steps.length) return null;
    return { index, step: rt.roadmap.steps[index] };
  }

  function expectedBuildingType(step, village) {
    if (!step || step.type !== 'building') return null;
    const name = norm(step.building);
    if (name === 'tribe wall') {
      const tribeId = Number(village?.tribeId);
      if (tribeId === 1) return 31;
      if (tribeId === 2) return 32;
      if (tribeId === 3) return 33;
      return null;
    }
    return BUILDING_TYPES[name] ?? null;
  }

  function isRepeatable(step) {
    return step?.type === 'building' && REPEATABLE_BUILDINGS.has(norm(step.building));
  }

  function detectionNode() {
    const card = document.querySelector(`#${PANEL_ID} .qol-rmr-step-card`);
    if (!card) return null;
    let node = card.querySelector('.qol-rmac-detection');
    if (!node) {
      node = document.createElement('div');
      node.className = 'qol-rmac-detection';
      card.appendChild(node);
    }
    return node;
  }

  function clearDetection() {
    document.querySelector(`#${PANEL_ID} .qol-rmac-detection`)?.remove();
  }

  function renderDetection(text, tone = 'waiting') {
    const node = detectionNode();
    if (!node) return;
    node.className = `qol-rmac-detection ${tone}`;
    node.textContent = text;
  }

  function resetConfirmation() {
    confirmationKey = '';
    confirmationCount = 0;
  }

  function storageKey(ctx) {
    const server = clean(ctx?.server);
    const playerId = clean(ctx?.playerId);
    if (!server || !/^\d+$/.test(playerId)) return '';
    return `${STORAGE_PREFIX}:${server}:${playerId}`;
  }

  function progressSlot(rt, create = false) {
    const { state, assignment } = rt || {};
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

    const villageId = clean(assignment.villageId || rt.ctx?.villageId);
    if (!/^\d+$/.test(villageId)) return null;
    if (create && !state.progress.villages[villageId]) state.progress.villages[villageId] = {};
    if (create && !state.progress.villages[villageId][assignment.roadmapId]) {
      state.progress.villages[villageId][assignment.roadmapId] = { currentStep: 0, skipped: [] };
    }
    return state.progress.villages[villageId]?.[assignment.roadmapId] || null;
  }

  function saveRuntime(rt) {
    const key = storageKey(rt?.ctx);
    if (!key || !rt?.state) return false;
    try {
      localStorage.setItem(key, JSON.stringify(rt.state));
      return true;
    } catch (error) {
      console.warn('[APES Roadmaps AutoComplete] Could not save progress.', error);
      return false;
    }
  }

  function showToast(message) {
    document.querySelector('.qol-rma-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'qol-rma-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  function completeCurrentStep(expectedIndex, label) {
    if (completing) return false;
    const rt = runtime();
    const current = currentStep(rt);
    if (!rt?.roadmap || !rt?.assignment || !current || current.index !== expectedIndex) return false;

    const slot = progressSlot(rt, true);
    if (!slot) return false;
    const total = rt.roadmap.steps.length;
    const storedIndex = Math.max(0, Math.min(total, Number(slot.currentStep) || 0));
    if (storedIndex !== expectedIndex || storedIndex >= total) return false;

    completing = true;
    try {
      const skipped = new Set(Array.isArray(slot.skipped) ? slot.skipped.map(Number) : []);
      skipped.delete(storedIndex);
      slot.skipped = [...skipped]
        .filter(index => Number.isInteger(index) && index >= 0 && index < total)
        .sort((a, b) => a - b);
      slot.currentStep = storedIndex + 1;

      if (!saveRuntime(rt)) return false;
      resetConfirmation();
      showToast(`${label} detected — roadmap advanced.`);
      window.APES?.roadmapsRunner?.refresh?.();
      window.APES?.roadmapsRunnerControls?.refresh?.();
      return true;
    } finally {
      completing = false;
    }
  }

  function requestSnapshotIfNeeded() {
    const rt = runtime();
    const current = currentStep(rt);

    if (!rt?.assignment || !rt?.roadmap || !current) {
      resetConfirmation();
      clearDetection();
      return;
    }

    const step = current.step;
    if (step?.type !== 'building') {
      resetConfirmation();
      renderDetection('Manual step — complete when done.', 'manual');
      return;
    }

    if (isRepeatable(step)) {
      resetConfirmation();
      renderDetection('Manual completion for repeatable buildings.', 'manual');
      return;
    }

    const villageId = clean(rt.ctx?.villageId);
    if (!/^\d+$/.test(villageId)) {
      resetConfirmation();
      renderDetection('Waiting for current village data…', 'waiting');
      return;
    }

    const key = `${rt.ctx?.server}|${rt.ctx?.playerId}|${villageId}|${rt.assignment.roadmapId}|${current.index}|${norm(step.building)}|${Number(step.level) || 0}`;
    if (lastRequestedKey !== key) {
      lastRequestedKey = key;
      resetConfirmation();
    }

    window.postMessage({ source: UI_SOURCE, type: REQUEST_TYPE }, location.origin);
  }

  function onSnapshot(event) {
    if (event.source !== window) return;
    if (event.data?.source !== BRIDGE_SOURCE || event.data?.type !== RESPONSE_TYPE) return;

    const rt = runtime();
    const current = currentStep(rt);
    if (!rt?.assignment || !rt?.roadmap || !current) return;

    const step = current.step;
    if (step?.type !== 'building' || isRepeatable(step)) return;

    const villageId = clean(rt.ctx?.villageId);
    if (!/^\d+$/.test(villageId)) return;

    const snapshot = event.data?.payload;
    const villages = Array.isArray(snapshot?.villages) ? snapshot.villages : [];
    const village = villages.find(item => String(item?.villageId) === villageId);
    if (!village) {
      resetConfirmation();
      renderDetection('Waiting for live building data…', 'waiting');
      return;
    }

    const buildingType = expectedBuildingType(step, village);
    if (!Number.isFinite(buildingType)) {
      resetConfirmation();
      renderDetection('Automatic detection is not available for this building yet.', 'manual');
      return;
    }

    const targetLevel = Math.max(1, Number(step.level) || 1);
    const matches = (Array.isArray(village.buildings) ? village.buildings : [])
      .filter(building => Number(building?.buildingType) === buildingType);
    const currentLevel = matches.reduce((max, building) => Math.max(max, Number(building?.lvl) || 0), 0);
    const label = clean(step.building) || 'Building';

    if (currentLevel < targetLevel) {
      resetConfirmation();
      renderDetection(`Detected ${label} Lv ${currentLevel} · needs Lv ${targetLevel}`, 'waiting');
      return;
    }

    const key = `${rt.ctx?.server}|${rt.ctx?.playerId}|${villageId}|${rt.assignment.roadmapId}|${current.index}|${buildingType}|${targetLevel}`;
    if (confirmationKey === key) confirmationCount += 1;
    else {
      confirmationKey = key;
      confirmationCount = 1;
    }

    if (confirmationCount < REQUIRED_CONFIRMATIONS) {
      renderDetection(`Detected ${label} Lv ${currentLevel} · confirming…`, 'confirming');
      return;
    }

    renderDetection(`Detected ${label} Lv ${currentLevel} · complete`, 'complete');
    completeCurrentStep(current.index, `${label} Lv ${targetLevel}`);
  }

  function init() {
    window.addEventListener('message', onSnapshot);
    window.addEventListener('hashchange', () => {
      lastRequestedKey = '';
      resetConfirmation();
      setTimeout(requestSnapshotIfNeeded, 250);
    });

    timer = setInterval(requestSnapshotIfNeeded, CHECK_INTERVAL_MS);
    setTimeout(requestSnapshotIfNeeded, 500);

    window.APES = window.APES || {};
    window.APES.roadmapsAutoComplete = Object.freeze({
      checkNow: requestSnapshotIfNeeded,
      reset: resetConfirmation
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
