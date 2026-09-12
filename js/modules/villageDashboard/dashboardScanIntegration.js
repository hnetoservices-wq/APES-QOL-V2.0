(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';
  let running = false;

  function dashboardOpen() {
    return document.getElementById(OVERLAY_ID)?.classList.contains('open') || false;
  }

  function setPhase(text) {
    const button = document.querySelector(`#${OVERLAY_ID} .apes-vd-scan-btn`);
    if (!button) return;
    button.classList.toggle('scanning', Boolean(text));
    button.setAttribute('aria-disabled', text ? 'true' : 'false');
    if (text) button.textContent = text;
  }

  async function runCombinedDashboardScan() {
    if (running) return;
    const palette = window.APES_VILLAGE_PALETTE;
    const smithy = window.APES?.villageSmithyLevels;
    if (!palette?.scan) return;

    running = true;
    try {
      // Preserve the dashboard's existing scan first: construction/building
      // locations and the resource-production collector all depend on its
      // normal village-by-village navigation.
      await palette.scan();

      // The Research models are not guaranteed to load simply by visiting a
      // village. Run the Smithy pass immediately afterwards; it reuses cached
      // Research data where available and only opens a Smithy when needed.
      if (smithy?.scan) {
        setPhase('Scanning Smithies…');
        await smithy.scan();
      }
    } catch (error) {
      console.warn('[APES Village Dashboard] Combined dashboard scan failed.', error);
    } finally {
      running = false;
      const button = document.querySelector(`#${OVERLAY_ID} .apes-vd-scan-btn`);
      if (button) {
        button.classList.remove('scanning');
        button.setAttribute('aria-disabled', 'false');
        button.textContent = 'Scan Now';
      }
      window.APES_VILLAGE_PALETTE?.refresh?.();
      window.dispatchEvent(new CustomEvent('apes_vd_dashboard_scan_complete'));
    }
  }

  // Capture before villagePalette's overlay handler. This makes the visible
  // dashboard Scan Now button the single entry point for both the legacy scan
  // and the Smithy/army pass instead of leaving Smithy behind a second button.
  window.addEventListener('click', event => {
    const button = event.target?.closest?.('.apes-vd-scan-btn');
    if (!button || !dashboardOpen()) return;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.contains(button)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!running) void runCombinedDashboardScan();
  }, true);

  window.addEventListener('keydown', event => {
    const button = event.target?.closest?.('.apes-vd-scan-btn');
    if (!button || !dashboardOpen() || !['Enter', ' '].includes(event.key)) return;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.contains(button)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!running) void runCombinedDashboardScan();
  }, true);

  window.APES = window.APES || {};
  window.APES.villageDashboardCombinedScan = Object.freeze({
    run: runCombinedDashboardScan,
    isRunning: () => running
  });
})();
