(() => {
  'use strict';

  const workspace = window.APES_AOC_WORKSPACE;
  if (!workspace || window.__APES_AOC_TOOL_ADAPTERS_REMAINING__) return;
  window.__APES_AOC_TOOL_ADAPTERS_REMAINING__ = true;

  const body = () => document.body || document.documentElement;

  function isDisplayed(element) {
    if (!element) return false;
    try { return getComputedStyle(element).display !== 'none'; }
    catch (_) { return false; }
  }

  function saveStyle(element) {
    if (!element || element.dataset.apesAocSavedStyle !== undefined) return;
    element.dataset.apesAocSavedStyle = element.getAttribute('style') || '';
  }

  function restoreStyle(element) {
    if (!element || element.dataset.apesAocSavedStyle === undefined) return;
    const saved = element.dataset.apesAocSavedStyle;
    if (saved) element.setAttribute('style', saved);
    else element.removeAttribute('style');
    delete element.dataset.apesAocSavedStyle;
  }

  function forceEmbeddedBox(panel, { overlay = false, absolute = false } = {}) {
    if (!panel) return;
    saveStyle(panel);
    const set = (name, value) => panel.style.setProperty(name, value, 'important');
    set('position', absolute ? 'absolute' : 'relative');
    set('left', 'auto');
    set('right', 'auto');
    set('top', 'auto');
    set('bottom', 'auto');
    set('inset', absolute ? '0' : 'auto');
    set('transform', 'none');
    set('margin', '0');
    set('width', '100%');
    set('max-width', 'none');
    set('height', '100%');
    set('max-height', 'none');
    set('min-width', '0');
    set('min-height', '0');
    set('resize', 'none');
    set('z-index', absolute ? '6' : 'auto');
    set('display', 'flex');
    if (overlay) {
      set('padding', '0');
      set('background', 'transparent');
      set('align-items', 'stretch');
      set('justify-content', 'stretch');
    }
  }

  function returnToBody(panel) {
    if (!panel) return;
    panel.classList.remove('apes-aoc-embedded-tool', 'apes-aoc-embedded-subtool');
    restoreStyle(panel);
    if (panel.parentElement !== body()) body().appendChild(panel);
  }

  function openByButton(panelId, buttonId, isOpen = isDisplayed) {
    let panel = document.getElementById(panelId);
    if (!panel || !isOpen(panel)) {
      const button = document.getElementById(buttonId);
      if (!button) throw new Error(`Launcher ${buttonId} is unavailable.`);
      button.click();
      panel = document.getElementById(panelId);
    }
    if (!panel) throw new Error(`Panel ${panelId} is unavailable.`);
    return panel;
  }

  function makeAdapter({ panelId, open, close, openClass = '', overlay = false, onMount, onUnmount }) {
    let panel = null;
    let host = null;

    function mount(nextHost) {
      host = nextHost;
      panel = open();
      if (!panel) throw new Error(`${panelId} could not be opened.`);
      if (openClass) panel.classList.add(openClass);
      panel.classList.add('apes-aoc-embedded-tool');
      host.appendChild(panel);
      forceEmbeddedBox(panel, { overlay });
      onMount?.({ panel, host });
      return unmount;
    }

    function unmount() {
      try { onUnmount?.({ panel, host }); } catch (_) {}
      if (!panel) return;
      try { close?.(panel); } catch (_) {}
      if (openClass) panel.classList.remove(openClass);
      returnToBody(panel);
      panel = null;
      host = null;
    }

    return { mount, unmount };
  }

  // Roadmaps — same Roadmaps application, simply hosted by the AOC.
  workspace.register('roadmaps', makeAdapter({
    panelId: 'qol-roadmaps-container',
    open() {
      const api = window.APES?.roadmaps;
      if (!api?.open) throw new Error('Roadmaps API is unavailable.');
      api.open();
      return document.getElementById('qol-roadmaps-container');
    },
    close() { window.APES?.roadmaps?.close?.(); },
    openClass: 'qol-rm-open'
  }));

  // Rally Point Scanner — scans keep using the scanner's existing full-screen lock.
  workspace.register('rallyPoint', makeAdapter({
    panelId: 'qol-rally-point-scanner',
    open() {
      return openByButton('qol-rally-point-scanner', 'qol-rally-point-toggle-btn');
    },
    close(panel) { panel.style.setProperty('display', 'none', 'important'); }
  }));

  // CP Manager — its Plan CP and Trade Route planner subwindows are adopted into
  // the same AOC host as overlays, rather than appearing as separate floating windows.
  workspace.register('cpManager', (() => {
    const MAIN_ID = 'qol-cp-manager-panel';
    const SUB_IDS = ['qol-cp-planner-panel', 'qol-cp-trade-planner-panel'];
    let panel = null;
    let host = null;
    let observer = null;
    let clickListener = null;

    function adoptSubpanels() {
      if (!host?.isConnected) return;
      for (const id of SUB_IDS) {
        const sub = document.getElementById(id);
        if (!sub || !isDisplayed(sub)) continue;
        if (sub.parentElement !== host) host.appendChild(sub);
        sub.classList.add('apes-aoc-embedded-subtool');
        forceEmbeddedBox(sub, { absolute: true });
      }
    }

    function mount(nextHost) {
      host = nextHost;
      panel = openByButton(MAIN_ID, 'qol-cp-toggle-btn');
      panel.classList.add('apes-aoc-embedded-tool');
      host.appendChild(panel);
      forceEmbeddedBox(panel);

      clickListener = event => {
        if (!event.target.closest('.qol-cp-plan-btn,.qol-cp-trade-btn')) return;
        setTimeout(adoptSubpanels, 0);
        setTimeout(adoptSubpanels, 60);
      };
      panel.addEventListener('click', clickListener, true);

      observer = new MutationObserver(() => adoptSubpanels());
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
      adoptSubpanels();
      return unmount;
    }

    function unmount() {
      observer?.disconnect();
      observer = null;
      if (panel && clickListener) panel.removeEventListener('click', clickListener, true);
      clickListener = null;

      for (const id of SUB_IDS) {
        const sub = document.getElementById(id);
        if (!sub) continue;
        sub.style.setProperty('display', 'none', 'important');
        returnToBody(sub);
      }
      if (panel) {
        panel.style.setProperty('display', 'none', 'important');
        returnToBody(panel);
      }
      panel = null;
      host = null;
    }

    return { mount, unmount };
  })());

  // Resource Upgrade Planner — its existing scanner lock remains global while the
  // planner itself occupies the AOC workspace.
  workspace.register('resourcePlanner', makeAdapter({
    panelId: 'qol-resource-upgrade-planner-overlay',
    open() {
      const api = window.APES_RESOURCE_UPGRADE_PLANNER;
      if (!api?.open) throw new Error('Resource Upgrade Planner API is unavailable.');
      api.open();
      return document.getElementById('qol-resource-upgrade-planner-overlay');
    },
    close() { window.APES_RESOURCE_UPGRADE_PLANNER?.close?.(); },
    openClass: 'qol-open',
    overlay: true
  }));

  // Secret Society Scanner — scanning and messaging locks continue to cover the
  // game, but the normal scanner UI stays inside the AOC Tools tab.
  workspace.register('secretSociety', makeAdapter({
    panelId: 'qol-ss-scanner-panel',
    open() {
      return openByButton(
        'qol-ss-scanner-panel',
        'qol-ss-scanner-toggle-btn',
        panel => panel.classList.contains('qol-ss-open')
      );
    },
    close(panel) { panel.classList.remove('qol-ss-open'); },
    openClass: 'qol-ss-open'
  }));
})();
