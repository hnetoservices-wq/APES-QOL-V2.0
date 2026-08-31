(() => {
  'use strict';

  const APES = window.APES;
  if (!APES?.ui) return;
  const OVERLAY_ID = 'apes-v2-village-overlay';
  const SETTING_KEY = 'keybind_villagePalette';
  const UI_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_UI';
  const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
  const REQUEST_TYPE = 'REQUEST_SNAPSHOT';
  const RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';
  const REFRESH_MS = 2500;
  const SCAN_SETTLE_MS = 1100;
  const SCAN_REFRESH_MS = 250;
  const COUNTDOWN_REFRESH_MS = 1000;
  const SCAN_STORAGE_VERSION = 1;
  const FREE_FINISH_MS = 5 * 60 * 1000;
  const STORAGE_RISK_MS = 3 * 60 * 60 * 1000;
  const SCAN_STALE_MS = 30 * 60 * 1000;
  const RECENT_CELEBRATION_FINISH_MS = 6 * 60 * 60 * 1000;
  const SORT_MODES = new Set(['order', 'attention', 'nextEvent', 'construction', 'storage']);
  const BUILDING_NAMES = Object.freeze({
    1: 'Woodcutter',
    2: 'Clay Pit',
    3: 'Iron Mine',
    4: 'Cropland',
    5: 'Sawmill',
    6: 'Brickyard',
    7: 'Iron Foundry',
    8: 'Grain Mill',
    9: 'Bakery',
    10: 'Warehouse',
    11: 'Granary',
    12: 'Smithy',
    14: 'Tournament Square',
    15: 'Main Building',
    16: 'Rally Point',
    17: 'Marketplace',
    18: 'Embassy',
    19: 'Barracks',
    20: 'Stable',
    21: 'Workshop',
    22: 'Academy',
    23: 'Cranny',
    24: 'Town Hall',
    25: 'Residence',
    26: 'Palace',
    27: 'Treasury',
    28: 'Trade Office',
    29: 'Great Barracks',
    30: 'Great Stable',
    31: 'City Wall',
    32: 'Earth Wall',
    33: 'Palisade',
    34: 'Stonemason',
    35: 'Brewery',
    36: 'Trapper',
    37: "Hero's Mansion",
    38: 'Great Warehouse',
    39: 'Great Granary',
    40: 'Wonder of the World',
    41: 'Horse Drinking Trough',
    46: 'Healing Tent'
  });
  const BUILDING_SHORT_NAMES = Object.freeze({
    1: 'Wood',
    2: 'Clay',
    3: 'Iron',
    4: 'Crop'
  });
  const DASHBOARD_BUILDINGS = Object.freeze([{
    type: 17,
    label: 'Market'
  }, {
    type: 19,
    label: 'Barracks'
  }, {
    type: 20,
    label: 'Stables'
  }, {
    type: 29,
    label: 'Greater Barracks'
  }, {
    type: 30,
    label: 'Greater Stables'
  }]);
  const TRAINING_BUILDING_TYPES = new Set([19, 20, 29, 30]);
  const RESOURCE_DEFS = Object.freeze([{
    key: 'wood',
    name: 'Wood'
  }, {
    key: 'clay',
    name: 'Clay'
  }, {
    key: 'iron',
    name: 'Iron'
  }, {
    key: 'crop',
    name: 'Crop'
  }]);
  const UNIT_NAMES = Object.freeze({
    1: ['Legionnaire', 'Praetorian', 'Imperian', 'Equites Legati', 'Equites Imperatoris', 'Equites Caesaris', 'Battering Ram', 'Fire Catapult', 'Senator', 'Settler'],
    2: ['Clubswinger', 'Spearman', 'Axeman', 'Scout', 'Paladin', 'Teutonic Knight', 'Ram', 'Catapult', 'Chief', 'Settler'],
    3: ['Phalanx', 'Swordsman', 'Pathfinder', 'Theutates Thunder', 'Druidrider', 'Haeduan', 'Ram', 'Trebuchet', 'Chieftain', 'Settler']
  });
  const UNIT_CROP_CONSUMPTION = Object.freeze({
    1: [1, 1, 1, 2, 3, 4, 3, 6, 5, 1],
    2: [1, 1, 1, 1, 2, 3, 3, 6, 4, 1],
    3: [1, 1, 2, 2, 2, 3, 3, 6, 4, 1]
  });
  let snapshot = {
    generatedAt: 0,
    playerId: null,
    activeVillageId: '',
    villages: []
  };
  let refreshTimer = null;
  let retryTimer = null;
  let countdownTimer = null;
  let scanInProgress = false;
  let scanProgress = {
    current: 0,
    total: 0,
    returning: false
  };
  let scanStoreCache = null;
  let scanStoreCacheKey = '';
  let sortMode = loadSortMode();
  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  function enabled() {
    try {
      return localStorage.getItem(`qol_${SETTING_KEY}`) !== 'false';
    } catch (_) {
      return true;
    }
  }
  function isVillageKey(event) {
    return event.code === 'KeyH' || String(event.key || '').toLowerCase() === 'h';
  }
  function currentVillageIdFromUrl() {
    return String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
  }
  function asNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function asTimestamp(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return numeric < 100000000000 ? numeric * 1000 : numeric;
  }
  function formatInteger(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number).toLocaleString() : '0';
  }
  function formatDurationMilliseconds(milliseconds) {
    if (!Number.isFinite(milliseconds)) return '';
    if (milliseconds <= 0) return 'ready';
    let seconds = Math.ceil(milliseconds / 1000);
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
  }
  function formatCompactAge(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'unknown';
    const minutes = Math.floor(milliseconds / 60000);
    if (minutes < 1) return '<1m';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  }
  function remainingText(value) {
    const timestamp = asTimestamp(value);
    return timestamp ? formatDurationMilliseconds(timestamp - Date.now()) : '';
  }
  function eventClock(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }
  function sortStorageKey() {
    return `apes_aoc_sort:${location.hostname}`;
  }
  function loadSortMode() {
    try {
      const saved = localStorage.getItem(sortStorageKey());
      return SORT_MODES.has(saved) ? saved : 'order';
    } catch (_) {
      return 'order';
    }
  }
  function saveSortMode(value) {
    sortMode = SORT_MODES.has(value) ? value : 'order';
    try {
      localStorage.setItem(sortStorageKey(), sortMode);
    } catch (_) {}
  }
  function scanStorageKey() {
    const player = String(snapshot?.playerId ?? 'unknown');
    return `apes_village_dashboard_scan_v${SCAN_STORAGE_VERSION}:${location.hostname}:${player}`;
  }
  function readScanStore(force = false) {
    const key = scanStorageKey();
    if (!force && scanStoreCache && scanStoreCacheKey === key) return scanStoreCache;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      scanStoreCache = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      scanStoreCache = {};
    }
    scanStoreCacheKey = key;
    return scanStoreCache;
  }
  function writeScanStore(store) {
    const key = scanStorageKey();
    scanStoreCache = store || {};
    scanStoreCacheKey = key;
    try {
      localStorage.setItem(key, JSON.stringify(scanStoreCache));
    } catch (error) {
      console.warn('[APES AOC] Could not save scan data.', error);
    }
  }
  function scannedVillage(villageId) {
    return readScanStore()?.villages?.[String(villageId)] || null;
  }
  function saveScannedVillage(villageId, data) {
    const store = readScanStore();
    if (!store.villages || typeof store.villages !== 'object') store.villages = {};
    store.villages[String(villageId)] = {
      ...(store.villages[String(villageId)] || {}),
      ...(data || {}),
      scannedAt: Date.now()
    };
    writeScanStore(store);
  }
  function normalizeNumericText(value) {
    return String(value ?? '').replace(/\u2212/g, '-').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/\s+/g, '').trim();
  }
  function parseSignedInteger(value) {
    const text = normalizeNumericText(value);
    if (!text) return null;
    const compact = text.match(/^([+-]?)(\d+(?:[.,]\d+)?)([kKmM])$/);
    if (compact) {
      const sign = compact[1] === '-' ? -1 : 1;
      const number = Number.parseFloat(compact[2].replace(',', '.'));
      const multiplier = compact[3].toLowerCase() === 'm' ? 1000000 : 1000;
      return Number.isFinite(number) ? Math.round(sign * number * multiplier) : null;
    }
    const negative = /^-/.test(text);
    const digits = text.replace(/[^0-9]/g, '');
    if (!digits) return null;
    const number = Number.parseInt(digits, 10);
    return Number.isFinite(number) ? negative ? -number : number : null;
  }
  function parseUnsignedInteger(value) {
    const number = parseSignedInteger(value);
    return Number.isFinite(number) ? Math.abs(number) : null;
  }
  function directText(element) {
    if (!element) return '';
    return Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent || '').join(' ').trim();
  }
  function scanResourcesFromDom() {
    return RESOURCE_DEFS.map(resource => {
      const stock = document.querySelector(`#resourceBar .stockContainer.${resource.key}`);
      const progress = stock?.querySelector('.progressbar');
      const amountNode = progress?.querySelector('.values .amount.wrapper');
      const capacityNode = progress?.querySelector('.values .capacity');
      const block = stock?.closest('[ng-repeat]') || stock?.parentElement;
      const productionNode = block?.querySelector('.production .value');
      if (!progress || !productionNode) return null;
      const current = parseUnsignedInteger(progress.getAttribute('value')) ?? parseUnsignedInteger(amountNode?.textContent);
      const capacity = parseUnsignedInteger(progress.getAttribute('max-value')) ?? parseUnsignedInteger(capacityNode?.textContent);
      const production = parseSignedInteger(directText(productionNode));
      if (![current, capacity, production].every(Number.isFinite)) return null;
      return {
        key: resource.key,
        name: resource.name,
        current,
        capacity,
        production
      };
    }).filter(Boolean);
  }
  function getLocationFromBuildingElement(image, wrapper) {
    const fromId = String(image?.id || '').match(/^buildingImage(\d+)$/)?.[1];
    if (fromId) return Number(fromId);
    const locationClass = Array.from(wrapper?.classList || []).find(name => /^buildingLocation\d+$/.test(name));
    if (locationClass) return Number(locationClass.replace('buildingLocation', ''));
    const dataLocation = Number(wrapper?.getAttribute?.('data-location-id'));
    return Number.isFinite(dataLocation) ? dataLocation : null;
  }
  function scanDashboardBuildingsFromDom() {
    const view = document.getElementById('villageView');
    if (!view) return [];
    return DASHBOARD_BUILDINGS.map(definition => {
      const image = view.querySelector(`img.location.buildingId${definition.type}`);
      if (!image) return null;
      const wrapper = image.closest('building-location');
      const locationId = getLocationFromBuildingElement(image, wrapper);
      if (!Number.isFinite(locationId)) return null;
      return {
        type: definition.type,
        label: definition.label,
        location: locationId,
        level: asNumber(wrapper?.querySelector('.buildingLevel')?.textContent?.trim())
      };
    }).filter(Boolean);
  }
  function captureCurrentVillageScan(villageId) {
    if (!/^\d+$/.test(String(villageId || ''))) return;
    saveScannedVillage(villageId, {
      buildings: scanDashboardBuildingsFromDom(),
      resources: scanResourcesFromDom()
    });
  }
  function hasMeaningfulData(value, depth = 0) {
    if (value === null || value === undefined || depth > 6) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.trim() !== '' && value !== '0';
    if (Array.isArray(value)) return value.some(item => hasMeaningfulData(item, depth + 1));
    if (typeof value === 'object') {
      return Object.entries(value).some(([key, child]) => {
        if (/villageId|tribeId|freeSlots|canUse/i.test(key)) return false;
        return hasMeaningfulData(child, depth + 1);
      });
    }
    return false;
  }
  function collectObjects(value, predicate, limit = 16) {
    const results = [];
    const seen = new WeakSet();
    function walk(node, depth = 0) {
      if (results.length >= limit || node === null || node === undefined || depth > 8) return;
      if (typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      if (predicate(node)) results.push(node);
      if (results.length >= limit) return;
      if (Array.isArray(node)) node.forEach(item => walk(item, depth + 1));else Object.values(node).forEach(item => walk(item, depth + 1));
    }
    walk(value);
    return results;
  }
  function findEndTime(object) {
    if (!object || typeof object !== 'object') return null;
    const keys = ['finishTime', 'endTime', 'finishedAt', 'finishAt', 'completionTime', 'completeAt', 'timeFinished', 'end', 'until', 'doneAt', 'finish', 'finish-time', 'finishTimestamp', 'endTimestamp'];
    for (const key of keys) {
      if (object[key] === undefined) continue;
      const timestamp = asTimestamp(object[key]);
      if (timestamp) return timestamp;
    }
    return null;
  }
  function localUnitIndex(tribeId, rawIndex) {
    let id = Math.trunc(Number(rawIndex));
    if (!Number.isFinite(id)) return null;
    if (id === 0) return 1;
    const tribe = Number(tribeId);
    if (id >= 1 && id <= 10) return id;
    if (tribe >= 1 && tribe <= 3) {
      const base = (tribe - 1) * 10;
      if (id > base && id <= base + 10) return id - base;
    }
    return id;
  }
  function unitName(tribeId, rawIndex) {
    const index = localUnitIndex(tribeId, rawIndex);
    return index === null ? `Unit ${rawIndex}` : UNIT_NAMES[Number(tribeId)]?.[index - 1] || `Unit ${rawIndex}`;
  }
  function unitCropConsumption(tribeId, rawIndex) {
    const index = localUnitIndex(tribeId, rawIndex);
    if (index === null || index < 1 || index > 10) return 0;
    return UNIT_CROP_CONSUMPTION[Number(tribeId)]?.[index - 1] ?? 0;
  }
  function buildingLookup(village) {
    const byLocation = new Map();
    for (const building of village?.buildings || []) {
      const locationId = asNumber(building?.locationId);
      if (locationId !== null) byLocation.set(String(locationId), building);
    }
    return byLocation;
  }
  function buildingByType(village, type) {
    return (village?.buildings || []).find(building => Number(building?.buildingType) === Number(type)) || null;
  }
  function queueLocation(item) {
    return asNumber(item?.locationId ?? item?.buildingLocationId ?? item?.location ?? item?.building?.locationId);
  }
  function buildingTypeForQueueItem(item, village) {
    const direct = asNumber(item?.buildingType ?? item?.buildingTypeId ?? item?.building?.buildingType ?? item?.type);
    if (direct !== null && BUILDING_NAMES[direct]) return direct;
    const locationId = queueLocation(item);
    return locationId !== null ? asNumber(buildingLookup(village).get(String(locationId))?.buildingType) : direct;
  }
  function constructionQueueItems(queue) {
    const source = queue?.queues;
    if (!source || typeof source !== 'object') return [];
    const items = [];
    const pushBucket = bucket => {
      if (!bucket) return;
      if (Array.isArray(bucket)) {
        bucket.forEach(item => {
          if (item && typeof item === 'object') items.push(item);
        });
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
    if (Array.isArray(source)) source.forEach(pushBucket);else Object.values(source).forEach(pushBucket);
    return items;
  }
  function explicitQueueTargetLevel(item) {
    return asNumber(item?.targetLevel ?? item?.targetLvl ?? item?.targetBuildingLevel ?? item?.levelTo ?? item?.toLevel);
  }
  function constructionEntries(village) {
    const entries = [];
    const buildings = buildingLookup(village);
    const queuedPerLocation = new Map();
    const locationsSeen = new Set();
    for (const item of constructionQueueItems(village?.buildingQueue)) {
      const locationId = queueLocation(item);
      const type = buildingTypeForQueueItem(item, village);
      if (locationId === null && type === null) continue;
      const building = locationId !== null ? buildings.get(String(locationId)) : null;
      const currentLevel = asNumber(building?.lvl);
      const sequenceIndex = locationId !== null ? queuedPerLocation.get(String(locationId)) || 0 : 0;
      const levelDifference = asNumber(item?.levelDifference);
      let level = null;
      if (currentLevel !== null && levelDifference !== null) level = currentLevel + levelDifference + 1;else if (currentLevel !== null) level = currentLevel + sequenceIndex + 1;else {
        level = explicitQueueTargetLevel(item);
        if (level === null) {
          const itemLevel = asNumber(item?.level ?? item?.lvl);
          if (itemLevel !== null) level = itemLevel + 1;
        }
      }
      if (locationId !== null) {
        queuedPerLocation.set(String(locationId), sequenceIndex + 1);
        locationsSeen.add(String(locationId));
      }
      const fullLabel = BUILDING_NAMES[type] || (type ? `Building ${type}` : 'Construction');
      entries.push({
        type,
        location: locationId,
        label: BUILDING_SHORT_NAMES[type] || fullLabel,
        fullLabel,
        level,
        end: findEndTime(item),
        waiting: asNumber(item?.timeStart) === 0 || item?.waiting === true
      });
    }
    for (const building of village?.buildings || []) {
      if (!hasMeaningfulData(building?.inQueueEffects)) continue;
      const type = asNumber(building?.buildingType);
      const locationId = asNumber(building?.locationId);
      if (locationId !== null && locationsSeen.has(String(locationId))) continue;
      const current = asNumber(building?.lvl);
      const fullLabel = BUILDING_NAMES[type] || (type ? `Building ${type}` : 'Construction');
      entries.push({
        type,
        location: locationId,
        label: BUILDING_SHORT_NAMES[type] || fullLabel,
        fullLabel,
        level: current !== null ? current + 1 : null,
        end: null,
        waiting: false
      });
    }
    return entries;
  }
  function constructionHtml(village) {
    const entries = constructionEntries(village);
    if (!entries.length) return '<span class="apes-vd-idle">Idle</span>';
    const tooltip = entries.map(entry => {
      const level = entry.level !== null ? ` → ${entry.level}` : '';
      const state = entry.end ? ` — ${remainingText(entry.end)}` : entry.waiting ? ' — Queued' : '';
      return `${entry.fullLabel}${level}${state}`;
    }).join('\n');
    const visible = entries.slice(0, 2).map(entry => {
      const level = entry.level !== null ? ` → ${entry.level}` : '';
      const finishMs = asTimestamp(entry.end);
      return `<span class="apes-vd-line apes-vd-construction-line"><strong>${escapeHtml(entry.label + level)}</strong>${finishMs ? `<small class="apes-vd-countdown" data-finish-ms="${finishMs}">${escapeHtml(remainingText(finishMs))}</small>` : entry.waiting ? '<small>Queued</small>' : ''}</span>`;
    }).join('');
    return `<div class="apes-vd-tooltip-target" title="${escapeHtml(tooltip)}">${visible}</div>`;
  }
  function addUnitCount(map, tribeId, rawId, amount) {
    const numeric = asNumber(amount);
    const local = localUnitIndex(tribeId, rawId);
    if (numeric === null || numeric <= 0 || local === null || local < 1 || local > 10) return;
    map.set(local, (map.get(local) || 0) + numeric);
  }
  function primitiveUnitCounts(root, tribeId) {
    const totals = new Map();
    const seen = new WeakSet();
    function walk(node, depth = 0) {
      if (node === null || node === undefined || depth > 7) return;
      if (Array.isArray(node)) {
        const primitives = node.every(value => value === null || ['number', 'string'].includes(typeof value));
        if (primitives) {
          node.forEach((value, index) => addUnitCount(totals, tribeId, index + 1, value));
          return;
        }
        node.forEach(value => walk(value, depth + 1));
        return;
      }
      if (typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      for (const [key, value] of Object.entries(node)) {
        if (/^\d+$/.test(key) && ['number', 'string'].includes(typeof value)) addUnitCount(totals, tribeId, Number(key), value);else if (value && typeof value === 'object') walk(value, depth + 1);
      }
    }
    walk(root);
    return totals;
  }
  function unitQueueEntries(village) {
    const queue = village?.unitQueue;
    if (!queue) return [];
    const entries = [];
    const seen = new Set();
    const candidates = collectObjects(queue?.unitsInQueue ?? queue, item => {
      if (!item || Array.isArray(item)) return false;
      return Object.keys(item).some(key => /unitType|unitTypeId|unitId|unitIndex|amount|count|quantity|remaining|finish|end/i.test(key));
    }, 14);
    for (const item of candidates) {
      const rawUnit = asNumber(item?.unitType ?? item?.unitTypeId ?? item?.unitId ?? item?.unit ?? item?.unitIndex);
      const amount = asNumber(item?.amount ?? item?.count ?? item?.quantity ?? item?.remaining ?? (typeof item?.units === 'number' ? item.units : null));
      const buildingType = asNumber(item?.buildingType ?? item?.buildingTypeId);
      const local = rawUnit !== null ? localUnitIndex(village?.tribeId, rawUnit) : null;
      const end = findEndTime(item);
      const key = `${local ?? ''}|${amount ?? ''}|${buildingType ?? ''}|${end ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        rawUnit,
        localIndex: local,
        label: rawUnit !== null ? unitName(village?.tribeId, rawUnit) : 'Troops',
        amount,
        building: BUILDING_NAMES[buildingType] || '',
        end
      });
    }
    if (!entries.length) {
      primitiveUnitCounts(queue?.unitsInQueue, village?.tribeId).forEach((amount, local) => {
        entries.push({
          rawUnit: local,
          localIndex: local,
          label: unitName(village?.tribeId, local),
          amount,
          building: '',
          end: null
        });
      });
    }
    return entries.filter(entry => entry.amount === null || entry.amount > 0);
  }
  function trainingHtml(village) {
    const entries = unitQueueEntries(village);
    if (!entries.length) return '<span class="apes-vd-idle">Idle</span>';
    const total = entries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const title = entries.map(entry => `${entry.building ? `${entry.building}: ` : ''}${entry.amount !== null ? `${formatInteger(entry.amount)} ` : ''}${entry.label}${entry.end ? ` — ${remainingText(entry.end)}` : ''}`).join('\n');
    if (entries.length === 1) {
      const entry = entries[0];
      return `<span class="apes-vd-line apes-vd-tooltip-target" title="${escapeHtml(title)}"><strong>${escapeHtml(`${entry.amount !== null ? `${formatInteger(entry.amount)} ` : ''}${entry.label}`)}</strong>${entry.end ? `<small class="apes-vd-countdown" data-finish-ms="${asTimestamp(entry.end)}">${escapeHtml(remainingText(entry.end))}</small>` : entry.building ? `<small>${escapeHtml(entry.building)}</small>` : ''}</span>`;
    }
    const primary = entries.slice(0, 2).map(entry => `${entry.amount !== null ? `${formatInteger(entry.amount)} ` : ''}${entry.label}`).join(' · ');
    const firstEnd = entries.map(entry => asTimestamp(entry.end)).filter(value => value && value > Date.now()).sort((a, b) => a - b)[0];
    return `<span class="apes-vd-line apes-vd-tooltip-target" title="${escapeHtml(title)}"><strong>${escapeHtml(total > 0 ? `${formatInteger(total)} queued` : 'Training active')}</strong><small>${escapeHtml(primary)}</small>${firstEnd ? `<small class="apes-vd-countdown" data-finish-ms="${firstEnd}">${escapeHtml(remainingText(firstEnd))}</small>` : ''}</span>`;
  }
  function smithyInfo(village) {
    const queue = village?.smithyQueue;
    if (!queue || !hasMeaningfulData(queue?.buildingTypes ?? queue)) return null;
    const candidates = collectObjects(queue?.buildingTypes ?? queue, item => {
      if (!item || Array.isArray(item)) return false;
      return Object.keys(item).some(key => /unitType|unitTypeId|unitId|unitIndex|level|lvl|target|finish|end/i.test(key));
    }, 6);
    if (!candidates.length) return {
      label: 'Upgrade active',
      end: null
    };
    const item = candidates[0];
    const rawUnit = asNumber(item?.unitType ?? item?.unitTypeId ?? item?.unitId ?? item?.unit ?? item?.unitIndex);
    const level = asNumber(item?.targetLevel ?? item?.lvlNext ?? item?.levelNext ?? item?.targetLvl ?? item?.level ?? item?.lvl);
    const label = rawUnit !== null ? unitName(village?.tribeId, rawUnit) : 'Smithy upgrade';
    return {
      label: `${label}${level !== null ? ` → ${level}` : ''}`,
      end: findEndTime(item)
    };
  }
  function smithyHtml(village) {
    const info = smithyInfo(village);
    if (!info) return '<span class="apes-vd-idle">Idle</span>';
    const finishMs = asTimestamp(info.end);
    return `<span class="apes-vd-line"><strong>${escapeHtml(info.label)}</strong>${finishMs ? `<small class="apes-vd-countdown" data-finish-ms="${finishMs}">${escapeHtml(remainingText(finishMs))}</small>` : ''}</span>`;
  }
  function celebrationInfo(village) {
    const type = Number(village?.celebrationType);
    const end = asTimestamp(village?.celebrationEnd);
    return {
      type,
      end,
      active: Boolean(end && end > Date.now()),
      name: type === 1 ? 'Small celebration' : type === 2 ? 'Great celebration' : 'Celebration'
    };
  }
  function celebrationHtml(village) {
    const info = celebrationInfo(village);
    if (!info.active) return '<span class="apes-vd-idle">None</span>';
    return `<span class="apes-vd-line"><strong>${escapeHtml(info.name)}</strong><small class="apes-vd-countdown" data-finish-ms="${info.end}">${escapeHtml(remainingText(info.end))}</small></span>`;
  }
  function normaliseUnitCounts(units) {
    const counts = new Map();
    if (Array.isArray(units)) {
      units.forEach((value, index) => {
        const amount = asNumber(value);
        if (amount !== null && amount > 0) counts.set(index + 1, (counts.get(index + 1) || 0) + amount);
      });
      return counts;
    }
    if (!units || typeof units !== 'object') return counts;
    Object.entries(units).forEach(([key, value]) => {
      const amount = asNumber(value);
      if (amount === null || amount <= 0) return;
      const match = String(key).match(/(\d+)/);
      const index = match ? Number(match[1]) : Number(key);
      if (Number.isFinite(index)) counts.set(index, (counts.get(index) || 0) + amount);
    });
    return counts;
  }
  function troopSummary(village) {
    const totals = new Map();
    const ownPlayerId = Number(snapshot?.playerId);
    for (const troop of village?.stationaryTroops || []) {
      if (Number.isFinite(ownPlayerId) && Number(troop?.playerId) !== ownPlayerId) continue;
      normaliseUnitCounts(troop?.units).forEach((amount, rawIndex) => {
        const local = localUnitIndex(village?.tribeId, rawIndex);
        if (local !== null && local >= 1 && local <= 10) totals.set(local, (totals.get(local) || 0) + amount);
      });
    }
    const entries = [...totals.entries()].filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]);
    return {
      total: entries.reduce((sum, [, amount]) => sum + amount, 0),
      cropPerHour: entries.reduce((sum, [index, amount]) => sum + amount * unitCropConsumption(village?.tribeId, index), 0),
      entries
    };
  }
  function troopsHtml(village) {
    const summary = troopSummary(village);
    const tooltip = summary.entries.length ? summary.entries.map(([index, amount]) => `${formatInteger(amount)} ${unitName(village?.tribeId, index)} — ${formatInteger(amount * unitCropConsumption(village?.tribeId, index))} Crop/h`).join('\n') : 'No troops stationed here';
    return `<span class="apes-vd-line apes-vd-tooltip-target" title="${escapeHtml(tooltip)}"><strong>${escapeHtml(formatInteger(summary.total))} Troops</strong><small>${escapeHtml(formatInteger(summary.cropPerHour))} Crop/h</small></span>`;
  }
  function dashboardBuildingEntries(village) {
    const scanned = scannedVillage(village?.villageId)?.buildings;
    if (Array.isArray(scanned) && scanned.length) {
      return DASHBOARD_BUILDINGS.map(definition => {
        const building = scanned.find(item => Number(item?.type) === definition.type);
        return building && Number.isFinite(Number(building.location)) ? {
          ...definition,
          location: Number(building.location),
          level: asNumber(building.level)
        } : null;
      }).filter(Boolean);
    }
    return DASHBOARD_BUILDINGS.map(definition => {
      const building = buildingByType(village, definition.type);
      const locationId = asNumber(building?.locationId);
      return locationId === null ? null : {
        ...definition,
        location: locationId,
        level: asNumber(building?.lvl)
      };
    }).filter(Boolean);
  }
  function buildingsHtml(village) {
    const entries = dashboardBuildingEntries(village);
    if (!entries.length) return '<span class="apes-vd-idle">None</span>';
    const villageId = String(village?.villageId || '');
    return `<ul class="apes-vd-building-list">${entries.map(entry => `<li><span class="apes-vd-building-link" role="button" tabindex="0" data-building-village-id="${escapeHtml(villageId)}" data-building-location="${entry.location}" title="Open ${escapeHtml(entry.label)}${entry.level !== null ? ` level ${entry.level}` : ''}">${escapeHtml(entry.label)}</span></li>`).join('')}</ul>`;
  }
  function projectedResourceStates(village) {
    const scan = scannedVillage(village?.villageId);
    if (!scan || !Array.isArray(scan.resources) || !Number.isFinite(Number(scan.scannedAt))) return [];
    const elapsedHours = Math.max(0, Date.now() - Number(scan.scannedAt)) / 3600000;
    return scan.resources.map(resource => {
      const initial = Number(resource.current);
      const capacity = Number(resource.capacity);
      const production = Number(resource.production);
      if (![initial, capacity, production].every(Number.isFinite) || capacity <= 0) return null;
      const projected = Math.max(0, Math.min(capacity, initial + production * elapsedHours));
      let etaMs = Infinity;
      let state = 'stable';
      if (production > 0) {
        state = projected >= capacity ? 'full' : 'filling';
        etaMs = projected >= capacity ? 0 : (capacity - projected) / production * 3600000;
      } else if (production < 0) {
        state = projected <= 0 ? 'empty' : 'draining';
        etaMs = projected <= 0 ? 0 : projected / Math.abs(production) * 3600000;
      }
      return {
        ...resource,
        current: projected,
        capacity,
        production,
        etaMs,
        state,
        scannedAt: Number(scan.scannedAt)
      };
    }).filter(Boolean);
  }
  function scanAge(village) {
    const scannedAt = Number(scannedVillage(village?.villageId)?.scannedAt);
    return Number.isFinite(scannedAt) ? Math.max(0, Date.now() - scannedAt) : Infinity;
  }
  function makeAlert(key, label, tone, weight, title = '') {
    return {
      key,
      label,
      tone,
      weight,
      title: title || label
    };
  }
  function villageInsights(village) {
    const now = Date.now();
    const constructions = constructionEntries(village);
    const activeConstructions = constructions.filter(entry => asTimestamp(entry.end) && asTimestamp(entry.end) > now);
    const training = unitQueueEntries(village);
    const smithy = smithyInfo(village);
    const celebration = celebrationInfo(village);
    const resources = projectedResourceStates(village);
    const alerts = [];
    const events = [];
    if (!constructions.length) alerts.push(makeAlert('constructionIdle', 'Construction idle', 'warn', 40));
    const freeReady = activeConstructions.filter(entry => asTimestamp(entry.end) - now <= FREE_FINISH_MS);
    if (freeReady.length) alerts.push(makeAlert('freeFinish', `${freeReady.length} free finish${freeReady.length === 1 ? '' : 'es'}`, 'ready', 80, 'Construction available for free instant finish.'));
    const hasTrainingBuilding = (village?.buildings || []).some(building => TRAINING_BUILDING_TYPES.has(Number(building?.buildingType)));
    if (hasTrainingBuilding && !training.length) alerts.push(makeAlert('trainingIdle', 'Training idle', 'warn', 30));
    const crop = resources.find(resource => resource.key === 'crop');
    if (crop && crop.production < 0) alerts.push(makeAlert('cropDeficit', `Crop ${formatInteger(crop.production)}/h`, 'danger', 100, 'Negative crop production.'));
    let storageRiskMs = Infinity;
    resources.forEach(resource => {
      if (Number.isFinite(resource.etaMs)) storageRiskMs = Math.min(storageRiskMs, resource.etaMs);
      if (resource.state === 'full') alerts.push(makeAlert(`full:${resource.key}`, `${resource.name} full`, 'danger', 90));else if (resource.state === 'empty') alerts.push(makeAlert(`empty:${resource.key}`, `${resource.name} empty`, 'danger', 90));else if (resource.etaMs <= STORAGE_RISK_MS) {
        const action = resource.production > 0 ? 'full' : 'empty';
        alerts.push(makeAlert(`storage:${resource.key}`, `${resource.name} ${action} ${formatCompactAge(resource.etaMs)}`, 'warn', 60));
      }
      if (Number.isFinite(resource.etaMs) && resource.etaMs > 0) {
        events.push({
          at: now + resource.etaMs,
          villageId: String(village.villageId),
          villageName: village.name,
          label: `${resource.name} storage ${resource.production > 0 ? 'full' : 'empty'}`,
          type: 'storage'
        });
      }
    });
    const townHall = buildingByType(village, 24);
    if (townHall && !celebration.active) {
      if (celebration.end && now - celebration.end <= RECENT_CELEBRATION_FINISH_MS) alerts.push(makeAlert('celebrationFinished', 'Celebration finished', 'warn', 35));else alerts.push(makeAlert('townHallIdle', 'Town Hall idle', 'info', 20));
    }
    const smithyBuilding = buildingByType(village, 12);
    if (smithyBuilding && !smithy) alerts.push(makeAlert('smithyIdle', 'Smithy idle', 'info', 5));
    const age = scanAge(village);
    if (!Number.isFinite(age)) alerts.push(makeAlert('scanNeeded', 'Scan needed', 'info', 15, 'Run Scan Now to refresh production/storage data on this device.'));else if (age > SCAN_STALE_MS) alerts.push(makeAlert('scanStale', `Scan ${formatCompactAge(age)} old`, 'info', 15));
    activeConstructions.forEach(entry => {
      const end = asTimestamp(entry.end);
      const display = `${entry.fullLabel}${entry.level !== null ? ` → ${entry.level}` : ''}`;
      const freeAt = end - FREE_FINISH_MS;
      if (freeAt > now) events.push({
        at: freeAt,
        villageId: String(village.villageId),
        villageName: village.name,
        label: `Free finish: ${display}`,
        type: 'free'
      });else events.push({
        at: now,
        villageId: String(village.villageId),
        villageName: village.name,
        label: `Free finish ready: ${display}`,
        type: 'ready'
      });
      events.push({
        at: end,
        villageId: String(village.villageId),
        villageName: village.name,
        label: `${display} finishes`,
        type: 'construction'
      });
    });
    training.forEach(entry => {
      const end = asTimestamp(entry.end);
      if (end && end > now) events.push({
        at: end,
        villageId: String(village.villageId),
        villageName: village.name,
        label: `Training finishes${entry.label ? `: ${entry.label}` : ''}`,
        type: 'training'
      });
    });
    const smithyEnd = asTimestamp(smithy?.end);
    if (smithyEnd && smithyEnd > now) events.push({
      at: smithyEnd,
      villageId: String(village.villageId),
      villageName: village.name,
      label: `Smithy finishes: ${smithy.label}`,
      type: 'smithy'
    });
    if (celebration.active && celebration.end) events.push({
      at: celebration.end,
      villageId: String(village.villageId),
      villageName: village.name,
      label: `${celebration.name} finishes`,
      type: 'celebration'
    });
    alerts.sort((a, b) => b.weight - a.weight);
    const attentionScore = alerts.reduce((sum, alert) => sum + alert.weight, 0);
    const nextEvent = events.filter(event => event.at >= now).sort((a, b) => a.at - b.at)[0]?.at ?? Infinity;
    const constructionFinish = activeConstructions.map(entry => asTimestamp(entry.end)).filter(Boolean).sort((a, b) => a - b)[0] ?? Infinity;
    return {
      alerts,
      events,
      attentionScore,
      nextEvent,
      constructionFinish,
      storageRiskMs,
      freeReady: freeReady.length,
      cropDeficit: Boolean(crop && crop.production < 0)
    };
  }
  function attentionHtml(insights) {
    if (!insights.alerts.length) return '<span class="apes-aoc-status apes-aoc-ready">All good</span>';
    const visible = insights.alerts.slice(0, 3);
    const extra = insights.alerts.length - visible.length;
    const title = insights.alerts.map(alert => alert.title).join('\n');
    return `<div class="apes-aoc-attention" title="${escapeHtml(title)}">${visible.map(alert => `<span class="apes-aoc-status apes-aoc-${alert.tone}">${escapeHtml(alert.label)}</span>`).join('')}${extra > 0 ? `<span class="apes-aoc-more">+${extra}</span>` : ''}</div>`;
  }
  function sortedVillageModels(villages) {
    const models = villages.map((village, index) => ({
      village,
      index,
      insights: villageInsights(village)
    }));
    const number = value => Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
    models.sort((a, b) => {
      if (sortMode === 'attention') return b.insights.attentionScore - a.insights.attentionScore || a.index - b.index;
      if (sortMode === 'nextEvent') return number(a.insights.nextEvent) - number(b.insights.nextEvent) || a.index - b.index;
      if (sortMode === 'construction') return number(a.insights.constructionFinish) - number(b.insights.constructionFinish) || a.index - b.index;
      if (sortMode === 'storage') return number(a.insights.storageRiskMs) - number(b.insights.storageRiskMs) || a.index - b.index;
      return a.index - b.index;
    });
    return models;
  }
  function renderSummary(models) {
    const target = document.querySelector(`#${OVERLAY_ID} .apes-aoc-summary`);
    if (!target) return;
    const attention = models.filter(model => model.insights.alerts.some(alert => alert.weight >= 20)).length;
    const free = models.reduce((sum, model) => sum + model.insights.freeReady, 0);
    const crop = models.filter(model => model.insights.cropDeficit).length;
    const storage = models.filter(model => Number.isFinite(model.insights.storageRiskMs) && model.insights.storageRiskMs <= STORAGE_RISK_MS).length;
    target.innerHTML = [['Needs attention', attention, attention ? 'warn' : 'ready'], ['Free finishes', free, free ? 'ready' : 'muted'], ['Crop deficits', crop, crop ? 'danger' : 'muted'], ['Storage risks', storage, storage ? 'warn' : 'muted']].map(([label, value, tone]) => `<span class="apes-aoc-summary-item apes-aoc-${tone}"><strong>${value}</strong>${label}</span>`).join('');
  }
  function renderEvents(models) {
    const target = document.querySelector(`#${OVERLAY_ID} .apes-aoc-events-list`);
    if (!target) return;
    const now = Date.now();
    const events = models.flatMap(model => model.insights.events).filter(event => event.at >= now - 1000).sort((a, b) => a.at - b.at).slice(0, 8);
    if (!events.length) {
      target.innerHTML = '<span class="apes-aoc-events-empty">No upcoming account events found.</span>';
      return;
    }
    target.innerHTML = events.map(event => `<div class="apes-aoc-event" data-event-village-id="${escapeHtml(event.villageId)}" title="Switch to ${escapeHtml(event.villageName)}"><strong>${event.at <= now + 1000 ? 'NOW' : escapeHtml(eventClock(event.at))}</strong><span>${escapeHtml(event.villageName)} — ${escapeHtml(event.label)}</span><small class="apes-aoc-event-countdown" data-event-ms="${event.at}">${event.at <= now ? 'ready' : escapeHtml(formatDurationMilliseconds(event.at - now))}</small></div>`).join('');
  }
  function updateLiveCountdowns() {
    document.querySelectorAll(`#${OVERLAY_ID} .apes-vd-countdown[data-finish-ms]`).forEach(element => {
      const finish = Number(element.dataset.finishMs);
      if (Number.isFinite(finish)) element.textContent = formatDurationMilliseconds(finish - Date.now());
    });
    document.querySelectorAll(`#${OVERLAY_ID} .apes-aoc-event-countdown[data-event-ms]`).forEach(element => {
      const at = Number(element.dataset.eventMs);
      if (Number.isFinite(at)) element.textContent = at <= Date.now() ? 'ready' : formatDurationMilliseconds(at - Date.now());
    });
  }
  function updateScanButton() {
    const button = document.querySelector(`#${OVERLAY_ID} .apes-vd-scan-btn`);
    if (!button) return;
    if (scanInProgress) {
      button.classList.add('scanning');
      button.setAttribute('aria-disabled', 'true');
      button.textContent = scanProgress.returning ? 'Returning…' : `Scanning ${scanProgress.current}/${scanProgress.total}`;
    } else {
      button.classList.remove('scanning');
      button.setAttribute('aria-disabled', 'false');
      button.textContent = 'Scan Now';
    }
  }
  function mountDashboard() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
            <div class="apes-v2-village-dashboard" role="dialog" aria-modal="true" aria-label="Account Operations Center">
                <div class="apes-vd-heading">
                    <div class="apes-vd-brand"><span>APES</span><strong>Account Operations Center</strong></div>
                    <div class="apes-vd-heading-actions">
                        <label class="apes-aoc-sort-wrap">Sort <select class="apes-aoc-sort" aria-label="Sort villages"><option value="order">Village order</option><option value="attention">Needs attention</option><option value="nextEvent">Next event</option><option value="construction">Construction finish</option><option value="storage">Storage risk</option></select></label>
                        <div class="apes-vd-scan-btn" role="button" tabindex="0" aria-disabled="false">Scan Now</div>
                        <div class="apes-vd-hint">H / Esc to close · Click a village to switch</div>
                    </div>
                </div>
                <div class="apes-aoc-summary"></div>
                <div class="apes-aoc-events"><span class="apes-aoc-events-title">Next Events</span><div class="apes-aoc-events-list"></div></div>
                <div class="apes-vd-table-wrap">
                    <div class="apes-vd-header"><span>Village</span><span>Attention</span><span>Construction</span><span>Training</span><span>Smithy</span><span>Celebration</span><span>Troops</span><span>Buildings</span></div>
                    <div class="apes-vd-body"><div class="apes-vd-loading">Reading Travian village cache…</div></div>
                </div>
            </div>`;
    document.body.appendChild(overlay);
    const sort = overlay.querySelector('.apes-aoc-sort');
    sort.value = sortMode;
    sort.addEventListener('change', () => {
      saveSortMode(sort.value);
      renderDashboard();
    });
    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        closeDashboard();
        return;
      }
      const scanButton = event.target.closest('.apes-vd-scan-btn');
      if (scanButton) {
        event.preventDefault();
        event.stopPropagation();
        scanAllVillages();
        return;
      }
      const eventCard = event.target.closest('.apes-aoc-event[data-event-village-id]');
      if (eventCard && !scanInProgress) {
        openVillage(eventCard.dataset.eventVillageId);
        return;
      }
      const buildingControl = event.target.closest('.apes-vd-building-link');
      if (buildingControl && !scanInProgress) {
        event.preventDefault();
        event.stopPropagation();
        openBuilding(buildingControl.dataset.buildingVillageId, buildingControl.dataset.buildingLocation);
        return;
      }
      const villageControl = event.target.closest('[data-village-id]');
      if (villageControl && !scanInProgress) openVillage(villageControl.dataset.villageId);
    });
    overlay.addEventListener('keydown', event => {
      const scanButton = event.target.closest?.('.apes-vd-scan-btn');
      if (scanButton && ['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        scanAllVillages();
        return;
      }
      const buildingControl = event.target.closest?.('.apes-vd-building-link');
      if (buildingControl && !scanInProgress && ['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openBuilding(buildingControl.dataset.buildingVillageId, buildingControl.dataset.buildingLocation);
        return;
      }
      const villageControl = event.target.closest?.('[data-village-id]');
      if (villageControl && !scanInProgress && ['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openVillage(villageControl.dataset.villageId);
      }
    });
    updateScanButton();
    return overlay;
  }
  function renderDashboard() {
    const overlay = mountDashboard();
    const body = overlay.querySelector('.apes-vd-body');
    if (!body) return;
    updateScanButton();
    const sort = overlay.querySelector('.apes-aoc-sort');
    if (sort && sort.value !== sortMode) sort.value = sortMode;
    const villages = Array.isArray(snapshot?.villages) ? snapshot.villages : [];
    if (!villages.length) {
      overlay.querySelector('.apes-aoc-summary').innerHTML = '';
      overlay.querySelector('.apes-aoc-events-list').innerHTML = '<span class="apes-aoc-events-empty">Waiting for village data…</span>';
      body.innerHTML = `<div class="apes-vd-loading">${snapshot?.error ? escapeHtml(snapshot.error) : 'Waiting for Travian village cache…'}</div>`;
      return;
    }
    const models = sortedVillageModels(villages);
    renderSummary(models);
    renderEvents(models);
    const activeId = String(snapshot.activeVillageId || currentVillageIdFromUrl());
    body.innerHTML = models.map(({
      village,
      insights
    }) => {
      const villageId = String(village.villageId || '');
      const isActive = villageId === activeId || village.isActive;
      const badges = [village.isMainVillage ? '<span class="apes-vd-badge">Capital</span>' : '', village.isTown ? '<span class="apes-vd-badge">City</span>' : ''].filter(Boolean).join('');
      const coordinates = Number.isFinite(Number(village.x)) && Number.isFinite(Number(village.y)) ? `(${village.x}|${village.y})` : '';
      return `<div class="apes-vd-row${isActive ? ' current' : ''}">
                <div class="apes-vd-village" role="button" tabindex="0" data-village-id="${escapeHtml(villageId)}" title="Switch to ${escapeHtml(village.name)}"><span class="apes-vd-village-name">${escapeHtml(village.name)}</span><span class="apes-vd-village-meta">${coordinates ? `<small>${escapeHtml(coordinates)}</small>` : ''}${Number.isFinite(Number(village.population)) ? `<small>${escapeHtml(formatInteger(village.population))} pop</small>` : ''}${badges}</span></div>
                <div class="apes-vd-cell apes-aoc-attention-cell">${attentionHtml(insights)}</div>
                <div class="apes-vd-cell">${constructionHtml(village)}</div>
                <div class="apes-vd-cell">${trainingHtml(village)}</div>
                <div class="apes-vd-cell">${smithyHtml(village)}</div>
                <div class="apes-vd-cell">${celebrationHtml(village)}</div>
                <div class="apes-vd-cell">${troopsHtml(village)}</div>
                <div class="apes-vd-cell apes-vd-buildings-cell">${buildingsHtml(village)}</div>
            </div>`;
    }).join('');
    updateLiveCountdowns();
  }
  function requestSnapshot() {
    window.postMessage({
      source: UI_SOURCE,
      type: REQUEST_TYPE
    }, location.origin);
  }
  async function waitForVillageNavigation(villageId, timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (currentVillageIdFromUrl() === String(villageId)) return true;
      await sleep(100);
    }
    return false;
  }
  async function scanAllVillages() {
    if (scanInProgress) return;
    const villages = Array.isArray(snapshot?.villages) ? snapshot.villages : [];
    const ids = [...new Set(villages.map(village => String(village?.villageId || '')).filter(id => /^\d+$/.test(id)))];
    if (!ids.length) return;
    const startVillageId = currentVillageIdFromUrl() || String(snapshot?.activeVillageId || '') || ids[0];
    const orderedIds = ids.includes(startVillageId) ? [startVillageId, ...ids.filter(id => id !== startVillageId)] : ids;
    scanInProgress = true;
    scanProgress = {
      current: 0,
      total: orderedIds.length,
      returning: false
    };
    updateScanButton();
    try {
      for (let index = 0; index < orderedIds.length; index += 1) {
        const villageId = orderedIds[index];
        scanProgress = {
          current: index + 1,
          total: orderedIds.length,
          returning: false
        };
        updateScanButton();
        if (currentVillageIdFromUrl() !== villageId) location.hash = `#/page:village/villId:${villageId}`;
        await waitForVillageNavigation(villageId);
        await sleep(SCAN_SETTLE_MS);
        captureCurrentVillageScan(villageId);
        requestSnapshot();
        await sleep(SCAN_REFRESH_MS);
      }
      if (/^\d+$/.test(startVillageId) && currentVillageIdFromUrl() !== startVillageId) {
        scanProgress = {
          current: orderedIds.length,
          total: orderedIds.length,
          returning: true
        };
        updateScanButton();
        location.hash = `#/page:village/villId:${startVillageId}`;
        await waitForVillageNavigation(startVillageId);
        await sleep(SCAN_SETTLE_MS);
        captureCurrentVillageScan(startVillageId);
      }
    } finally {
      requestSnapshot();
      await sleep(SCAN_REFRESH_MS);
      scanInProgress = false;
      scanProgress = {
        current: 0,
        total: 0,
        returning: false
      };
      updateScanButton();
      if (isOpen()) renderDashboard();
    }
  }
  function startRefresh() {
    stopRefresh();
    requestSnapshot();
    refreshTimer = setInterval(requestSnapshot, REFRESH_MS);
    countdownTimer = setInterval(updateLiveCountdowns, COUNTDOWN_REFRESH_MS);
    retryTimer = setTimeout(() => {
      if (!snapshot?.villages?.length && isOpen()) requestSnapshot();
    }, 350);
  }
  function stopRefresh() {
    if (refreshTimer !== null) clearInterval(refreshTimer);
    if (retryTimer !== null) clearTimeout(retryTimer);
    if (countdownTimer !== null) clearInterval(countdownTimer);
    refreshTimer = retryTimer = countdownTimer = null;
  }
  function isOpen() {
    return document.getElementById(OVERLAY_ID)?.classList.contains('open') || false;
  }
  function openDashboard() {
    APES.ui.closeOtherTools('villagePalette');
    const overlay = mountDashboard();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    renderDashboard();
    startRefresh();
  }
  function closeDashboard() {
    stopRefresh();
    const overlay = document.getElementById(OVERLAY_ID);
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
  }
  function toggleDashboard() {
    isOpen() ? closeDashboard() : openDashboard();
  }
  function openVillage(villageId) {
    if (scanInProgress || !/^\d+$/.test(String(villageId || ''))) return;
    closeDashboard();
    location.hash = `#/page:village/villId:${villageId}`;
  }
  function openBuilding(villageId, locationId) {
    if (scanInProgress) return;
    const village = String(villageId || '');
    const buildingLocation = String(locationId || '');
    if (!/^\d+$/.test(village) || !/^\d+$/.test(buildingLocation)) return;
    closeDashboard();
    location.hash = `#/page:village/villId:${village}/location:${buildingLocation}/window:building`;
  }
  function syncMenuLabel() {
    const checkbox = document.getElementById('qol-chk-village-palette');
    const label = checkbox?.closest('.qol-keybind-item')?.querySelector('.qol-keybind-action');
    if (label && label.textContent !== 'Account Operations Center') label.textContent = 'Account Operations Center';
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.data?.source !== BRIDGE_SOURCE || event.data?.type !== RESPONSE_TYPE || !event.data?.payload || typeof event.data.payload !== 'object') return;
    const previousPlayer = snapshot?.playerId;
    snapshot = event.data.payload;
    if (String(previousPlayer ?? '') !== String(snapshot?.playerId ?? '')) {
      scanStoreCache = null;
      scanStoreCacheKey = '';
    }
    if (isOpen()) renderDashboard();
  });
  window.addEventListener('keydown', event => {
    if (!isVillageKey(event) || !enabled() || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || APES.ui.isTypingTarget(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) toggleDashboard();
  }, true);
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeDashboard();
  }, true);
  window.addEventListener('hashchange', () => {
    if (isOpen()) requestSnapshot();
  });
  window.addEventListener('qol_close_others', event => {
    if (event.detail?.source !== 'villagePalette') closeDashboard();
  });
  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key === SETTING_KEY && !event.detail.enabled) closeDashboard();
  });
  const menuObserver = new MutationObserver(syncMenuLabel);
  menuObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
  const api = Object.freeze({
    open: openDashboard,
    close: closeDashboard,
    toggle: toggleDashboard,
    refresh: requestSnapshot,
    scan: scanAllVillages,
    getVillages: () => (snapshot?.villages || []).map(village => ({
      ...village
    }))
  });
  window.APES_VILLAGE_PALETTE = api;
  window.APES_ACCOUNT_OPERATIONS_CENTER = api;
  mountDashboard();
  syncMenuLabel();
})();
