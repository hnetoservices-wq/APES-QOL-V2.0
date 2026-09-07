(() => {
  'use strict';

  const A = window.APES_AOC_INTERNAL;
  const D = A?.data;
  const R = A?.rendering;
  if (!A || !D || !R || A.__workspaceV1) return;
  A.__workspaceV1 = true;

  const TAB_KEY = `apes_aoc_workspace_tab:${location.hostname}`;
  const TOOL_KEY = `apes_aoc_workspace_tool:${location.hostname}`;

  const TOOLS = Object.freeze([
    {
      key: 'roadmaps',
      featureKey: 'roadmaps',
      label: 'Roadmaps',
      icon: '▤',
      description: 'Guided village and account development plans with step-by-step progress tracking.'
    },
    {
      key: 'rallyPoint',
      featureKey: 'rallyPointParser',
      label: 'Rally Point Scanner',
      icon: '⚔',
      description: 'Scan incoming and outgoing movements, attacks, reinforcements and incoming resources.'
    },
    {
      key: 'distance',
      featureKey: 'distanceCalculator',
      label: 'Distance & Arrival Calculator',
      icon: '↗',
      description: 'Calculate distance, travel duration, send times and exact server-time landings.'
    },
    {
      key: 'cpManager',
      featureKey: 'cpManager',
      label: 'CP Manager',
      icon: 'CP',
      description: 'Plan Culture Points, celebrations, expansion timing and settlement readiness.'
    },
    {
      key: 'reportArchive',
      featureKey: 'reportArchive',
      label: 'Report Archive',
      icon: '▰',
      description: 'Store, organize, search and reopen important reports after the originals disappear.'
    },
    {
      key: 'watchlists',
      featureKey: 'watchlist',
      label: 'Watchlists',
      icon: '◎',
      description: 'Track players, villages, notes and changes across organized watchlist tabs.'
    },
    {
      key: 'resourcePlanner',
      featureKey: 'resourceUpgradePlanner',
      label: 'Resource Upgrade Planner',
      icon: '◇',
      description: 'Optimize resource-field and production-building upgrade sequences for a village.'
    },
    {
      key: 'secretSociety',
      featureKey: 'secretSocietyScanner',
      label: 'Secret Society Scanner',
      icon: 'SS',
      description: 'Scan and compare Secret Society membership, roles, population and activity.'
    }
  ]);

  const adapters = new Map();
  let activeTab = readTab();
  let activeTool = readTool();
  let cleanupActive = null;
  let overlayObserver = null;

  function readTab() {
    try { return localStorage.getItem(TAB_KEY) === 'tools' ? 'tools' : 'account'; }
    catch (_) { return 'account'; }
  }

  function readTool() {
    try {
      const value = localStorage.getItem(TOOL_KEY) || '';
      return TOOLS.some(tool => tool.key === value) ? value : '';
    } catch (_) { return ''; }
  }

  function saveState() {
    try {
      localStorage.setItem(TAB_KEY, activeTab);
      if (activeTool) localStorage.setItem(TOOL_KEY, activeTool);
      else localStorage.removeItem(TOOL_KEY);
    } catch (_) {}
  }

  function enabled(tool) {
    if (!tool?.featureKey) return true;
    if (typeof window.isQolEnabled === 'function') return window.isQolEnabled(tool.featureKey) === true;
    try { return localStorage.getItem(`qol_${tool.featureKey}`) !== 'false'; }
    catch (_) { return true; }
  }

  function toolByKey(key) {
    return TOOLS.find(tool => tool.key === key) || null;
  }

  function control(label, attrs = '', className = '') {
    return `<div class="apes-aoc-workspace-control ${className}" role="button" tabindex="0" ${attrs}>${D.esc(label)}</div>`;
  }

  function ensureStructure(overlay) {
    if (!overlay) return;
    const shell = overlay.querySelector('.apes-aoc2-shell');
    const header = shell?.querySelector('.apes-aoc2-header');
    const layout = shell?.querySelector('.apes-aoc2-layout');
    const footer = shell?.querySelector('.apes-aoc2-footer');
    if (!shell || !header || !layout || !footer) return;

    layout.classList.add('apes-aoc-account-pane');

    if (!shell.querySelector('.apes-aoc-workspace-tabs')) {
      const tabs = document.createElement('nav');
      tabs.className = 'apes-aoc-workspace-tabs';
      tabs.setAttribute('aria-label', 'Account Operations Center sections');
      tabs.innerHTML = `
        <div class="apes-aoc-workspace-tab" data-aoc-workspace-tab="account" role="tab" tabindex="0" aria-selected="false">
          <strong>Account</strong><small>Account-wide operations</small>
        </div>
        <div class="apes-aoc-workspace-tab" data-aoc-workspace-tab="tools" role="tab" tabindex="0" aria-selected="false">
          <strong>Tools</strong><small data-aoc-tools-tab-note>APES workspace</small>
        </div>`;
      header.insertAdjacentElement('afterend', tabs);
    }

    if (!shell.querySelector('.apes-aoc-tools-workspace')) {
      const pane = document.createElement('section');
      pane.className = 'apes-aoc-tools-workspace';
      pane.setAttribute('aria-hidden', 'true');
      layout.insertAdjacentElement('afterend', pane);
    }

    const overview = layout.querySelector('.apes-aoc2-main > .apes-aoc2-card:first-child');
    overview?.classList.add('apes-aoc-account-overview-card');
    overview?.querySelector(':scope > .apes-aoc2-section-title')?.classList.add('apes-aoc-account-old-title');

    bindTabs(shell);
    observeOverlay(overlay);
    applyTab(overlay, false);
  }

  function observeOverlay(overlay) {
    if (overlayObserver || !overlay) return;
    overlayObserver = new MutationObserver(() => {
      if (!overlay.classList.contains('open')) unmountActiveTool();
      else if (activeTab === 'tools') renderToolsPane(overlay);
    });
    overlayObserver.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }

  function bindTabs(shell) {
    if (shell.dataset.apesWorkspaceBound === '1') return;
    shell.dataset.apesWorkspaceBound = '1';

    shell.addEventListener('click', event => {
      const tab = event.target.closest('[data-aoc-workspace-tab]');
      if (tab) {
        event.preventDefault();
        event.stopPropagation();
        switchTab(tab.dataset.aocWorkspaceTab);
        return;
      }

      const card = event.target.closest('[data-aoc-tool-key]');
      if (card) {
        event.preventDefault();
        event.stopPropagation();
        openTool(card.dataset.aocToolKey);
        return;
      }

      if (event.target.closest('[data-aoc-tools-home]')) {
        event.preventDefault();
        event.stopPropagation();
        showLauncher();
      }
    }, true);

    shell.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      const target = event.target.closest('[data-aoc-workspace-tab],[data-aoc-tool-key],[data-aoc-tools-home]');
      if (!target) return;
      event.preventDefault();
      target.click();
    }, true);
  }

  function switchTab(tab) {
    activeTab = tab === 'tools' ? 'tools' : 'account';
    saveState();
    const overlay = document.getElementById(D.OVERLAY_ID);
    applyTab(overlay, true);
  }

  function applyTab(overlay, focus = false) {
    if (!overlay) return;
    const shell = overlay.querySelector('.apes-aoc2-shell');
    const layout = shell?.querySelector('.apes-aoc-account-pane');
    const toolsPane = shell?.querySelector('.apes-aoc-tools-workspace');
    if (!shell || !layout || !toolsPane) return;

    shell.querySelectorAll('[data-aoc-workspace-tab]').forEach(tab => {
      const selected = tab.dataset.aocWorkspaceTab === activeTab;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    });

    if (activeTab === 'tools') {
      layout.classList.add('workspace-hidden');
      toolsPane.classList.add('open');
      toolsPane.setAttribute('aria-hidden', 'false');
      renderToolsPane(overlay);
    } else {
      unmountActiveTool();
      layout.classList.remove('workspace-hidden');
      toolsPane.classList.remove('open');
      toolsPane.setAttribute('aria-hidden', 'true');
    }

    updateToolsTabNote(shell);
    if (focus) shell.querySelector(`[data-aoc-workspace-tab="${activeTab}"]`)?.focus?.();
  }

  function updateToolsTabNote(shell = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc2-shell`)) {
    const note = shell?.querySelector('[data-aoc-tools-tab-note]');
    if (!note) return;
    const tool = toolByKey(activeTool);
    note.textContent = tool ? tool.label : 'APES workspace';
  }

  function renderLauncher(pane) {
    unmountActiveTool();
    const cards = TOOLS.map(tool => {
      const available = enabled(tool);
      const embedded = adapters.has(tool.key);
      const stateClass = !available ? ' disabled' : embedded ? ' ready' : ' pending';
      const status = !available ? 'Disabled in APES settings' : embedded ? 'Open in workspace' : 'Embedding next';
      return `<div class="apes-aoc-tool-card${stateClass}" data-aoc-tool-key="${D.esc(tool.key)}" role="button" tabindex="${available ? '0' : '-1'}" aria-disabled="${available ? 'false' : 'true'}">
        <span class="apes-aoc-tool-icon">${D.esc(tool.icon)}</span>
        <div class="apes-aoc-tool-copy"><strong>${D.esc(tool.label)}</strong><p>${D.esc(tool.description)}</p><small>${D.esc(status)}</small></div>
        <b class="apes-aoc-tool-arrow">›</b>
      </div>`;
    }).join('');

    pane.innerHTML = `<div class="apes-aoc-tools-launcher">
      <div class="apes-aoc-tools-head"><div><strong>APES Tools</strong><small>Open APES applications inside the Account Operations Center.</small></div></div>
      <div class="apes-aoc-tool-grid">${cards}</div>
    </div>`;
  }

  function renderToolHost(pane, tool) {
    pane.innerHTML = `<div class="apes-aoc-tool-host-shell">
      <div class="apes-aoc-tool-host-head">
        ${control('← All Tools', 'data-aoc-tools-home', 'back')}
        <div><strong>${D.esc(tool.label)}</strong><small>${D.esc(tool.description)}</small></div>
      </div>
      <div class="apes-aoc-tool-host" data-aoc-tool-host="${D.esc(tool.key)}"></div>
    </div>`;
    return pane.querySelector('[data-aoc-tool-host]');
  }

  function renderUnavailable(host, tool, message) {
    host.innerHTML = `<div class="apes-aoc-tool-unavailable"><span>${D.esc(tool.icon)}</span><strong>${D.esc(tool.label)}</strong><p>${D.esc(message)}</p></div>`;
  }

  function renderToolsPane(overlay = document.getElementById(D.OVERLAY_ID)) {
    const pane = overlay?.querySelector('.apes-aoc-tools-workspace');
    if (!pane || activeTab !== 'tools') return;
    if (!activeTool) {
      renderLauncher(pane);
      updateToolsTabNote();
      return;
    }

    const tool = toolByKey(activeTool);
    if (!tool) {
      activeTool = '';
      saveState();
      renderLauncher(pane);
      return;
    }

    const existing = pane.querySelector(`[data-aoc-tool-host="${CSS.escape(tool.key)}"]`);
    if (existing && existing.childElementCount) return;

    unmountActiveTool();
    const host = renderToolHost(pane, tool);
    updateToolsTabNote();

    if (!enabled(tool)) {
      renderUnavailable(host, tool, 'Enable this feature in the APES menu before opening it here.');
      return;
    }

    const adapter = adapters.get(tool.key);
    if (!adapter?.mount) {
      renderUnavailable(host, tool, 'The embedded version of this tool is the next integration step. Its standalone window remains unchanged.');
      return;
    }

    try {
      const result = adapter.mount(host, { overlay, tool });
      cleanupActive = typeof result === 'function' ? result : typeof adapter.unmount === 'function' ? () => adapter.unmount(host) : null;
    } catch (error) {
      console.error(`[APES AOC] Could not embed ${tool.label}.`, error);
      renderUnavailable(host, tool, 'The tool could not be mounted in the AOC workspace. Its standalone version is still available.');
    }
  }

  function unmountActiveTool() {
    if (!cleanupActive) return;
    try { cleanupActive(); } catch (error) { console.warn('[APES AOC] Embedded tool cleanup failed.', error); }
    cleanupActive = null;
  }

  function showLauncher() {
    unmountActiveTool();
    activeTool = '';
    saveState();
    const overlay = document.getElementById(D.OVERLAY_ID);
    const pane = overlay?.querySelector('.apes-aoc-tools-workspace');
    if (pane) renderLauncher(pane);
    updateToolsTabNote();
  }

  function openTool(key) {
    const tool = toolByKey(key);
    if (!tool || !enabled(tool)) return;
    activeTool = key;
    activeTab = 'tools';
    saveState();
    const overlay = document.getElementById(D.OVERLAY_ID);
    applyTab(overlay, false);
  }

  function register(key, adapter) {
    if (!toolByKey(key) || !adapter || typeof adapter.mount !== 'function') return false;
    adapters.set(key, adapter);
    const overlay = document.getElementById(D.OVERLAY_ID);
    if (overlay?.classList.contains('open') && activeTab === 'tools') renderToolsPane(overlay);
    return true;
  }

  const baseMount = R.mount;
  R.mount = (...args) => {
    const overlay = baseMount(...args);
    ensureStructure(overlay);
    return overlay;
  };

  const baseRender = R.render;
  R.render = (...args) => {
    const result = baseRender(...args);
    const overlay = document.getElementById(D.OVERLAY_ID);
    ensureStructure(overlay);
    return result;
  };

  window.APES_AOC_WORKSPACE = Object.freeze({
    version: 1,
    tools: TOOLS.map(tool => ({ ...tool })),
    register,
    openTool,
    showLauncher,
    switchTab,
    state: () => ({ activeTab, activeTool, embedded: adapters.has(activeTool) })
  });

  ensureStructure(document.getElementById(D.OVERLAY_ID));
})();
