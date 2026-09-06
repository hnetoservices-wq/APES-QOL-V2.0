(() => {
  'use strict';

  const APES = window.APES;
  const FEATURE_KEY = 'resourceUpgradePlanner';
  const PREFERENCE_KEY = 'qolpref_resourceUpgradePlanner';
  const PANEL_ID = 'qol-resource-upgrade-planner-overlay';
  const FLOAT_STYLE_ID = 'qol-resource-upgrade-floating-styles';
  const WINDOW_GEOMETRY_KEY = `apes_resource_upgrade_window_geometry_v2_${location.hostname}`;
  const VILLAGE_STATE_STORAGE = Object.freeze({
    feature: FEATURE_KEY,
    key: 'villageScanStates',
    scope: 'player'
  });
  const FALLBACK_KEY = `apes_resource_upgrade_village_states_v1_${location.hostname}`;
  const SYNC_INTERVAL_MS = 650;
  const SCAN_WATCH_MS = 220;
  const MIN_WIDTH = 460;
  const MIN_HEIGHT = 320;
  const DEFAULT_WIDTH = 780;
  const DEFAULT_HEIGHT = 560;
  const VIEWPORT_GAP = 8;
  const originalIsEnabled = window.isQolEnabled;
  let villageStore = {
    version: 1,
    villages: {}
  };
  let storeLoaded = false;
  let storeLoadPromise = null;
  let appliedVillageId = '';
  let appliedHasSavedState = false;
  let restoreBusy = false;
  let pendingScan = null;
  let scanWatchTimer = null;
  let lastSavedFingerprint = '';
  let geometrySaveTimer = null;
  let resizeObserver = null;
  window.isQolEnabled = function (key) {
    if (key === FEATURE_KEY) {
      try {
        const saved = localStorage.getItem(PREFERENCE_KEY);
        if (saved !== null) return saved !== 'false';
      } catch (_) {}
    }
    return typeof originalIsEnabled === 'function' ? originalIsEnabled(key) : true;
  };
  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key !== FEATURE_KEY) return;
    try {
      localStorage.setItem(PREFERENCE_KEY, String(event.detail.enabled !== false));
    } catch (_) {}
  });
  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return null;
    }
  }
  function normalizeStore(raw) {
    const output = {
      version: 1,
      villages: {}
    };
    if (!raw || typeof raw !== 'object' || !raw.villages || typeof raw.villages !== 'object') return output;
    for (const [key, entry] of Object.entries(raw.villages)) {
      if (!/^id:\d+$/.test(key) || !entry || typeof entry !== 'object' || !entry.state) continue;
      const villageId = String(entry.villageId || key.slice(3));
      if (!/^\d+$/.test(villageId)) continue;
      output.villages[`id:${villageId}`] = {
        villageId,
        villageName: String(entry.villageName || 'Village'),
        scannedAt: Number(entry.scannedAt) || Date.now(),
        updatedAt: Number(entry.updatedAt) || Number(entry.scannedAt) || Date.now(),
        state: clone(entry.state)
      };
    }
    return output;
  }
  async function loadStore() {
    if (storeLoaded) return villageStore;
    if (storeLoadPromise) return storeLoadPromise;
    storeLoadPromise = (async () => {
      let saved = null;
      try {
        if (APES?.storage?.get) saved = await APES.storage.get(VILLAGE_STATE_STORAGE, null);
      } catch (error) {
        console.warn('[APES Resource Planner] Per-village state read failed:', error);
      }
      if (!saved) {
        try {
          saved = JSON.parse(localStorage.getItem(FALLBACK_KEY) || 'null');
        } catch (_) {}
      }
      villageStore = normalizeStore(saved);
      storeLoaded = true;
      return villageStore;
    })();
    return storeLoadPromise;
  }
  async function saveStore() {
    const snapshot = clone(villageStore) || {
      version: 1,
      villages: {}
    };
    try {
      if (APES?.storage?.set) {
        await APES.storage.set(VILLAGE_STATE_STORAGE, snapshot);
        return;
      }
    } catch (error) {
      console.warn('[APES Resource Planner] Per-village state write failed:', error);
    }
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
    } catch (_) {}
  }
  function currentVillageIdentity() {
    const hashId = String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
    const contextId = String(APES?.context?.getVillageId?.() || '');
    const villageId = /^\d+$/.test(hashId) ? hashId : /^\d+$/.test(contextId) ? contextId : '';
    const contextName = String(APES?.context?.getVillageName?.() || '').trim();
    const domName = String(document.querySelector('.currentVillageName .dropdownHead .selectedItem .villageEntry, ' + '#villageList .dropdownHead .selectedItem .villageEntry, ' + '.dropdownHead .selectedItem .villageEntry')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      villageId,
      villageName: contextName && contextName !== 'Unknown village' ? contextName : domName || 'Village'
    };
  }
  function villageKey(villageId) {
    const id = String(villageId || '');
    return /^\d+$/.test(id) ? `id:${id}` : '';
  }
  function plannerApi() {
    const api = window.APES_RESOURCE_UPGRADE_PLANNER;
    return api?.getState && api?.setState ? api : null;
  }
  function panel() {
    return document.getElementById(PANEL_ID);
  }
  function plannerWindow() {
    return panel()?.querySelector('.qol-rup-window') || null;
  }
  function panelIsOpen() {
    return panel()?.classList.contains('qol-open') === true;
  }
  function roadmapWasActive() {
    return panel()?.querySelector('[data-tab="roadmap"].active') !== null;
  }
  function clickCalculate() {
    const control = panel()?.querySelector('[data-action="calculate"]');
    if (!control) return false;
    control.click();
    return true;
  }
  function restoreRoadmapTab(keepRoadmap) {
    if (!keepRoadmap) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const tab = panel()?.querySelector('[data-tab="roadmap"]');
      if (tab) {
        window.clearInterval(timer);
        tab.click();
      } else if (attempts >= 15) {
        window.clearInterval(timer);
      }
    }, 80);
  }
  function hideResultsForUnscannedVillage() {
    const root = panel()?.querySelector('[data-results]');
    if (!root) return;
    root.classList.remove('show');
    root.innerHTML = '';
  }
  function blankStateFrom(current) {
    const source = current && typeof current === 'object' ? current : {};
    return {
      layout: '4-4-4-6',
      maxLevel: 10,
      speed: [1, 2, 3, 5].includes(Number(source.speed)) ? Number(source.speed) : 1,
      steps: Math.min(100, Math.max(15, Number(source.steps) || 15)),
      goldBoost: source.goldBoost === true,
      fields: {
        wood: [],
        clay: [],
        iron: [],
        crop: []
      },
      buildings: {
        sawmill: 0,
        brickyard: 0,
        foundry: 0,
        mill: 0,
        bakery: 0,
        embassy: 0
      },
      oases: [],
      completionPlanKey: '',
      completedSteps: []
    };
  }
  function updateLoadedStatus(entry, identity) {
    const status = panel()?.querySelector('[data-scan-status]');
    if (!status || !entry) return;
    const ageMinutes = Math.max(0, Math.floor((Date.now() - Number(entry.scannedAt || 0)) / 60000));
    status.textContent = `Loaded saved scan for ${identity.villageName}${ageMinutes ? ` · ${ageMinutes}m old` : ''}.`;
    status.dataset.tone = 'success';
  }
  function updateUnscannedStatus(identity) {
    const status = panel()?.querySelector('[data-scan-status]');
    if (!status) return;
    status.textContent = `${identity.villageName} has not been scanned yet.`;
    status.dataset.tone = 'neutral';
  }
  function ensureCurrentVillageResults() {
    if (!panelIsOpen() || !appliedHasSavedState) return;
    const results = panel()?.querySelector('[data-results]');
    if (results?.classList.contains('show')) return;
    const keepRoadmap = roadmapWasActive();
    if (clickCalculate()) restoreRoadmapTab(keepRoadmap);
  }
  async function restoreActiveVillage(force = false) {
    if (restoreBusy) return;
    const api = plannerApi();
    if (!api) return;
    const identity = currentVillageIdentity();
    if (!identity.villageId) return;
    if (!force && appliedVillageId === identity.villageId) {
      ensureCurrentVillageResults();
      return;
    }
    restoreBusy = true;
    try {
      await loadStore();
      const entry = villageStore.villages[villageKey(identity.villageId)] || null;
      const keepRoadmap = roadmapWasActive();
      if (entry?.state) {
        await api.setState(clone(entry.state));
        appliedHasSavedState = true;
        lastSavedFingerprint = JSON.stringify(entry.state);
        if (panel()) {
          clickCalculate();
          restoreRoadmapTab(keepRoadmap);
          updateLoadedStatus(entry, identity);
        }
      } else {
        await api.setState(blankStateFrom(api.getState?.()));
        appliedHasSavedState = false;
        lastSavedFingerprint = '';
        hideResultsForUnscannedVillage();
        if (panel()) updateUnscannedStatus(identity);
      }
      appliedVillageId = identity.villageId;
    } catch (error) {
      console.warn('[APES Resource Planner] Could not restore village planner state:', error);
    } finally {
      restoreBusy = false;
    }
  }
  async function saveVillageState(identity, state, scannedAt = Date.now()) {
    if (!identity?.villageId || !state) return;
    await loadStore();
    const key = villageKey(identity.villageId);
    if (!key) return;
    const now = Date.now();
    villageStore.villages[key] = {
      villageId: identity.villageId,
      villageName: identity.villageName || 'Village',
      scannedAt: Number(scannedAt) || now,
      updatedAt: now,
      state: clone(state)
    };
    lastSavedFingerprint = JSON.stringify(state);
    appliedVillageId = identity.villageId;
    appliedHasSavedState = true;
    await saveStore();
    window.dispatchEvent(new CustomEvent('apes_resource_upgrade_village_state_saved', {
      detail: {
        villageId: identity.villageId,
        villageName: identity.villageName || 'Village',
        scannedAt: Number(scannedAt) || now
      }
    }));
  }
  function stopScanWatch() {
    if (scanWatchTimer !== null) window.clearInterval(scanWatchTimer);
    scanWatchTimer = null;
  }
  function startScanWatch(identity) {
    stopScanWatch();
    pendingScan = {
      villageId: identity.villageId,
      villageName: identity.villageName,
      startedAt: Date.now()
    };
    scanWatchTimer = window.setInterval(async () => {
      if (!pendingScan) {
        stopScanWatch();
        return;
      }
      const status = panel()?.querySelector('[data-scan-status]');
      const scanControl = panel()?.querySelector('[data-action="scan"]');
      const busy = scanControl?.classList.contains('qol-disabled') || scanControl?.getAttribute('aria-disabled') === 'true';
      const tone = String(status?.dataset?.tone || '');
      const text = String(status?.textContent || '').trim();
      if (tone === 'error' && !busy) {
        pendingScan = null;
        stopScanWatch();
        return;
      }
      if (busy || tone !== 'success' || !/^Scanned\s+/i.test(text)) return;
      const scanned = pendingScan;
      pendingScan = null;
      stopScanWatch();
      const scannedState = plannerApi()?.getState?.();
      if (scannedState) await saveVillageState(scanned, scannedState, Date.now());
    }, SCAN_WATCH_MS);
  }
  async function persistCurrentVillageEdits() {
    if (restoreBusy || pendingScan) return;
    const identity = currentVillageIdentity();
    if (!identity.villageId || appliedVillageId !== identity.villageId || !appliedHasSavedState) return;
    const state = plannerApi()?.getState?.();
    if (!state) return;
    const fingerprint = JSON.stringify(state);
    if (fingerprint === lastSavedFingerprint) return;
    const previous = villageStore.villages[villageKey(identity.villageId)];
    await saveVillageState(identity, state, previous?.scannedAt || Date.now());
  }
  function injectFloatingStyles() {
    if (!panel() || document.getElementById(FLOAT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = FLOAT_STYLE_ID;
    style.textContent = `
            #${PANEL_ID}{display:none!important;position:fixed!important;inset:0!important;padding:0!important;background:transparent!important;align-items:initial!important;justify-content:initial!important;pointer-events:none!important}
            #${PANEL_ID}.qol-open{display:block!important;pointer-events:none!important}
            #${PANEL_ID} .qol-rup-window{
                position:absolute!important;
                left:0!important;top:0!important;transform:none!important;
                width:${DEFAULT_WIDTH}px!important;height:${DEFAULT_HEIGHT}px!important;
                min-width:${MIN_WIDTH}px!important;min-height:${MIN_HEIGHT}px!important;
                max-width:calc(100vw - ${VIEWPORT_GAP * 2}px)!important;
                max-height:calc(100vh - ${VIEWPORT_GAP * 2}px)!important;
                resize:none!important;overflow:hidden!important;pointer-events:auto!important;
                container-type:inline-size!important;
            }
            #${PANEL_ID} .qol-rup-header{cursor:move!important;user-select:none!important;touch-action:none!important;flex:0 0 auto!important}
            #${PANEL_ID} .qol-rup-body{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;padding:9px!important}
            #${PANEL_ID} .qol-rup-resize-handle{position:absolute!important;z-index:40!important;display:block!important;pointer-events:auto!important;background:transparent!important;touch-action:none!important}
            #${PANEL_ID} .qol-rup-resize-n,#${PANEL_ID} .qol-rup-resize-s{left:10px!important;right:10px!important;height:8px!important;cursor:ns-resize!important}
            #${PANEL_ID} .qol-rup-resize-n{top:-2px!important}#${PANEL_ID} .qol-rup-resize-s{bottom:-2px!important}
            #${PANEL_ID} .qol-rup-resize-e,#${PANEL_ID} .qol-rup-resize-w{top:10px!important;bottom:10px!important;width:8px!important;cursor:ew-resize!important}
            #${PANEL_ID} .qol-rup-resize-e{right:-2px!important}#${PANEL_ID} .qol-rup-resize-w{left:-2px!important}
            #${PANEL_ID} .qol-rup-resize-ne,#${PANEL_ID} .qol-rup-resize-nw,#${PANEL_ID} .qol-rup-resize-se,#${PANEL_ID} .qol-rup-resize-sw{width:16px!important;height:16px!important}
            #${PANEL_ID} .qol-rup-resize-ne{right:-3px!important;top:-3px!important;cursor:nesw-resize!important}
            #${PANEL_ID} .qol-rup-resize-nw{left:-3px!important;top:-3px!important;cursor:nwse-resize!important}
            #${PANEL_ID} .qol-rup-resize-se{right:-3px!important;bottom:-3px!important;cursor:nwse-resize!important}
            #${PANEL_ID} .qol-rup-resize-sw{left:-3px!important;bottom:-3px!important;cursor:nesw-resize!important}
            #${PANEL_ID} .qol-rup-resize-se::after{content:''!important;position:absolute!important;right:4px!important;bottom:4px!important;width:8px!important;height:8px!important;border-right:2px solid rgba(112,86,48,.65)!important;border-bottom:2px solid rgba(112,86,48,.65)!important}
            #${PANEL_ID} .qol-rup-actions-top{padding:6px!important;margin-bottom:7px!important}
            #${PANEL_ID} .qol-rup-section{margin-bottom:7px!important}
            #${PANEL_ID} .qol-rup-section-body{padding:7px!important}
            #${PANEL_ID} .qol-rup-summary{gap:4px!important;margin-bottom:5px!important}
            #${PANEL_ID} .qol-rup-tabs{margin-bottom:5px!important}
            @container (max-width:760px){
                #${PANEL_ID} .qol-rup-settings{grid-template-columns:repeat(2,minmax(125px,1fr))!important}
                #${PANEL_ID} .qol-rup-buildings{grid-template-columns:repeat(2,minmax(125px,1fr))!important}
                #${PANEL_ID} .qol-rup-oasis-summary{grid-template-columns:repeat(2,minmax(125px,1fr))!important}
                #${PANEL_ID} .qol-rup-oasis-count{grid-column:1/-1!important}
                #${PANEL_ID} .qol-rup-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}
                #${PANEL_ID} .qol-rup-compact-row{grid-template-columns:52px minmax(155px,1fr) minmax(180px,1.2fr) 40px!important}
                #${PANEL_ID} .qol-rup-compact-row>*:nth-last-child(2),#${PANEL_ID} .qol-rup-compact-row>*:nth-last-child(3){display:none!important}
                #${PANEL_ID} .qol-rup-scan-status{min-width:120px!important}
            }
            @container (max-width:560px){
                #${PANEL_ID} .qol-rup-settings,#${PANEL_ID} .qol-rup-buildings,#${PANEL_ID} .qol-rup-oasis-summary{grid-template-columns:1fr!important}
                #${PANEL_ID} .qol-rup-summary{grid-template-columns:1fr!important}
                #${PANEL_ID} .qol-rup-action-left{flex-wrap:wrap!important}
                #${PANEL_ID} .qol-rup-scan-status{width:100%!important;min-width:0!important}
                #${PANEL_ID} .qol-rup-compact-row{grid-template-columns:45px minmax(180px,1fr) 40px!important;min-width:300px!important}
                #${PANEL_ID} .qol-rup-compact-row>*:nth-child(3){display:none!important}
            }
        `;
    document.head.appendChild(style);
  }
  function loadWindowGeometry() {
    try {
      const value = JSON.parse(localStorage.getItem(WINDOW_GEOMETRY_KEY) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch (_) {
      return null;
    }
  }
  function viewportLimits() {
    return {
      maxWidth: Math.max(320, window.innerWidth - VIEWPORT_GAP * 2),
      maxHeight: Math.max(240, window.innerHeight - VIEWPORT_GAP * 2)
    };
  }
  function clampGeometry(value) {
    const limits = viewportLimits();
    const fallbackWidth = Math.min(DEFAULT_WIDTH, limits.maxWidth);
    const fallbackHeight = Math.min(DEFAULT_HEIGHT, limits.maxHeight);
    const width = Math.min(limits.maxWidth, Math.max(Math.min(MIN_WIDTH, limits.maxWidth), Number(value?.width) || fallbackWidth));
    const height = Math.min(limits.maxHeight, Math.max(Math.min(MIN_HEIGHT, limits.maxHeight), Number(value?.height) || fallbackHeight));
    const fallbackLeft = Math.max(VIEWPORT_GAP, Math.round((window.innerWidth - width) / 2));
    const fallbackTop = Math.max(VIEWPORT_GAP, Math.round((window.innerHeight - height) / 2));
    const left = Math.max(VIEWPORT_GAP, Math.min(Number.isFinite(Number(value?.left)) ? Number(value.left) : fallbackLeft, window.innerWidth - width - VIEWPORT_GAP));
    const top = Math.max(VIEWPORT_GAP, Math.min(Number.isFinite(Number(value?.top)) ? Number(value.top) : fallbackTop, window.innerHeight - height - VIEWPORT_GAP));
    return {
      left,
      top,
      width,
      height
    };
  }
  function applyGeometry(win, geometry) {
    if (!win || !geometry) return;
    win.style.setProperty('transform', 'none', 'important');
    win.style.setProperty('left', `${Math.round(geometry.left)}px`, 'important');
    win.style.setProperty('top', `${Math.round(geometry.top)}px`, 'important');
    win.style.setProperty('width', `${Math.round(geometry.width)}px`, 'important');
    win.style.setProperty('height', `${Math.round(geometry.height)}px`, 'important');
  }
  function saveWindowGeometry(win = plannerWindow()) {
    if (!win || !panelIsOpen()) return;
    const rect = win.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    try {
      localStorage.setItem(WINDOW_GEOMETRY_KEY, JSON.stringify({
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      }));
    } catch (_) {}
  }
  function scheduleGeometrySave() {
    if (geometrySaveTimer !== null) window.clearTimeout(geometrySaveTimer);
    geometrySaveTimer = window.setTimeout(() => {
      geometrySaveTimer = null;
      saveWindowGeometry();
    }, 140);
  }
  function restoreWindowGeometry(win = plannerWindow()) {
    if (!win || win.dataset.rupGeometryRestored === 'true') return;
    applyGeometry(win, clampGeometry(loadWindowGeometry()));
    win.dataset.rupGeometryRestored = 'true';
  }
  function keepWindowInViewport(win = plannerWindow()) {
    if (!win || !panelIsOpen()) return;
    const rect = win.getBoundingClientRect();
    applyGeometry(win, clampGeometry({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }));
  }
  function makeWindowDraggable(win) {
    const header = win?.querySelector('.qol-rup-header');
    if (!header || header.dataset.rupFloatingDragBound === 'true') return;
    header.dataset.rupFloatingDragBound = 'true';
    header.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('[data-close]')) return;
      const rect = win.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      event.preventDefault();
      event.stopPropagation();
      try {
        header.setPointerCapture?.(event.pointerId);
      } catch (_) {}
      const move = moveEvent => {
        const width = win.getBoundingClientRect().width;
        const height = win.getBoundingClientRect().height;
        const left = Math.max(VIEWPORT_GAP, Math.min(moveEvent.clientX - offsetX, window.innerWidth - width - VIEWPORT_GAP));
        const top = Math.max(VIEWPORT_GAP, Math.min(moveEvent.clientY - offsetY, window.innerHeight - height - VIEWPORT_GAP));
        win.style.setProperty('left', `${left}px`, 'important');
        win.style.setProperty('top', `${top}px`, 'important');
      };
      const stop = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', stop, true);
        window.removeEventListener('pointercancel', stop, true);
        scheduleGeometrySave();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', stop, true);
      window.addEventListener('pointercancel', stop, true);
    });
  }
  function resizeGeometry(direction, start, dx, dy) {
    const limits = viewportLimits();
    let left = start.left;
    let top = start.top;
    let right = start.left + start.width;
    let bottom = start.top + start.height;
    if (direction.includes('e')) right = Math.min(window.innerWidth - VIEWPORT_GAP, start.left + start.width + dx);
    if (direction.includes('s')) bottom = Math.min(window.innerHeight - VIEWPORT_GAP, start.top + start.height + dy);
    if (direction.includes('w')) left = Math.max(VIEWPORT_GAP, start.left + dx);
    if (direction.includes('n')) top = Math.max(VIEWPORT_GAP, start.top + dy);
    const minWidth = Math.min(MIN_WIDTH, limits.maxWidth);
    const minHeight = Math.min(MIN_HEIGHT, limits.maxHeight);
    if (right - left < minWidth) {
      if (direction.includes('w')) left = right - minWidth;else right = left + minWidth;
    }
    if (bottom - top < minHeight) {
      if (direction.includes('n')) top = bottom - minHeight;else bottom = top + minHeight;
    }
    left = Math.max(VIEWPORT_GAP, left);
    top = Math.max(VIEWPORT_GAP, top);
    right = Math.min(window.innerWidth - VIEWPORT_GAP, right);
    bottom = Math.min(window.innerHeight - VIEWPORT_GAP, bottom);
    return {
      left,
      top,
      width: right - left,
      height: bottom - top
    };
  }
  function bindResizeHandle(win, handle) {
    if (handle.dataset.rupResizeBound === 'true') return;
    handle.dataset.rupResizeBound = 'true';
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const direction = handle.dataset.rupResize;
      const rect = win.getBoundingClientRect();
      const start = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        x: event.clientX,
        y: event.clientY
      };
      event.preventDefault();
      event.stopPropagation();
      try {
        handle.setPointerCapture?.(event.pointerId);
      } catch (_) {}
      const move = moveEvent => {
        const next = resizeGeometry(direction, start, moveEvent.clientX - start.x, moveEvent.clientY - start.y);
        applyGeometry(win, next);
      };
      const stop = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', stop, true);
        window.removeEventListener('pointercancel', stop, true);
        scheduleGeometrySave();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', stop, true);
      window.addEventListener('pointercancel', stop, true);
    });
  }
  function ensureResizeHandles(win) {
    ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].forEach(direction => {
      let handle = win.querySelector(`[data-rup-resize="${direction}"]`);
      if (!handle) {
        handle = document.createElement('span');
        handle.className = `qol-rup-resize-handle qol-rup-resize-${direction}`;
        handle.dataset.rupResize = direction;
        handle.setAttribute('aria-hidden', 'true');
        win.appendChild(handle);
      }
      bindResizeHandle(win, handle);
    });
  }
  function ensureFloatingWindow() {
    const win = plannerWindow();
    if (!panel() || !win) return;
    injectFloatingStyles();
    ensureResizeHandles(win);
    makeWindowDraggable(win);
    if (panelIsOpen()) {
      restoreWindowGeometry(win);
      window.requestAnimationFrame(() => keepWindowInViewport(win));
    }
    if (!resizeObserver && typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        if (panelIsOpen()) scheduleGeometrySave();
      });
      resizeObserver.observe(win);
    }
  }
  function handlePlannerClick(event) {
    const scanControl = event.target.closest?.(`#${PANEL_ID} [data-action="scan"]`);
    if (!scanControl) return;
    const identity = currentVillageIdentity();
    if (identity.villageId) startScanWatch(identity);
  }
  function handlePlannerChange(event) {
    const target = event.target;
    if (!target || !panel()?.contains(target)) return;
    if (target.closest?.('[data-rup-roadmap-complete]')) return;
    window.setTimeout(() => {
      void persistCurrentVillageEdits();
    }, 80);
  }
  function scheduleRestore(force = false) {
    window.setTimeout(() => {
      void restoreActiveVillage(force);
    }, 0);
  }
  document.addEventListener('click', handlePlannerClick, true);
  document.addEventListener('change', handlePlannerChange, true);
  window.addEventListener('hashchange', () => scheduleRestore(false));
  window.addEventListener('resize', () => {
    ensureFloatingWindow();
    keepWindowInViewport();
    scheduleGeometrySave();
  }, {
    passive: true
  });
  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key === FEATURE_KEY && event.detail.enabled !== false) scheduleRestore(true);
  });
  const observer = new MutationObserver(() => {
    ensureFloatingWindow();
    if (!panelIsOpen()) return;
    scheduleRestore(false);
    ensureCurrentVillageResults();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
  window.setInterval(() => {
    ensureFloatingWindow();
    const identity = currentVillageIdentity();
    if (!identity.villageId) return;
    if (identity.villageId !== appliedVillageId) void restoreActiveVillage(false);else ensureCurrentVillageResults();
  }, SYNC_INTERVAL_MS);
  loadStore().then(() => scheduleRestore(true));
  window.APES_RESOURCE_UPGRADE_VILLAGE_STATES = Object.freeze({
    get: async villageId => {
      await loadStore();
      const entry = villageStore.villages[villageKey(villageId)];
      return entry ? clone(entry) : null;
    },
    list: async () => {
      await loadStore();
      return Object.values(villageStore.villages).map(entry => ({
        villageId: entry.villageId,
        villageName: entry.villageName,
        scannedAt: entry.scannedAt,
        updatedAt: entry.updatedAt
      }));
    }
  });
})();
