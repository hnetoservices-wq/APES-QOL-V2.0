/**
 * APES QoL v2 — Village Dashboard Bridge
 *
 * Runs in Travian's MAIN world and exposes a sanitized, read-only snapshot of
 * the logged-in player's own village cache to the isolated APES UI world.
 * No navigation, profile opening or network scanning is performed here.
 */

(() => {
    'use strict';

    const FLAG = '__APES_QOL_VILLAGE_DASHBOARD_BRIDGE__';
    const UI_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_UI';
    const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
    const REQUEST_TYPE = 'REQUEST_SNAPSHOT';
    const RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';

    if (window[FLAG]) return;
    window[FLAG] = true;

    function cache() {
        return window.Cache?.c || {};
    }

    function modelData(cacheObject, key) {
        const model = cacheObject?.[key];
        if (!model) return null;
        return model?.data ?? model;
    }

    function asFiniteNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : null;
    }

    function asId(value) {
        const text = String(value ?? '').trim();
        return /^\d+$/.test(text) ? text : '';
    }

    function safeCopy(value, depth = 0, seen = new WeakSet()) {
        if (value === null || value === undefined) return value;
        if (typeof value === 'string' || typeof value === 'boolean') return value;
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (typeof value === 'bigint') return String(value);
        if (typeof value === 'function' || typeof value === 'symbol') return undefined;
        if (depth > 6) return undefined;

        if (Array.isArray(value)) {
            return value.slice(0, 160)
                .map(item => safeCopy(item, depth + 1, seen))
                .filter(item => item !== undefined);
        }

        if (typeof value !== 'object') return undefined;
        if (seen.has(value)) return undefined;
        seen.add(value);

        const output = {};
        for (const key of Object.keys(value).slice(0, 220)) {
            if (key === 'movement' || key.startsWith('$$')) continue;
            let copied;
            try {
                copied = safeCopy(value[key], depth + 1, seen);
            } catch (_error) {
                copied = undefined;
            }
            if (copied !== undefined) output[key] = copied;
        }
        return output;
    }

    function extractIdsFromOwnCollection(cacheObject) {
        const ids = new Set();
        const raw = modelData(cacheObject, 'Collection:Village:own');
        const seen = new WeakSet();

        function walk(value, depth = 0) {
            if (value === null || value === undefined || depth > 4) return;

            if (typeof value === 'number' || typeof value === 'string') {
                const text = String(value);
                const named = text.match(/Village:(\d+)/i)?.[1];
                if (named) ids.add(named);
                else if (/^\d{6,}$/.test(text)) ids.add(text);
                return;
            }

            if (typeof value !== 'object') return;
            if (seen.has(value)) return;
            seen.add(value);

            const direct = asId(
                value.villageId ??
                value.locationId ??
                value.id ??
                value?.data?.villageId ??
                value?.data?.locationId
            );
            if (direct) ids.add(direct);

            const refName = String(value.name ?? value.key ?? value.cacheKey ?? '');
            const named = refName.match(/Village:(\d+)/i)?.[1];
            if (named) ids.add(named);

            for (const child of Object.values(value)) walk(child, depth + 1);
        }

        walk(raw);
        return ids;
    }

    function activeVillageId(cacheObject) {
        const fromHash = String(window.location.hash || '')
            .match(/(?:^|\/)villId:(\d+)/i)?.[1];
        if (fromHash) return fromHash;

        for (const [key, model] of Object.entries(cacheObject)) {
            if (!/^Village:\d+$/.test(key)) continue;
            const data = model?.data;
            if (data?.isActive === true || data?.isActive === 1 || data?.isActive === '1') {
                return asId(data.villageId) || key.split(':')[1];
            }
        }
        return '';
    }

    function ownVillageIds(cacheObject) {
        const fromCollection = extractIdsFromOwnCollection(cacheObject);
        const activeId = activeVillageId(cacheObject);
        const activeData = activeId ? modelData(cacheObject, `Village:${activeId}`) : null;
        const ownPlayerId = asFiniteNumber(activeData?.playerId);

        // The native own-village collection is the authoritative source when
        // it resolves cleanly to Village cache keys.
        const validCollectionIds = [...fromCollection]
            .filter(id => modelData(cacheObject, `Village:${id}`));
        if (validCollectionIds.length) {
            return {
                playerId: ownPlayerId ?? asFiniteNumber(
                    modelData(cacheObject, `Village:${validCollectionIds[0]}`)?.playerId
                ),
                ids: validCollectionIds
            };
        }

        // Fallback: all cached Village models belonging to the active
        // village's player. This deliberately excludes map villages owned by
        // other players.
        const ids = [];
        if (ownPlayerId !== null) {
            for (const [key, model] of Object.entries(cacheObject)) {
                const match = key.match(/^Village:(\d+)$/);
                if (!match) continue;
                if (Number(model?.data?.playerId) === ownPlayerId) ids.push(match[1]);
            }
        }

        if (activeId && !ids.includes(activeId)) ids.push(activeId);
        return { playerId: ownPlayerId, ids };
    }

    function resolveCollectionModels(cacheObject, key, modelPrefix) {
        const raw = modelData(cacheObject, key);
        if (!raw) return [];

        const values = Array.isArray(raw) ? raw : Object.values(raw);
        const models = [];
        const seenKeys = new Set();

        for (const value of values) {
            const directData = value?.data ?? value;
            if (directData && typeof directData === 'object') {
                const expectedField = modelPrefix === 'Troops' ? 'units' : 'buildingType';
                if (expectedField in directData) {
                    models.push(directData);
                    continue;
                }
            }

            let id = '';
            if (typeof value === 'number' || typeof value === 'string') {
                id = asId(value);
                if (!id) id = String(value).match(new RegExp(`${modelPrefix}:(\\d+)`, 'i'))?.[1] || '';
            } else if (value && typeof value === 'object') {
                id = asId(
                    value.troopId ??
                    value.buildingId ??
                    value.id ??
                    value?.data?.troopId ??
                    value?.data?.buildingId
                );
                if (!id) {
                    id = String(value.name ?? value.key ?? '')
                        .match(new RegExp(`${modelPrefix}:(\\d+)`, 'i'))?.[1] || '';
                }
            }

            if (!id) continue;
            const modelKey = `${modelPrefix}:${id}`;
            if (seenKeys.has(modelKey)) continue;
            seenKeys.add(modelKey);
            const data = modelData(cacheObject, modelKey);
            if (data) models.push(data);
        }

        return models;
    }

    function compactBuilding(building) {
        return {
            buildingType: asFiniteNumber(building?.buildingType),
            villageId: asId(building?.villageId),
            locationId: asFiniteNumber(building?.locationId),
            lvl: asFiniteNumber(building?.lvl),
            lvlNext: asFiniteNumber(building?.lvlNext),
            isMaxLvl: building?.isMaxLvl === true || building?.isMaxLvl === 1 || building?.isMaxLvl === '1'
        };
    }

    function compactTroop(troop) {
        return {
            troopId: asFiniteNumber(troop?.troopId),
            playerId: asFiniteNumber(troop?.playerId),
            playerName: String(troop?.playerName ?? ''),
            tribeId: asFiniteNumber(troop?.tribeId),
            villageId: asId(troop?.villageId),
            villageName: String(troop?.villageName ?? ''),
            villageIdLocation: asId(troop?.villageIdLocation),
            villageIdSupply: asId(troop?.villageIdSupply),
            status: safeCopy(troop?.status),
            units: safeCopy(troop?.units, 0),
            originalTroops: safeCopy(troop?.originalTroops, 0),
            supplyTroops: safeCopy(troop?.supplyTroops, 0)
        };
    }

    function villageSnapshot(cacheObject, villageId, playerId) {
        const village = modelData(cacheObject, `Village:${villageId}`) || {};
        const buildings = resolveCollectionModels(
            cacheObject,
            `Collection:Building:${villageId}`,
            'Building'
        ).map(compactBuilding);

        const stationaryTroops = resolveCollectionModels(
            cacheObject,
            `Collection:Troops:stationary:${villageId}`,
            'Troops'
        ).map(compactTroop);

        const movingTroops = resolveCollectionModels(
            cacheObject,
            `Collection:Troops:moving:${villageId}`,
            'Troops'
        ).map(compactTroop);

        const elsewhereTroops = resolveCollectionModels(
            cacheObject,
            `Collection:Troops:elsewhere:${villageId}`,
            'Troops'
        ).map(compactTroop);

        const woundedTroops = resolveCollectionModels(
            cacheObject,
            `Collection:Troops:wounded:${villageId}`,
            'Troops'
        ).map(compactTroop);

        return {
            villageId,
            playerId: asFiniteNumber(village.playerId) ?? playerId,
            name: String(village.name ?? `Village ${villageId}`),
            tribeId: asFiniteNumber(village.tribeId),
            population: asFiniteNumber(village.population),
            x: asFiniteNumber(village.x ?? village?.coordinates?.x),
            y: asFiniteNumber(village.y ?? village?.coordinates?.y),
            isActive: village.isActive === true || village.isActive === 1 || village.isActive === '1',
            isMainVillage: village.isMainVillage === true || village.isMainVillage === 1 || village.isMainVillage === '1',
            isTown: village.isTown === true || village.isTown === 1 || village.isTown === '1',
            celebrations: safeCopy(village.celebrations),
            celebrationType: safeCopy(village.celebrationType),
            celebrationEnd: safeCopy(village.celebrationEnd),
            culturePoints: asFiniteNumber(village.culturePoints),
            culturePointProduction: asFiniteNumber(village.culturePointProduction),
            buildingQueue: safeCopy(modelData(cacheObject, `BuildingQueue:${villageId}`)),
            unitQueue: safeCopy(modelData(cacheObject, `UnitQueue:${villageId}`)),
            smithyQueue: safeCopy(modelData(cacheObject, `UnitResearchQueue:${villageId}`)),
            buildings,
            stationaryTroops,
            movingTroops,
            elsewhereTroops,
            woundedTroops
        };
    }

    function buildSnapshot() {
        const cacheObject = cache();
        const ownership = ownVillageIds(cacheObject);
        const activeId = activeVillageId(cacheObject);

        const villages = ownership.ids
            .map(id => villageSnapshot(cacheObject, id, ownership.playerId))
            .sort((a, b) => {
                const aActive = a.villageId === activeId || a.isActive;
                const bActive = b.villageId === activeId || b.isActive;
                if (aActive !== bActive) return aActive ? -1 : 1;
                return a.name.localeCompare(b.name, undefined, {
                    numeric: true,
                    sensitivity: 'base'
                });
            });

        return {
            generatedAt: Date.now(),
            playerId: ownership.playerId,
            activeVillageId: activeId,
            villages
        };
    }

    function sendSnapshot() {
        let payload;
        try {
            payload = buildSnapshot();
        } catch (error) {
            console.warn('[APES Village Dashboard Bridge] Snapshot failed.', error);
            payload = {
                generatedAt: Date.now(),
                playerId: null,
                activeVillageId: '',
                villages: [],
                error: String(error?.message || error)
            };
        }

        window.postMessage({
            source: BRIDGE_SOURCE,
            type: RESPONSE_TYPE,
            payload
        }, window.location.origin);
    }

    window.addEventListener('message', event => {
        if (event.source !== window) return;
        if (event.data?.source !== UI_SOURCE) return;
        if (event.data?.type !== REQUEST_TYPE) return;
        sendSnapshot();
    });
})();
