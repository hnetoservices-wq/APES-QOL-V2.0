(() => {
  'use strict';

  const A = window.APES_AOC_INTERNAL;
  const D = A?.data;
  if (!D || D.__accuracyLayerV1) return;
  D.__accuracyLayerV1 = true;

  const UNIT_ID_KEYS = Object.freeze(['unitId', 'unitType', 'unitTypeId', 'troopType', 'troopTypeId']);
  const AMOUNT_KEYS = Object.freeze(['amount', 'count', 'quantity', 'remaining', 'unitsLeft', 'totalUnits', 'number']);
  const LEVEL_KEYS = Object.freeze(['targetLevel', 'targetLvl', 'levelTo', 'lvlNext', 'newLevel']);

  function explicitUnitId(object) {
    return D.firstNum(object, UNIT_ID_KEYS);
  }

  function namedPathUnitId(path) {
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const part = String(path[index] ?? '');
      const match = part.match(/(?:^|[^a-z])(?:unit|troop)[^0-9]*(\d{1,3})(?:$|[^0-9])/i)
        || part.match(/^(?:unit|troop)(\d{1,3})$/i);
      if (match) return Number(match[1]);
    }
    return null;
  }

  function localUnitSlot(rawUnitId) {
    const id = D.num(rawUnitId);
    if (id === null || id <= 0) return null;
    return ((Math.round(id) - 1) % 10 + 10) % 10 + 1;
  }

  function expectedTrainingTypes(tribeId, rawUnitId) {
    const slot = localUnitSlot(rawUnitId);
    if (slot === null) return [];
    const tribe = Number(tribeId);

    if (slot === 7 || slot === 8) return [21];
    if (slot >= 4 && slot <= 6) return [20, 30];
    if (slot === 3 && tribe === 3) return [20, 30];
    if (slot >= 1 && slot <= 3) return [19, 29];
    return [];
  }

  function activeTrainingTypes(village) {
    return (D.scanFor(village?.villageId)?.trainingBuildings || [])
      .map(entry => Number(entry?.type))
      .filter(Number.isFinite);
  }

  function trainingBuilding(village, unitId, explicitType) {
    const type = D.num(explicitType);
    if (type !== null) {
      return {
        type,
        label: D.TRAINING_BUILDINGS[type] || D.BUILDINGS[type] || '',
        confidence: 'exact'
      };
    }

    const expected = expectedTrainingTypes(village?.tribeId, unitId);
    if (!expected.length) return { type: null, label: '', confidence: 'unknown' };

    const active = activeTrainingTypes(village);
    const matching = expected.filter(candidate => active.includes(candidate));
    if (matching.length === 1) {
      const resolved = matching[0];
      return {
        type: resolved,
        label: D.TRAINING_BUILDINGS[resolved] || D.BUILDINGS[resolved] || '',
        confidence: 'observed'
      };
    }

    if (matching.length > 1) {
      return {
        type: null,
        label: matching.map(candidate => D.TRAINING_BUILDINGS[candidate] || D.BUILDINGS[candidate]).filter(Boolean).join(' / '),
        confidence: 'ambiguous'
      };
    }

    if (expected.length === 1) {
      const resolved = expected[0];
      return {
        type: resolved,
        label: D.TRAINING_BUILDINGS[resolved] || D.BUILDINGS[resolved] || '',
        confidence: 'inferred'
      };
    }

    return { type: null, label: '', confidence: 'unknown' };
  }

  D.unitName = (tribeId, rawUnitId) => {
    const tribe = D.UNITS?.[Number(tribeId)];
    const slot = localUnitSlot(rawUnitId);
    if (!tribe || slot === null) return '';
    return tribe[slot - 1] || '';
  };

  D.construction = village => {
    const source = D.queueItems(village).map(raw => {
      const item = raw.item;
      const end = D.endTime(item);
      const start = D.time(item?.timeStart ?? item?.startTime ?? item?.startedAt ?? item?.start);
      return { ...raw, end, start };
    }).sort((left, right) => {
      const leftStart = Number.isFinite(left.start) ? left.start : Infinity;
      const rightStart = Number.isFinite(right.start) ? right.start : Infinity;
      if (leftStart !== rightStart) return leftStart - rightStart;
      const leftEnd = Number.isFinite(left.end) ? left.end : Infinity;
      const rightEnd = Number.isFinite(right.end) ? right.end : Infinity;
      if (leftEnd !== rightEnd) return leftEnd - rightEnd;
      const leftBucket = Number(left.bucketKey);
      const rightBucket = Number(right.bucketKey);
      if (Number.isFinite(leftBucket) && Number.isFinite(rightBucket) && leftBucket !== rightBucket) return leftBucket - rightBucket;
      return Number(left.index || 0) - Number(right.index || 0);
    });

    const occurrence = new Map();
    const normalized = [];

    for (const raw of source) {
      const item = raw.item;
      const location = D.firstNum(item, ['locationId', 'buildingLocationId', 'location']);
      const building = location === null ? null : (village?.buildings || []).find(entry => Number(entry.locationId) === location);
      const type = D.firstNum(item, ['buildingType', 'buildingTypeId']) ?? D.num(building?.buildingType);
      const current = D.num(building?.lvl);
      const nextKnown = D.num(building?.lvlNext);
      const explicitTarget = D.firstNum(item, LEVEL_KEYS);
      const group = `${location ?? 'x'}:${type ?? 'x'}`;
      const ordinal = occurrence.get(group) || 0;
      occurrence.set(group, ordinal + 1);

      let baseline = current !== null ? current + 1 : null;
      if (nextKnown !== null && current !== null && nextKnown > current) baseline = nextKnown;
      else if (nextKnown !== null && current === null) baseline = nextKnown;

      const level = explicitTarget ?? (baseline !== null ? baseline + ordinal : null);
      const queueType = D.firstNum(item, ['queueType', 'type']) ?? D.num(raw.bucketKey);
      const end = raw.end;

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

  D.training = village => {
    const queue = village?.unitQueue;
    const rows = [];
    const seen = new Set();

    D.walkObjects(queue, (object, path) => {
      const amount = D.firstNum(object, AMOUNT_KEYS);
      if (!(amount > 0)) return;

      const explicitId = explicitUnitId(object);
      const pathId = explicitId === null ? namedPathUnitId(path) : null;
      const unitId = explicitId ?? pathId;
      const unitConfidence = explicitId !== null ? 'exact' : pathId !== null ? 'named-path' : 'unknown';
      const end = D.endTime(object);
      const explicitBuildingType = D.firstNum(object, ['buildingType', 'buildingTypeId']);
      const location = D.firstNum(object, ['locationId', 'buildingLocationId']);

      if (unitId === null && end === null && explicitBuildingType === null) return;

      const resolvedBuilding = trainingBuilding(village, unitId, explicitBuildingType);
      const key = [unitId ?? 'x', resolvedBuilding.type ?? 'x', location ?? 'x', amount, end ?? 'x'].join('|');
      if (seen.has(key)) return;
      seen.add(key);

      rows.push({
        unitId,
        unitName: unitId !== null ? D.unitName(village?.tribeId, unitId) : '',
        unitConfidence,
        buildingType: resolvedBuilding.type,
        buildingLabel: resolvedBuilding.label,
        buildingConfidence: resolvedBuilding.confidence,
        location,
        amount,
        end
      });
    });

    rows.sort((left, right) => {
      const leftEnd = Number.isFinite(left.end) ? left.end : Infinity;
      const rightEnd = Number.isFinite(right.end) ? right.end : Infinity;
      if (leftEnd !== rightEnd) return leftEnd - rightEnd;
      return String(left.buildingLabel || '').localeCompare(String(right.buildingLabel || '')) || Number(left.unitId || 0) - Number(right.unitId || 0);
    });

    let count = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    if (!count && D.hasData(queue)) {
      const fallback = D.collect(queue, object => D.firstNum(object, AMOUNT_KEYS) > 0, 24);
      const values = fallback.map(object => D.firstNum(object, AMOUNT_KEYS)).filter(value => value > 0);
      count = values.reduce((sum, value) => sum + value, 0);
    }

    const futureEnds = rows.map(row => row.end).filter(time => Number.isFinite(time) && time > Date.now()).sort((a, b) => a - b);
    const active = rows.length > 0 || D.hasData(queue?.unitsInQueue ?? queue);
    return {
      active,
      count,
      end: futureEnds[0] || null,
      entries: rows,
      quality: rows.length ? (rows.every(row => row.unitConfidence !== 'unknown') ? 'identified' : 'partial') : active ? 'generic' : 'idle'
    };
  };

  D.smithy = village => {
    const queue = village?.smithyQueue;
    const entries = [];
    const seen = new Set();
    const now = Date.now();

    D.walkObjects(queue, (object, path) => {
      const end = D.endTime(object);
      if (!(end && end > now)) return;

      const explicitId = explicitUnitId(object);
      const pathId = explicitId === null ? namedPathUnitId(path) : null;
      const unitId = explicitId ?? pathId;
      const unitConfidence = explicitId !== null ? 'exact' : pathId !== null ? 'named-path' : 'unknown';
      const explicitLevel = D.firstNum(object, LEVEL_KEYS);
      const fallbackLevel = unitId !== null ? D.firstNum(object, ['level', 'lvl']) : null;
      const level = explicitLevel ?? fallbackLevel;
      const key = [unitId ?? 'x', level ?? 'x', end].join('|');
      if (seen.has(key)) return;
      seen.add(key);

      entries.push({
        unitId,
        unitName: unitId !== null ? D.unitName(village?.tribeId, unitId) : '',
        unitConfidence,
        level,
        end
      });
    });

    entries.sort((left, right) => left.end - right.end);

    let fallbackEnd = null;
    if (!entries.length) {
      D.walkObjects(queue, object => {
        const end = D.endTime(object);
        if (end && end > now && (!fallbackEnd || end < fallbackEnd)) fallbackEnd = end;
      });
    }

    const end = entries[0]?.end || fallbackEnd;
    return {
      active: Boolean(end) || entries.length > 0,
      end: end || null,
      entries,
      quality: entries.length ? (entries.every(entry => entry.unitConfidence !== 'unknown') ? 'identified' : 'partial') : end ? 'generic' : 'idle'
    };
  };

  function celebrationType(value) {
    const numeric = D.num(value);
    const text = String(value ?? '').toLowerCase();
    if (numeric === 2 || /big|great|large/.test(text)) return 'big';
    if (numeric === 1 || /small/.test(text)) return 'small';
    return '';
  }

  D.celebration = village => {
    const now = Date.now();
    const hasTownHall = D.hasBuilding(village, 24);
    let type = celebrationType(village?.celebrationType);
    let typeConfidence = type ? 'exact' : 'unknown';
    let end = D.time(village?.celebrationEnd);

    if (!(end && end > now)) {
      end = null;
      D.walkObjects(village?.celebrations, (object, path) => {
        const candidateEnd = D.endTime(object);
        if (!(candidateEnd && candidateEnd > now)) return;
        if (end && candidateEnd >= end) return;

        end = candidateEnd;
        const objectType = celebrationType(object?.celebrationType ?? object?.type ?? object?.kind ?? object?.size);
        const booleanType = object?.isBig === true || object?.big === true ? 'big' : object?.isSmall === true || object?.small === true ? 'small' : '';
        const pathType = path.some(part => /big|great|large/i.test(part)) ? 'big' : path.some(part => /small/i.test(part)) ? 'small' : '';
        const resolved = objectType || booleanType || pathType || type;
        if (resolved) {
          type = resolved;
          typeConfidence = objectType || booleanType ? 'exact' : pathType ? 'named-path' : typeConfidence;
        }
      });
    }

    const active = Boolean(end && end > now);
    const label = type === 'big' ? 'Big celebration' : type === 'small' ? 'Small celebration' : 'Celebration';
    return {
      active,
      end: active ? end : null,
      type,
      typeConfidence,
      label,
      hasTownHall,
      ready: hasTownHall && !active
    };
  };

  const baseProjected = D.projected;
  D.projected = village => {
    const scan = D.scanFor(village?.villageId);
    const scannedAt = Number(scan?.scannedAt);
    const resources = baseProjected(village);
    if (!resources.length || !Number.isFinite(scannedAt)) return resources;
    const age = Math.max(0, Date.now() - scannedAt);
    return resources.map(resource => ({
      ...resource,
      scannedAt,
      snapshotAge: age,
      live: age <= 15000,
      stale: age > D.STALE_MS,
      projected: age > 15000
    }));
  };

  D.resourceSnapshotState = village => {
    const scan = D.scanFor(village?.villageId);
    const scannedAt = Number(scan?.scannedAt);
    if (!Number.isFinite(scannedAt)) return { state: 'missing', age: Infinity, scannedAt: null };
    const age = Math.max(0, Date.now() - scannedAt);
    return {
      state: age <= 15000 ? 'live' : age > D.STALE_MS ? 'stale' : 'projected',
      age,
      scannedAt
    };
  };

  D.dataAccuracy = village => {
    const train = D.training(village);
    const smith = D.smithy(village);
    const party = D.celebration(village);
    const resources = D.resourceSnapshotState(village);
    return {
      training: train.quality,
      smithy: smith.quality,
      celebration: party.active ? party.typeConfidence : party.ready ? 'ready' : 'idle',
      resources: resources.state
    };
  };

  window.APES_AOC_DATA_ACCURACY = Object.freeze({
    version: 1,
    inspect(villageId) {
      const id = String(villageId || D.currentVillageId() || '');
      const village = (D.snapshot?.villages || []).find(entry => String(entry.villageId) === id);
      if (!village) return null;
      return {
        village: { id, name: village.name, tribeId: village.tribeId },
        quality: D.dataAccuracy(village),
        training: D.training(village),
        smithy: D.smithy(village),
        celebration: D.celebration(village),
        construction: D.construction(village),
        resourceSnapshot: D.resourceSnapshotState(village),
        raw: {
          unitQueue: village.unitQueue,
          smithyQueue: village.smithyQueue,
          buildingQueue: village.buildingQueue,
          celebrationType: village.celebrationType,
          celebrationEnd: village.celebrationEnd,
          celebrations: village.celebrations
        }
      };
    }
  });
})();
