(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';
  const UI_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_UI';
  const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
  const REQUEST_TYPE = 'REQUEST_SNAPSHOT';
  const RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';
  const ALARM_STORAGE_KEY = 'qol_building_alarms';
  const SCAN_STORAGE_VERSION = 1;
  const MAX_EVENTS = 8;

  const BUILDING_NAMES = Object.freeze({
    1: 'Woodcutter', 2: 'Clay Pit', 3: 'Iron Mine', 4: 'Cropland',
    5: 'Sawmill', 6: 'Brickyard', 7: 'Iron Foundry', 8: 'Grain Mill',
    9: 'Bakery', 10: 'Warehouse', 11: 'Granary', 12: 'Smithy',
    14: 'Tournament Square', 15: 'Main Building', 16: 'Rally Point',
    17: 'Marketplace', 18: 'Embassy', 19: 'Barracks', 20: 'Stable',
    21: 'Workshop', 22: 'Academy', 23: 'Cranny', 24: 'Town Hall',
    25: 'Residence', 26: 'Palace', 27: 'Treasury', 28: 'Trade Office',
    29: 'Great Barracks', 30: 'Great Stable', 31: 'City Wall',
    32: 'Earth Wall', 33: 'Palisade', 34: 'Stonemason', 35: 'Brewery',
    36: 'Trapper', 37: "Hero's Mansion", 38: 'Great Warehouse',
    39: 'Great Granary', 40: 'Wonder of the World', 41: 'Horse Drinking Trough',
    46: 'Healing Tent'
  });

  let snapshot = { generatedAt: 0, playerId: null, activeVillageId: '', villages: [] };
  let tickTimer = null;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function num(value) {
    if (value === '' || value === null || value === undefined || typeof value === 'object') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function timestamp(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    return number < 100000000000 ? number * 1000 : number;
  }

  function duration(milliseconds) {
    if (!Number.isFinite(milliseconds)) return '—';
    if (milliseconds <= 0) return 'now';
    let seconds = Math.ceil(milliseconds / 1000);
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m`;
    return `${seconds}s`;
  }

  function findEndTime(object) {
    if (!object || typeof object !== 'object') return null;
    for (const key of [
      'endTime', 'finishTime', 'finishedAt', 'finishAt', 'completionTime',
      'completeAt', 'timeFinished', 'end', 'until', 'doneAt', 'finish',
      'finish-time', 'finishTimestamp', 'endTimestamp', 'finished'
    ]) {
      if (object[key] === undefined) continue;
      const value = timestamp(object[key]);
      if (value) return value;
    }
    return null;
  }

  function walkObjects(value, callback, depth = 0, seen = new WeakSet()) {
    if (value == null || depth > 8 || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    callback(value);
    const children = Array.isArray(value) ? value : Object.values(value);
    children.forEach(child => walkObjects(child, callback, depth + 1, seen));
  }

  function futureTimes(value) {
    const now = Date.now();
    const found = new Set();
    walkObjects(value, object => {
      const end = findEndTime(object);
      if (end && end > now) found.add(end);
    });
    return [...found].sort((a, b) => a - b);
  }

  function scanStorageKey() {
    const player = String(snapshot?.playerId ?? 'unknown');
    return `apes_village_dashboard_scan_v${SCAN_STORAGE_VERSION}:${location.hostname}:${player}`;
  }

  function readScanStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(scanStorageKey()) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function scannedQueue(villageId) {
    const queue = readScanStore()?.villages?.[String(villageId)]?.constructionQueue;
    return Array.isArray(queue) ? queue : [];
  }

  function buildingLookup(village) {
    const map = new Map();
    for (const building of village?.buildings || []) {
      const locationId = num(building?.locationId);
      if (locationId !== null) map.set(String(locationId), building);
    }
    return map;
  }

  function queueLocation(item) {
    return num(item?.locationId ?? item?.buildingLocationId ?? item?.location ?? item?.building?.locationId);
  }

  function queueType(item, village, lookup) {
    const direct = num(item?.buildingType ?? item?.buildingTypeId ?? item?.building?.buildingType);
    if (direct !== null) return direct;
    const locationId = queueLocation(item);
    return locationId === null ? null : num(lookup.get(String(locationId))?.buildingType);
  }

  function constructionQueueItems(village) {
    const source = village?.buildingQueue?.queues;
    if (!source || typeof source !== 'object') return [];
    const items = [];
    const pushBucket = bucket => {
      if (!bucket) return;
      if (Array.isArray(bucket)) {
        bucket.forEach(item => { if (item && typeof item === 'object') items.push(item); });
        return;
      }
      if (typeof bucket !== 'object') return;
      if (queueLocation(bucket) !== null) {
        items.push(bucket);
        return;
      }
      Object.values(bucket).forEach(item => {
        if (item && typeof item === 'object' && queueLocation(item) !== null) items.push(item);
      });
    };
    if (Array.isArray(source)) source.forEach(pushBucket);
    else Object.values(source).forEach(pushBucket);
    return items;
  }

  function constructionEvents(village) {
    const now = Date.now();
    const lookup = buildingLookup(village);
    const scanned = scannedQueue(village?.villageId);
    const occurrence = new Map();
    const events = [];

    constructionQueueItems(village).forEach((item, index) => {
      const locationId = queueLocation(item);
      const type = queueType(item, village, lookup);
      const current = locationId === null ? null : num(lookup.get(String(locationId))?.lvl);
      const group = `${locationId ?? 'x'}:${type ?? 'x'}`;
      const ordinal = occurrence.get(group) || 0;
      occurrence.set(group, ordinal + 1);
      const explicit = num(item?.targetLevel ?? item?.targetLvl ?? item?.targetBuildingLevel ?? item?.levelTo ?? item?.toLevel);
      const level = explicit ?? (current !== null ? current + ordinal + 1 : null);
      const at = findEndTime(item) || timestamp(scanned[index]?.finishAt);
      if (!at || at < now - 1000) return;
      const building = BUILDING_NAMES[type] || (type ? `Building ${type}` : 'Construction');
      events.push({
        at,
        villageId: String(village?.villageId || ''),
        villageName: String(village?.name || 'Village'),
        label: `${building}${level !== null ? ` → ${level}` : ''} finishes`,
        kind: 'construction'
      });
    });
    return events;
  }

  function trainingEvents(village) {
    const times = futureTimes(village?.unitQueue);
    if (!times.length) return [];
    return [{
      at: times[times.length - 1],
      villageId: String(village?.villageId || ''),
      villageName: String(village?.name || 'Village'),
      label: 'Training queue finishes',
      kind: 'training'
    }];
  }

  function smithyEvents(village) {
    const times = futureTimes(village?.smithyQueue);
    if (!times.length) return [];
    return [{
      at: times[times.length - 1],
      villageId: String(village?.villageId || ''),
      villageName: String(village?.name || 'Village'),
      label: 'Smithy upgrade finishes',
      kind: 'smithy'
    }];
  }

  function celebrationEvents(village) {
    const at = timestamp(village?.celebrationEnd);
    if (!at || at < Date.now() - 1000) return [];
    const type = Number(village?.celebrationType);
    const label = type === 2 ? 'Great celebration finishes' : type === 1 ? 'Small celebration finishes' : 'Celebration finishes';
    return [{
      at,
      villageId: String(village?.villageId || ''),
      villageName: String(village?.name || 'Village'),
      label,
      kind: 'celebration'
    }];
  }

  function readBuildingAlarms() {
    try {
      const alarms = JSON.parse(localStorage.getItem(ALARM_STORAGE_KEY) || '[]');
      return Array.isArray(alarms) ? alarms : [];
    } catch (_) {
      return [];
    }
  }

  function alarmEvents() {
    const now = Date.now();
    return readBuildingAlarms().map(alarm => {
      const finishAt = timestamp(alarm?.finishAt);
      const alarmAt = timestamp(alarm?.alarmAt);
      if (!finishAt || finishAt < now - 1000 || !alarmAt) return null;
      const name = String(alarm?.buildingName || 'Construction').trim();
      const levelText = String(alarm?.levelText || '').replace(/\s+/g, ' ').trim();
      const ready = alarmAt <= now;
      return {
        at: ready ? now : alarmAt,
        villageId: String(alarm?.villageId || ''),
        villageName: String(alarm?.villageName || 'Village'),
        label: ready ? `Free finish ready: ${name}${levelText ? ` ${levelText}` : ''}` : `Free finish: ${name}${levelText ? ` ${levelText}` : ''}`,
        kind: ready ? 'alarm-ready' : 'alarm'
      };
    }).filter(Boolean);
  }

  function allEvents() {
    const villages = Array.isArray(snapshot?.villages) ? snapshot.villages : [];
    const events = [
      ...villages.flatMap(constructionEvents),
      ...villages.flatMap(trainingEvents),
      ...villages.flatMap(smithyEvents),
      ...villages.flatMap(celebrationEvents),
      ...alarmEvents()
    ];

    const seen = new Set();
    return events
      .filter(event => {
        const key = `${event.kind}|${event.villageId}|${Math.round(event.at / 1000)}|${event.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((left, right) => left.at - right.at)
      .slice(0, MAX_EVENTS);
  }

  function iconFor(kind) {
    if (kind === 'alarm-ready') return '✓';
    if (kind === 'alarm') return '◷';
    if (kind === 'training') return '⚔';
    if (kind === 'smithy') return '⚒';
    if (kind === 'celebration') return '★';
    return '⌂';
  }

  function ensurePanel() {
    const overlay = document.getElementById(OVERLAY_ID);
    const dashboard = overlay?.querySelector('.apes-v2-village-dashboard');
    if (!dashboard) return null;

    let panel = dashboard.querySelector('.apes-vd-next-events');
    if (panel) return panel;

    panel = document.createElement('section');
    panel.className = 'apes-vd-next-events';
    panel.setAttribute('aria-label', 'Next account events');
    panel.innerHTML = `
      <div class="apes-vd-next-events-head">
        <strong>Next Events</strong>
        <small>Account-wide</small>
      </div>
      <div class="apes-vd-next-events-list"></div>
    `;
    const table = dashboard.querySelector('.apes-vd-table-wrap');
    if (table) dashboard.insertBefore(panel, table);
    else dashboard.appendChild(panel);

    panel.addEventListener('click', event => {
      const card = event.target.closest('[data-next-event-village]');
      if (!card) return;
      const villageId = String(card.dataset.nextEventVillage || '');
      if (!/^\d+$/.test(villageId)) return;
      window.APES_VILLAGE_PALETTE?.close?.();
      location.hash = `#/page:village/villId:${villageId}`;
    });
    panel.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      const card = event.target.closest('[data-next-event-village]');
      if (!card) return;
      event.preventDefault();
      card.click();
    });
    return panel;
  }

  function render() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.classList.contains('open')) return;
    const panel = ensurePanel();
    const list = panel?.querySelector('.apes-vd-next-events-list');
    if (!list) return;

    const now = Date.now();
    const events = allEvents();
    list.innerHTML = events.length ? events.map(event => {
      const ready = event.kind === 'alarm-ready';
      const clock = ready || event.at <= now + 1000
        ? 'NOW'
        : new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      return `
        <div class="apes-vd-next-event ${esc(event.kind)}${ready ? ' ready' : ''}"
             role="button" tabindex="0" data-next-event-village="${esc(event.villageId)}"
             title="Open ${esc(event.villageName)}">
          <span class="apes-vd-next-event-icon">${esc(iconFor(event.kind))}</span>
          <span class="apes-vd-next-event-copy">
            <strong>${esc(clock)} · ${esc(event.villageName)}</strong>
            <small>${esc(event.label)}</small>
          </span>
          <span class="apes-vd-next-event-countdown" data-event-at="${event.at}">${esc(ready ? 'ready' : duration(event.at - now))}</span>
        </div>
      `;
    }).join('') : '<span class="apes-vd-next-events-empty">No upcoming account events found.</span>';
  }

  function updateCountdowns() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.classList.contains('open')) return;
    const now = Date.now();
    overlay.querySelectorAll('.apes-vd-next-event-countdown[data-event-at]').forEach(node => {
      const at = Number(node.dataset.eventAt);
      if (!Number.isFinite(at)) return;
      node.textContent = at <= now ? 'ready' : duration(at - now);
    });
  }

  function requestSnapshot() {
    window.postMessage({ source: UI_SOURCE, type: REQUEST_TYPE }, location.origin);
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.data?.source !== BRIDGE_SOURCE || event.data?.type !== RESPONSE_TYPE) return;
    if (!event.data?.payload || typeof event.data.payload !== 'object') return;
    snapshot = event.data.payload;
    render();
  });

  const observer = new MutationObserver(() => {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    ensurePanel();
    if (overlay.classList.contains('open')) render();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  tickTimer = window.setInterval(() => {
    updateCountdowns();
    if (document.getElementById(OVERLAY_ID)?.classList.contains('open')) render();
  }, 5000);

  window.setInterval(updateCountdowns, 1000);
  ensurePanel();
  requestSnapshot();
})();
