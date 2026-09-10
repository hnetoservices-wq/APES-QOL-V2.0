(() => {
  'use strict';

  const FEATURE_KEY = 'tradeRouteTracker';
  const SETTING_KEY = `qol_${FEATURE_KEY}`;
  const PANEL_ID = 'qol-trade-route-tracker';
  const BUTTON_ID = 'qol-trade-route-tracker-toggle-btn';
  const LOCK_ID = 'qol-trade-route-scan-lock';
  const STYLE_ID = 'qol-trade-route-tracker-styles';
  const CHECKBOX_ID = 'qol-chk-trade-route-tracker';
  const UI_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_UI';
  const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
  const REQUEST_TYPE = 'REQUEST_SNAPSHOT';
  const RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';
  const MARKET_BUILDING_TYPE = 17;
  const RESOURCE_KEYS = Object.freeze(['wood', 'clay', 'iron', 'crop']);
  const RESOURCE_LABELS = Object.freeze({ wood: 'Wood', clay: 'Clay', iron: 'Iron', crop: 'Crop' });
  const RESOURCE_ICONS = Object.freeze({
    wood: 'unit_wood_small_illu resType1',
    clay: 'unit_clay_small_illu resType2',
    iron: 'unit_iron_small_illu resType3',
    crop: 'unit_crop_small_illu resType4'
  });

  let latestSnapshot = null;
  let currentData = null;
  let scanRunning = false;
  let menuSyncQueued = false;
  let launcherSyncTimer = null;

  function enabled() {
    try {
      const value = localStorage.getItem(SETTING_KEY);
      return value === null ? true : value !== 'false';
    } catch (_) {
      return true;
    }
  }

  function setEnabled(value) {
    try { localStorage.setItem(SETTING_KEY, String(Boolean(value))); } catch (_) {}
    window.dispatchEvent(new CustomEvent('qol_setting_changed', { detail: { key: FEATURE_KEY, enabled: Boolean(value) } }));
    if (!value) closePanel();
    syncRuntime();
    scheduleMenuSync();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function numberFromText(value) {
    const cleaned = String(value ?? '')
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
      .replace(/[^0-9-]/g, '');
    const number = Number.parseInt(cleaned || '0', 10);
    return Number.isFinite(number) ? number : 0;
  }

  function fmt(value) {
    return Math.round(Number(value) || 0).toLocaleString('en-US');
  }

  function resourceIcon(key) {
    return `<i class="qol-tr-route-res-icon ${RESOURCE_ICONS[key]}" title="${RESOURCE_LABELS[key]}" aria-label="${RESOURCE_LABELS[key]}"></i>`;
  }

  function currentVillageId() {
    return String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
  }

  function storageKey(playerId) {
    return `apes_trade_route_tracker_v1:${location.hostname}:${playerId || 'unknown'}`;
  }

  function saveData(data) {
    try { localStorage.setItem(storageKey(data?.playerId), JSON.stringify(data)); } catch (error) {
      console.warn('[APES Trade Route Tracker] Could not save scan.', error);
    }
  }

  function loadData(playerId = latestSnapshot?.playerId) {
    try {
      const data = JSON.parse(localStorage.getItem(storageKey(playerId)) || 'null');
      return data && typeof data === 'object' ? data : null;
    } catch (_) {
      return null;
    }
  }

  function requestSnapshot(timeout = 3500) {
    return new Promise(resolve => {
      let done = false;
      const finish = payload => {
        if (done) return;
        done = true;
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        if (payload) latestSnapshot = payload;
        resolve(payload || null);
      };
      const onMessage = event => {
        if (event.source !== window) return;
        if (event.data?.source !== BRIDGE_SOURCE || event.data?.type !== RESPONSE_TYPE) return;
        finish(event.data.payload);
      };
      const timer = setTimeout(() => finish(null), timeout);
      window.addEventListener('message', onMessage);
      window.postMessage({ source: UI_SOURCE, type: REQUEST_TYPE }, location.origin);
    });
  }

  function marketLocationFromSnapshot(village) {
    const building = (village?.buildings || []).find(item => Number(item?.buildingType) === MARKET_BUILDING_TYPE && Number(item?.locationId) > 0 && Number(item?.lvl) > 0);
    return building ? Number(building.locationId) : null;
  }

  function marketLocationFromDom() {
    const image = document.querySelector('#villageView img.location.buildingId17');
    if (!image) return null;
    const fromId = String(image.id || '').match(/^buildingImage(\d+)$/)?.[1];
    if (fromId) return Number(fromId);
    const wrapper = image.closest('building-location');
    const locationClass = Array.from(wrapper?.classList || []).find(name => /^buildingLocation\d+$/.test(name));
    return locationClass ? Number(locationClass.replace('buildingLocation', '')) : null;
  }

  async function waitFor(predicate, timeout = 6000, interval = 80) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const value = predicate();
        if (value) return value;
      } catch (_) {}
      await sleep(interval);
    }
    return null;
  }

  async function navigate(hash, predicate, timeout = 6500) {
    if (location.hash !== hash) location.hash = hash;
    return waitFor(predicate, timeout);
  }

  function scanHash(villageId, marketLocation) {
    return `#/page:village/villId:${villageId}/location:${marketLocation}/window:building/tab:TradeRoute`;
  }

  function villageHash(villageId) {
    return `#/page:village/villId:${villageId}`;
  }

  function visibleDepartures(route) {
    const markers = Array.from(route.querySelectorAll('trade-route .timeline .timeMarker > div[class*="hour-"]'));
    if (!markers.length) return 1;
    const visible = markers.filter(marker => {
      if (marker.classList.contains('ng-hide')) return false;
      const style = getComputedStyle(marker);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).length;
    return Math.max(1, visible);
  }

  function parseRoute(route, sourceVillage) {
    const target = route.querySelector('.controlPanel .villageLink[villageid], .controlPanel .villageLink[villageId]');
    const targetId = String(target?.getAttribute('villageid') || target?.getAttribute('villageId') || '').trim();
    const targetName = String(target?.getAttribute('villagename') || target?.textContent || 'Unknown target').replace(/\s+/g, ' ').trim();
    if (!targetId) return null;

    const resources = {};
    const selectors = {
      wood: '.woodValue .resourceValue',
      clay: '.clayValue .resourceValue',
      iron: '.ironValue .resourceValue',
      crop: '.cropValue .resourceValue'
    };
    for (const key of RESOURCE_KEYS) resources[key] = numberFromText(route.querySelector(selectors[key])?.textContent);

    const controlText = route.querySelector('.controlPanel')?.textContent?.replace(/\s+/g, ' ') || '';
    const merchants = Number.parseInt(controlText.match(/(\d+)\s+Merchants?/i)?.[1] || '0', 10) || 0;
    const startButton = route.querySelector('.tradeRoute_start_small_flat_black')?.closest('.iconButton');
    const pauseButton = route.querySelector('.tradeRoute_pause_small_flat_black')?.closest('.iconButton');
    const active = startButton ? startButton.classList.contains('active') : !(pauseButton?.classList.contains('active'));
    const departures = visibleDepartures(route);
    const daily = Object.fromEntries(RESOURCE_KEYS.map(key => [key, active ? resources[key] * departures : 0]));

    return {
      sourceVillageId: String(sourceVillage.villageId),
      sourceVillageName: String(sourceVillage.name || sourceVillage.villageId),
      targetVillageId: targetId,
      targetVillageName: targetName,
      merchants,
      active,
      departuresPerDay: departures,
      resources,
      daily
    };
  }

  function parseTradeRoutePage(sourceVillage) {
    const root = document.querySelector('.tabTradeRoute .tradeRoute, .loadedTab.tabTradeRoute .tradeRoute');
    if (!root) return null;
    return Array.from(root.querySelectorAll('.routeContainer')).map(route => parseRoute(route, sourceVillage)).filter(Boolean);
  }

  function summarize(routes, ownIds) {
    const map = new Map();
    for (const route of routes) {
      const key = String(route.targetVillageId);
      let item = map.get(key);
      if (!item) {
        item = {
          targetVillageId: key,
          targetVillageName: route.targetVillageName,
          type: ownIds.has(key) ? 'Own Village' : 'WW',
          routeCount: 0,
          activeRouteCount: 0,
          sources: new Set(),
          perDispatch: { wood: 0, clay: 0, iron: 0, crop: 0 },
          daily: { wood: 0, clay: 0, iron: 0, crop: 0 }
        };
        map.set(key, item);
      }
      item.routeCount += 1;
      if (route.active) item.activeRouteCount += 1;
      item.sources.add(route.sourceVillageName);
      for (const resource of RESOURCE_KEYS) {
        item.perDispatch[resource] += route.resources[resource] || 0;
        item.daily[resource] += route.daily[resource] || 0;
      }
    }
    return Array.from(map.values()).map(item => ({ ...item, sources: Array.from(item.sources).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) }))
      .sort((a, b) => (a.type === 'WW' ? -1 : 1) - (b.type === 'WW' ? -1 : 1) || a.targetVillageName.localeCompare(b.targetVillageName, undefined, { numeric: true }));
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
#${PANEL_ID}{position:fixed!important;left:50%!important;top:50%!important;transform:translate(-50%,-50%)!important;width:min(980px,calc(100vw - 40px))!important;height:min(680px,calc(100vh - 40px))!important;z-index:1000000!important;display:none!important;flex-direction:column!important;border:2px solid var(--qol-border)!important;border-radius:5px!important;background:#f6f1e8!important;box-shadow:0 14px 36px rgba(0,0,0,.48)!important;color:#4b3925!important;overflow:hidden!important}
#${PANEL_ID}.open{display:flex!important}
#${PANEL_ID} .qol-tr-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;min-height:42px!important;padding:7px 10px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-dark))!important;color:#fff9ed!important;flex:0 0 auto!important}
#${PANEL_ID} .qol-tr-title{display:flex!important;align-items:baseline!important;gap:8px!important;min-width:0!important}
#${PANEL_ID} .qol-tr-title strong{font-size:13px!important}.qol-tr-sub{font-size:8.5px!important;opacity:.82!important}
#${PANEL_ID} .qol-tr-head-actions{display:flex!important;align-items:center!important;gap:6px!important}
#${PANEL_ID} .qol-tr-btn{all:unset!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:27px!important;padding:4px 9px!important;border:1px solid #8b7351!important;border-radius:3px!important;background:linear-gradient(to bottom,#fffdf8,#e3d7c4)!important;color:#4b3823!important;font-size:9px!important;font-weight:800!important;cursor:pointer!important;user-select:none!important}
#${PANEL_ID} .qol-tr-btn.primary{border-color:var(--qol-action-border)!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important}
#${PANEL_ID} .qol-tr-close{all:unset!important;display:flex!important;align-items:center!important;justify-content:center!important;width:26px!important;height:26px!important;border-radius:3px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;font-size:18px!important;cursor:pointer!important}
#${PANEL_ID} .qol-tr-stats{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:7px!important;padding:8px 10px!important;background:#ede3d3!important;border-bottom:1px solid #d5c5ac!important;flex:0 0 auto!important}
#${PANEL_ID} .qol-tr-stat{padding:7px 8px!important;border:1px solid #d4c4aa!important;border-radius:3px!important;background:#fffaf1!important}.qol-tr-stat span{display:block!important;color:#8a765a!important;font-size:7.5px!important;font-weight:800!important;text-transform:uppercase!important}.qol-tr-stat strong{display:block!important;margin-top:2px!important;color:#4d3822!important;font-size:15px!important}
#${PANEL_ID} .qol-tr-tabs{display:flex!important;gap:4px!important;padding:6px 10px 0!important;background:#f6f1e8!important;flex:0 0 auto!important}.qol-tr-tab{all:unset!important;padding:5px 9px!important;border:1px solid #c5b394!important;border-bottom:0!important;border-radius:3px 3px 0 0!important;background:#e8dece!important;color:#6d583b!important;font-size:8.5px!important;font-weight:800!important;cursor:pointer!important}.qol-tr-tab.active{background:#fff!important;color:#4b3823!important}
#${PANEL_ID} .qol-tr-body{min-height:0!important;flex:1 1 auto!important;overflow:auto!important;background:#fff!important;border-top:1px solid #c5b394!important}
#${PANEL_ID} table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:9px!important}#${PANEL_ID} th,#${PANEL_ID} td{padding:6px 7px!important;border-bottom:1px solid #e5dccd!important;vertical-align:middle!important;color:#4b3925!important}#${PANEL_ID} th{position:sticky!important;top:0!important;z-index:2!important;background:#f0e7d8!important;color:#715d42!important;font-size:7.5px!important;text-transform:uppercase!important;text-align:left!important}#${PANEL_ID} td.num,#${PANEL_ID} th.num{text-align:right!important}
#${PANEL_ID} .qol-tr-badge{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:60px!important;padding:2px 5px!important;border:1px solid #9caf79!important;border-radius:2px!important;background:#eef5e5!important;color:#506d2f!important;font-size:7.5px!important;font-weight:800!important}.qol-tr-badge.ww{border-color:#c19c50!important;background:#fff1c9!important;color:#7b5715!important}
#${PANEL_ID} .qol-tr-route-status{font-weight:800!important}.qol-tr-route-status.paused{color:#9c3c35!important}.qol-tr-route-status.active{color:#58772e!important}
#${PANEL_ID} .qol-tr-res{display:inline-flex!important;align-items:center!important;justify-content:flex-end!important;gap:3px!important;white-space:nowrap!important}.qol-tr-route-resources{display:flex!important;align-items:center!important;gap:7px!important;flex-wrap:wrap!important}.qol-tr-route-resources .qol-tr-res{justify-content:flex-start!important}
#${PANEL_ID} .qol-tr-route-res-icon{display:inline-block!important;flex:0 0 auto!important}.qol-tr-empty{padding:28px 16px!important;text-align:center!important;color:#7b6952!important;font-size:10px!important}
#${PANEL_ID} .qol-tr-foot{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;min-height:34px!important;padding:6px 10px!important;border-top:1px solid #d5c5ac!important;background:#eee5d8!important;color:#7a684f!important;font-size:8px!important;flex:0 0 auto!important}
#${BUTTON_ID}{position:fixed!important;z-index:9998!important;display:flex!important;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;padding:0!important;border:2px solid var(--qol-accent)!important;border-radius:50%!important;background:var(--qol-accent-soft)!important;color:var(--qol-accent-ink)!important;box-shadow:0 2px 4px rgba(0,0,0,.22)!important;font:800 9px/1 Arial!important;cursor:pointer!important;user-select:none!important}
#${LOCK_ID}{position:fixed!important;inset:0!important;z-index:2147483646!important;display:none!important;align-items:center!important;justify-content:center!important;background:rgba(20,17,12,.72)!important;backdrop-filter:blur(1px)!important}#${LOCK_ID}.open{display:flex!important}#${LOCK_ID} .qol-tr-lock-card{min-width:320px!important;max-width:min(520px,90vw)!important;padding:16px!important;border:2px solid var(--qol-border)!important;border-radius:5px!important;background:#f7f1e7!important;box-shadow:0 12px 32px rgba(0,0,0,.5)!important;text-align:center!important;color:#4b3823!important}#${LOCK_ID} .qol-tr-lock-card strong{display:block!important;font-size:13px!important}#${LOCK_ID} .qol-tr-lock-status{margin-top:7px!important;font-size:9px!important;color:#755f42!important}.qol-tr-lock-progress{height:7px!important;margin-top:10px!important;border:1px solid #ad9877!important;border-radius:5px!important;background:#e2d6c3!important;overflow:hidden!important}.qol-tr-lock-progress i{display:block!important;height:100%!important;width:0;background:var(--qol-accent)!important;transition:width .15s ease!important}
@media(max-width:720px){#${PANEL_ID} .qol-tr-stats{grid-template-columns:repeat(2,1fr)!important}}
`;
    document.head.appendChild(style);
  }

  function ensureLock() {
    let lock = document.getElementById(LOCK_ID);
    if (!lock) {
      lock = document.createElement('div');
      lock.id = LOCK_ID;
      lock.innerHTML = '<div class="qol-tr-lock-card"><strong>Scanning Trade Routes</strong><div class="qol-tr-lock-status">Preparing scan…</div><div class="qol-tr-lock-progress"><i></i></div></div>';
      document.body.appendChild(lock);
    }
    return lock;
  }

  function setLock(open, text = '', current = 0, total = 0) {
    const lock = ensureLock();
    lock.classList.toggle('open', Boolean(open));
    if (text) lock.querySelector('.qol-tr-lock-status').textContent = text;
    const percent = total > 0 ? Math.max(0, Math.min(100, current / total * 100)) : 0;
    lock.querySelector('.qol-tr-lock-progress i').style.width = `${percent}%`;
  }

  function statsFor(data) {
    const routes = data?.routes || [];
    const destinations = data?.summary || [];
    return {
      villages: data?.villagesScanned || 0,
      routes: routes.length,
      ownTargets: destinations.filter(item => item.type === 'Own Village').length,
      wwTargets: destinations.filter(item => item.type === 'WW').length
    };
  }

  function summaryRows(data) {
    const rows = data?.summary || [];
    if (!rows.length) return '<div class="qol-tr-empty">No trade routes were found in the last scan.</div>';
    return `<table><thead><tr><th style="width:19%">Destination</th><th style="width:9%">Type</th><th style="width:22%">Sources</th>${RESOURCE_KEYS.map(key => `<th class="num" style="width:10%">${resourceIcon(key)} ${RESOURCE_LABELS[key]}/day</th>`).join('')}<th class="num" style="width:10%">Routes</th></tr></thead><tbody>${rows.map(item => `<tr><td><strong>${escapeHtml(item.targetVillageName)}</strong></td><td><span class="qol-tr-badge ${item.type === 'WW' ? 'ww' : ''}">${escapeHtml(item.type)}</span></td><td>${escapeHtml(item.sources.join(', '))}</td>${RESOURCE_KEYS.map(key => `<td class="num">${fmt(item.daily[key])}</td>`).join('')}<td class="num">${item.activeRouteCount}/${item.routeCount}</td></tr>`).join('')}</tbody></table>`;
  }

  function routeRows(data) {
    const routes = data?.routes || [];
    const ownIds = new Set((data?.ownVillageIds || []).map(String));
    if (!routes.length) return '<div class="qol-tr-empty">No individual routes were found in the last scan.</div>';
    return `<table><thead><tr><th style="width:17%">Source</th><th style="width:17%">Destination</th><th style="width:8%">Type</th><th style="width:8%">Status</th><th style="width:8%">Merchants</th><th style="width:9%">Departures/day</th><th>Per dispatch</th></tr></thead><tbody>${routes.map(route => `<tr><td>${escapeHtml(route.sourceVillageName)}</td><td><strong>${escapeHtml(route.targetVillageName)}</strong></td><td><span class="qol-tr-badge ${ownIds.has(String(route.targetVillageId)) ? '' : 'ww'}">${ownIds.has(String(route.targetVillageId)) ? 'Own' : 'WW'}</span></td><td><span class="qol-tr-route-status ${route.active ? 'active' : 'paused'}">${route.active ? 'Active' : 'Paused'}</span></td><td>${fmt(route.merchants)}</td><td>${fmt(route.departuresPerDay)}</td><td><div class="qol-tr-route-resources">${RESOURCE_KEYS.filter(key => route.resources[key] > 0).map(key => `<span class="qol-tr-res">${resourceIcon(key)} ${fmt(route.resources[key])}</span>`).join('') || '—'}</div></td></tr>`).join('')}</tbody></table>`;
  }

  function render(activeTab = document.querySelector(`#${PANEL_ID} .qol-tr-tab.active`)?.dataset.tab || 'summary') {
    const panel = ensurePanel();
    const data = currentData || loadData();
    const stats = statsFor(data);
    const scanned = data?.scannedAt ? new Date(data.scannedAt).toLocaleString() : 'Never';
    panel.querySelector('.qol-tr-stats').innerHTML = `
      <div class="qol-tr-stat"><span>Villages scanned</span><strong>${fmt(stats.villages)}</strong></div>
      <div class="qol-tr-stat"><span>Trade routes</span><strong>${fmt(stats.routes)}</strong></div>
      <div class="qol-tr-stat"><span>Own destinations</span><strong>${fmt(stats.ownTargets)}</strong></div>
      <div class="qol-tr-stat"><span>WW destinations</span><strong>${fmt(stats.wwTargets)}</strong></div>`;
    panel.querySelectorAll('.qol-tr-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === activeTab));
    panel.querySelector('.qol-tr-body').innerHTML = activeTab === 'routes' ? routeRows(data) : summaryRows(data);
    panel.querySelector('.qol-tr-foot span').textContent = `Last scan: ${scanned}`;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    ensureStyles();
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="qol-tr-head"><div class="qol-tr-title"><strong>Trade Route Tracker</strong><span class="qol-tr-sub">Account-wide Market routes</span></div><div class="qol-tr-head-actions"><button class="qol-tr-btn primary" data-action="scan">Scan All Villages</button><button class="qol-tr-close" data-action="close">×</button></div></div>
      <div class="qol-tr-stats"></div>
      <div class="qol-tr-tabs"><button class="qol-tr-tab active" data-tab="summary">By Destination</button><button class="qol-tr-tab" data-tab="routes">Individual Routes</button></div>
      <div class="qol-tr-body"></div>
      <div class="qol-tr-foot"><span>Last scan: Never</span><small>External destination = WW. Daily totals count active routes only.</small></div>`;
    document.body.appendChild(panel);
    panel.addEventListener('click', event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'close') closePanel();
      if (action === 'scan') void scanAllVillages();
      const tab = event.target.closest('.qol-tr-tab')?.dataset.tab;
      if (tab) render(tab);
    });
    return panel;
  }

  function openPanel() {
    if (!enabled()) return;
    const panel = ensurePanel();
    currentData = loadData() || currentData;
    panel.classList.add('open');
    render();
  }

  function closePanel() {
    document.getElementById(PANEL_ID)?.classList.remove('open');
  }

  function ensureLauncher() {
    ensureStyles();
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement('button');
      button.id = BUTTON_ID;
      button.type = 'button';
      button.textContent = 'TR';
      button.title = 'Trade Route Tracker';
      button.addEventListener('click', () => document.getElementById(PANEL_ID)?.classList.contains('open') ? closePanel() : openPanel());
      document.body.appendChild(button);
    }
    return button;
  }

  function positionLauncher() {
    const button = ensureLauncher();
    if (!enabled()) {
      button.style.display = 'none';
      return;
    }
    button.style.display = 'flex';
    const host = document.getElementById('qol-responsive-toolbar');
    if (host && getComputedStyle(host).display !== 'none') {
      const rect = host.getBoundingClientRect();
      const left = Math.max(8, rect.left - 36);
      button.style.left = `${Math.round(left)}px`;
      button.style.top = `${Math.round(rect.top)}px`;
      return;
    }
    button.style.right = '48px';
    button.style.bottom = '18px';
    button.style.left = 'auto';
    button.style.top = 'auto';
  }

  function syncRuntime() {
    positionLauncher();
    if (!enabled()) closePanel();
  }

  function makeMenuCard() {
    const card = document.createElement('article');
    card.className = 'qol-feature-card';
    card.dataset.featureKey = FEATURE_KEY;
    card.dataset.qolTradeRouteTrackerCard = '1';
    card.innerHTML = `
      <span class="qol-feature-icon" aria-hidden="true">⇄</span>
      <div class="qol-feature-copy"><h3 class="qol-feature-name">Trade Route Tracker</h3><p class="qol-feature-desc">Scans Marketplace trade routes across every village and summarizes resources sent to your villages and World Wonders.</p></div>
      <label class="qol-switch" title="Toggle Trade Route Tracker"><input type="checkbox" id="${CHECKBOX_ID}" class="qol-checkbox"><span class="qol-switch-track" aria-hidden="true"></span><span class="qol-visually-hidden">Toggle Trade Route Tracker</span></label>`;
    const checkbox = card.querySelector(`#${CHECKBOX_ID}`);
    checkbox.checked = enabled();
    checkbox.addEventListener('change', event => setEnabled(Boolean(event.target.checked)));
    return card;
  }

  function syncMenu() {
    menuSyncQueued = false;
    const modal = document.getElementById('qol-modal');
    const grid = modal?.querySelector('#qol-advanced-feature-grid');
    if (!grid) return;
    let card = grid.querySelector('[data-qol-trade-route-tracker-card="1"]');
    if (!card) {
      card = makeMenuCard();
      grid.appendChild(card);
    }
    const checkbox = card.querySelector(`#${CHECKBOX_ID}`);
    if (checkbox) checkbox.checked = enabled();
    const count = modal.querySelector('#qol-advanced-feature-count');
    if (count) {
      const total = grid.querySelectorAll(':scope > .qol-feature-card').length;
      count.textContent = `${total} tool${total === 1 ? '' : 's'}`;
    }
  }

  function scheduleMenuSync() {
    if (menuSyncQueued) return;
    menuSyncQueued = true;
    requestAnimationFrame(syncMenu);
  }

  async function findMarketForVillage(village) {
    const cached = marketLocationFromSnapshot(village);
    if (cached) return cached;
    const id = String(village.villageId);
    await navigate(villageHash(id), () => currentVillageId() === id && document.querySelector('#villageView'), 5000);
    await sleep(180);
    return marketLocationFromDom();
  }

  async function scanVillage(village) {
    const marketLocation = await findMarketForVillage(village);
    if (!marketLocation) return { routes: [], skipped: 'No Marketplace found' };
    const id = String(village.villageId);
    const hash = scanHash(id, marketLocation);
    const ready = await navigate(hash, () => {
      if (currentVillageId() !== id || !String(location.hash).includes('/tab:TradeRoute')) return null;
      return document.querySelector('.tabTradeRoute .tradeRoute, .loadedTab.tabTradeRoute .tradeRoute');
    }, 7000);
    if (!ready) return { routes: [], skipped: 'Trade Route tab did not load' };
    await sleep(220);
    const routes = parseTradeRoutePage(village);
    return { routes: routes || [], skipped: routes === null ? 'Could not parse Trade Route tab' : '' };
  }

  async function scanAllVillages() {
    if (scanRunning) return;
    scanRunning = true;
    const originalHash = location.hash;
    const panelWasOpen = document.getElementById(PANEL_ID)?.classList.contains('open');
    let snapshot = null;
    try {
      snapshot = await requestSnapshot();
      const villages = Array.isArray(snapshot?.villages) ? snapshot.villages : [];
      if (!villages.length) throw new Error('APES could not read your village list.');
      const ownIds = new Set(villages.map(village => String(village.villageId)));
      const allRoutes = [];
      const scanResults = [];
      setLock(true, `Preparing ${villages.length} villages…`, 0, villages.length);

      for (let index = 0; index < villages.length; index += 1) {
        const village = villages[index];
        setLock(true, `${index + 1}/${villages.length} · ${village.name}`, index, villages.length);
        const result = await scanVillage(village);
        allRoutes.push(...result.routes);
        scanResults.push({ villageId: String(village.villageId), villageName: village.name, routeCount: result.routes.length, skipped: result.skipped || '' });
        setLock(true, `${index + 1}/${villages.length} · ${village.name}`, index + 1, villages.length);
        await sleep(120);
      }

      currentData = {
        schemaVersion: 1,
        scannedAt: Date.now(),
        playerId: snapshot.playerId,
        ownVillageIds: Array.from(ownIds),
        villagesScanned: villages.length,
        routes: allRoutes,
        summary: summarize(allRoutes, ownIds),
        scanResults
      };
      saveData(currentData);
    } catch (error) {
      console.error('[APES Trade Route Tracker] Scan failed.', error);
      alert(`Trade Route Tracker scan failed: ${error?.message || error}`);
    } finally {
      if (originalHash && location.hash !== originalHash) {
        location.hash = originalHash;
        await sleep(250);
      }
      setLock(false);
      scanRunning = false;
      if (panelWasOpen || currentData) {
        openPanel();
        render('summary');
      }
    }
  }

  function init() {
    ensureStyles();
    ensureLauncher();
    positionLauncher();
    scheduleMenuSync();
    requestSnapshot().then(snapshot => {
      if (snapshot) {
        currentData = loadData(snapshot.playerId);
        if (document.getElementById(PANEL_ID)?.classList.contains('open')) render();
      }
    });

    const observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE))) {
        scheduleMenuSync();
        clearTimeout(launcherSyncTimer);
        launcherSyncTimer = setTimeout(positionLauncher, 30);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener('resize', positionLauncher);
    window.addEventListener('qol_setting_changed', event => {
      if (event.detail?.key === FEATURE_KEY) syncRuntime();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById(PANEL_ID)?.classList.contains('open') && !scanRunning) closePanel();
    }, true);
  }

  window.APES_TRADE_ROUTE_TRACKER = Object.freeze({ open: openPanel, close: closePanel, scan: scanAllVillages });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
