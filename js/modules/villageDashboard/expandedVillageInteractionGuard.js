(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';
  const GUARD_FLAG = 'apesVdInteractionGuard';

  function guardDetail(detail) {
    if (!detail || detail.dataset[GUARD_FLAG] === '1') return;
    detail.dataset[GUARD_FLAG] = '1';

    // The dashboard treats any ancestor carrying data-village-id as a village
    // navigation target. Expanded intel deliberately carries the village id too,
    // so clicks/keys inside the panel must stop before bubbling to the dashboard
    // overlay while still reaching their actual controls normally.
    detail.addEventListener('click', event => {
      event.stopPropagation();
    });

    detail.addEventListener('keydown', event => {
      event.stopPropagation();
    });
  }

  function patch() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    overlay.querySelectorAll('.apes-vd-expanded-intel').forEach(guardDetail);
  }

  const observer = new MutationObserver(patch);

  function install() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return false;
    patch();
    observer.disconnect();
    observer.observe(overlay, { childList: true, subtree: true });
    return true;
  }

  if (!install()) {
    const timer = window.setInterval(() => {
      if (install()) window.clearInterval(timer);
    }, 250);
  }
})();
