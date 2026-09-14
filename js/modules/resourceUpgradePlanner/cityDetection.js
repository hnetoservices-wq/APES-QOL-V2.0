(() => {
  'use strict';

  const PANEL_ID = 'qol-resource-upgrade-planner-overlay';
  let scanGeneration = 0;
  let appliedSignature = '';
  let lastDetected = null;

  function planner() {
    return window.APES_RESOURCE_UPGRADE_PLANNER || null;
  }

  function scanButton() {
    return document.querySelector(`#${PANEL_ID} [data-action="scan"]`);
  }

  function scanIsActive() {
    const button = scanButton();
    return Boolean(button && (button.getAttribute('aria-disabled') === 'true' || button.classList.contains('qol-disabled') || /scanning/i.test(button.textContent || '')));
  }

  function currentVillageId() {
    return String(window.location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
  }

  function highestFieldLevel(state) {
    const fields = state?.fields || {};
    const values = Object.values(fields).flatMap(levels => Array.isArray(levels) ? levels : []);
    return values.reduce((highest, value) => Math.max(highest, Number(value) || 0), 0);
  }

  function readSettlementType() {
    const root = document.querySelector('#villageView:not(#villageViewRes)');
    if (!root) return null;

    const view = root.closest('[ng-controller="villageViewCtrl"]') ||
      root.closest('.village.viewBackground') ||
      document.querySelector('[ng-controller="villageViewCtrl"].village.viewBackground');
    if (!view) return null;

    // Travian binds the city/town state directly to this class:
    // ng-class="{'village-water': isTown, 'misty': mist}"
    // A freshly upgraded city therefore exposes village-water even while all
    // resource fields are still level 10.
    const isCity = view.classList.contains('village-water');
    return {
      isCity,
      label: isCity ? 'City' : 'Village'
    };
  }

  async function applyDetectedSettlementType() {
    if (!scanIsActive()) return;
    const api = planner();
    if (!api?.getState || !api?.setState) return;

    const detection = readSettlementType();
    if (!detection) return;

    const villageId = currentVillageId();
    const signature = `${scanGeneration}:${villageId}:${detection.isCity ? 'city' : 'village'}`;
    if (signature === appliedSignature) return;
    appliedSignature = signature;
    lastDetected = detection;

    const current = api.getState();
    if (!current) return;

    const highest = highestFieldLevel(current);
    let maxLevel = Number(current.maxLevel) || 10;

    // Preserve a known/manual capital. Capital fields outrank city detection.
    if (highest > 12 || maxLevel === 20) {
      maxLevel = 20;
    } else if (detection.isCity) {
      maxLevel = 12;
    } else if (maxLevel === 12) {
      // Reset a previous city's setting when scanning a normal village.
      maxLevel = 10;
    }

    if (maxLevel !== Number(current.maxLevel)) {
      try {
        await api.setState({ ...current, maxLevel });
      } catch (error) {
        console.warn('[APES Resource Planner] Could not apply detected village type.', error);
      }
    }

    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.dataset.rupDetectedSettlementType = detection.isCity ? 'city' : 'village';
    }
  }

  function beginScanDetection() {
    scanGeneration += 1;
    appliedSignature = '';
    lastDetected = null;
    window.setTimeout(applyDetectedSettlementType, 0);
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.(`#${PANEL_ID} [data-action="scan"]`);
    if (!button) return;
    beginScanDetection();
  }, true);

  // The scanner briefly navigates to the village building view before reading
  // the resource fields. Detect isTown during that window and update the
  // planner's internal state before its field calculation runs.
  window.setInterval(() => {
    if (scanIsActive()) {
      void applyDetectedSettlementType();
      return;
    }

    // Once the scan completes, append a small confirmation without interfering
    // with errors/warnings produced by the planner itself.
    if (!lastDetected) return;
    const status = document.querySelector(`#${PANEL_ID} [data-scan-status]`);
    if (status?.dataset.tone === 'success' && !/\b(city|village) detected\b/i.test(status.textContent || '')) {
      const cap = lastDetected.isCity ? 12 : 10;
      const current = planner()?.getState?.();
      if (Number(current?.maxLevel) !== 20) {
        status.textContent = `${String(status.textContent || '').replace(/\s*$/, '')} ${lastDetected.label} detected · fields to ${cap}.`;
      }
    }
    lastDetected = null;
  }, 90);
})();
