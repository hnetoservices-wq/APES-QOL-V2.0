(() => {
  'use strict';

  function install() {
    const base = window.APES?.roadmaps;
    if (!base || typeof base.open !== 'function' || typeof base.getAllRoadmaps !== 'function') return false;
    if (typeof base.refresh === 'function') return true;

    window.APES.roadmaps = Object.freeze({
      ...base,
      refresh: () => {
        const panel = document.getElementById('qol-roadmaps-container');
        if (!panel?.classList.contains('qol-rm-open')) return;
        base.open();
      }
    });
    return true;
  }

  if (!install()) {
    const timer = setInterval(() => {
      if (!install()) return;
      clearInterval(timer);
    }, 50);
    setTimeout(() => clearInterval(timer), 3000);
  }
})();
