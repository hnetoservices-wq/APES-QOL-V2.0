/**
 * APES QoL v2 — Village Dashboard
 *
 * Press H to toggle a borderless, windowless dashboard for every owned
 * village. Data comes from Travian's existing MAIN-world cache via
 * villageDashboardBridge.js; this feature never navigates villages to scan.
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
        41: 'Horse Drinking Trough'
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

    let snapshot = {
        generatedAt: 0,
        playerId: null,
        activeVillageId: '',
        villages: []
    };
    let refreshTimer = null;
    let retryTimer = null;

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function enabled() {
        try {
            return localStorage.getItem(`qol_${SETTING_KEY}`) !== 'false';
        } catch (_error) {
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

        // Travian commonly uses Unix seconds. Millisecond timestamps are also
        // accepted so the UI remains tolerant of model changes.
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
        return Number.isFinite(number)
            ? Math.round(number).toLocaleString()
            : '0';
    }

    function hasMeaningfulData(value, depth = 0) {
        if (value === null || value === undefined || depth > 5) return false;
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

    function collectObjects(value, predicate, limit = 12) {
        const results = [];
        const seen = new WeakSet();

        function walk(node, depth = 0) {
            if (results.length >= limit || node === null || node === undefined || depth > 7) return;
            if (typeof node !== 'object') return;
            if (seen.has(node)) return;
            seen.add(node);

            if (predicate(node)) results.push(node);
            if (results.length >= limit) return;

            if (Array.isArray(node)) {
                node.forEach(item => walk(item, depth + 1));
            } else {
                Object.values(node).forEach(item => walk(item, depth + 1));
            }
        }

        walk(value);
        return results;
    }

    function findEndTime(object) {
        if (!object || typeof object !== 'object') return null;
        const keys = [
            'endTime', 'finishTime', 'finishedAt', 'finishAt', 'completionTime',
            'completeAt', 'timeFinished', 'end', 'until', 'doneAt'
        ];
        for (const key of keys) {
            if (object[key] !== undefined) {
                const timestamp = asTimestamp(object[key]);
                if (timestamp) return timestamp;
            }
        }
        return null;
    }

    function buildingLookup(village) {
        const byLocation = new Map();
        for (const building of village?.buildings || []) {
            const locationId = asNumber(building?.locationId);
            if (locationId !== null) byLocation.set(String(locationId), building);
        }
        return byLocation;
    }

    function buildingTypeForQueueItem(item, village) {
        const direct = asNumber(
            item?.buildingType ??
            item?.buildingTypeId ??
            item?.type
        );
        if (direct !== null && BUILDING_NAMES[direct]) return direct;

        const locationId = asNumber(item?.locationId ?? item?.buildingLocationId);
        if (locationId !== null) {
            return asNumber(buildingLookup(village).get(String(locationId))?.buildingType);
        }
        return direct;
    }

    function constructionEntries(village) {
        const queue = village?.buildingQueue;
        if (!queue) return [];

        const candidates = collectObjects(queue?.queues ?? queue, item => {
            if (!item || Array.isArray(item)) return false;
            const hasBuilding = [
                'buildingType', 'buildingTypeId', 'locationId', 'buildingLocationId'
            ].some(key => item[key] !== undefined);
            const hasQueueSignal = [
                'lvl', 'level', 'lvlNext', 'targetLevel', 'endTime', 'finishTime',
                'finishedAt', 'completionTime', 'duration', 'startTime'
            ].some(key => item[key] !== undefined);
            return hasBuilding && hasQueueSignal;
        }, 8);

        const seen = new Set();
        return candidates.map(item => {
            const type = buildingTypeForQueueItem(item, village);
            const location = asNumber(item?.locationId ?? item?.buildingLocationId);
            const level = asNumber(
                item?.targetLevel ??
                item?.lvlNext ??
                item?.level ??
                item?.lvl
            );
            const end = findEndTime(item);
            const label = BUILDING_NAMES[type] || (type ? `Building ${type}` : 'Construction');
            const key = `${type || ''}|${location || ''}|${level || ''}|${end || ''}`;
            if (seen.has(key)) return null;
            seen.add(key);
            return { label, level, end };
        }).filter(Boolean);
    }

    function constructionHtml(village) {
        const entries = constructionEntries(village);
        if (!entries.length) {
            return '<span class="apes-vd-idle">Idle</span>';
        }

        return entries.slice(0, 2).map(entry => {
            const level = entry.level !== null ? ` → Lv ${entry.level}` : '';
            const remaining = entry.end ? remainingText(entry.end) : '';
            return `
                <span class="apes-vd-line">
                    <strong>${escapeHtml(entry.label)}${escapeHtml(level)}</strong>
                    ${remaining ? `<small>${escapeHtml(remaining)}</small>` : ''}
                </span>
            `;
        }).join('');
    }

    function unitName(tribeId, rawIndex) {
        let index = Number(rawIndex);
        if (!Number.isFinite(index)) return `Unit ${rawIndex}`;
        if (index <= 0) index += 1;
        const names = UNIT_NAMES[Number(tribeId)];
        return names?.[index - 1] || `Unit ${index}`;
    }

    function unitQueueEntries(village) {
        const queue = village?.unitQueue;
        if (!queue) return [];

        const candidates = collectObjects(queue?.unitsInQueue ?? queue, item => {
            if (!item || Array.isArray(item)) return false;
            return [
                'unitType', 'unitTypeId', 'unitId', 'unit', 'unitIndex', 'amount',
                'count', 'quantity', 'remaining', 'endTime', 'finishTime'
            ].some(key => item[key] !== undefined);
        }, 10);

        return candidates.map(item => {
            const unitIndex = asNumber(
                item?.unitType ?? item?.unitTypeId ?? item?.unitId ?? item?.unit ?? item?.unitIndex
            );
            const amount = asNumber(
                item?.amount ?? item?.count ?? item?.quantity ?? item?.remaining ?? item?.units
            );
            const buildingType = asNumber(item?.buildingType ?? item?.buildingTypeId);
            return {
                label: unitIndex !== null ? unitName(village?.tribeId, unitIndex) : 'Troops',
                amount,
                building: BUILDING_NAMES[buildingType] || '',
                end: findEndTime(item)
            };
        });
    }

    function countNumbers(value, depth = 0) {
        if (value === null || value === undefined || depth > 6) return 0;
        if (typeof value === 'number') return value > 0 ? value : 0;
        if (typeof value === 'string') {
            const number = Number(value);
            return Number.isFinite(number) && number > 0 ? number : 0;
        }
        if (Array.isArray(value)) return value.reduce((sum, item) => sum + countNumbers(item, depth + 1), 0);
        if (typeof value === 'object') {
            return Object.entries(value).reduce((sum, [key, item]) => {
                if (/villageId|buildingType|unitType|unitId|start|end|time|duration/i.test(key)) return sum;
                return sum + countNumbers(item, depth + 1);
            }, 0);
        }
        return 0;
    }

    function trainingHtml(village) {
        const entries = unitQueueEntries(village);
        if (entries.length) {
            return entries.slice(0, 2).map(entry => {
                const amount = entry.amount !== null ? `${formatInteger(entry.amount)} ` : '';
                const prefix = entry.building ? `${entry.building}: ` : '';
                const remaining = entry.end ? remainingText(entry.end) : '';
                return `
                    <span class="apes-vd-line">
                        <strong>${escapeHtml(prefix + amount + entry.label)}</strong>
                        ${remaining ? `<small>${escapeHtml(remaining)}</small>` : ''}
                    </span>
                `;
            }).join('');
        }

        const fallbackCount = countNumbers(village?.unitQueue?.unitsInQueue);
        if (fallbackCount > 0) {
            return `<span class="apes-vd-line"><strong>${escapeHtml(formatInteger(fallbackCount))} queued</strong></span>`;
        }
        return '<span class="apes-vd-idle">Idle</span>';
    }

    function smithyHtml(village) {
        const queue = village?.smithyQueue;
        if (!queue || !hasMeaningfulData(queue?.buildingTypes ?? queue)) {
            return '<span class="apes-vd-idle">Idle</span>';
        }

        const candidates = collectObjects(queue?.buildingTypes ?? queue, item => {
            if (!item || Array.isArray(item)) return false;
            return [
                'unitType', 'unitTypeId', 'unitId', 'unit', 'unitIndex',
                'level', 'lvl', 'lvlNext', 'targetLevel', 'endTime', 'finishTime'
            ].some(key => item[key] !== undefined);
        }, 4);

        if (!candidates.length) {
            return '<span class="apes-vd-line"><strong>Upgrade active</strong></span>';
        }

        const item = candidates[0];
        const unitIndex = asNumber(
            item?.unitType ?? item?.unitTypeId ?? item?.unitId ?? item?.unit ?? item?.unitIndex
        );
        const level = asNumber(item?.targetLevel ?? item?.lvlNext ?? item?.level ?? item?.lvl);
        const end = findEndTime(item);
        const label = unitIndex !== null ? unitName(village?.tribeId, unitIndex) : 'Smithy upgrade';
        return `
            <span class="apes-vd-line">
                <strong>${escapeHtml(label)}${level !== null ? ` → Lv ${escapeHtml(level)}` : ''}</strong>
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
            counts.forEach((amount, index) => {
                totals.set(index, (totals.get(index) || 0) + amount);
            });
        }

        const entries = [...totals.entries()]
            .filter(([, amount]) => amount > 0)
            .sort((a, b) => b[1] - a[1]);
        const total = entries.reduce((sum, [, amount]) => sum + amount, 0);
        return { total, entries };
    }

    function troopsHtml(village) {
        const summary = troopSummary(village);
        if (!summary.total) return '<span class="apes-vd-idle">0 troops</span>';

        const primary = summary.entries.slice(0, 2)
            .map(([index, amount]) => `${formatInteger(amount)} ${unitName(village?.tribeId, index)}`)
            .join(' · ');
        const tooltip = summary.entries
            .map(([index, amount]) => `${formatInteger(amount)} ${unitName(village?.tribeId, index)}`)
            .join('\n');

        return `
            <span class="apes-vd-line" title="${escapeHtml(tooltip)}">
                <strong>${escapeHtml(formatInteger(summary.total))} troops</strong>
                ${primary ? `<small>${escapeHtml(primary)}</small>` : ''}
            </span>
        `;
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
                    <div class="apes-vd-hint">H / Esc to close · Click a village to switch</div>
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
            const villageButton = event.target.closest('[data-village-id]');
            if (villageButton) openVillage(villageButton.dataset.villageId);
        });

        return overlay;
    }

    function renderDashboard() {
        const overlay = mountDashboard();
        const body = overlay.querySelector('.apes-vd-body');
        if (!body) return;

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
                village.isTown ? '<span class="apes-vd-badge">Town</span>' : ''
            ].filter(Boolean).join('');
            const coordinates = Number.isFinite(Number(village.x)) && Number.isFinite(Number(village.y))
                ? `(${village.x}|${village.y})`
                : '';

            return `
                <div class="apes-vd-row${isActive ? ' current' : ''}">
                    <button class="apes-vd-village" type="button" data-village-id="${escapeHtml(villageId)}" title="Switch to ${escapeHtml(village.name)}">
                        <span class="apes-vd-village-name">${escapeHtml(village.name)}</span>
                        <span class="apes-vd-village-meta">
                            ${coordinates ? `<small>${escapeHtml(coordinates)}</small>` : ''}
                            ${Number.isFinite(Number(village.population)) ? `<small>${escapeHtml(formatInteger(village.population))} pop</small>` : ''}
                            ${badges}
                        </span>
                    </button>
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
        window.postMessage({
            source: UI_SOURCE,
            type: REQUEST_TYPE
        }, window.location.origin);
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
        if (!/^\d+$/.test(String(villageId || ''))) return;
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
        getVillages: () => (snapshot?.villages || []).map(village => ({ ...village }))
    });

    mountDashboard();
    syncMenuLabel();
})();
