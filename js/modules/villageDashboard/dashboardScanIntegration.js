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
    const troops = window.APES?.villageDashboardIntel;
    if (!palette?.scan) return;

    running = true;
    let troopFailed = false;
    let villagesFailed = false;
    try {
      // Preserve the dashboard's existing scan first: construction/building
      // locations and the resource-production collector all depend on its
      // normal village-by-village navigation.
      setPhase('Loading villages…');
      const villagesScanned = await palette.scan();
      if (villagesScanned === false) {
        villagesFailed = true;
        console.warn('[APES Village Dashboard] Scan Now did not start: village list is unavailable.');
        return;
      }

      // The Research models are not guaranteed to load simply by visiting a
      // village. Run the Smithy pass immediately afterwards; it reuses cached
      // Research data where available and only opens a Smithy when needed.
      if (smithy?.scan) {
        setPhase('Scanning Smithies…');
        try {
          await smithy.scan();
        } catch (error) {
          // A Smithy failure should not prevent a fresh troop snapshot.
          console.warn('[APES Village Dashboard] Smithy pass failed.', error);
        }
      }

      // Account Overview's Unit Counter reads saved army-history snapshots.
      // A normal village-by-village Scan Now previously never refreshed them,
      // leaving correct-looking coverage (2/2) but stale totals for hours.
      // The existing troop scanner opens the game's own Troops overview,
      // reads its per-village figures, records the history and restores
      // the original hash. This does NOT read only stationary village troops.
      if (troops?.refreshTroops) {
        setPhase('Scanning Troops…');
        const refreshed = await troops.refreshTroops();
        if (!refreshed) {
          troopFailed = true;
          console.warn('[APES Village Dashboard] Troop overview scan did not complete; saved Unit Counter history was retained.');
        }
      } else {
        troopFailed = true;
        console.warn('[APES Village Dashboard] Troop scanner is not loaded; Unit Counter was not refreshed.');
      }
    } catch (error) {
      troopFailed = true;
      console.warn('[APES Village Dashboard] Combined dashboard scan failed.', error);
    } finally {
      running = false;
      const button = document.querySelector(`#${OVERLAY_ID} .apes-vd-scan-btn`);
      if (button) {
        button.classList.remove('scanning');
        button.setAttribute('aria-disabled', 'false');
        button.textContent = villagesFailed
          ? 'Villages unavailable — Retry'
          : troopFailed ? 'Troop scan failed — Retry' : 'Scan Now';
        button.title = villagesFailed
          ? 'Village data did not load. Retry to scan once the game has loaded.'
          : troopFailed
            ? 'Unit Counter was not refreshed. Retry, or check the DevTools console for the troop scan error.'
            : 'Scan all villages and refresh troop counts';
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
