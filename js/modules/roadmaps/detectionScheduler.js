(() => {
  'use strict';

  const FAST_CHECK_MS = 850;
  let timer = null;

  function check() {
    window.APES?.roadmapsAutoComplete?.checkNow?.();
  }

  function init() {
    if (timer) return;
    timer = setInterval(check, FAST_CHECK_MS);

    // Re-check quickly when the runner changes steps or the village changes.
    window.addEventListener('hashchange', () => setTimeout(check, 100));
    document.addEventListener('click', event => {
      if (!event.target.closest('#qol-roadmap-runner [data-rmr-action], #qol-roadmap-runner [data-action]')) return;
      setTimeout(check, 120);
    }, true);

    setTimeout(check, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
