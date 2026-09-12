(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';
  const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
  const RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';

  function expandedInfoOpen() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.classList.contains('open')) return false;
    return Boolean(overlay.querySelector('.apes-vd-expanded-intel'));
  }

  // villagePalette refreshes its snapshot every 2.5 seconds and normally
  // rebuilds the entire dashboard body on every response. Rebuilding the body
  // destroys the expanded Info row; the expanded modules then recreate it,
  // which causes the visible full-panel flicker seen in the dashboard.
  //
  // While an Info row is open, keep the currently rendered dashboard stable.
  // The expanded view has its own troop/history/Smithy/resource update paths,
  // so it does not need the periodic base-table rebuild underneath it.
  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.data?.source !== BRIDGE_SOURCE || event.data?.type !== RESPONSE_TYPE) return;
    if (!expandedInfoOpen()) return;

    event.stopImmediatePropagation();
  }, true);

  // Once the Info row is collapsed, ask for a fresh snapshot immediately so
  // the normal dashboard rows catch up without waiting for the next interval.
  document.addEventListener('click', event => {
    if (!event.target?.closest?.('[data-apes-vd-expand], .apes-vd-info-proxy, .apes-vd-village-info')) return;
    window.setTimeout(() => {
      if (expandedInfoOpen()) return;
      window.APES_VILLAGE_PALETTE?.refresh?.();
    }, 120);
  }, true);
})();
