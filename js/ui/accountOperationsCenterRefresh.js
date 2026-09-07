(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';
  let busy = false;

  function forceRender(reason) {
    try {
      if (window.APES_AOC_PERFORMANCE?.force) window.APES_AOC_PERFORMANCE.force(reason);
      else window.dispatchEvent(new CustomEvent('apes_aoc_force_render', { detail: { reason } }));
    } catch (_) {}
  }

  function label(button, text) {
    if (!button?.isConnected) return;
    button.textContent = text;
  }

  function describe(button) {
    if (!button) return;
    button.setAttribute('title', 'Refreshes Travian account cache and recaptures the current village. Resource snapshots for other villages refresh when those villages are visited.');
    button.setAttribute('aria-label', 'Refresh Account Operations Center data');
  }

  function refresh(button) {
    if (busy) return;
    busy = true;
    describe(button);
    label(button, 'Refreshing…');
    button.classList.add('busy');

    const api = window.APES_ACCOUNT_OPERATIONS_CENTER;
    try { api?.captureCurrentVillage?.(); } catch (_) {}
    try { api?.refresh?.(); } catch (_) {}
    forceRender('manual-refresh-start');

    // A couple of short follow-up reads catch cache changes Travian commits immediately
    // after navigation/queue/resource updates without starting any disruptive village scan.
    [180, 520].forEach(delay => setTimeout(() => {
      try { api?.captureCurrentVillage?.(); } catch (_) {}
      try { api?.refresh?.(); } catch (_) {}
      forceRender('manual-refresh-followup');
    }, delay));

    setTimeout(() => {
      const current = document.querySelector(`#${OVERLAY_ID} .apes-aoc2-refresh`);
      label(current, 'Refreshed');
      current?.classList.remove('busy');
    }, 650);

    setTimeout(() => {
      const current = document.querySelector(`#${OVERLAY_ID} .apes-aoc2-refresh`);
      label(current, 'Refresh');
      describe(current);
      busy = false;
    }, 1450);
  }

  document.addEventListener('click', event => {
    const button = event.target.closest?.(`#${OVERLAY_ID} .apes-aoc2-refresh`);
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    refresh(button);
  }, true);

  const observer = new MutationObserver(() => {
    describe(document.querySelector(`#${OVERLAY_ID} .apes-aoc2-refresh`));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  describe(document.querySelector(`#${OVERLAY_ID} .apes-aoc2-refresh`));
})();
