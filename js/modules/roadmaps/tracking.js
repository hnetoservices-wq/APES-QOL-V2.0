(() => {
  'use strict';

  const TRACKING_PREFIX = 'qol_roadmap_tracking_v1';
  const SELECTED_KEY = 'qol_roadmap_selected_v1';
  const HUB_ID = 'qol-roadmaps-container';
  const RUNNER_ID = 'qol-roadmap-runner';
  const ASSIGN_DIALOG_ID = 'qol-roadmap-assignment-dialog';

  let absoluteRawGet = null;
  let installTimer = null;
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
    return readFlag(trackingKey(runtime.ctx || currentContext(), runtime.assignment.roadmapId));
  }

  function setActiveFor(ctx, roadmapId, enabled) {
    return writeFlag(trackingKey(ctx, roadmapId), Boolean(enabled));
  }

  function refreshTrackingUi() {
    window.APES?.roadmapsRunner?.refresh?.();
    window.APES?.roadmaps?.refresh?.();
    scheduleEnhance();
  }

  function setCurrentActive(enabled) {
    const runtime = rawRuntime();
    if (!runtime?.assignment || !runtime?.roadmap) return false;
    if (detectionMode(runtime) !== 'automatic') return false;
    if (!setActiveFor(runtime.ctx || currentContext(), runtime.assignment.roadmapId, enabled)) return false;

    window.APES?.roadmapsAutoComplete?.reset?.();
    window.dispatchEvent(new CustomEvent('qol_roadmap_tracking_changed', {
      detail: {
        enabled: Boolean(enabled),
        villageId: clean(runtime.ctx?.villageId),
        roadmapId: runtime.assignment.roadmapId
      }
    }));
    refreshTrackingUi();
    if (enabled) setTimeout(() => window.APES?.roadmapsAutoComplete?.checkNow?.(), 60);
    return true;
  }

  // Detection modules use roadmapsRunner.getContextState(). When tracking is OFF,
  // only that public detection-facing view is changed to a manual step. The real
  // Roadmap, runner UI and stable-ID state remain untouched through getRawContextState().
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

  function hasMarker(value) {
    return Boolean(value && Object.prototype.hasOwnProperty.call(value, '__roadmapTrackingWrapped'));
  }

  function wrapRunner() {
    const base = window.APES?.roadmapsRunner;
    if (!base || typeof base.getContextState !== 'function') return false;

    if (!absoluteRawGet) {
      const original = base.getRawContextState || base.getContextState;
      absoluteRawGet = original.bind(base);
    }
    if (hasMarker(base)) return true;

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
    if (!hasMarker(runner)) wrapRunner();
    const current = window.APES?.roadmapsRunner;
    if (hasMarker(current) && current.__stableIdsWrapped === true && installTimer) {
      clearInterval(installTimer);
      installTimer = null;
    }
    return hasMarker(current);
  }

  function showToast(message) {
    document.querySelector('.qol-rmt-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'qol-rmt-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function updateControl(control, runtime, compact = false) {
    if (!control) return;
    const automatic = detectionMode(runtime) === 'automatic';
    const active = automatic && isActive(runtime);
    control.classList.toggle('active', active);
    control.classList.toggle('disabled', !automatic);
    control.setAttribute('aria-pressed', active ? 'true' : 'false');
    control.setAttribute('tabindex', automatic ? '0' : '-1');
    setText(control, compact ? `Auto: ${active ? 'ON' : 'OFF'}` : `Auto Tracking: ${active ? 'ON' : 'OFF'}`);
    control.title = automatic
      ? (active ? 'Automatic tracking is active for this village. Click to pause it.' : 'Automatic tracking is paused for this village. Click to start it.')
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
      if (setCurrentActive(next)) showToast(next ? 'Automatic tracking started for this village.' : 'Automatic tracking paused for this village.');
    };

    control.addEventListener('pointerdown', event => {
      if (event.button === 0) activate(event);
    });
    control.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    control.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
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
    updateControl(control, runtime, false);
  }

  function currentRawStep(runtime) {
    if (!runtime?.roadmap || !runtime?.progress) return null;
    const index = Math.max(0, Number(runtime.progress.currentStep) || 0);
    return runtime.roadmap.steps?.[index] || null;
  }

  function isResourceStep(step) {
    if (!step || step.type !== 'instruction') return false;
    return Boolean(window.APES?.roadmapsResourceFields?.parse?.(step.text));
  }

  function enhanceRunner() {
    const panel = document.getElementById(RUNNER_ID);
    const runtime = rawRuntime();
    if (!panel || !runtime?.assignment) return;

    const header = panel.querySelector('.qol-rmr-header');
    if (!header) return;
    let control = header.querySelector('[data-rmt-runner-toggle]');
    if (!control) {
      control = document.createElement('div');
      control.className = 'qol-rmt-runner-toggle';
      control.dataset.rmtRunnerToggle = '1';
      control.setAttribute('role', 'button');
      control.setAttribute('aria-pressed', 'false');
      const close = header.querySelector('.qol-rmr-close');
      if (close) header.insertBefore(control, close);
      else header.appendChild(control);
      wireControl(control);
    }

    const automatic = detectionMode(runtime) === 'automatic';
    const active = automatic && isActive(runtime);
    updateControl(control, runtime, true);
    panel.classList.toggle('qol-rmt-paused', automatic && !active);
    panel.classList.toggle('qol-rmt-resource-paused', automatic && !active && isResourceStep(currentRawStep(runtime)));
  }

  function syncLoadBlock(layer) {
    const block = layer?.querySelector('[data-rmt-load-block]');
    const toggle = block?.querySelector('[data-rmt-load-toggle]');
    const status = block?.querySelector('[data-rmt-load-status]');
    if (!block || !toggle || !status) return;

    const automatic = layer.dataset.rms6Detection !== 'manual';
    if (!automatic) layer.dataset.rmtTracking = 'off';
    const active = automatic && layer.dataset.rmtTracking === 'on';
    toggle.classList.toggle('active', active);
    toggle.classList.toggle('disabled', !automatic);
    toggle.setAttribute('aria-checked', active ? 'true' : 'false');
    toggle.setAttribute('tabindex', automatic ? '0' : '-1');
    setText(status, automatic
      ? (active
        ? 'ON — APES will track supported objectives for this village even while the runner is closed.'
        : 'OFF — APES will not run background building or resource checks for this village.')
      : 'Manual Detection does not use automatic tracking.');
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
      syncLoadBlock(layer);
    };
    toggle.addEventListener('click', activate);
    toggle.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });

    new MutationObserver(() => syncLoadBlock(layer)).observe(layer, {
      attributes: true,
      attributeFilter: ['data-rms6-detection']
    });
    syncLoadBlock(layer);
  }

  function persistAssignmentChoice(layer) {
    if (!layer) return;
    const roadmapId = selectedRoadmapId();
    if (!roadmapId) return;
    const automatic = layer.dataset.rms6Detection !== 'manual';
    setActiveFor(currentContext(), roadmapId, automatic && layer.dataset.rmtTracking === 'on');
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

  function mutationNeedsEnhance(mutation) {
    return [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE);
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

    new MutationObserver(mutations => {
      if (mutations.some(mutationNeedsEnhance)) scheduleEnhance();
    }).observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('hashchange', scheduleEnhance);
    window.addEventListener('qol_roadmap_tracking_changed', scheduleEnhance);
    scheduleEnhance();
    setTimeout(scheduleEnhance, 250);
    setTimeout(scheduleEnhance, 800);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
