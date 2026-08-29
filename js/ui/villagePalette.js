/**
 * APES QoL v2 — Village Dashboard
 *
 * Press H to toggle a borderless dashboard for every owned village.
 * Data comes from Travian's MAIN-world cache via villageDashboardBridge.js.
 * Scan Now deliberately visits every owned village to refresh that cache.
 */

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

    const UNIT_NAMES = Object.freeze({
        1: [
            'Legionnaire', 'Praetorian', 'Imperian', 'Equites Legati',
            'Equites Imperatoris', 'Equites Caesaris', 'Battering Ram',
            'Fire Catapult', 'Senator', 'Settler'
        ],
        2: [
            'Clubswinger', 'Spearman', 'Axeman', 'Scout', 'Paladin',
            'Teutonic Knight', 'Ram', 'Catapult', 'Chief', 'Settler'
        ],
        3: [
            'Phalanx', 'Swordsman', 'Pathfinder', 'Theutates Thunder',
            'Druidrider', 'Haeduan', 'Ram', 'Trebuchet', 'Chieftain', 'Settler'
        ]
    });

    // Official Travian Kingdoms crop consumption per unit, local unit 1..10.
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
    let scanInProgress = false;
    let scanProgress = { current: 0, total: 0, returning: false };

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function sleep(milliseconds) {
        return new Promise(resolve => window.setTimeout(resolve, milliseconds));
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
        return String(window.location.hash || '')
            .match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
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

    function remainingText(value) {
        const timestamp = asTimestamp(value);
        return timestamp ? formatDurationMilliseconds(timestamp - Date.now()) : '';
    }

    function formatInteger(value) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.round(number).toLocaleString() : '0';
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

            if (Array.isArray(node)) node.forEach(item => walk(item, depth + 1));
            else Object.values(node).forEach(item => walk(item, depth + 1));
        }

        walk(value);
        return results;
    }

    function findEndTime(object) {
        if (!object || typeof object !== 'object') return null;
        const keys = [
            'endTime', 'finishTime', 'finishedAt', 'finishAt', 'completionTime',
            'completeAt', 'timeFinished', 'end', 'until', 'doneAt', 'finish'
        ];
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
        if (index === null) return `Unit ${rawIndex}`;
        return UNIT_NAMES[Number(tribeId)]?.[index - 1] || `Unit ${rawIndex}`;
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

    function queueLocation(item) {
        return asNumber(
            item?.locationId ??
            item?.buildingLocationId ??
            item?.location ??
            item?.building?.locationId
        );
    }

    function buildingTypeForQueueItem(item, village) {
        const direct = asNumber(
            item?.buildingType ??
            item?.buildingTypeId ??
            item?.building?.buildingType ??
            item?.type
        );
        if (direct !== null && BUILDING_NAMES[direct]) return direct;

        const locationId = queueLocation(item);
        if (locationId !== null) {
            return asNumber(buildingLookup(village).get(String(locationId))?.buildingType);
        }
        return direct;
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
                if (item && typeof item === 'object' && queueLocation(item) !== null) {
                    items.push(item);
                }
            });
        };

        if (Array.isArray(source)) source.forEach(pushBucket);
        else Object.values(source).forEach(pushBucket);
        return items;
    }

    function explicitQueueTargetLevel(item) {
        return asNumber(
            item?.targetLevel ??
            item?.targetLvl ??
            item?.targetBuildingLevel ??
            item?.levelTo ??
            item?.toLevel
        );
    }

    function constructionEntries(village) {
        const queue = village?.buildingQueue;
        const entries = [];
        const buildings = buildingLookup(village);
        const queuedPerLocation = new Map();
        const locationsSeenInQueue = new Set();
        const queueItems = constructionQueueItems(queue);

        for (const item of queueItems) {
            const location = queueLocation(item);
            const type = buildingTypeForQueueItem(item, village);
            if (location === null && type === null) continue;

            const building = location !== null ? buildings.get(String(location)) : null;
            const currentLevel = asNumber(building?.lvl);
            const sequenceIndex = location !== null
                ? (queuedPerLocation.get(String(location)) || 0)
                : 0;

            let level = null;
            if (currentLevel !== null) {
                level = currentLevel + sequenceIndex + 1;
            } else {
                level = explicitQueueTargetLevel(item);
                if (level === null) {
                    const itemLevel = asNumber(item?.level ?? item?.lvl);
                    if (itemLevel !== null) level = itemLevel + 1;
                }
            }

            if (location !== null) {
                queuedPerLocation.set(String(location), sequenceIndex + 1);
                locationsSeenInQueue.add(String(location));
            }

            const end = findEndTime(item);
            const fullLabel = BUILDING_NAMES[type] || (type ? `Building ${type}` : 'Construction');
            const label = BUILDING_SHORT_NAMES[type] || fullLabel;
            entries.push({ type, location, label, fullLabel, level, end });
        }

        for (const building of village?.buildings || []) {
            if (!hasMeaningfulData(building?.inQueueEffects)) continue;

            const type = asNumber(building?.buildingType);
            const location = asNumber(building?.locationId);
            if (location !== null && locationsSeenInQueue.has(String(location))) continue;

            const current = asNumber(building?.lvl);
            const level = current !== null ? current + 1 : null;
            const fullLabel = BUILDING_NAMES[type] || (type ? `Building ${type}` : 'Construction');
            const label = BUILDING_SHORT_NAMES[type] || fullLabel;
            entries.push({ type, location, label, fullLabel, level, end: null });
        }

        return entries;
    }

    function constructionHtml(village) {
        const entries = constructionEntries(village);
        if (!entries.length) return '<span class="apes-vd-idle">Idle</span>';

        const tooltip = entries.map(entry => {
            const level = entry.level !== null ? ` → ${entry.level}` : '';
            const remaining = entry.end ? ` — ${remainingText(entry.end)}` : '';
            return `${entry.fullLabel}${level}${remaining}`;
        }).join('\n');

        const visible = entries.slice(0, 2).map(entry => {
            const level = entry.level !== null ? ` → ${entry.level}` : '';
            const remaining = entry.end ? remainingText(entry.end) : '';
            return `
                <span class="apes-vd-line">
                    <strong>${escapeHtml(entry.label + level)}</strong>
                    ${remaining ? `<small>${escapeHtml(remaining)}</small>` : ''}
                </span>
            `;
        }).join('');

        return `<div class="apes-vd-tooltip-target" title="${escapeHtml(tooltip)}">${visible}</div>`;
    }

    function addUnitCount(map, tribeId, rawId, amount) {
        const numericAmount = asNumber(amount);
        const localIndex = localUnitIndex(tribeId, rawId);
        if (
            numericAmount === null ||
            numericAmount <= 0 ||
            localIndex === null ||
            localIndex < 1 ||
            localIndex > 10
        ) return;
        map.set(localIndex, (map.get(localIndex) || 0) + numericAmount);
    }

    function primitiveUnitCounts(root, tribeId) {
        const totals = new Map();
        const seen = new WeakSet();

        function walk(node, depth = 0) {
            if (node === null || node === undefined || depth > 7) return;

            if (Array.isArray(node)) {
                const primitives = node.every(value =>
                    value === null || ['number', 'string'].includes(typeof value)
                );
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
                if (/^\d+$/.test(key) && ['number', 'string'].includes(typeof value)) {
                    addUnitCount(totals, tribeId, Number(key), value);
                } else if (value && typeof value === 'object') {
                    walk(value, depth + 1);
                }
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
            return Object.keys(item).some(key =>
                /unitType|unitTypeId|unitId|unitIndex|amount|count|quantity|remaining|finish|end/i.test(key)
            );
        }, 14);

        for (const item of candidates) {
            const rawUnit = asNumber(
                item?.unitType ??
                item?.unitTypeId ??
                item?.unitId ??
                item?.unit ??
                item?.unitIndex
            );
            const amount = asNumber(
                item?.amount ??
                item?.count ??
                item?.quantity ??
                item?.remaining ??
                (typeof item?.units === 'number' ? item.units : null)
            );
            const buildingType = asNumber(item?.buildingType ?? item?.buildingTypeId);
            const localIndex = rawUnit !== null ? localUnitIndex(village?.tribeId, rawUnit) : null;
            const end = findEndTime(item);
            const key = `${localIndex ?? ''}|${amount ?? ''}|${buildingType ?? ''}|${end ?? ''}`;
            if (seen.has(key)) continue;
            seen.add(key);

            entries.push({
                rawUnit,
                localIndex,
                label: rawUnit !== null ? unitName(village?.tribeId, rawUnit) : 'Troops',
                amount,
                building: BUILDING_NAMES[buildingType] || '',
                end
            });
        }

        if (!entries.length) {
            const totals = primitiveUnitCounts(queue?.unitsInQueue, village?.tribeId);
            totals.forEach((amount, localIndex) => {
                entries.push({
                    rawUnit: localIndex,
                    localIndex,
                    label: unitName(village?.tribeId, localIndex),
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
        const details = entries.map(entry => {
            const building = entry.building ? `${entry.building}: ` : '';
            const amount = entry.amount !== null ? `${formatInteger(entry.amount)} ` : '';
            const remaining = entry.end ? ` — ${remainingText(entry.end)}` : '';
            return `${building}${amount}${entry.label}${remaining}`;
        });
        const title = details.join('\n');

        if (entries.length === 1) {
            const entry = entries[0];
            const amount = entry.amount !== null ? `${formatInteger(entry.amount)} ` : '';
            return `
                <span class="apes-vd-line apes-vd-tooltip-target" title="${escapeHtml(title)}">
                    <strong>${escapeHtml(amount + entry.label)}</strong>
                    ${entry.building ? `<small>${escapeHtml(entry.building)}</small>` : ''}
                </span>
            `;
        }

        const primary = entries.slice(0, 2)
            .map(entry => `${entry.amount !== null ? formatInteger(entry.amount) + ' ' : ''}${entry.label}`)
            .join(' · ');

        return `
            <span class="apes-vd-line apes-vd-tooltip-target" title="${escapeHtml(title)}">
                <strong>${escapeHtml(total > 0 ? `${formatInteger(total)} queued` : 'Training active')}</strong>
                <small>${escapeHtml(primary)}</small>
            </span>
        `;
    }

    function smithyHtml(village) {
        const queue = village?.smithyQueue;
        if (!queue || !hasMeaningfulData(queue?.buildingTypes ?? queue)) {
            return '<span class="apes-vd-idle">Idle</span>';
        }

        const candidates = collectObjects(queue?.buildingTypes ?? queue, item => {
            if (!item || Array.isArray(item)) return false;
            return Object.keys(item).some(key =>
                /unitType|unitTypeId|unitId|unitIndex|level|lvl|target|finish|end/i.test(key)
            );
        }, 6);

        if (!candidates.length) {
            return '<span class="apes-vd-line"><strong>Upgrade active</strong></span>';
        }

        const item = candidates[0];
        const rawUnit = asNumber(
            item?.unitType ??
            item?.unitTypeId ??
            item?.unitId ??
            item?.unit ??
            item?.unitIndex
        );
        const level = asNumber(
            item?.targetLevel ??
            item?.lvlNext ??
            item?.levelNext ??
            item?.targetLvl ??
            item?.level ??
            item?.lvl
        );
        const end = findEndTime(item);
        const label = rawUnit !== null ? unitName(village?.tribeId, rawUnit) : 'Smithy upgrade';
        const display = `${label}${level !== null ? ` → ${level}` : ''}`;
        const tooltip = `${display}${end ? ` — ${remainingText(end)}` : ''}`;

        return `
            <span class="apes-vd-line apes-vd-tooltip-target" title="${escapeHtml(tooltip)}">
                <strong>${escapeHtml(display)}</strong>
                ${end ? `<small>${escapeHtml(remainingText(end))}</small>` : ''}
            </span>
        `;
    }

    function celebrationHtml(village) {
        const type = Number(village?.celebrationType);
        const end = asTimestamp(village?.celebrationEnd);
        const active = end && end > Date.now();

        if (!active && !hasMeaningfulData(village?.celebrations)) {
            return '<span class="apes-vd-idle">None</span>';
        }

        const name = type === 1
            ? 'Small celebration'
            : type === 2
                ? 'Great celebration'
                : 'Celebration';

        return `
            <span class="apes-vd-line">
                <strong>${escapeHtml(name)}</strong>
                ${end ? `<small>${escapeHtml(remainingText(end))}</small>` : ''}
            </span>
        `;
    }

    function normaliseUnitCounts(units) {
        const counts = new Map();

        if (Array.isArray(units)) {
            units.forEach((value, index) => {
                const amount = asNumber(value);
                if (amount !== null && amount > 0) {
                    counts.set(index + 1, (counts.get(index + 1) || 0) + amount);
                }
            });
            return counts;
        }

        if (!units || typeof units !== 'object') return counts;

        Object.entries(units).forEach(([key, value]) => {
            const amount = asNumber(value);
            if (amount === null || amount <= 0) return;
            const match = String(key).match(/(\d+)/);
            const index = match ? Number(match[1]) : Number(key);
            if (!Number.isFinite(index)) return;
            counts.set(index, (counts.get(index) || 0) + amount);
        });

        return counts;
    }

    function troopSummary(village) {
        const totals = new Map();
        const ownPlayerId = Number(snapshot?.playerId);

        for (const troop of village?.stationaryTroops || []) {
            if (Number.isFinite(ownPlayerId) && Number(troop?.playerId) !== ownPlayerId) continue;
            const counts = normaliseUnitCounts(troop?.units);
            counts.forEach((amount, rawIndex) => {
                const localIndex = localUnitIndex(village?.tribeId, rawIndex);
                if (localIndex === null || localIndex < 1 || localIndex > 10) return;
                totals.set(localIndex, (totals.get(localIndex) || 0) + amount);
            });
        }

        const entries = [...totals.entries()]
            .filter(([, amount]) => amount > 0)
            .sort((a, b) => b[1] - a[1]);
        const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
        const cropPerHour = entries.reduce((sum, [index, amount]) => {
            return sum + amount * unitCropConsumption(village?.tribeId, index);
        }, 0);

        return { total, cropPerHour, entries };
    }

    function troopsHtml(village) {
        const summary = troopSummary(village);
        const tooltip = summary.entries.length
            ? summary.entries.map(([index, amount]) => {
                const crop = amount * unitCropConsumption(village?.tribeId, index);
                return `${formatInteger(amount)} ${unitName(village?.tribeId, index)} — ${formatInteger(crop)} Crop/h`;
            }).join('\n')
            : 'No troops stationed here';

        return `
            <span class="apes-vd-line apes-vd-tooltip-target" title="${escapeHtml(tooltip)}">
                <strong>${escapeHtml(formatInteger(summary.total))} Troops</strong>
                <small>${escapeHtml(formatInteger(summary.cropPerHour))} Crop/h</small>
            </span>
        `;
    }

    function updateScanButton() {
        const button = document.querySelector(`#${OVERLAY_ID} .apes-vd-scan-btn`);
        if (!button) return;

        if (scanInProgress) {
            button.classList.add('scanning');
            button.setAttribute('aria-disabled', 'true');
            button.textContent = scanProgress.returning
                ? 'Returning…'
                : `Scanning ${scanProgress.current}/${scanProgress.total}`;
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
            <div class="apes-v2-village-dashboard" role="dialog" aria-modal="true" aria-label="Village dashboard">
                <div class="apes-vd-heading">
                    <div class="apes-vd-brand">
                        <span>APES</span>
                        <strong>Village Dashboard</strong>
                    </div>
                    <div class="apes-vd-heading-actions">
                        <div class="apes-vd-scan-btn" role="button" tabindex="0" aria-disabled="false">Scan Now</div>
                        <div class="apes-vd-hint">H / Esc to close · Click a village to switch</div>
                    </div>
                </div>
                <div class="apes-vd-table-wrap">
                    <div class="apes-vd-header">
                        <span>Village</span>
                        <span>Construction</span>
                        <span>Training</span>
                        <span>Smithy</span>
                        <span>Celebration</span>
                        <span>Troops</span>
                    </div>
                    <div class="apes-vd-body">
                        <div class="apes-vd-loading">Reading Travian village cache…</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

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

            const villageControl = event.target.closest?.('[data-village-id]');
            if (!villageControl || scanInProgress || !['Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            openVillage(villageControl.dataset.villageId);
        });

        updateScanButton();
        return overlay;
    }

    function renderDashboard() {
        const overlay = mountDashboard();
        const body = overlay.querySelector('.apes-vd-body');
        if (!body) return;

        updateScanButton();

        const villages = Array.isArray(snapshot?.villages) ? snapshot.villages : [];
        if (!villages.length) {
            body.innerHTML = `
                <div class="apes-vd-loading">
                    ${snapshot?.error ? escapeHtml(snapshot.error) : 'Waiting for Travian village cache…'}
                </div>
            `;
            return;
        }

        const activeId = String(snapshot.activeVillageId || currentVillageIdFromUrl());
        body.innerHTML = villages.map(village => {
            const villageId = String(village.villageId || '');
            const isActive = villageId === activeId || village.isActive;
            const badges = [
                village.isMainVillage ? '<span class="apes-vd-badge">Capital</span>' : '',
                village.isTown ? '<span class="apes-vd-badge">City</span>' : ''
            ].filter(Boolean).join('');
            const coordinates = Number.isFinite(Number(village.x)) && Number.isFinite(Number(village.y))
                ? `(${village.x}|${village.y})`
                : '';

            return `
                <div class="apes-vd-row${isActive ? ' current' : ''}">
                    <div class="apes-vd-village" role="button" tabindex="0"
                         data-village-id="${escapeHtml(villageId)}"
                         title="Switch to ${escapeHtml(village.name)}">
                        <span class="apes-vd-village-name">${escapeHtml(village.name)}</span>
                        <span class="apes-vd-village-meta">
                            ${coordinates ? `<small>${escapeHtml(coordinates)}</small>` : ''}
                            ${Number.isFinite(Number(village.population)) ? `<small>${escapeHtml(formatInteger(village.population))} pop</small>` : ''}
                            ${badges}
                        </span>
                    </div>
                    <div class="apes-vd-cell">${constructionHtml(village)}</div>
                    <div class="apes-vd-cell">${trainingHtml(village)}</div>
                    <div class="apes-vd-cell">${smithyHtml(village)}</div>
                    <div class="apes-vd-cell">${celebrationHtml(village)}</div>
                    <div class="apes-vd-cell">${troopsHtml(village)}</div>
                </div>
            `;
        }).join('');
    }

    function requestSnapshot() {
        window.postMessage({ source: UI_SOURCE, type: REQUEST_TYPE }, window.location.origin);
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
        const ids = [...new Set(
            villages
                .map(village => String(village?.villageId || ''))
                .filter(id => /^\d+$/.test(id))
        )];
        if (!ids.length) return;

        const startVillageId = currentVillageIdFromUrl() || String(snapshot?.activeVillageId || '') || ids[0];
        const orderedIds = ids.includes(startVillageId)
            ? [startVillageId, ...ids.filter(id => id !== startVillageId)]
            : ids;

        scanInProgress = true;
        scanProgress = { current: 0, total: orderedIds.length, returning: false };
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

                if (currentVillageIdFromUrl() !== villageId) {
                    window.location.hash = `#/page:village/villId:${villageId}`;
                }

                await waitForVillageNavigation(villageId);
                await sleep(SCAN_SETTLE_MS);
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
                window.location.hash = `#/page:village/villId:${startVillageId}`;
                await waitForVillageNavigation(startVillageId);
                await sleep(SCAN_SETTLE_MS);
            }
        } finally {
            requestSnapshot();
            await sleep(SCAN_REFRESH_MS);
            scanInProgress = false;
            scanProgress = { current: 0, total: 0, returning: false };
            updateScanButton();
            if (isOpen()) renderDashboard();
        }
    }

    function startRefresh() {
        stopRefresh();
        requestSnapshot();
        refreshTimer = window.setInterval(requestSnapshot, REFRESH_MS);
        retryTimer = window.setTimeout(() => {
            if (!snapshot?.villages?.length && isOpen()) requestSnapshot();
        }, 350);
    }

    function stopRefresh() {
        if (refreshTimer !== null) window.clearInterval(refreshTimer);
        if (retryTimer !== null) window.clearTimeout(retryTimer);
        refreshTimer = null;
        retryTimer = null;
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
        if (isOpen()) closeDashboard();
        else openDashboard();
    }

    function openVillage(villageId) {
        if (scanInProgress || !/^\d+$/.test(String(villageId || ''))) return;
        closeDashboard();
        window.location.hash = `#/page:village/villId:${villageId}`;
    }

    function syncMenuLabel() {
        const checkbox = document.getElementById('qol-chk-village-palette');
        const row = checkbox?.closest('.qol-keybind-item');
        const label = row?.querySelector('.qol-keybind-action');
        if (label && label.textContent !== 'Village Dashboard') {
            label.textContent = 'Village Dashboard';
        }
    }

    window.addEventListener('message', event => {
        if (event.source !== window) return;
        if (event.data?.source !== BRIDGE_SOURCE) return;
        if (event.data?.type !== RESPONSE_TYPE) return;
        if (!event.data?.payload || typeof event.data.payload !== 'object') return;

        snapshot = event.data.payload;
        if (isOpen()) renderDashboard();
    });

    window.addEventListener('keydown', event => {
        if (
            !isVillageKey(event) ||
            !enabled() ||
            event.ctrlKey ||
            event.altKey ||
            event.metaKey ||
            event.shiftKey ||
            APES.ui.isTypingTarget(event.target)
        ) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.repeat) return;
        toggleDashboard();
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
    menuObserver.observe(document.documentElement, { childList: true, subtree: true });

    window.APES_VILLAGE_PALETTE = Object.freeze({
        open: openDashboard,
        close: closeDashboard,
        toggle: toggleDashboard,
        refresh: requestSnapshot,
        scan: scanAllVillages,
        getVillages: () => (snapshot?.villages || []).map(village => ({ ...village }))
    });

    mountDashboard();
    syncMenuLabel();
})();
