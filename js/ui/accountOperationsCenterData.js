(() => {
  'use strict';

  const A = window.APES_AOC_INTERNAL = window.APES_AOC_INTERNAL || {};
  const D = A.data = {};

  D.OVERLAY_ID = 'apes-v2-village-overlay';
  D.SETTING_KEY = 'keybind_villagePalette';
  D.UI_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_UI';
  D.BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
  D.REQUEST_TYPE = 'REQUEST_SNAPSHOT';
  D.RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';
  D.FREE_FINISH_MS = 5 * 60 * 1000;
  D.STALE_MS = 30 * 60 * 1000;
  D.RESOURCE_WARNING_MS = 3 * 60 * 60 * 1000;
  D.RESOURCE_EVENT_MS = 48 * 60 * 60 * 1000;

  D.snapshot = { generatedAt: 0, playerId: null, activeVillageId: '', villages: [] };

  D.BUILDINGS = Object.freeze({
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
    20: 'Stables',
    21: 'Workshop',
    22: 'Academy',
    23: 'Cranny',
    24: 'Town Hall',
    25: 'Residence',
    26: 'Palace',
    27: 'Treasury',
    28: 'Trade Office',
    29: 'Great Barracks',
    30: 'Great Stables',
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
    46: 'Hospital'
  });

  D.TRAINING_BUILDINGS = Object.freeze({
    19: 'Barracks',
    20: 'Stables',
    21: 'Workshop',
    29: 'Great Barracks',
    30: 'Great Stables',
    46: 'Hospital'
  });

  D.TRACKED = Object.freeze([
    { type: 17, label: 'Market' },
    { type: 19, label: 'Barracks' },
    { type: 20, label: 'Stables' },
    { type: 29, label: 'Great Barracks' },
    { type: 30, label: 'Great Stables' }
  ]);

  D.RESOURCES = Object.freeze([
    { key: 'wood', name: 'Wood' },
    { key: 'clay', name: 'Clay' },
    { key: 'iron', name: 'Iron' },
    { key: 'crop', name: 'Crop' }
  ]);

  D.UNITS = Object.freeze({
    1: ['Legionnaire', 'Praetorian', 'Imperian', 'Equites Legati', 'Equites Imperatoris', 'Equites Caesaris', 'Ram', 'Fire Catapult', 'Senator', 'Settler'],
    2: ['Clubswinger', 'Spearman', 'Axeman', 'Scout', 'Paladin', 'Teutonic Knight', 'Ram', 'Catapult', 'Chief', 'Settler'],
    3: ['Phalanx', 'Swordsman', 'Pathfinder', 'Theutates Thunder', 'Druidrider', 'Haeduan', 'Ram', 'Trebuchet', 'Chieftain', 'Settler']
  });

  D.esc = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  D.num = value => {
    if (value === '' || value === null || value === undefined || typeof value === 'object') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };

  D.int = value => D.num(value) === null ? '—' : Math.round(Number(value)).toLocaleString();

  D.signed = value => {
    const number = D.num(value);
    if (number === null) return '—';
    const rounded = Math.round(number);
    return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString()}`;
  };

  D.time = value => {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number < 1e11 ? number * 1000 : number;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  D.duration = ms => {
    if (!Number.isFinite(ms)) return '—';
    if (ms <= 0) return 'ready';
    const minutes = Math.ceil(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  };

  D.currentVillageId = () => String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1]
    || String(D.snapshot.activeVillageId || '');

  D.hasData = function hasData(value, depth = 0) {
    if (value == null || depth > 7) return false;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.trim() !== '' && value !== '0';
    if (Array.isArray(value)) return value.some(item => D.hasData(item, depth + 1));
    if (typeof value === 'object') {
      return Object.entries(value).some(([key, item]) => !/villageId|tribeId|freeSlots|canUse/i.test(key) && D.hasData(item, depth + 1));
    }
    return false;
  };

  D.collect = function collect(value, predicate, limit = 30) {
    const output = [];
    const seen = new WeakSet();
    function walk(item, depth = 0) {
      if (output.length >= limit || item == null || depth > 8 || typeof item !== 'object' || seen.has(item)) return;
      seen.add(item);
      if (predicate(item)) output.push(item);
      if (output.length >= limit) return;
      (Array.isArray(item) ? item : Object.values(item)).forEach(child => walk(child, depth + 1));
    }
    walk(value);
    return output;
  };

  D.walkObjects = function walkObjects(value, callback, path = [], depth = 0, seen = new WeakSet()) {
    if (value == null || depth > 8 || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    callback(value, path);
    const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value);
    for (const [key, child] of entries) {
      if (child && typeof child === 'object') D.walkObjects(child, callback, [...path, key], depth + 1, seen);
    }
  };

  D.endTime = object => {
    for (const key of ['finishTime', 'endTime', 'finishAt', 'finishedAt', 'completionTime', 'end', 'until', 'finish', 'finishTimestamp', 'endTimestamp', 'finished']) {
      const time = D.time(object?.[key]);
      if (time) return time;
    }
    return null;
  };

  D.firstNum = (object, keys) => {
    for (const key of keys) {
      const value = D.num(object?.[key]);
      if (value !== null) return value;
    }
    return null;
  };

  D.unitName = (tribeId, rawUnitId) => {
    const tribe = D.UNITS[Number(tribeId)];
    const id = D.num(rawUnitId);
    if (!tribe || id === null || id <= 0) return '';
    const local = ((Math.round(id) - 1) % 10 + 10) % 10;
    return tribe[local] || '';
  };

  D.hasBuilding = (village, type) => (village?.buildings || []).some(building => Number(building.buildingType) === Number(type));

  D.queueItems = village => {
    const queues = village?.buildingQueue?.queues;
    if (!queues || typeof queues !== 'object') return [];
    const direct = [];
    for (const [bucketKey, bucket] of Object.entries(queues)) {
      if (!Array.isArray(bucket)) continue;
      bucket.forEach((item, index) => {
        if (item && typeof item === 'object') direct.push({ item, bucketKey, index });
      });
    }
    if (direct.length) return direct;
    return D.collect(queues, item => item && !Array.isArray(item) && (
      D.firstNum(item, ['locationId', 'buildingLocationId', 'location']) !== null
      || D.firstNum(item, ['buildingType', 'buildingTypeId']) !== null
    ), 24).map((item, index) => ({ item, bucketKey: '', index }));
  };

  D.construction = village => {
    const occurrence = new Map();
    const normalized = [];

    for (const raw of D.queueItems(village)) {
      const item = raw.item;
      const location = D.firstNum(item, ['locationId', 'buildingLocationId', 'location']);
      const building = location === null ? null : (village?.buildings || []).find(entry => Number(entry.locationId) === location);
      const type = D.firstNum(item, ['buildingType', 'buildingTypeId']) ?? D.num(building?.buildingType);
      const current = D.num(building?.lvl);
      const explicitTarget = D.firstNum(item, ['targetLevel', 'targetLvl', 'levelTo', 'lvlNext', 'newLevel']);
      const group = `${location ?? 'x'}:${type ?? 'x'}`;
      const ordinal = occurrence.get(group) || 0;
      occurrence.set(group, ordinal + 1);
      const level = explicitTarget ?? (current !== null ? current + ordinal + 1 : null);
      const end = D.endTime(item);
      const queueType = D.firstNum(item, ['queueType', 'type']) ?? D.num(raw.bucketKey);
      normalized.push({
        loc: location,
        type,
        label: D.BUILDINGS[type] || `Building ${type ?? ''}`.trim() || 'Construction',
        level,
        end,
        queueType,
        paid: item?.paid === true || item?.paid === 1 || item?.paid === '1',
        waiting: !end && (queueType === 4 || item?.waiting === true)
      });
    }

    const seen = new Set();
    return normalized.filter(entry => {
      const key = [entry.loc, entry.type, entry.level, entry.end, entry.queueType].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  function pathUnitId(path) {
    for (let index = path.length - 1; index >= 0; index -= 1) {
      if (/^\d{1,3}$/.test(path[index])) return Number(path[index]);
      const match = String(path[index]).match(/(?:unit|troop)[^0-9]*(\d+)/i);
      if (match) return Number(match[1]);
    }
    return null;
  }

  D.training = village => {
    const queue = village?.unitQueue;
    const rows = [];
    const seen = new Set();

    D.walkObjects(queue, (object, path) => {
      const amount = D.firstNum(object, ['amount', 'count', 'quantity', 'remaining', 'unitsLeft', 'totalUnits', 'number']);
      const end = D.endTime(object);
      const unitId = D.firstNum(object, ['unitId', 'unitType', 'unitTypeId', 'troopType', 'troopTypeId']) ?? pathUnitId(path);
      const buildingType = D.firstNum(object, ['buildingType', 'buildingTypeId']);
      const location = D.firstNum(object, ['locationId', 'buildingLocationId']);
      if (!(amount > 0) || (unitId === null && end === null && buildingType === null)) return;
      const key = [unitId, buildingType, location, amount, end].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({
        unitId,
        unitName: D.unitName(village?.tribeId, unitId),
        buildingType,
        buildingLabel: D.TRAINING_BUILDINGS[buildingType] || D.BUILDINGS[buildingType] || '',
        location,
        amount,
        end
      });
    });

    let count = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    if (!count && D.hasData(queue)) {
      const fallback = D.collect(queue, object => D.firstNum(object, ['amount', 'count', 'quantity', 'remaining']) > 0, 24);
      const values = fallback.map(object => D.firstNum(object, ['amount', 'count', 'quantity', 'remaining'])).filter(value => value > 0);
      count = values.reduce((sum, value) => sum + value, 0);
    }

    const futureEnds = rows.map(row => row.end).filter(time => Number.isFinite(time) && time > Date.now()).sort((a, b) => a - b);
    const active = rows.length > 0 || D.hasData(queue?.unitsInQueue ?? queue);
    return { active, count, end: futureEnds[0] || null, entries: rows };
  };

  D.smithy = village => {
    const queue = village?.smithyQueue;
    const entries = [];
    const seen = new Set();
    const now = Date.now();

    D.walkObjects(queue, (object, path) => {
      const end = D.endTime(object);
      if (!(end && end > now)) return;
      const unitId = D.firstNum(object, ['unitId', 'unitType', 'unitTypeId', 'troopType', 'troopTypeId']) ?? pathUnitId(path);
      const level = D.firstNum(object, ['targetLevel', 'targetLvl', 'levelTo', 'lvlNext', 'newLevel', 'level', 'lvl']);
      const key = [unitId, level, end].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({
        unitId,
        unitName: D.unitName(village?.tribeId, unitId),
        level,
        end
      });
    });

    let fallbackEnd = null;
    if (!entries.length) {
      D.walkObjects(queue, object => {
        const end = D.endTime(object);
        if (end && end > now && (!fallbackEnd || end < fallbackEnd)) fallbackEnd = end;
      });
    }

    const end = entries.map(entry => entry.end).filter(Boolean).sort((a, b) => a - b)[0] || fallbackEnd;
    return {
      active: Boolean(end) || entries.length > 0,
      end: end || null,
      entries
    };
  };

  function celebrationType(value) {
    const text = String(value ?? '').toLowerCase();
    if (value === 2 || /big|great|large/.test(text)) return 'big';
    if (value === 1 || /small/.test(text)) return 'small';
    return '';
  }

  D.celebration = village => {
    const now = Date.now();
    const hasTownHall = D.hasBuilding(village, 24);
    let type = celebrationType(village?.celebrationType);
    let end = D.time(village?.celebrationEnd);

    if (!(end && end > now)) {
      end = null;
      D.walkObjects(village?.celebrations, (object, path) => {
        const candidateEnd = D.endTime(object);
        if (!(candidateEnd && candidateEnd > now)) return;
        if (!end || candidateEnd < end) {
          end = candidateEnd;
          type = celebrationType(object?.celebrationType ?? object?.type ?? object?.kind ?? object?.size)
            || (object?.isBig === true || object?.big === true ? 'big' : '')
            || (path.some(part => /big|great|large/i.test(part)) ? 'big' : '')
            || (path.some(part => /small/i.test(part)) ? 'small' : '')
            || type;
        }
      });
    }

    const active = Boolean(end && end > now);
    return {
      active,
      end: active ? end : null,
      type: type || 'small',
      label: type === 'big' ? 'Big celebration' : 'Small celebration',
      hasTownHall,
      ready: hasTownHall && !active
    };
  };

  let scanCache = null;
  let scanCacheKey = '';

  D.scanKey = () => `apes_village_dashboard_scan_v1:${location.hostname}:${String(D.snapshot.playerId ?? 'unknown')}`;

  D.scanStore = () => {
    const key = D.scanKey();
    if (scanCache && scanCacheKey === key) return scanCache;
    try {
      scanCache = JSON.parse(localStorage.getItem(key) || '{}') || {};
    } catch (_) {
      scanCache = {};
    }
    scanCacheKey = key;
    return scanCache;
  };

  D.resetScanCache = () => {
    scanCache = null;
    scanCacheKey = '';
  };

  D.scanFor = id => D.scanStore()?.villages?.[String(id)] || null;

  D.saveScan = (id, data) => {
    if (!D.snapshot.playerId) return;
    const store = D.scanStore();
    store.villages = store.villages || {};
    store.villages[String(id)] = { ...(store.villages[String(id)] || {}), ...data, scannedAt: Date.now() };
    try { localStorage.setItem(D.scanKey(), JSON.stringify(store)); } catch (_) {}
  };

  D.parseSigned = text => {
    const raw = String(text ?? '').replace(/\u2212/g, '-').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/\s+/g, '').trim();
    if (!raw) return null;
    const compact = raw.match(/^([+-]?)(\d+(?:[.,]\d+)?)([kKmM])$/);
    if (compact) {
      const number = Number.parseFloat(compact[2].replace(',', '.'));
      const multiplier = compact[3].toLowerCase() === 'm' ? 1e6 : 1e3;
      return Math.round((compact[1] === '-' ? -1 : 1) * number * multiplier);
    }
    const negative = /^-/.test(raw);
    const digits = raw.replace(/[^0-9]/g, '');
    return digits ? (negative ? -1 : 1) * Number.parseInt(digits, 10) : null;
  };

  D.scanResources = () => D.RESOURCES.map(resource => {
    const stock = document.querySelector(`#resourceBar .stockContainer.${resource.key}`);
    const bar = stock?.querySelector('.progressbar');
    const block = stock?.closest('[ng-repeat]') || stock?.parentElement;
    const productionNode = block?.querySelector('.production .value');
    if (!bar || !productionNode) return null;
    const current = Math.abs(D.parseSigned(bar.getAttribute('value') ?? bar.querySelector('.amount.wrapper')?.textContent) ?? NaN);
    const capacity = Math.abs(D.parseSigned(bar.getAttribute('max-value') ?? bar.querySelector('.capacity')?.textContent) ?? NaN);
    const direct = [...productionNode.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(' ');
    const production = D.parseSigned(direct);
    return [current, capacity, production].every(Number.isFinite) ? { ...resource, current, capacity, production } : null;
  }).filter(Boolean);

  D.scanBuildings = () => {
    const view = document.getElementById('villageView');
    if (!view) return [];
    return D.TRACKED.map(definition => {
      const image = view.querySelector(`img.location.buildingId${definition.type}`);
      if (!image) return null;
      const wrapper = image.closest('building-location');
      const location = D.num(
        String(image.id || '').match(/^buildingImage(\d+)$/)?.[1]
        || Array.from(wrapper?.classList || []).find(name => /^buildingLocation\d+$/.test(name))?.replace('buildingLocation', '')
      );
      return location === null ? null : {
        ...definition,
        location,
        level: D.num(wrapper?.querySelector('.buildingLevel')?.textContent)
      };
    }).filter(Boolean);
  };

  D.scanTrainingBuildings = () => {
    const active = [];
    document.querySelectorAll('#quickLinks [ng-repeat="item in unitBuilding"] i').forEach(icon => {
      const match = String(icon.className || '').match(/building_g(\d+)_small_flat_green/i);
      if (!match) return;
      const type = Number(match[1]);
      active.push({ type, label: D.TRAINING_BUILDINGS[type] || D.BUILDINGS[type] || `Building ${type}` });
    });
    return active.filter((entry, index, list) => list.findIndex(other => other.type === entry.type) === index);
  };

  D.captureCurrent = () => {
    const id = D.currentVillageId();
    if (!/^\d+$/.test(id) || !D.snapshot.playerId) return;
    const resources = D.scanResources();
    const buildings = D.scanBuildings();
    const trainingBuildings = D.scanTrainingBuildings();
    if (resources.length || buildings.length || trainingBuildings.length) D.saveScan(id, { resources, buildings, trainingBuildings });
  };

  D.projected = village => {
    const scan = D.scanFor(village?.villageId);
    if (!scan?.resources || !Number.isFinite(Number(scan.scannedAt))) return [];
    const hours = Math.max(0, Date.now() - Number(scan.scannedAt)) / 3600000;
    return scan.resources.map(resource => {
      const projectedRaw = resource.current + resource.production * hours;
      const current = Math.max(0, Math.min(resource.capacity, projectedRaw));
      const eta = resource.production > 0
        ? (resource.capacity - current) / resource.production * 3600000
        : resource.production < 0
          ? current / Math.abs(resource.production) * 3600000
          : Infinity;
      return {
        ...resource,
        current,
        percent: resource.capacity > 0 ? Math.round(current / resource.capacity * 100) : 0,
        eta,
        direction: resource.production < 0 ? 'empty' : 'full'
      };
    });
  };

  D.resourceRisk = resources => resources
    .filter(resource => Number.isFinite(resource.eta))
    .map(resource => ({
      ...resource,
      label: `${resource.name} ${resource.direction === 'empty' ? 'empty' : 'full'}`
    }))
    .sort((left, right) => left.eta - right.eta)[0] || null;

  D.insight = village => {
    const now = Date.now();
    const build = D.construction(village);
    const train = D.training(village);
    const smith = D.smithy(village);
    const party = D.celebration(village);
    const res = D.projected(village);
    const alerts = [];
    const events = [];

    const addAlert = (label, tone, score, actionable = false, kind = '') => alerts.push([label, tone, score, actionable, kind]);

    const free = build.filter(item => item.end && item.end > now && item.end - now <= D.FREE_FINISH_MS).length;
    if (free) addAlert(`${free} free finish${free === 1 ? '' : 'es'}`, 'ready', 80, true, 'freeFinish');

    const crop = res.find(resource => resource.key === 'crop');
    if (crop?.production < 0) addAlert(`Crop ${D.signed(crop.production)}/h`, 'danger', 100, true, 'crop');

    let storage = Infinity;
    res.forEach(resource => {
      if (Number.isFinite(resource.eta)) storage = Math.min(storage, resource.eta);
      if (resource.percent >= 100 || resource.current <= 0 && resource.production < 0) {
        addAlert(`${resource.name} ${resource.production < 0 ? 'empty' : 'full'}`, 'danger', 90, true, 'storage');
      } else if (Number.isFinite(resource.eta) && resource.eta <= D.RESOURCE_WARNING_MS) {
        addAlert(`${resource.name} ${resource.direction} ${D.duration(resource.eta)}`, 'warn', 60, true, 'storage');
      }
      if (Number.isFinite(resource.eta) && resource.eta > 0 && resource.eta <= D.RESOURCE_EVENT_MS) {
        events.push({
          at: now + resource.eta,
          id: String(village.villageId),
          name: village.name,
          label: `${resource.name} ${resource.direction === 'empty' ? 'empties' : 'fills'}`
        });
      }
    });

    if (party.ready) addAlert('Celebration ready', 'warn', 45, true, 'celebration');
    if (!build.length) addAlert('Construction idle', 'info', 8, false, 'construction');

    const hasTraining = (village?.buildings || []).some(building => Object.hasOwn(D.TRAINING_BUILDINGS, Number(building.buildingType)));
    if (hasTraining && !train.active) addAlert('Training idle', 'info', 7, false, 'training');
    if (D.hasBuilding(village, 12) && !smith.active) addAlert('Smithy idle', 'info', 5, false, 'smithy');

    const age = Date.now() - Number(D.scanFor(village?.villageId)?.scannedAt);
    if (!Number.isFinite(age)) addAlert('Resource data needed', 'info', 4, false, 'data');
    else if (age > D.STALE_MS) addAlert(`Resource data ${D.duration(age)} old`, 'info', 4, false, 'data');

    build.forEach(item => {
      if (!item.end || item.end <= now) return;
      const label = `${item.label}${item.level !== null ? ` → ${item.level}` : ''}`;
      events.push({ at: item.end, id: String(village.villageId), name: village.name, label: `${label} finishes` });
      const freeAt = item.end - D.FREE_FINISH_MS;
      events.push({
        at: Math.max(now, freeAt),
        id: String(village.villageId),
        name: village.name,
        label: freeAt <= now ? `Free finish ready: ${label}` : `Free finish: ${label}`
      });
    });

    if (train.end && train.end > now) events.push({ at: train.end, id: String(village.villageId), name: village.name, label: 'Training queue finishes' });
    if (smith.end && smith.end > now) events.push({ at: smith.end, id: String(village.villageId), name: village.name, label: 'Smithy upgrade finishes' });
    if (party.active) events.push({ at: party.end, id: String(village.villageId), name: village.name, label: `${party.label} finishes` });

    alerts.sort((left, right) => Number(right[3]) - Number(left[3]) || right[2] - left[2]);
    events.sort((left, right) => left.at - right.at);

    const actionableAlerts = alerts.filter(alert => alert[3]);
    const score = alerts.reduce((sum, alert) => sum + (alert[3] ? alert[2] : Math.min(alert[2], 9)), 0);
    const nextConstruction = build.filter(item => item.end > now).map(item => item.end).sort((a, b) => a - b)[0] ?? Infinity;

    return {
      build,
      train,
      smith,
      party,
      res,
      alerts,
      actionableAlerts,
      needsAttention: actionableAlerts.length > 0,
      events,
      score,
      free,
      next: events[0]?.at ?? Infinity,
      construction: nextConstruction,
      storage
    };
  };
})();
