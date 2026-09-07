(() => {
  'use strict';

  const workspace = window.APES_AOC_WORKSPACE;
  if (!workspace || window.__APES_AOC_TOOL_ADAPTERS_V1__) return;
  window.__APES_AOC_TOOL_ADAPTERS_V1__ = true;

  function distanceAdapter() {
    let timer = null;
    let panel = null;
    let sendListener = null;

    function tick() {
      if (!panel?.isConnected) return;
      const input = panel.querySelector('[data-field]');
      if (!input) return;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function mount(host) {
      const api = window.APES_DISTANCE_CALCULATOR;
      panel = document.getElementById('qol-distance-calc-panel');
      if (!api || !panel) throw new Error('Distance Calculator UI is unavailable.');

      try { api.close?.(); } catch (_) {}

      panel.classList.add('apes-aoc-embedded-tool', 'qol-open');
      panel.setAttribute('aria-hidden', 'false');
      host.appendChild(panel);

      const current = panel.querySelector('[data-current-village]');
      if (current) {
        try { api.useCurrentVillage?.(); } catch (_) {}
      }

      tick();
      timer = window.setInterval(tick, 1000);

      sendListener = event => {
        if (!event.target.closest?.('[data-send]')) return;
        window.setTimeout(() => window.APES_ACCOUNT_OPERATIONS_CENTER?.close?.(), 0);
      };
      panel.addEventListener('click', sendListener, true);

      return unmount;
    }

    function unmount() {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
      if (panel && sendListener) panel.removeEventListener('click', sendListener, true);
      sendListener = null;
      if (!panel) return;

      panel.classList.remove('apes-aoc-embedded-tool', 'qol-open');
      panel.setAttribute('aria-hidden', 'true');
      if (panel.parentElement !== document.body) document.body.appendChild(panel);
      panel = null;
    }

    return { mount, unmount };
  }

  workspace.register('distance', distanceAdapter());
})();
