(() => {
  'use strict';

  const A = window.APES_AOC_INTERNAL;
  const D = A?.data;
  const R = A?.rendering;
  if (!D || !R || A.__villageActionsV1) return;
  A.__villageActionsV1 = true;

  let enhanceTimer = null;

  function villageById(id) {
    return (D.snapshot?.villages || []).find(village => String(village?.villageId || '') === String(id));
  }

  function building(village, type) {
    return (village?.buildings || []).find(item => Number(item?.buildingType) === Number(type)) || null;
  }

  function buildingLocation(village, type) {
    const match = building(village, type);
    const location = Number(match?.locationId);
    return Number.isFinite(location) ? location : null;
  }

  function firstTrainingLocation(village, insight) {
    const explicit = insight?.train?.entries?.map(entry => Number(entry.location)).find(Number.isFinite);
    if (Number.isFinite(explicit)) return explicit;
    const types = insight?.train?.entries?.map(entry => Number(entry.buildingType)).filter(Number.isFinite) || [];
    for (const type of types) {
      const location = buildingLocation(village, type);
      if (Number.isFinite(location)) return location;
    }
    for (const type of [19, 20, 21, 29, 30, 46]) {
      const location = buildingLocation(village, type);
      if (Number.isFinite(location)) return location;
    }
    return null;
  }

  function firstConstructionLocation(insight) {
    const location = insight?.build?.map(item => Number(item.loc)).find(Number.isFinite);
    return Number.isFinite(location) ? location : null;
  }

  function actionForAlert(village, insight, alert) {
    const kind = String(alert?.[4] || '');
    if (kind === 'incomingAttack' || kind === 'incomingResources' || kind === 'incomingOverflow' || kind === 'outgoings') {
      return { type: 'rally', subtab: kind === 'outgoings' ? 'Outgoing' : 'Incoming' };
    }
    if (kind === 'celebration' || kind === 'celebrationComplete') {
      const location = buildingLocation(village, 24);
      return Number.isFinite(location) ? { type: 'building', location } : { type: 'village' };
    }
    if (kind === 'smithy' || kind === 'smithyComplete') {
      const location = buildingLocation(village, 12);
      return Number.isFinite(location) ? { type: 'building', location } : { type: 'village' };
    }
    if (kind === 'training' || kind === 'trainingComplete') {
      const location = firstTrainingLocation(village, insight);
      return Number.isFinite(location) ? { type: 'building', location } : { type: 'village' };
    }
    if (kind === 'freeFinish' || kind === 'constructionComplete' || kind === 'alarm' || kind === 'construction') {
      const location = firstConstructionLocation(insight);
      return Number.isFinite(location) ? { type: 'building', location } : { type: 'village' };
    }
    if (['crop', 'storage', 'data'].includes(kind)) return { type: 'village' };
    return null;
  }

  function encodeAction(action) {
    try { return encodeURIComponent(JSON.stringify(action)); } catch (_) { return ''; }
  }

  function decodeAction(value) {
    try { return JSON.parse(decodeURIComponent(String(value || ''))); } catch (_) { return null; }
  }

  function execute(villageId, action) {
    const id = String(villageId || '');
    if (!/^\d+$/.test(id) || !action) return;
    if (action.type === 'building' && Number.isFinite(Number(action.location))) {
      A.controller?.openBuilding?.(id, String(action.location));
      return;
    }
    if (action.type === 'rally') {
      A.controller?.close?.();
      const suffix = action.subtab ? `/subtab:${action.subtab}` : '';
      location.hash = `#/page:village/villId:${id}/location:32/window:building${suffix}`;
      return;
    }
    if (action.type === 'tool' && action.controlId) {
      document.getElementById(action.controlId)?.click();
      return;
    }
    A.controller?.openVillage?.(id);
  }

  function actionButton(label, villageId, action, extra = '') {
    return `<div class="apes-aoc2-detail-action apes-aoc2-control ${extra}" role="button" tabindex="0" data-aoc-village-id="${D.esc(villageId)}" data-aoc-action="${encodeAction(action)}">${D.esc(label)}</div>`;
  }

  function injectDetailActions(detail, village, insight) {
    if (!detail || detail.querySelector('.apes-aoc2-detail-actions')) return;
    const head = detail.querySelector('.apes-aoc2-detail-head');
    if (!head) return;
    const id = String(village.villageId);
    const buttons = [actionButton('Village', id, { type: 'village' })];
    buttons.push(actionButton('Rally Point', id, { type: 'rally', subtab: 'Incoming' }));

    const market = buildingLocation(village, 17);
    if (Number.isFinite(market)) buttons.push(actionButton('Marketplace', id, { type: 'building', location: market }));

    const training = firstTrainingLocation(village, insight);
    if (Number.isFinite(training)) buttons.push(actionButton('Training', id, { type: 'building', location: training }));

    const townHall = buildingLocation(village, 24);
    if (Number.isFinite(townHall)) buttons.push(actionButton('Town Hall', id, { type: 'building', location: townHall }));

    const smithy = buildingLocation(village, 12);
    if (Number.isFinite(smithy)) buttons.push(actionButton('Smithy', id, { type: 'building', location: smithy }));

    if (document.getElementById('qol-resource-planner-toggle-btn')) {
      buttons.push(actionButton('Resource Planner', id, { type: 'tool', controlId: 'qol-resource-planner-toggle-btn' }, 'tool'));
    }

    const bar = document.createElement('div');
    bar.className = 'apes-aoc2-detail-actions';
    bar.innerHTML = buttons.join('');
    head.insertAdjacentElement('afterend', bar);
  }

  function annotateAlerts(row, village, insight) {
    const nodes = [...row.querySelectorAll('.apes-aoc2-attention .apes-aoc2-status')];
    const alerts = insight?.alerts || [];
    nodes.forEach((node, index) => {
      const alert = alerts[index];
      if (!alert) return;
      const action = actionForAlert(village, insight, alert);
      node.dataset.aocKind = String(alert?.[4] || '');
      if (!action) return;
      node.dataset.aocVillageId = String(village.villageId);
      node.dataset.aocAction = encodeAction(action);
      node.classList.add('apes-aoc2-actionable-chip');
      node.title = `${String(alert?.[0] || '').trim()} · click to open`;
    });
  }

  function enhance() {
    enhanceTimer = null;
    const overlay = document.getElementById(D.OVERLAY_ID);
    if (!overlay) return;
    overlay.querySelectorAll('[data-row-village-id]').forEach(row => {
      const village = villageById(row.dataset.rowVillageId);
      if (!village) return;
      const insight = D.insight(village);
      annotateAlerts(row, village, insight);
    });
    overlay.querySelectorAll('[data-detail-village-id]').forEach(detail => {
      const village = villageById(detail.dataset.detailVillageId);
      if (!village) return;
      injectDetailActions(detail, village, D.insight(village));
    });
  }

  function scheduleEnhance() {
    if (enhanceTimer !== null) clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(enhance, 40);
  }

  document.addEventListener('click', event => {
    const target = event.target.closest?.('[data-aoc-action][data-aoc-village-id]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    execute(target.dataset.aocVillageId, decodeAction(target.dataset.aocAction));
  }, true);

  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const target = event.target.closest?.('[data-aoc-action][data-aoc-village-id]');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    execute(target.dataset.aocVillageId, decodeAction(target.dataset.aocAction));
  }, true);

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('apes_aoc_force_render', scheduleEnhance);

  const baseRender = R.render;
  R.render = (...args) => {
    const result = baseRender(...args);
    scheduleEnhance();
    return result;
  };

  window.APES_AOC_VILLAGE_ACTIONS = Object.freeze({ version: 1, refresh: scheduleEnhance });
})();
