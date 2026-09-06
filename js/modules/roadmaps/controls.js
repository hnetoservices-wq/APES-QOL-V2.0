(() => {
  'use strict';

  const PANEL_ID = 'qol-roadmap-runner';
  const STORAGE_PREFIX = 'qol_roadmap_assignments_v1';
  const BOUND_ATTR = 'data-rmr-bound';

  let panelObserver = null;
  let rootObserver = null;
  let bindQueued = false;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function currentRuntime() {
    return window.APES?.roadmapsRunner?.getContextState?.() || null;
  }

  function storageKey(ctx) {
    const server = clean(ctx?.server);
    const playerId = clean(ctx?.playerId);
    if (!server || !/^\d+$/.test(playerId)) return '';
    return `${STORAGE_PREFIX}:${server}:${playerId}`;
  }

  function writeState(runtime) {
    const key = storageKey(runtime?.ctx);
    if (!key || !runtime?.state) return false;
    try {
      localStorage.setItem(key, JSON.stringify(runtime.state));
      return true;
    } catch (error) {
      console.warn('[APES Roadmaps Runner Controls] Could not save progress.', error);
      return false;
    }
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

  function refreshRunner() {
    window.APES?.roadmapsRunner?.refresh?.();
  }

  function moveBack() {
    const runtime = currentRuntime();
    if (!runtime?.roadmap || !runtime?.assignment) return;
    const slot = progressSlot(runtime, true);
    if (!slot) return;
    const current = Math.max(0, Number(slot.currentStep) || 0);
    if (current <= 0) return;
    slot.currentStep = current - 1;
    if (!Array.isArray(slot.skipped)) slot.skipped = [];
    if (writeState(runtime)) refreshRunner();
  }

  function advance(skip) {
    const runtime = currentRuntime();
    if (!runtime?.roadmap || !runtime?.assignment) return;
    const slot = progressSlot(runtime, true);
    if (!slot) return;

    const total = Array.isArray(runtime.roadmap.steps) ? runtime.roadmap.steps.length : 0;
    const current = Math.max(0, Math.min(total, Number(slot.currentStep) || 0));
    if (current >= total) return;

    const skipped = new Set(Array.isArray(slot.skipped) ? slot.skipped.map(Number) : []);
    if (skip) skipped.add(current);
    else skipped.delete(current);

    slot.skipped = [...skipped]
      .filter(index => Number.isInteger(index) && index >= 0 && index < total)
      .sort((a, b) => a - b);
    slot.currentStep = current + 1;

    if (writeState(runtime)) refreshRunner();
  }

  function restart() {
    const runtime = currentRuntime();
    if (!runtime?.roadmap || !runtime?.assignment) return;
    const name = clean(runtime.roadmap.name) || 'this roadmap';
    if (!window.confirm(`Restart “${name}” from Step 1?`)) return;
    const slot = progressSlot(runtime, true);
    if (!slot) return;
    slot.currentStep = 0;
    slot.skipped = [];
    if (writeState(runtime)) refreshRunner();
  }

  function handleAction(action) {
    if (action === 'complete') advance(false);
    else if (action === 'skip') advance(true);
    else if (action === 'back') moveBack();
    else if (action === 'hub') window.APES?.roadmaps?.open?.();
    else if (action === 'close') window.APES?.roadmapsRunner?.close?.();
    else if (action === 'restart') restart();
  }

  function bindControl(control) {
    if (!control || control.getAttribute(BOUND_ATTR) === '1') return;

    const action = clean(control.getAttribute('data-rmr-action') || control.getAttribute('data-action'));
    if (!action) return;

    // Remove the generic attribute used by the Stage 4 draft. Travian and other
    // scripts should never see Roadmap controls as generic `data-action` elements.
    control.removeAttribute('data-action');
    control.setAttribute('data-rmr-action', action);
    control.setAttribute(BOUND_ATTR, '1');

    const run = event => {
      if (control.classList.contains('disabled')) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      handleAction(action);
    };

    control.addEventListener('click', run);
    control.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      run(event);
    });
  }

  function bindControls() {
    bindQueued = false;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    panel.querySelectorAll('[data-action],[data-rmr-action]').forEach(bindControl);

    const body = panel.querySelector('.qol-rmr-body');
    if (body && (!panelObserver || panelObserver._target !== body)) {
      panelObserver?.disconnect();
      panelObserver = new MutationObserver(scheduleBind);
      panelObserver._target = body;
      panelObserver.observe(body, { childList: true, subtree: true });
    }
  }

  function scheduleBind() {
    if (bindQueued) return;
    bindQueued = true;
    requestAnimationFrame(bindControls);
  }

  function init() {
    scheduleBind();

    rootObserver = new MutationObserver(scheduleBind);
    rootObserver.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('hashchange', scheduleBind);
    setTimeout(scheduleBind, 250);
    setTimeout(scheduleBind, 900);

    window.APES = window.APES || {};
    window.APES.roadmapsRunnerControls = Object.freeze({ refresh: scheduleBind });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
