(() => {
  'use strict';

  // MAIN-world bridge: the content script cannot directly access Travian's
  // JavaScript config. Publish only the official production/world speed.
  // No chat data, no network access and no extension permissions required.
  const FLAG = '__APES_QOL_WORLD_SPEED_BRIDGE__';
  const ATTRIBUTE = 'data-apes-world-speed';
  const SPEEDS = new Set([1, 2, 3, 5]);
  if (window[FLAG]) return;
  window[FLAG] = true;

  function publish() {
    const root = document.documentElement;
    const speed = Number(window.Travian?.Config?.TG_SPEED ?? window.config?.TG_SPEED);
    if (!root || !SPEEDS.has(speed)) return false;

    const value = String(speed);
    if (root.getAttribute(ATTRIBUTE) !== value) {
      root.setAttribute(ATTRIBUTE, value);
      window.dispatchEvent(new CustomEvent('apes_qol_world_speed_detected'));
    }
    return true;
  }

  if (publish()) return;
  // Game config becomes available asynchronously after the content script.
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (publish() || attempts >= 240) window.clearInterval(timer);
  }, 500);
})();
