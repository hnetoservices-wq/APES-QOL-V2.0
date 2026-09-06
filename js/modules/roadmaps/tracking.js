(() => {
  'use strict';

  const TRACKING_PREFIX = 'qol_roadmap_tracking_v1';
  const SELECTED_KEY = 'qol_roadmap_selected_v1';
  const HUB_ID = 'qol-roadmaps-container';
  const RUNNER_ID = 'qol-roadmap-runner';
  const ASSIGN_DIALOG_ID = 'qol-roadmap-assignment-dialog';

  let absoluteRawGet = null;
  let installTimer = null;
  let observer = null;
  let enhanceQueued = false;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function readFlag(key) {
    try {
      return localStorage.getItem(key) === 'true';
    } catch (_) {
      return false;
    }
  }

  function writeFlag(key, enabled) {
    if (!key) return false;
    try {
      localStorage.setItem(key, enabled ? 'true' : 'false');
      return true;
    } catch (error) {
      console.warn('[APES Roadmaps Tracking] Could not save tracking state.', error);
      return false;
    }
  }

  function currentContext() {
    const source = window.APES?.context?.snapshot?.() || {};
    const server = clean(source.server || location.hostname.toLowerCase());
    const playerId = clean(source.playerId);
    const hashVillage = String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
    const villageId = clean(source.villageId === 'unknown' ? hashVillage : source.villageId) || hashVillage;
    return { server, playerId, villageId };
  }

  function selectedRoadmapId() {
    try {
      return clean(localStorage.getItem(SELECTED_KEY));
    } catch (_) {
      return '';
    }
  }

  function trackingKey(ctx, roadmapId) {
    const server = clean(ctx?.server);
    const playerId = clean(ctx?.playerId);
    const villageId = clean(ctx?.villageId);
    const id = clean(roadmapId);
    if (!server || !/^\d+$/.test(playerId) || !/^\d+$/.test(villageId) || !id) return '';
    return `${TRACKING_PREFIX}:${server}:${playerId}:${villageId}:${id}`;
  }

  function detectionMode(runtime) {
    if (!runtime?.assignment || !runtime?.state) return 'automatic';
    if (runtime.assignment.detection === 'manual') return 'manual';
    if (runtime.assignment.detection === 'automatic') return 'automatic';

    const villageId = clean(runtime.assignment.villageId || runtime.ctx?.villageId);
    if (runtime.assignment.scope === 'village') {
      return runtime.state.villages?.[villageId]?.detection === 'manual' ? 'manual' : 'automatic';
    }
    return runtime.state.defaultAssignment?.detection === 'manual' ? 'manual' : 'automatic';
  }

  function rawRuntime() {
    try {
      if (absoluteRawGet) return absoluteRawGet();
      const runner = window.APES?.roadmapsRunner;
      return runner?.getRawContextState?.() || runner?.getContextState?.() || null;
    } catch (_) {
      return null;
    }
  }

  function isActive(runtime = rawRuntime()) {
    if (!runtime?.assignment || !runtime?.roadmap) return false;
    if (detectionMode(runtime) !== 'automatic') return false;
    const ctx = runtime.ctx || currentContext();
    return readFlag(trackingKey(ctx, runtime.assignment.roadmapId));
  }

  function setActiveFor(ctx, roadmapId, enabled) {
    return writeFlag(trackingKey(ctx, roadmapId), Boolean(enabled));
  }

  function setCurrentActive(enabled) {
    const runtime = rawRuntime();
    if (!runtime?.assignment || !runtime?.roadmap) return false;
    if (detectionMode(runtime) !== 'automatic') return false;
    const ok = setActiveFor(runtime.ctx || currentContext(), runtime.assignment.roadmapId, enabled);
    if (!ok) return false;

    window.APES?.roadmapsAutoComplete?.reset?.();
    window.dispatchEvent(new CustomEvent('qol_roadmap_tracking_changed', {
      detail: {
        enabled: Boolean(enabled),
        villageId: clean(runtime.ctx?.villageId),
        roadmapId: runtime.assignment.roadmapId
      }
    }));

    window.APES?.roadmapsRunner?.refresh?.();
    window.APES?.roadmaps?.refresh?.();
    scheduleEnhance();

    if (enabled) {
      setTimeout(() => window.APES?.roadmapsAutoComplete?.checkNow?.(), 60);
    }
    return true;
  }

  function gatedContext(base) {
    const runtime = base.getContextState?.();
    if (!runtime?.assignment || !runtime?.roadmap || !runtime?.progress) return runtime;
    if (detectionMode(runtime) !== 'automatic' || isActive(runtime)) return runtime;

    const index = Math.max(0, Number(runtime.progress.currentStep) || 0);
    if (!Array.isArray(runtime.roadmap.steps) || index >= runtime.roadmap.steps.length) return runtime;

    const steps = [...runtime.roadmap.steps];
    steps[index] = { ...steps[index], type: 'manual' };
    return {
      ...runtime,
      assignment: { ...runtime.assignment, tracking: false },
      roadmap: { ...runtime.roadmap, steps }
    };
  }

  function hasTrackingMarker(value) {
    return Boolean(value && Object.prototype.hasOwnProperty.call(value, '__roadmapTrackingWrapped'));
  }

  function wrapRunner() {
    const base = window.APES?.roadmapsRunner;
    if (!base || typeof base.getContextState !== 'function') return false;

    if (!absoluteRawGet) {
      const original = base.getRawContextState || base.getContextState;
      absoluteRawGet = original.bind(base);
    }

    if (hasTrackingMarker(base)) return true;

    const wrapped = {
      ...base,
      getRawContextState: () => absoluteRawGet?.() || null,
      getContextState: () => gatedContext(base)
    };
    Object.defineProperty(wrapped, '__roadmapTrackingWrapped', {
      value: true,
      enumerable: false,
      configurable: false,
      writable: false
    });
    window.APES.roadmapsRunner = Object.freeze(wrapped);
    return true;
  }

  function ensureRunnerWrapper() {
    const runner = window.APES?.roadmapsRunner;
    if (!runner) return false;
    if (!hasTrackingMarker(runner)) wrapRunner();
    const current = window.APES?.roadmapsRunner;
    if (hasTrackingMarker(current) && current.__stableIdsWrapped === true && installTimer) {
      clearInterval(installTimer);
      installTimer = null;
    }
    return hasTrackingMarker(current);
  }

  function showToast(message, type = 'info') {
    document.querySelector('.qol-rmt-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `qol-rmt-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  function updateControl(control, runtime) {
    if (!control) return;
    const automatic = detectionMode(runtime) === 'automatic';
    const active = automatic && isActive(runtime);
    control.classList.toggle('active', active);
    control.classList.toggle('disabled', !automatic);
    control.setAttribute('aria-pressed', active ? 'true' : 'false');
    control.setAttribute('tabindex', automatic ? '0' : '-1');
    control.textContent = `Auto Tracking: ${active ? 'ON' : 'OFF'}`;
    control.title = automatic
      ? (active
        ? 'Automatic tracking is active for this village. Click to pause it.'
        : 'Automatic tracking is paused for this village. Click to start it.')
      : 'This Roadmap uses Manual Detection. Automatic tracking is unavailable.';
  }

  function wireControl(control) {
    if (!control || control.dataset.rmtBound === '1') return;
    control.dataset.rmtBound = '1';

    const activate = event => {
      event.preventDefault();
      event.stopPropagation();
      const runtime = rawRuntime();
      if (!runtime?.assignment) return;
      if (detectionMode(runtime) !== 'automatic') {
        showToast('Automatic tracking is unavailable while Manual Detection is selected.');
        return;
      }
      const next = !isActive(runtime);
      if (setCurrentActive(next)) {
        showToast(next ? 'Automatic tracking started for this village.' : 'Automatic tracking paused for this village.');
      }
    };

    control.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      activate(event);
    });
    control.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    control.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      activate(event);
    });
  }

  function enhanceHub() {
    const hub = document.getElementById(HUB_ID);
    const runtime = rawRuntime();
    const actions = hub?.querySelector('.qol-rma-context-actions');
    if (!actions || !runtime?.assignment) {
      hub?.querySelector('[data-rmt-hub-toggle]')?.remove();
      return;
    }

    let control = actions.querySelector('[data-rmt-hub-toggle]');
    if (!control) {
      control = document.createElement('div');
      control.className = 'qol-rm-action qol-secondary qol-rmt-toggle';
      control.dataset.rmtHubToggle = '1';
      control.setAttribute('role', 'button');
      control.setAttribute('aria-pressed', 'false');
      actions.insertBefore(control, actions.firstChild || null);
      wireControl(control);
    }
    updateControl(control, runtime);
  }

  function restoreResourcePresentation(runtime, panel) {
    if (!runtime?.roadmap || !runtime?.progress || !panel) return;
    const index = Math.max(0, Number(runtime.progress.currentStep) || 0);
    const step = runtime.roadmap.steps?.[index];
    if (!step || step.type !== 'instruction') return;
    const info = window.APES?.roadmapsResourceFields?.parse?.(step.text);
    if (!info) return;

    const badge = panel.querySelector('.qol-rmr-type');
    if (badge) {
      badge.textContent = 'Resource Fields';
      badge.classList.remove('building', 'instruction');
      badge.classList.add('resource');
    }
  }

  function enhanceRunner() {
    const panel = document.getElementById(RUNNER_ID);
    const runtime = rawRuntime();
    if (!panel || !runtime?.assignment) return;
    const body = panel.querySelector('.qol-rmr-body');
    if (!body) return;

    let control = body.querySelector('[data-rmt-runner-toggle]');
    if (!control) {
      control = document.createElement('div');
      control.className = 'qol-rmt-runner-toggle';
      control.dataset.rmtRunnerToggle = '1';
      control.setAttribute('role', 'button');
      control.setAttribute('aria-pressed', 'false');
      body.prepend(control);
      wireControl(control);
    }

    const modeBadge = body.querySelector('.qol-rms6-detection-mode');
    if (modeBadge && modeBadge.nextElementSibling !== control) modeBadge.after(control);
    updateControl(control, runtime);

    const automatic = detectionMode(runtime) === 'automatic';
    const active = automatic && isActive(runtime);
    const card = panel.querySelector('.qol-rmr-step-card');

    if (automatic && !active && card) {
      card.querySelector('.qol-rmac-detection')?.remove();
      card.querySelector('.qol-rmrf-detection')?.remove();
      let note = card.querySelector('.qol-rmt-paused-note');
      if (!note) {
        note = document.createElement('div');
        note.className = 'qol-rmt-paused-note';
        card.appendChild(note);
      }
      note.textContent = 'Automatic tracking is paused. No building or resource checks are running.';
      restoreResourcePresentation(runtime, panel);
    } else {
      card?.querySelector('.qol-rmt-paused-note')?.remove();
    }
  }

  function syncLoadTrackingBlock(layer) {
    const block = layer?.querySelector('[data-rmt-load-block]');
    const toggle = block?.querySelector('[data-rmt-load-toggle]');
    if (!block || !toggle) return;

    const automatic = layer.dataset.rms6Detection !== 'manual';
    if (!automatic) layer.dataset.rmtTracking = 'off';
    const active = automatic && layer.dataset.rmtTracking === 'on';
    toggle.classList.toggle('active', active);
    toggle.classList.toggle('disabled', !automatic);
    toggle.setAttribute('aria-checked', active ? 'true' : 'false');
    toggle.setAttribute('tabindex', automatic ? '0' : '-1');
    block.querySelector('[data-rmt-load-status]').textContent = automatic
      ? (active
        ? 'ON — APES will track supported objectives for this village even while the runner is closed.'
        : 'OFF — APES will not run background building or resource checks for this village.')
      : 'Manual Detection does not use automatic tracking.';
  }

  function enhanceAssignmentDialog() {
    const layer = document.getElementById(ASSIGN_DIALOG_ID);
    if (!layer) return;
    const detectionBlock = layer.querySelector('.qol-rms6-detection-block');
    if (!detectionBlock || layer.querySelector('[data-rmt-load-block]')) return;

    layer.dataset.rmtTracking = 'off';
    const block = document.createElement('div');
    block.className = 'qol-rmt-load-block';
    block.dataset.rmtLoadBlock = '1';
    block.innerHTML = `
      <div class="qol-rms6-section-title">Automatic Tracking</div>
      <div class="qol-rmt-load-toggle" data-rmt-load-toggle role="checkbox" tabindex="0" aria-checked="false">
        <span class="qol-rmt-switch" aria-hidden="true"><i></i></span>
        <div>
          <strong>Start automatic tracking now</strong>
          <small>Optional. Tracking belongs to the current village only, including when using Every Village.</small>
        </div>
      </div>
      <div class="qol-rmt-load-status" data-rmt-load-status></div>`;
    detectionBlock.after(block);

    const toggle = block.querySelector('[data-rmt-load-toggle]');
    const activate = event => {
      event.preventDefault();
      event.stopPropagation();
      if (layer.dataset.rms6Detection === 'manual') return;
      layer.dataset.rmtTracking = layer.dataset.rmtTracking === 'on' ? 'off' : 'on';
      syncLoadTrackingBlock(layer);
    };
    toggle.addEventListener('click', activate);
    toggle.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      activate(event);
    });

    const modeObserver = new MutationObserver(() => syncLoadTrackingBlock(layer));
    modeObserver.observe(layer, { attributes: true, attributeFilter: ['data-rms6-detection'] });
    syncLoadTrackingBlock(layer);
  }

  function persistAssignmentChoice(layer) {
    if (!layer) return;
    const ctx = currentContext();
    const roadmapId = selectedRoadmapId();
    if (!roadmapId) return;
    const automatic = layer.dataset.rms6Detection !== 'manual';
    const enabled = automatic && layer.dataset.rmtTracking === 'on';
    setActiveFor(ctx, roadmapId, enabled);
  }

  function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => {
      enhanceQueued = false;
      ensureRunnerWrapper();
      enhanceAssignmentDialog();
      enhanceHub();
      enhanceRunner();
    });
  }

  function init() {
    window.APES = window.APES || {};
    window.APES.roadmapsTracking = Object.freeze({
      isActive,
      setCurrent: setCurrentActive,
      setFor: setActiveFor,
      getDetectionMode: detectionMode,
      getRawRuntime: rawRuntime,
      keyFor: trackingKey,
      enhance: scheduleEnhance
    });

    ensureRunnerWrapper();
    installTimer = setInterval(ensureRunnerWrapper, 50);

    window.addEventListener('click', event => {
      const load = event.target.closest?.(`#${ASSIGN_DIALOG_ID} [data-load]`);
      if (load) persistAssignmentChoice(document.getElementById(ASSIGN_DIALOG_ID));
    }, true);

    window.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const load = event.target.closest?.(`#${ASSIGN_DIALOG_ID} [data-load]`);
      if (load) persistAssignmentChoice(document.getElementById(ASSIGN_DIALOG_ID));
    }, true);

    observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('hashchange', scheduleEnhance);
    window.addEventListener('qol_roadmap_tracking_changed', scheduleEnhance);

    scheduleEnhance();
    setTimeout(scheduleEnhance, 250);
    setTimeout(scheduleEnhance, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
