(() => {
  'use strict';

  const SELECTED_KEY = 'qol_roadmap_selected_v1';
  const HUB_ID = 'qol-roadmaps-container';
  const FALLBACK_ID = 'x3_speedsettle';
  const RETIRED_IDS = Object.freeze(['x1_support_500cp']);
  const RETIRED_SET = new Set(RETIRED_IDS);
  const STYLE_ID = 'qol-roadmaps-retired-guides-style';

  let hubObserver = null;
  let rootObserver = null;
  let queued = false;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = RETIRED_IDS
      .map(id => `#${HUB_ID} [data-roadmap-select="${CSS.escape(id)}"]{display:none!important}`)
      .join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function sanitizeSelection() {
    try {
      const selected = clean(localStorage.getItem(SELECTED_KEY));
      if (RETIRED_SET.has(selected)) localStorage.setItem(SELECTED_KEY, FALLBACK_ID);
    } catch (_) {}
  }

  function installRoadmapsFilter() {
    const base = window.APES?.roadmaps;
    if (!base || typeof base.getAllRoadmaps !== 'function') return false;
    if (base.__retiredGuidesFiltered === true) return true;

    const rawGetAll = base.getAllRoadmaps.bind(base);
    const getAllRoadmaps = () => {
      const all = rawGetAll() || {};
      RETIRED_IDS.forEach(id => delete all[id]);
      return all;
    };

    window.APES.roadmaps = Object.freeze({
      ...base,
      __retiredGuidesFiltered: true,
      getAllRoadmaps
    });
    return true;
  }

  function filterOfficialGuideApi() {
    const base = window.APES?.roadmapsOfficialGuides;
    if (!base || base.__retiredGuidesFiltered === true) return false;

    const rawGetDefinition = typeof base.getDefinition === 'function'
      ? base.getDefinition.bind(base)
      : null;
    const ids = Array.isArray(base.ids)
      ? base.ids.filter(id => !RETIRED_SET.has(clean(id)))
      : [];

    window.APES.roadmapsOfficialGuides = Object.freeze({
      ...base,
      __retiredGuidesFiltered: true,
      ids: Object.freeze(ids),
      getDefinition: id => RETIRED_SET.has(clean(id)) ? null : rawGetDefinition?.(id) ?? null
    });
    return true;
  }

  function enforceHub() {
    queued = false;
    sanitizeSelection();
    installRoadmapsFilter();
    filterOfficialGuideApi();

    const hub = document.getElementById(HUB_ID);
    if (!hub) return;

    let retiredWasActive = false;
    RETIRED_IDS.forEach(id => {
      hub.querySelectorAll(`[data-roadmap-select="${CSS.escape(id)}"]`).forEach(item => {
        if (item.classList.contains('qol-active')) retiredWasActive = true;
        item.remove();
      });
    });

    if (!retiredWasActive) return;
    try {
      localStorage.setItem(SELECTED_KEY, FALLBACK_ID);
    } catch (_) {}

    const fallback = hub.querySelector(`[data-roadmap-select="${CSS.escape(FALLBACK_ID)}"]`);
    fallback?.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0
    }));
  }

  function scheduleEnforce() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enforceHub);
  }

  function observeHub() {
    const hub = document.getElementById(HUB_ID);
    if (!hub) return false;
    if (hubObserver) return true;
    hubObserver = new MutationObserver(scheduleEnforce);
    hubObserver.observe(hub, { childList: true, subtree: true });
    scheduleEnforce();
    return true;
  }

  function init() {
    installStyle();
    sanitizeSelection();
    installRoadmapsFilter();
    filterOfficialGuideApi();

    if (!observeHub()) {
      rootObserver = new MutationObserver(() => {
        installRoadmapsFilter();
        filterOfficialGuideApi();
        if (!observeHub()) return;
        rootObserver?.disconnect();
        rootObserver = null;
      });
      rootObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    window.APES = window.APES || {};
    window.APES.roadmapsRetiredGuides = Object.freeze({
      ids: RETIRED_IDS,
      isRetired: id => RETIRED_SET.has(clean(id))
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
