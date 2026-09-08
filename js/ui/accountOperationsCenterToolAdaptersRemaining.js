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

  function loading(host, text) {
    const node = document.createElement('div');
    node.className = 'apes-aoc-tool-loading';
    node.textContent = text;
    host.replaceChildren(node);
    return node;
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

  // Rally Point Scanner: keep its scan/navigation logic untouched, but treat the
  // floating panel as a proper hosted application while it lives in the AOC.
  workspace.register('rallyPoint', (() => {
    const PANEL_ID = 'qol-rally-point-scanner';
    let panel = null;
    let host = null;

    function mount(nextHost) {
      host = nextHost;
      panel = openByButton(PANEL_ID, 'qol-rally-point-toggle-btn');
      panel.classList.add('apes-aoc-embedded-tool');
      host.appendChild(panel);
      forceEmbeddedBox(panel);
      return unmount;
    }

    function unmount() {
      if (!panel) return;
      panel.style.setProperty('display', 'none', 'important');
      returnToBody(panel);
      // The scanner's native open/close contract is inline display, so leave it
      // definitively closed after restoring its standalone positioning styles.
      panel.style.setProperty('display', 'none', 'important');
      panel = null;
      host = null;
    }

    return { mount, unmount };
  })());

  // CP Manager: the main panel is hosted normally. Plan CP and Plan Trade Routes
  // remain the existing CP sub-applications, but they are pinned over the host
  // every time CP repositions them, so they never escape back into floating mode.
  workspace.register('cpManager', (() => {
    const MAIN_ID = 'qol-cp-manager-panel';
    const SUB_IDS = ['qol-cp-planner-panel', 'qol-cp-trade-planner-panel'];
    let panel = null;
    let host = null;
    let observer = null;
    let clickListener = null;
    let scheduled = [];

    function clearScheduled() {
      scheduled.forEach(id => clearTimeout(id));
      scheduled = [];
    }

    function adoptSubpanels() {
      if (!host?.isConnected) return;
      for (const id of SUB_IDS) {
        const sub = document.getElementById(id);
        if (!sub || !isDisplayed(sub)) continue;
        if (sub.parentElement !== host) host.appendChild(sub);
        sub.classList.add('apes-aoc-embedded-subtool');
        // CP's native renderer deliberately repositions these after opening.
        // Re-assert the embedded geometry every time, not only the first time.
        forceEmbeddedBox(sub, { absolute: true });
      }
    }

    function scheduleAdoption() {
      clearScheduled();
      [0, 40, 120, 260].forEach(delay => {
        scheduled.push(setTimeout(adoptSubpanels, delay));
      });
    }

    function mount(nextHost) {
      host = nextHost;
      panel = openByButton(MAIN_ID, 'qol-cp-toggle-btn');
      panel.classList.add('apes-aoc-embedded-tool');
      host.appendChild(panel);
      forceEmbeddedBox(panel);

      clickListener = event => {
        if (event.target.closest('.qol-cp-plan-btn,.qol-cp-trade-btn')) {
          scheduleAdoption();
          return;
        }
        if (event.target.closest('.qol-cp-open-market-btn')) {
          setTimeout(() => window.APES_ACCOUNT_OPERATIONS_CENTER?.close?.(), 0);
        }
      };
      host.addEventListener('click', clickListener, true);

      observer = new MutationObserver(() => adoptSubpanels());
      observer.observe(document.body, { childList: true, subtree: true });
      adoptSubpanels();
      return unmount;
    }

    function unmount() {
      clearScheduled();
      observer?.disconnect();
      observer = null;
      if (host && clickListener) host.removeEventListener('click', clickListener, true);
      clickListener = null;

      for (const id of SUB_IDS) {
        const sub = document.getElementById(id);
        if (!sub) continue;
        sub.style.setProperty('display', 'none', 'important');
        returnToBody(sub);
        sub.style.setProperty('display', 'none', 'important');
      }
      if (panel) {
        panel.style.setProperty('display', 'none', 'important');
        returnToBody(panel);
        panel.style.setProperty('display', 'none', 'important');
      }
      panel = null;
      host = null;
    }

    return { mount, unmount };
  })());

  // Resource Upgrade Planner's open() is asynchronous because it loads persisted
  // planner state before constructing the panel. The workspace therefore mounts a
  // temporary loading state and adopts the real panel only after open() resolves.
  workspace.register('resourcePlanner', (() => {
    const PANEL_ID = 'qol-resource-upgrade-planner-overlay';
    let panel = null;
    let host = null;
    let cancelled = false;
    let generation = 0;

    async function attach(myGeneration) {
      const api = window.APES_RESOURCE_UPGRADE_PLANNER;
      if (!api?.open) throw new Error('Resource Upgrade Planner API is unavailable.');
      await api.open();
      if (cancelled || myGeneration !== generation || !host?.isConnected) {
        api.close?.();
        return;
      }
      panel = document.getElementById(PANEL_ID);
      if (!panel) throw new Error('Resource Upgrade Planner UI is unavailable.');
      panel.classList.add('qol-open', 'apes-aoc-embedded-tool');
      host.replaceChildren(panel);
      forceEmbeddedBox(panel, { overlay: true });
    }

    function mount(nextHost) {
      host = nextHost;
      cancelled = false;
      const myGeneration = ++generation;
      const status = loading(host, 'Loading Resource Upgrade Planner…');
      void attach(myGeneration).catch(error => {
        console.error('[APES AOC] Resource Upgrade Planner embed failed.', error);
        if (!cancelled && status.isConnected) {
          status.textContent = 'Resource Upgrade Planner could not be loaded in the workspace.';
          status.classList.add('error');
        }
      });
      return unmount;
    }

    function unmount() {
      cancelled = true;
      generation += 1;
      window.APES_RESOURCE_UPGRADE_PLANNER?.close?.();
      if (panel) {
        panel.classList.remove('qol-open');
        returnToBody(panel);
      }
      panel = null;
      host = null;
    }

    return { mount, unmount };
  })());

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
