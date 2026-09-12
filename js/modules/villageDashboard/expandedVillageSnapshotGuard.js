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

  function isDashboardSnapshot(event) {
    return event?.source === window &&
      event?.data?.source === BRIDGE_SOURCE &&
      event?.data?.type === RESPONSE_TYPE;
  }

  /*
   * villagePalette and expandedVillageIntel both register VILLAGE_SNAPSHOT
   * message listeners after this module loads. Their normal snapshot handlers
   * rebuild dashboard markup, which destroys the expanded row and causes the
   * visible base-layout -> patched-layout flicker every refresh cycle.
   *
   * Do not rely on stopImmediatePropagation here. Instead wrap future message
   * listeners at registration time and simply withhold dashboard snapshots
   * while an expanded Info row exists. Unrelated postMessage traffic is passed
   * through untouched.
   */
  const nativeAddEventListener = window.addEventListener.bind(window);
  const wrappedListeners = new WeakMap();

  window.addEventListener = function(type, listener, options) {
    if (type !== 'message' || typeof listener !== 'function') {
      return nativeAddEventListener(type, listener, options);
    }

    const wrapped = function(event) {
      if (isDashboardSnapshot(event) && expandedInfoOpen()) return;
      return listener.call(this, event);
    };

    wrappedListeners.set(listener, wrapped);
    return nativeAddEventListener(type, wrapped, options);
  };

  const nativeRemoveEventListener = window.removeEventListener.bind(window);
  window.removeEventListener = function(type, listener, options) {
    if (type === 'message' && typeof listener === 'function') {
      const wrapped = wrappedListeners.get(listener);
      if (wrapped) {
        wrappedListeners.delete(listener);
        return nativeRemoveEventListener(type, wrapped, options);
      }
    }
    return nativeRemoveEventListener(type, listener, options);
  };

  // After collapse, request one fresh base snapshot so the normal dashboard
  // catches up immediately rather than waiting for its next refresh interval.
  document.addEventListener('click', event => {
    if (!event.target?.closest?.('[data-apes-vd-expand], .apes-vd-info-proxy, .apes-vd-village-info')) return;
    window.setTimeout(() => {
      if (expandedInfoOpen()) return;
      window.APES_VILLAGE_PALETTE?.refresh?.();
    }, 120);
  }, true);
})();