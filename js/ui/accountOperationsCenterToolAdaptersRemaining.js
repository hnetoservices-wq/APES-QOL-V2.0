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

  function setImportant(element, property, value) {
    element?.style?.setProperty(property, value, 'important');
  }

  function pinAbsoluteFill(panel) {
    if (!panel) return;
    saveStyle(panel);
    setImportant(panel, 'position', 'absolute');
    setImportant(panel, 'inset', '0');
    setImportant(panel, 'left', '0');
    setImportant(panel, 'right', '0');
    setImportant(panel, 'top', '0');
    setImportant(panel, 'bottom', '0');
    setImportant(panel, 'transform', 'none');
    setImportant(panel, 'margin', '0');
    setImportant(panel, 'padding', '0');
    setImportant(panel, 'width', '100%');
    setImportant(panel, 'min-width', '0');
    setImportant(panel, 'max-width', 'none');
    setImportant(panel, 'height', '100%');
    setImportant(panel, 'min-height', '0');
    setImportant(panel, 'max-height', 'none');
    setImportant(panel, 'resize', 'none');
    setImportant(panel, 'display', 'flex');
    setImportant(panel, 'z-index', '1');
  }

  function repin(callback) {
    callback();
    requestAnimationFrame(callback);
    setTimeout(callback, 60);
    setTimeout(callback, 180);
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

  function makeSimpleAdapter({ panelId, open, close, openClass = '', onPin, onUnmount }) {
    let panel = null;
    let host = null;

    function pin() {
      if (!panel || !host?.isConnected) return;
      pinAbsoluteFill(panel);
      onPin?.({ panel, host });
    }

    function mount(nextHost) {
      host = nextHost;
      panel = open();
      if (!panel) throw new Error(`${panelId} could not be opened.`);
      if (openClass) panel.classList.add(openClass);
      panel.classList.add('apes-aoc-embedded-tool');
      host.appendChild(panel);
      repin(pin);
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

  // Roadmaps applies its saved standalone window position again on the next
  // animation frame after open(). Re-pin after that frame so standalone window
  // coordinates can never leak into the AOC workspace.
  workspace.register('roadmaps', makeSimpleAdapter({
    panelId: 'qol-roadmaps-container',
    open() {
      const api = window.APES?.roadmaps;
      if (!api?.open) throw new Error('Roadmaps API is unavailable.');
      api.open();
      return document.getElementById('qol-roadmaps-container');
    },
    close() { window.APES?.roadmaps?.close?.(); },
    openClass: 'qol-rm-open',
    onPin({ panel }) {
      const workspaceRoot = panel.querySelector('.qol-rm-workspace');
      if (!workspaceRoot) return;
      setImportant(workspaceRoot, 'width', '100%');
      setImportant(workspaceRoot, 'height', '100%');
      setImportant(workspaceRoot, 'min-width', '0');
      setImportant(workspaceRoot, 'min-height', '0');
    }
  }));

  // Rally Point Scanner has synchronous standalone positioning, so a hard pin
  // after the launcher click is enough. Its own full-screen scan lock remains global.
  workspace.register('rallyPoint', makeSimpleAdapter({
    panelId: 'qol-rally-point-scanner',
    open() {
      return openByButton('qol-rally-point-scanner', 'qol-rally-point-toggle-btn');
    },
    close(panel) { panel.style.setProperty('display', 'none', 'important'); }
  }));

  // CP Manager. During Scan CP the panel is temporarily returned to document.body,
  // the AOC stops polling/rendering, and the AOC itself is hidden. This gives the
  // scanner exactly the same navigation environment it has in standalone mode.
  workspace.register('cpManager', (() => {
    const MAIN_ID = 'qol-cp-manager-panel';
    const SUB_IDS = ['qol-cp-planner-panel', 'qol-cp-trade-planner-panel'];
    const SCAN_OVERLAY_ID = 'qol-cp-scan-overlay';
    let panel = null;
    let host = null;
    let observer = null;
    let clickListener = null;
    let isolationTimer = null;
    let isolationActive = false;
    let scanOverlaySeen = false;
    let aocVisibility = '';
    let aocPointerEvents = '';

    function pinMain() {
      if (!panel || !host?.isConnected || isolationActive) return;
      pinAbsoluteFill(panel);
    }

    function adoptSubpanels() {
      if (!host?.isConnected || isolationActive) return;
      for (const id of SUB_IDS) {
        const sub = document.getElementById(id);
        if (!sub || !isDisplayed(sub)) continue;
        if (sub.parentElement !== host) host.appendChild(sub);
        sub.classList.add('apes-aoc-embedded-subtool');
        pinAbsoluteFill(sub);
        setImportant(sub, 'z-index', '6');
      }
    }

    function resumeAfterScan() {
      if (!isolationActive) return;
      isolationActive = false;
      scanOverlaySeen = false;
      if (isolationTimer !== null) clearInterval(isolationTimer);
      isolationTimer = null;

      const aoc = document.getElementById('apes-v2-village-overlay');
      if (aoc) {
        if (aocVisibility) aoc.style.setProperty('visibility', aocVisibility);
        else aoc.style.removeProperty('visibility');
        if (aocPointerEvents) aoc.style.setProperty('pointer-events', aocPointerEvents);
        else aoc.style.removeProperty('pointer-events');
      }

      if (panel && host?.isConnected) {
        panel.classList.add('apes-aoc-embedded-tool');
        host.appendChild(panel);
        repin(pinMain);
      }
      window.APES_ACCOUNT_OPERATIONS_CENTER?.resume?.('cpManagerScan');
      setTimeout(adoptSubpanels, 0);
    }

    function isolateForScan() {
      if (isolationActive || !panel || !host?.isConnected) return;
      isolationActive = true;
      scanOverlaySeen = false;
      window.APES_ACCOUNT_OPERATIONS_CENTER?.suspend?.('cpManagerScan');

      const aoc = document.getElementById('apes-v2-village-overlay');
      if (aoc) {
        aocVisibility = aoc.style.getPropertyValue('visibility');
        aocPointerEvents = aoc.style.getPropertyValue('pointer-events');
        aoc.style.setProperty('visibility', 'hidden', 'important');
        aoc.style.setProperty('pointer-events', 'none', 'important');
      }

      panel.classList.remove('apes-aoc-embedded-tool');
      restoreStyle(panel);
      body().appendChild(panel);
      panel.style.setProperty('display', 'flex', 'important');

      let checks = 0;
      isolationTimer = window.setInterval(() => {
        checks += 1;
        const scanOverlay = document.getElementById(SCAN_OVERLAY_ID);
        if (scanOverlay) scanOverlaySeen = true;
        if (scanOverlaySeen && !scanOverlay) {
          resumeAfterScan();
          return;
        }
        // If the scan never started, do not leave the AOC suspended.
        if (!scanOverlaySeen && checks >= 30) {
          resumeAfterScan();
          return;
        }
        // Hard safety limit: two minutes.
        if (checks >= 2400) resumeAfterScan();
      }, 50);
    }

    function mount(nextHost) {
      host = nextHost;
      panel = openByButton(MAIN_ID, 'qol-cp-toggle-btn');
      panel.classList.add('apes-aoc-embedded-tool');
      host.appendChild(panel);
      repin(pinMain);

      clickListener = event => {
        if (event.target.closest('.qol-cp-scan-btn')) {
          isolateForScan();
          return;
        }
        if (!event.target.closest('.qol-cp-plan-btn,.qol-cp-trade-btn')) return;
        setTimeout(adoptSubpanels, 0);
        setTimeout(adoptSubpanels, 60);
        setTimeout(adoptSubpanels, 180);
      };
      panel.addEventListener('click', clickListener, true);

      observer = new MutationObserver(() => adoptSubpanels());
      observer.observe(document.body, { childList: true, subtree: true });
      adoptSubpanels();
      return unmount;
    }

    function unmount() {
      observer?.disconnect();
      observer = null;
      if (panel && clickListener) panel.removeEventListener('click', clickListener, true);
      clickListener = null;
      if (isolationActive) resumeAfterScan();

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

  // Resource Upgrade Planner opens asynchronously. Poll for the real panel and only
  // then attach it. Its outer element is a standalone full-screen overlay, so both
  // the overlay and its inner window are pinned explicitly to the AOC host.
  workspace.register('resourcePlanner', (() => {
    const PANEL_ID = 'qol-resource-upgrade-planner-overlay';
    let panel = null;
    let inner = null;
    let host = null;
    let attachTimer = null;
    let cancelled = false;

    function pin() {
      if (!panel || !host?.isConnected) return;
      pinAbsoluteFill(panel);
      setImportant(panel, 'background', 'transparent');
      setImportant(panel, 'align-items', 'stretch');
      setImportant(panel, 'justify-content', 'stretch');
      setImportant(panel, 'overflow', 'hidden');

      inner = panel.querySelector('.qol-rup-window');
      if (!inner) return;
      saveStyle(inner);
      setImportant(inner, 'position', 'absolute');
      setImportant(inner, 'inset', '0');
      setImportant(inner, 'left', '0');
      setImportant(inner, 'right', '0');
      setImportant(inner, 'top', '0');
      setImportant(inner, 'bottom', '0');
      setImportant(inner, 'width', '100%');
      setImportant(inner, 'min-width', '0');
      setImportant(inner, 'max-width', 'none');
      setImportant(inner, 'height', '100%');
      setImportant(inner, 'min-height', '0');
      setImportant(inner, 'max-height', 'none');
      setImportant(inner, 'margin', '0');
      setImportant(inner, 'transform', 'none');
      setImportant(inner, 'border', '0');
      setImportant(inner, 'border-radius', '0');
      setImportant(inner, 'box-shadow', 'none');
    }

    function attachWhenReady(attempt = 0) {
      if (cancelled || !host?.isConnected) return;
      panel = document.getElementById(PANEL_ID);
      if (!panel || !panel.classList.contains('qol-open')) {
        if (attempt >= 160) {
          host.innerHTML = '<div class="apes-aoc-tool-unavailable"><strong>Resource Upgrade Planner</strong><p>The planner did not finish opening. Its standalone version remains available.</p></div>';
          return;
        }
        attachTimer = setTimeout(() => attachWhenReady(attempt + 1), 25);
        return;
      }
      panel.classList.add('apes-aoc-embedded-tool');
      host.appendChild(panel);
      repin(pin);
    }

    function mount(nextHost) {
      host = nextHost;
      cancelled = false;
      const api = window.APES_RESOURCE_UPGRADE_PLANNER;
      if (!api?.open) throw new Error('Resource Upgrade Planner API is unavailable.');
      void api.open();
      attachWhenReady();
      return unmount;
    }

    function unmount() {
      cancelled = true;
      if (attachTimer !== null) clearTimeout(attachTimer);
      attachTimer = null;
      try { window.APES_RESOURCE_UPGRADE_PLANNER?.close?.(); } catch (_) {}
      if (inner) restoreStyle(inner);
      inner = null;
      if (panel) returnToBody(panel);
      panel = null;
      host = null;
    }

    return { mount, unmount };
  })());

  workspace.register('secretSociety', makeSimpleAdapter({
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
