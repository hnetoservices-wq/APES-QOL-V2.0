(() => {
  'use strict';
  // MAIN world: the map paints a blue tint inside its canvas, beyond CSS filters.
  // These method names are verified against the supplied 0.121.7 game client.
  const FLAG = '__APES_QOL_NIGHT_OVERLAY_BRIDGE__';
  const CLASS = 'qol-daylight-enabled';
  if (window[FLAG]) return;
  window[FLAG] = true;
  let hooked = null, timer = null;
  const forcedIntensity = () => document.documentElement?.classList.contains('qol-night-enabled') ? 1 : document.documentElement?.classList.contains(CLASS) ? 0 : null;
  const active = () => forcedIntensity() !== null;
  function currentMap() {
    const angular = window.angular;
    if (typeof angular?.element !== 'function') return null;
    const nodes = [document.querySelector('[ng-app],[data-ng-app]'), document.body, document.documentElement];
    for (const node of nodes) {
      if (!node) continue;
      try {
        const injector = angular.element(node).injector?.();
        if (!injector || typeof injector.get !== 'function' || injector.has && !injector.has('MapService')) continue;
        const service = injector.get('MapService');
        if (typeof service?.yh === 'function') return service.yh();
      } catch (_) { /* Angular or its map may still be initializing. */ }
    }
    return null;
  }
  function restore() {
    const record = hooked;
    hooked = null;
    if (!record || record.map.Hi !== record.wrapper) return;
    record.map.Hi = record.original;
    try { record.original.call(record.map, record.nativeIntensity); } catch (_) {}
  }
  function sync() {
    if (!active()) {
      if (timer !== null) { window.clearInterval(timer); timer = null; }
      restore();
      return;
    }
    if (timer === null) timer = window.setInterval(sync, 1000);
    const map = currentMap();
    if (hooked?.map === map && map?.Hi === hooked.wrapper) {
      if (hooked.applied !== forcedIntensity()) {
        hooked.applied = forcedIntensity();
        hooked.original.call(map, hooked.applied);
      }
      return;
    }
    restore();
    if (typeof map?.Hi !== 'function') return;
    const intensity = map.renderer?.Gb;
    const record = { map, original: map.Hi,
      nativeIntensity: Number.isFinite(intensity) && intensity >= 0 && intensity <= 1 ? intensity : Number(Boolean(document.querySelector('.ingameContentContainer.nightMode'))) };
    record.wrapper = function (...args) {
      record.nativeIntensity = args[0];
      return Reflect.apply(record.original, this, active() ? [forcedIntensity(), ...args.slice(1)] : args);
    };
    try {
      map.Hi = record.wrapper;
      hooked = record;
      record.applied = forcedIntensity();
      record.original.call(map, record.applied);
    } catch (_) { restore(); }
  }
  function start() {
    if (!document.documentElement) return;
    new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    sync();
  }
  window.addEventListener('hashchange', sync);
  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
