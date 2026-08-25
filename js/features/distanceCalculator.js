/**
 * APES QoL — Distance & Arrival Calculator
 *
 * Calculates straight-line distance, travel duration, and server-time arrival
 * for Travian Kingdoms troops and merchants. The active village is read from
 * the URL's villId, while map targets can be read from the visible map tooltip.
 */
(() => {
    'use strict';

    const FEATURE_KEY = 'distanceCalculator';
    const BUTTON_ID = 'qol-distance-calc-toggle-btn';
    const PANEL_ID = 'qol-distance-calc-panel';
    const STYLE_ID = 'qol-distance-calc-styles';
    const STORAGE_KEY = `apes_distance_calculator_v1_${window.location.hostname}`;
    const LOCATION_ID_SIZE = 32768;
    const LOCATION_ID_OFFSET = 16384;

    const WORLD_SPEEDS = Object.freeze({
        1: { label: 'x1 world', movement: 1 },
        2: { label: 'x2 world', movement: 1.5 },
        3: { label: 'x3 world', movement: 2 },
        5: { label: 'x5 world', movement: 3 }
    });

    // Canonical x1-world movement speeds. World speed and long-distance
    // modifiers are applied later; these values must never be pre-multiplied.
    const MOVEMENTS = Object.freeze([
        { group: 'Roman troops', key: 'roman-legionnaire', label: 'Legionnaire', speed: 6, type: 'troop' },
        { group: 'Roman troops', key: 'roman-praetorian', label: 'Praetorian', speed: 5, type: 'troop' },
        { group: 'Roman troops', key: 'roman-imperian', label: 'Imperian', speed: 7, type: 'troop' },
        { group: 'Roman troops', key: 'roman-equites-legati', label: 'Equites Legati', speed: 16, type: 'troop' },
        { group: 'Roman troops', key: 'roman-equites-imperatoris', label: 'Equites Imperatoris', speed: 14, type: 'troop' },
        { group: 'Roman troops', key: 'roman-equites-caesaris', label: 'Equites Caesaris', speed: 10, type: 'troop' },
        { group: 'Roman troops', key: 'roman-battering-ram', label: 'Battering Ram', speed: 4, type: 'troop' },
        { group: 'Roman troops', key: 'roman-fire-catapult', label: 'Fire Catapult', speed: 3, type: 'troop' },
        { group: 'Roman troops', key: 'roman-senator', label: 'Senator', speed: 4, type: 'troop' },
        { group: 'Roman troops', key: 'roman-settler', label: 'Settler', speed: 5, type: 'troop' },
        { group: 'Teuton troops', key: 'teuton-clubswinger', label: 'Clubswinger', speed: 7, type: 'troop' },
        { group: 'Teuton troops', key: 'teuton-spearfighter', label: 'Spearfighter', speed: 7, type: 'troop' },
        { group: 'Teuton troops', key: 'teuton-axefighter', label: 'Axefighter', speed: 6, type: 'troop' },
        { group: 'Teuton troops', key: 'teuton-scout', label: 'Scout', speed: 9, type: 'troop' },
        { group: 'Teuton troops', key: 'teuton-paladin', label: 'Paladin', speed: 10, type: 'troop' },
        { group: 'Teuton troops', key: 'teuton-knight', label: 'Teutonic Knight', speed: 9, type: 'troop' },
        { group: 'Teuton troops', key: 'teuton-ram', label: 'Ram', speed: 4, type: 'troop' },
        { group: 'Teuton troops', key: 'teuton-catapult', label: 'Catapult', speed: 3, type: 'troop' },
        { group: 'Teuton troops', key: 'teuton-chief', label: 'Chief', speed: 4, type: 'troop' },
        { group: 'Teuton troops', key: 'teuton-settler', label: 'Settler', speed: 5, type: 'troop' },
        { group: 'Gaul troops', key: 'gaul-phalanx', label: 'Phalanx', speed: 7, type: 'troop' },
        { group: 'Gaul troops', key: 'gaul-swordsman', label: 'Swordsman', speed: 6, type: 'troop' },
        { group: 'Gaul troops', key: 'gaul-pathfinder', label: 'Pathfinder', speed: 17, type: 'troop' },
        { group: 'Gaul troops', key: 'gaul-theutates', label: 'Theutates Thunder', speed: 19, type: 'troop' },
        { group: 'Gaul troops', key: 'gaul-druidrider', label: 'Druidrider', speed: 16, type: 'troop' },
        { group: 'Gaul troops', key: 'gaul-haeduan', label: 'Haeduan', speed: 13, type: 'troop' },
        { group: 'Gaul troops', key: 'gaul-ram', label: 'Ram', speed: 4, type: 'troop' },
        { group: 'Gaul troops', key: 'gaul-trebuchet', label: 'Trebuchet', speed: 3, type: 'troop' },
        { group: 'Gaul troops', key: 'gaul-chieftain', label: 'Chieftain', speed: 5, type: 'troop' },
        { group: 'Gaul troops', key: 'gaul-settler', label: 'Settler', speed: 5, type: 'troop' },
        { group: 'Merchants', key: 'merchant-roman', label: 'Roman Merchant', speed: 16, type: 'merchant' },
        { group: 'Merchants', key: 'merchant-teuton', label: 'Teuton Merchant', speed: 12, type: 'merchant' },
        { group: 'Merchants', key: 'merchant-gaul', label: 'Gaul Merchant', speed: 24, type: 'merchant' },
        { group: 'Hero', key: 'hero', label: 'Hero', speed: 7, type: 'troop' }
    ]);

    const MOVEMENT_MAP = new Map(MOVEMENTS.map(item => [item.key, item]));
    let state = loadState();
    let clockTimer = null;
    let lastResult = null;

    function enabled() {
        return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY);
    }

    function detectWorldSpeed() {
        const source = `${window.location.hostname} ${document.title || ''}`.toLowerCase();
        const match = source.match(/(?:x\s*([235])|([235])\s*x)/i);
        return Number(match?.[1] || match?.[2] || 1);
    }

    function defaultState() {
        return {
            originX: '',
            originY: '',
            targetX: '',
            targetY: '',
            movementKey: 'roman-legionnaire',
            tournamentLevel: 0,
            bootsBonus: 0,
            siegeMode: false,
            desiredArrival: ''
        };
    }

    function loadState() {
        const fallback = defaultState();
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            const merged = { ...fallback, ...(saved && typeof saved === 'object' ? saved : {}) };
            if (!MOVEMENT_MAP.has(merged.movementKey)) merged.movementKey = fallback.movementKey;
            merged.siegeMode = merged.siegeMode === true;
            delete merged.customSpeed;
            delete merged.worldSpeed;
            return merged;
        } catch (_) {
            return fallback;
        }
    }

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) {
            // The calculator continues to work if browser storage is unavailable.
        }
    }

    function clamp(value, minimum, maximum, fallback = minimum) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.min(maximum, Math.max(minimum, numeric));
    }

    function parseCoordinate(value) {
        const numeric = Number(String(value ?? '').trim().replace('−', '-'));
        return Number.isInteger(numeric) ? numeric : null;
    }

    function parseCoordinatePair(value) {
        const match = String(value || '')
            .replace(/[()\[\]]/g, '')
            .match(/(-?\d+)\s*[|,;/]\s*(-?\d+)/);
        if (!match) return null;
        return { x: Number(match[1]), y: Number(match[2]) };
    }

    function locationIdToCoordinates(locationId) {
        const value = Number(locationId);
        if (!Number.isFinite(value) || value < 0) return null;
        const encodedY = Math.floor(value / LOCATION_ID_SIZE);
        const encodedX = value - encodedY * LOCATION_ID_SIZE;
        return {
            x: encodedX - LOCATION_ID_OFFSET,
            y: encodedY - LOCATION_ID_OFFSET
        };
    }

    function getCurrentVillageCoordinates() {
        const id = String(window.location.hash || '').match(/villId:(\d+)/i)?.[1];
        return id ? locationIdToCoordinates(id) : null;
    }

    function getVisibleMapCoordinates() {
        const wrapper = document.querySelector('#tileInformation .coordinateWrapper');
        if (wrapper) {
            const x = parseCoordinate(wrapper.getAttribute('x'));
            const y = parseCoordinate(wrapper.getAttribute('y'));
            if (x !== null && y !== null) return { x, y };
        }

        const hash = String(window.location.hash || '');
        const x = parseCoordinate(hash.match(/(?:^|\/)x:(-?\d+)/i)?.[1]);
        const y = parseCoordinate(hash.match(/(?:^|\/)y:(-?\d+)/i)?.[1]);
        return x !== null && y !== null ? { x, y } : null;
    }

    function getServerClockSeconds() {
        const clock = document.querySelector('span[i18ndt][full="true"]') ||
            document.querySelector('#servertime[i18ndt], #servertime');
        const matches = [...String(clock?.textContent || '').matchAll(/(\d{1,2}):(\d{2}):(\d{2})/g)];
        const match = matches.at(-1);
        if (match) {
            return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
        }

        const now = new Date();
        return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    }

    function formatDuration(seconds) {
        if (!Number.isFinite(seconds)) return '—';
        const rounded = Math.max(0, Math.floor(seconds));
        const hours = Math.floor(rounded / 3600);
        const minutes = Math.floor((rounded % 3600) / 60);
        const remaining = rounded % 60;
        return [hours, minutes, remaining].map(value => String(value).padStart(2, '0')).join(':');
    }

    function formatArrival(clockSeconds, durationSeconds) {
        if (!Number.isFinite(clockSeconds) || !Number.isFinite(durationSeconds)) return '—';
        const total = Math.max(0, Math.floor(clockSeconds) + Math.floor(durationSeconds));
        return formatClockWithDay(total);
    }

    function formatClockWithDay(totalSeconds) {
        if (!Number.isFinite(totalSeconds)) return '—';
        const total = Math.max(0, Math.floor(totalSeconds));
        const dayOffset = Math.floor(total / 86400);
        const withinDay = total % 86400;
        const hours = Math.floor(withinDay / 3600);
        const minutes = Math.floor((withinDay % 3600) / 60);
        const seconds = withinDay % 60;
        const time = [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
        if (dayOffset === 1) return `${time} · tomorrow`;
        if (dayOffset > 1) return `${time} · +${dayOffset} days`;
        return `${time} · today`;
    }

    function parseClockTime(value) {
        const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!match) return null;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        const seconds = Number(match[3] || 0);
        if (hours > 23 || minutes > 59 || seconds > 59) return null;
        return hours * 3600 + minutes * 60 + seconds;
    }

    function calculateSendPlan(durationSeconds) {
        const desiredSeconds = parseClockTime(state.desiredArrival);
        if (desiredSeconds === null || !Number.isFinite(durationSeconds)) return { valid: false };

        const serverNow = Math.floor(getServerClockSeconds());
        const travelSeconds = Math.max(0, Math.floor(durationSeconds));
        const earliestArrival = serverNow + travelSeconds;
        const extraDays = Math.max(0, Math.ceil((earliestArrival - desiredSeconds) / 86400));
        const arrivalAt = desiredSeconds + extraDays * 86400;
        const sendAt = arrivalAt - travelSeconds;

        return {
            valid: true,
            sendAt,
            arrivalAt,
            sendLabel: formatClockWithDay(sendAt),
            arrivalLabel: formatClockWithDay(arrivalAt)
        };
    }

    function calculate() {
        const originX = parseCoordinate(state.originX);
        const originY = parseCoordinate(state.originY);
        const targetX = parseCoordinate(state.targetX);
        const targetY = parseCoordinate(state.targetY);
        const movement = MOVEMENT_MAP.get(state.movementKey);
        const baseSpeed = Number(movement?.speed || 0);
        const worldSpeed = detectWorldSpeed();
        const world = WORLD_SPEEDS[worldSpeed] || WORLD_SPEEDS[1];

        if ([originX, originY, targetX, targetY].some(value => value === null) || !movement || baseSpeed <= 0) {
            return { valid: false };
        }

        const distance = Math.hypot(targetX - originX, targetY - originY);
        const firstSpeed = baseSpeed * world.movement;
        const tournamentLevel = clamp(state.tournamentLevel, 0, 20, 0);
        const bootsBonus = clamp(state.bootsBonus, 0, 200, 0);
        const usesTroopModifiers = movement.type !== 'merchant';
        const longDistanceMultiplier = usesTroopModifiers
            ? (1 + tournamentLevel * 0.1) * (1 + bootsBonus / 100)
            : 1;
        const longSpeed = firstSpeed * longDistanceMultiplier;
        let durationSeconds = distance / firstSpeed * 3600;

        if (distance > 20 && longDistanceMultiplier > 1) {
            durationSeconds = (20 / firstSpeed * 3600) +
                ((distance - 20) / longSpeed * 3600);
        }

        durationSeconds = Math.floor(durationSeconds);
        const siegeMode = state.siegeMode === true;
        if (siegeMode) durationSeconds *= 2;

        const serverNow = getServerClockSeconds();
        return {
            valid: true,
            originX,
            originY,
            targetX,
            targetY,
            distance,
            durationSeconds,
            arrival: formatArrival(serverNow, durationSeconds),
            firstSpeed,
            longSpeed,
            baseSpeed,
            worldSpeed,
            movement,
            world,
            tournamentLevel,
            bootsBonus,
            siegeMode,
            usesTroopModifiers
        };
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function movementOptions() {
        const groups = new Map();
        MOVEMENTS.forEach(item => {
            if (!groups.has(item.group)) groups.set(item.group, []);
            groups.get(item.group).push(item);
        });
        return [...groups.entries()].map(([group, items]) => `
            <optgroup label="${escapeHtml(group)}">
                ${items.map(item => `
                    <option value="${escapeHtml(item.key)}">${escapeHtml(item.label)} · ${item.speed} fields/h at x1</option>
                `).join('')}
            </optgroup>
        `).join('');
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${BUTTON_ID}{position:fixed!important;display:none!important;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;margin:0!important;padding:0!important;border:2px solid #7d6342!important;border-radius:50%!important;background:#ebdcb9!important;color:#654c30!important;box-shadow:0 2px 4px rgba(0,0,0,.22)!important;cursor:pointer!important;user-select:none!important;box-sizing:border-box!important;z-index:9999!important}
            #${BUTTON_ID}:hover{transform:scale(1.08)!important;background:#f7f5f0!important}
            #${BUTTON_ID} svg{width:17px!important;height:17px!important;fill:none!important;stroke:#654c30!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important;pointer-events:none!important}
            #${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${PANEL_ID}{position:fixed!important;right:24px!important;top:74px!important;z-index:1000001!important;display:none!important;flex-direction:column!important;width:min(590px,calc(100vw - 30px))!important;min-width:min(370px,calc(100vw - 30px))!important;min-height:430px!important;max-width:calc(100vw - 16px)!important;max-height:calc(100vh - 16px)!important;border:3px solid #634d31!important;border-radius:6px!important;background:#f7f5f0!important;box-shadow:0 12px 34px rgba(0,0,0,.48)!important;overflow:hidden!important;resize:both!important;color:#332719!important}
            #${PANEL_ID}.qol-open{display:flex!important}
            #${PANEL_ID} .qol-distance-header{display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 auto!important;min-height:40px!important;padding:8px 10px 8px 12px!important;background:linear-gradient(to bottom,#6d5436,#543f26)!important;color:#fff!important;cursor:move!important;user-select:none!important;touch-action:none!important}
            #${PANEL_ID} .qol-distance-title{display:flex!important;align-items:center!important;gap:8px!important;font-size:13px!important;font-weight:700!important}
            #${PANEL_ID} .qol-distance-title svg{width:18px!important;height:18px!important;fill:none!important;stroke:#f7e7c8!important;stroke-width:1.8!important}
            #${PANEL_ID} .qol-distance-close{display:flex!important;align-items:center!important;justify-content:center!important;width:23px!important;height:23px!important;border-radius:3px!important;background:rgba(0,0,0,.22)!important;color:#fff!important;font-size:20px!important;font-weight:700!important;line-height:1!important;cursor:pointer!important}
            #${PANEL_ID} .qol-distance-close:hover{background:rgba(255,255,255,.16)!important}
            #${PANEL_ID} .qol-distance-body{display:flex!important;flex:1 1 auto!important;min-height:0!important;flex-direction:column!important;gap:10px!important;padding:12px!important;overflow:auto!important;background:#f7f5f0!important;font-size:10px!important}
            #${PANEL_ID} .qol-distance-intro{margin:0!important;padding:8px 9px!important;border:1px solid #decdae!important;border-radius:4px!important;background:#fff7e8!important;color:#624b30!important;line-height:1.4!important}
            #${PANEL_ID} .qol-distance-coordinates{display:grid!important;grid-template-columns:minmax(0,1fr) 34px minmax(0,1fr)!important;align-items:stretch!important;gap:7px!important}
            #${PANEL_ID} .qol-distance-card{display:flex!important;flex-direction:column!important;gap:7px!important;padding:9px!important;border:1px solid #d5c7b2!important;border-radius:4px!important;background:#fff!important}
            #${PANEL_ID} .qol-distance-card-title{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:7px!important;color:#4d3922!important;font-size:10px!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.35px!important}
            #${PANEL_ID} .qol-distance-pair{display:grid!important;grid-template-columns:1fr auto 1fr!important;align-items:center!important;gap:5px!important}
            #${PANEL_ID} .qol-distance-separator{color:#8b7658!important;font-size:13px!important;font-weight:700!important}
            #${PANEL_ID} input,#${PANEL_ID} select{display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;height:30px!important;margin:0!important;padding:5px 7px!important;border:1px solid #a99575!important;border-radius:3px!important;background:#fffdf9!important;color:#3d2d1c!important;box-shadow:inset 0 1px 2px rgba(0,0,0,.08)!important;font-size:10px!important;line-height:1.2!important;outline:none!important}
            #${PANEL_ID} select{-webkit-appearance:menulist!important;appearance:auto!important;position:static!important;clip:auto!important;clip-path:none!important;transform:none!important;pointer-events:auto!important}
            #${PANEL_ID} input:focus,#${PANEL_ID} select:focus{border-color:#7ca821!important;box-shadow:0 0 0 2px rgba(124,168,33,.18)!important}
            #${PANEL_ID} input:disabled{opacity:.55!important;cursor:not-allowed!important;background:#eee9e1!important}
            #${PANEL_ID} .qol-distance-mini{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:23px!important;padding:3px 7px!important;border:1px solid #8e7656!important;border-radius:3px!important;background:#eadfcf!important;color:#563f26!important;cursor:pointer!important;user-select:none!important;font-size:8px!important;font-weight:700!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-distance-mini:hover{background:#fff3dc!important}
            #${PANEL_ID} .qol-distance-swap{display:flex!important;align-items:center!important;justify-content:center!important;align-self:center!important;width:34px!important;height:34px!important;border:1px solid #8e7656!important;border-radius:50%!important;background:#eadfcf!important;color:#654c30!important;cursor:pointer!important;font-size:18px!important;font-weight:700!important;user-select:none!important}
            #${PANEL_ID} .qol-distance-swap:hover{background:#fff3dc!important;transform:rotate(180deg)!important}
            #${PANEL_ID} .qol-distance-settings{display:grid!important;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr)!important;gap:8px!important}
            #${PANEL_ID} .qol-distance-fields{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}
            #${PANEL_ID} .qol-distance-field{display:flex!important;flex-direction:column!important;gap:4px!important;min-width:0!important}
            #${PANEL_ID} .qol-distance-field.qol-full{grid-column:1/-1!important}
            #${PANEL_ID} .qol-distance-field label{color:#6d5b43!important;font-size:8px!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.3px!important}
            #${PANEL_ID} .qol-distance-check{display:flex!important;align-items:center!important;gap:7px!important;min-height:30px!important;padding:5px 7px!important;border:1px solid #cdbb9f!important;border-radius:3px!important;background:#f4ecde!important;color:#5d482d!important;cursor:pointer!important;user-select:none!important}
            #${PANEL_ID} .qol-distance-check.qol-full{grid-column:1/-1!important}
            #${PANEL_ID} .qol-distance-check:hover{border-color:#9c815d!important;background:#fff5e5!important}
            #${PANEL_ID} .qol-distance-check-box{display:flex!important;align-items:center!important;justify-content:center!important;flex:0 0 15px!important;width:15px!important;height:15px!important;border:1px solid #886d49!important;border-radius:3px!important;background:#fff!important;color:#fff!important;font-size:11px!important;font-weight:700!important;line-height:1!important}
            #${PANEL_ID} .qol-distance-check.qol-checked .qol-distance-check-box{border-color:#48651f!important;background:#668b2c!important}
            #${PANEL_ID} .qol-distance-check.qol-checked .qol-distance-check-box::after{content:'✓'!important}
            #${PANEL_ID} .qol-distance-check-label{font-size:9px!important;font-weight:700!important}
            #${PANEL_ID} .qol-distance-check-note{margin-left:auto!important;color:#806d55!important;font-size:8px!important;font-weight:700!important}
            #${PANEL_ID} .qol-distance-detected{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;min-height:30px!important;padding:5px 8px!important;border:1px solid #cdbb9f!important;border-radius:3px!important;background:#f4ecde!important;color:#503b23!important}
            #${PANEL_ID} .qol-distance-detected strong{font-size:10px!important}
            #${PANEL_ID} .qol-distance-detected span{color:#7a6549!important;font-size:8px!important;font-weight:700!important}
            #${PANEL_ID} .qol-distance-help{margin:0!important;color:#8b7a65!important;font-size:8px!important;line-height:1.35!important}
            #${PANEL_ID} .qol-distance-modifiers.qol-disabled{opacity:.55!important}
            #${PANEL_ID} .qol-distance-scheduler{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)!important;align-items:stretch!important;gap:9px!important}
            #${PANEL_ID} .qol-distance-scheduler-copy{display:flex!important;flex-direction:column!important;justify-content:center!important;gap:4px!important}
            #${PANEL_ID} .qol-distance-scheduler-copy strong{color:#4d3922!important;font-size:11px!important;text-transform:uppercase!important;letter-spacing:.3px!important}
            #${PANEL_ID} .qol-distance-scheduler-copy span{color:#806d55!important;font-size:8px!important;line-height:1.35!important}
            #${PANEL_ID} .qol-distance-scheduler-control{display:grid!important;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr)!important;align-items:end!important;gap:8px!important}
            #${PANEL_ID} .qol-distance-send-time{display:flex!important;min-height:46px!important;flex-direction:column!important;justify-content:center!important;gap:2px!important;padding:6px 9px!important;border:1px solid #cdbb9f!important;border-radius:3px!important;background:#f4ecde!important}
            #${PANEL_ID} .qol-distance-send-time span{color:#7a6549!important;font-size:7px!important;font-weight:700!important;text-transform:uppercase!important}
            #${PANEL_ID} .qol-distance-send-time strong{color:#4c7620!important;font-size:15px!important;line-height:1.1!important}
            #${PANEL_ID} .qol-distance-send-time small{color:#806d55!important;font-size:7px!important}
            #${PANEL_ID} .qol-distance-result{display:grid!important;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr)!important;gap:8px!important;padding:10px!important;border:1px solid #4a351f!important;border-radius:5px!important;background:linear-gradient(135deg,#6b5132,#4e3a24)!important;color:#fff8e9!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.12)!important}
            #${PANEL_ID} .qol-distance-arrival{display:flex!important;flex-direction:column!important;justify-content:center!important;gap:4px!important;min-width:0!important}
            #${PANEL_ID} .qol-distance-result-label{color:#d9c7a8!important;font-size:8px!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.45px!important}
            #${PANEL_ID} .qol-distance-arrival-value{color:#fff!important;font-size:19px!important;font-weight:700!important;line-height:1.15!important;white-space:normal!important}
            #${PANEL_ID} .qol-distance-result-sub{color:#d9c7a8!important;font-size:8px!important}
            #${PANEL_ID} .qol-distance-metrics{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:5px!important}
            #${PANEL_ID} .qol-distance-metric{display:flex!important;flex-direction:column!important;justify-content:center!important;gap:2px!important;min-width:0!important;padding:6px!important;border:1px solid rgba(255,255,255,.14)!important;border-radius:3px!important;background:rgba(255,255,255,.07)!important}
            #${PANEL_ID} .qol-distance-metric span{color:#d9c7a8!important;font-size:7px!important;text-transform:uppercase!important}
            #${PANEL_ID} .qol-distance-metric strong{overflow:hidden!important;color:#fff!important;font-size:10px!important;text-overflow:ellipsis!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-distance-invalid{display:none!important;align-items:center!important;justify-content:center!important;min-height:92px!important;padding:12px!important;border:1px dashed #bca98c!important;border-radius:5px!important;background:#fff!important;color:#7b6a55!important;font-style:italic!important;text-align:center!important}
            #${PANEL_ID}.qol-invalid .qol-distance-result{display:none!important}
            #${PANEL_ID}.qol-invalid .qol-distance-invalid{display:flex!important}
            #${PANEL_ID} .qol-distance-footer{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important}
            #${PANEL_ID} .qol-distance-actions{display:flex!important;align-items:center!important;gap:6px!important}
            #${PANEL_ID} .qol-distance-copy,#${PANEL_ID} .qol-distance-send{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:29px!important;padding:6px 12px!important;border:1px solid #42311c!important;border-radius:3px!important;background:#7d6342!important;color:#fff!important;box-shadow:0 1px 3px rgba(0,0,0,.18)!important;cursor:pointer!important;user-select:none!important;font-size:9px!important;font-weight:700!important}
            #${PANEL_ID} .qol-distance-copy:hover{background:#8d7352!important}
            #${PANEL_ID} .qol-distance-send{border-color:#47641f!important;background:#668b2c!important}
            #${PANEL_ID} .qol-distance-send:hover{background:#76a134!important}
            #${PANEL_ID} .qol-distance-send.qol-disabled{opacity:.45!important;cursor:not-allowed!important}
            #${PANEL_ID} .qol-distance-formula{margin:0!important;color:#8b7a65!important;font-size:7.5px!important;text-align:right!important}
            @media(max-width:620px){#${PANEL_ID} .qol-distance-coordinates{grid-template-columns:1fr!important}#${PANEL_ID} .qol-distance-swap{justify-self:center!important;transform:rotate(90deg)!important}#${PANEL_ID} .qol-distance-swap:hover{transform:rotate(270deg)!important}#${PANEL_ID} .qol-distance-settings,#${PANEL_ID} .qol-distance-result,#${PANEL_ID} .qol-distance-scheduler,#${PANEL_ID} .qol-distance-scheduler-control{grid-template-columns:1fr!important}}
        `;
        document.head.appendChild(style);
    }

    function activate(element, handler) {
        if (!element) return;
        element.addEventListener('click', handler);
        element.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            handler(event);
        });
    }

    function makeDraggable(panel) {
        const header = panel.querySelector('.qol-distance-header');
        if (!header || header.dataset.dragReady === 'true') return;
        header.dataset.dragReady = 'true';

        header.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('[data-close]')) return;
            const rect = panel.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            panel.style.setProperty('left', `${rect.left}px`, 'important');
            panel.style.setProperty('top', `${rect.top}px`, 'important');
            panel.style.setProperty('right', 'auto', 'important');
            header.setPointerCapture?.(event.pointerId);

            const move = moveEvent => {
                const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
                const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
                panel.style.setProperty('left', `${Math.min(maxLeft, Math.max(0, moveEvent.clientX - offsetX))}px`, 'important');
                panel.style.setProperty('top', `${Math.min(maxTop, Math.max(0, moveEvent.clientY - offsetY))}px`, 'important');
            };
            const stop = () => {
                window.removeEventListener('pointermove', move, true);
                window.removeEventListener('pointerup', stop, true);
                window.removeEventListener('pointercancel', stop, true);
            };
            window.addEventListener('pointermove', move, true);
            window.addEventListener('pointerup', stop, true);
            window.addEventListener('pointercancel', stop, true);
        });
    }

    function syncInputs() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const values = {
            originX: state.originX,
            originY: state.originY,
            targetX: state.targetX,
            targetY: state.targetY,
            movementKey: state.movementKey,
            tournamentLevel: state.tournamentLevel,
            bootsBonus: state.bootsBonus,
            desiredArrival: state.desiredArrival
        };
        Object.entries(values).forEach(([name, value]) => {
            const input = panel.querySelector(`[data-field="${name}"]`);
            if (input) input.value = value;
        });
        const detectedWorld = WORLD_SPEEDS[detectWorldSpeed()] || WORLD_SPEEDS[1];
        const detectedWorldLabel = panel.querySelector('[data-world-label]');
        const detectedMovement = panel.querySelector('[data-world-movement]');
        if (detectedWorldLabel) detectedWorldLabel.textContent = detectedWorld.label;
        if (detectedMovement) detectedMovement.textContent = `Movement x${detectedWorld.movement}`;
        const siegeToggle = panel.querySelector('[data-siege]');
        siegeToggle?.classList.toggle('qol-checked', state.siegeMode === true);
        siegeToggle?.setAttribute('aria-checked', String(state.siegeMode === true));
        updateModifierState();
        updateResult();
    }

    function updateModifierState() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const movement = MOVEMENT_MAP.get(state.movementKey);
        const merchant = movement?.type === 'merchant';
        panel.querySelectorAll('[data-troop-modifier]').forEach(input => input.toggleAttribute('disabled', merchant));
        panel.querySelector('.qol-distance-modifiers')?.classList.toggle('qol-disabled', merchant);
        const help = panel.querySelector('.qol-distance-modifier-help');
        if (help) help.textContent = merchant
            ? 'Merchants ignore Tournament Square and hero boots.'
            : 'Tournament Square and boots apply only after the first 20 fields.';
    }

    function updateResult() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        lastResult = calculate();
        panel.classList.toggle('qol-invalid', !lastResult.valid);
        const sendButton = panel.querySelector('[data-send]');
        sendButton?.classList.toggle('qol-disabled', !lastResult.valid);
        sendButton?.setAttribute('aria-disabled', String(!lastResult.valid));
        if (!lastResult.valid) return;

        const set = (selector, value) => {
            const element = panel.querySelector(selector);
            if (element) element.textContent = value;
        };
        set('[data-result="arrival"]', lastResult.arrival);
        set('[data-result="duration"]', formatDuration(lastResult.durationSeconds));
        set('[data-result="distance"]', `${lastResult.distance.toFixed(3)} fields`);
        set('[data-result="baseSpeed"]', `${lastResult.firstSpeed.toFixed(2)} fields/h`);
        set('[data-result="longSpeed"]', `${lastResult.longSpeed.toFixed(2)} fields/h`);
        set('[data-result="movement"]', lastResult.movement.label);
        set('[data-result="route"]', `(${lastResult.originX}|${lastResult.originY}) → (${lastResult.targetX}|${lastResult.targetY})`);

        const sendPlan = calculateSendPlan(lastResult.durationSeconds);
        const sendAt = panel.querySelector('[data-result="sendAt"]');
        const plannedArrival = panel.querySelector('[data-result="plannedArrival"]');
        if (sendAt) sendAt.textContent = sendPlan.valid ? sendPlan.sendLabel : 'Choose a time';
        if (plannedArrival) plannedArrival.textContent = sendPlan.valid
            ? `Landing ${sendPlan.arrivalLabel}`
            : 'Uses the live server clock';

    }

    function updateStateFromInput(input) {
        const field = input.dataset.field;
        if (!field) return;
        state[field] = input.value;
        if (field === 'tournamentLevel' || field === 'bootsBonus') state[field] = Number(input.value);
        saveState();
        updateModifierState();
        updateResult();
    }

    function toggleSiegeMode() {
        state.siegeMode = state.siegeMode !== true;
        saveState();
        syncInputs();
    }

    function setCoordinates(kind, coordinates) {
        if (!coordinates) return false;
        state[`${kind}X`] = coordinates.x;
        state[`${kind}Y`] = coordinates.y;
        saveState();
        syncInputs();
        return true;
    }

    function setFeedback(message) {
        const element = document.querySelector(`#${PANEL_ID} .qol-distance-formula`);
        if (!element) return;
        const original = element.dataset.original || element.textContent;
        element.dataset.original = original;
        element.textContent = message;
        window.setTimeout(() => {
            if (element.isConnected) element.textContent = original;
        }, 1800);
    }

    function openSendTroops() {
        const result = calculate();
        if (!result.valid) {
            setFeedback('Enter valid target coordinates first.');
            return;
        }
        closePanel();
        window.location.hash = `#/page:map/x:${result.targetX}/y:${result.targetY}/window:sendTroops`;
    }

    async function copyResult() {
        if (!lastResult?.valid) {
            setFeedback('Enter valid coordinates first.');
            return;
        }
        const summary = [
            `(${lastResult.originX}|${lastResult.originY}) → (${lastResult.targetX}|${lastResult.targetY})`,
            `${lastResult.distance.toFixed(3)} fields`,
            lastResult.movement.label,
            `travel ${formatDuration(lastResult.durationSeconds)}`,
            `arrival ${lastResult.arrival}`
        ];
        if (lastResult.siegeMode) summary.push('siege travel x2');
        const sendPlan = calculateSendPlan(lastResult.durationSeconds);
        if (sendPlan.valid) {
            summary.push(`send ${sendPlan.sendLabel}`, `planned landing ${sendPlan.arrivalLabel}`);
        }
        try {
            await navigator.clipboard.writeText(summary.join(' · '));
            setFeedback('Calculation copied.');
        } catch (_) {
            setFeedback('Clipboard is unavailable.');
        }
    }

    function mountUi() {
        if (!enabled()) return;
        injectStyles();

        let button = document.getElementById(BUTTON_ID);
        if (!button) {
            button = document.createElement('div');
            button.id = BUTTON_ID;
            button.title = 'Distance & Arrival Calculator';
            button.setAttribute('role', 'button');
            button.setAttribute('tabindex', '0');
            button.setAttribute('aria-label', 'Open Distance and Arrival Calculator');
            button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2"></circle><circle cx="18" cy="6" r="2"></circle><path d="M8 16L16 8M10 18h8v-8"></path></svg>';
            activate(button, event => {
                event.preventDefault();
                event.stopPropagation();
                togglePanel();
            });
            document.body.appendChild(button);
        }

        let panel = document.getElementById(PANEL_ID);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = PANEL_ID;
            panel.className = 'qol-invalid';
            panel.innerHTML = `
                <div class="qol-distance-header">
                    <div class="qol-distance-title">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2"></circle><circle cx="18" cy="6" r="2"></circle><path d="M8 16L16 8M10 18h8v-8"></path></svg>
                        <span>Distance &amp; Arrival Calculator</span>
                    </div>
                    <div class="qol-distance-close" data-close role="button" tabindex="0" aria-label="Close">×</div>
                </div>
                <div class="qol-distance-body">
                    <p class="qol-distance-intro">Select the slowest unit in the movement. APES uses the active village automatically and calculates against the live server clock.</p>
                    <div class="qol-distance-coordinates">
                        <section class="qol-distance-card">
                            <div class="qol-distance-card-title"><span>Origin</span><div class="qol-distance-mini" data-current-village role="button" tabindex="0">Current village</div></div>
                            <div class="qol-distance-pair"><input data-field="originX" inputmode="numeric" aria-label="Origin X"><span class="qol-distance-separator">|</span><input data-field="originY" inputmode="numeric" aria-label="Origin Y"></div>
                        </section>
                        <div class="qol-distance-swap" data-swap role="button" tabindex="0" title="Swap origin and target">⇄</div>
                        <section class="qol-distance-card">
                            <div class="qol-distance-card-title"><span>Target</span><div class="qol-distance-mini" data-map-target role="button" tabindex="0">Map target</div></div>
                            <div class="qol-distance-pair"><input data-field="targetX" inputmode="numeric" aria-label="Target X"><span class="qol-distance-separator">|</span><input data-field="targetY" inputmode="numeric" aria-label="Target Y"></div>
                        </section>
                    </div>
                    <div class="qol-distance-settings">
                        <section class="qol-distance-card">
                            <div class="qol-distance-card-title">Movement</div>
                            <div class="qol-distance-fields">
                                <div class="qol-distance-field qol-full"><label>Slowest unit or merchant</label><select data-field="movementKey">${movementOptions()}</select></div>
                                <div class="qol-distance-field qol-full"><label>Detected gameworld speed</label><div class="qol-distance-detected"><strong data-world-label>x1 world</strong><span data-world-movement>Movement x1</span></div></div>
                            </div>
                            <p class="qol-distance-help">Unit speeds are stored at x1. APES applies the detected world's movement multiplier automatically.</p>
                        </section>
                        <section class="qol-distance-card qol-distance-modifiers">
                            <div class="qol-distance-card-title">Long-distance modifiers</div>
                            <div class="qol-distance-fields">
                                <div class="qol-distance-field"><label>Tournament Square</label><input data-field="tournamentLevel" data-troop-modifier type="number" min="0" max="20" step="1"></div>
                                <div class="qol-distance-field"><label>Hero boots bonus %</label><input data-field="bootsBonus" data-troop-modifier type="number" min="0" max="200" step="1"></div>
                                <div class="qol-distance-check qol-full" data-siege role="checkbox" tabindex="0" aria-checked="false"><span class="qol-distance-check-box" aria-hidden="true"></span><span class="qol-distance-check-label">Siege</span><span class="qol-distance-check-note">Travel time x2</span></div>
                            </div>
                            <p class="qol-distance-help qol-distance-modifier-help">Tournament Square and boots apply only after the first 20 fields.</p>
                        </section>
                    </div>
                    <section class="qol-distance-card qol-distance-scheduler">
                        <div class="qol-distance-scheduler-copy">
                            <strong>Plan an exact landing</strong>
                            <span>Choose the desired server-time arrival. APES calculates the next valid time to send.</span>
                        </div>
                        <div class="qol-distance-scheduler-control">
                            <div class="qol-distance-field"><label>Desired landing time</label><input data-field="desiredArrival" type="time" step="1" aria-label="Desired landing time in server time"></div>
                            <div class="qol-distance-send-time"><span>Send at</span><strong data-result="sendAt">Choose a time</strong><small data-result="plannedArrival">Uses the live server clock</small></div>
                        </div>
                    </section>
                    <div class="qol-distance-invalid">Enter both origin and target coordinates to calculate the route.</div>
                    <section class="qol-distance-result">
                        <div class="qol-distance-arrival">
                            <span class="qol-distance-result-label">Arrival if sent now</span>
                            <strong class="qol-distance-arrival-value" data-result="arrival">—</strong>
                            <span class="qol-distance-result-sub" data-result="route">—</span>
                        </div>
                        <div class="qol-distance-metrics">
                            <div class="qol-distance-metric"><span>Travel time</span><strong data-result="duration">—</strong></div>
                            <div class="qol-distance-metric"><span>Distance</span><strong data-result="distance">—</strong></div>
                            <div class="qol-distance-metric"><span>First 20 speed</span><strong data-result="baseSpeed">—</strong></div>
                            <div class="qol-distance-metric"><span>After 20 speed</span><strong data-result="longSpeed">—</strong></div>
                        </div>
                    </section>
                    <div class="qol-distance-footer">
                        <div class="qol-distance-actions">
                            <div class="qol-distance-send" data-send role="button" tabindex="0" aria-disabled="true">Send</div>
                            <div class="qol-distance-copy" data-copy role="button" tabindex="0">Copy calculation</div>
                        </div>
                        <p class="qol-distance-formula">Straight-line distance · matched to whole game seconds</p>
                    </div>
                </div>
            `;
            document.body.appendChild(panel);
            makeDraggable(panel);
            activate(panel.querySelector('[data-close]'), closePanel);
            activate(panel.querySelector('[data-current-village]'), () => {
                if (!setCoordinates('origin', getCurrentVillageCoordinates())) setFeedback('Current village coordinates were not found.');
            });
            activate(panel.querySelector('[data-map-target]'), () => {
                if (!setCoordinates('target', getVisibleMapCoordinates())) setFeedback('Open a map tile first, or enter the coordinates.');
            });
            activate(panel.querySelector('[data-swap]'), () => {
                [state.originX, state.targetX] = [state.targetX, state.originX];
                [state.originY, state.targetY] = [state.targetY, state.originY];
                saveState();
                syncInputs();
            });
            activate(panel.querySelector('[data-siege]'), toggleSiegeMode);
            activate(panel.querySelector('[data-send]'), openSendTroops);
            activate(panel.querySelector('[data-copy]'), copyResult);
            panel.querySelectorAll('[data-field]').forEach(input => {
                input.addEventListener('input', () => updateStateFromInput(input));
                input.addEventListener('change', () => updateStateFromInput(input));
                input.addEventListener('paste', event => {
                    const pair = parseCoordinatePair(event.clipboardData?.getData('text'));
                    if (!pair || !/^(origin|target)[XY]$/.test(input.dataset.field || '')) return;
                    event.preventDefault();
                    setCoordinates(input.dataset.field.startsWith('origin') ? 'origin' : 'target', pair);
                });
            });
        }

        panel.style.removeProperty('display');
        if (state.originX === '' || state.originY === '') {
            const current = getCurrentVillageCoordinates();
            if (current) {
                state.originX = current.x;
                state.originY = current.y;
                saveState();
            }
        }
        syncInputs();
        window.qolRepositionAllButtons?.();
    }

    function openPanel() {
        if (!enabled()) return;
        mountUi();
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        window.APES?.ui?.closeOtherTools?.('distanceCalculator');
        panel.classList.add('qol-open');
        panel.setAttribute('aria-hidden', 'false');
        const current = getCurrentVillageCoordinates();
        if (current) setCoordinates('origin', current);
        updateResult();
        window.clearInterval(clockTimer);
        clockTimer = window.setInterval(updateResult, 1000);
    }

    function closePanel() {
        const panel = document.getElementById(PANEL_ID);
        panel?.classList.remove('qol-open');
        panel?.setAttribute('aria-hidden', 'true');
        window.clearInterval(clockTimer);
        clockTimer = null;
    }

    function togglePanel() {
        const panel = document.getElementById(PANEL_ID);
        if (panel?.classList.contains('qol-open')) closePanel();
        else openPanel();
    }

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !event.defaultPrevented) closePanel();
    });

    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source !== 'distanceCalculator') closePanel();
    });

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== FEATURE_KEY) return;
        if (event.detail.enabled) {
            mountUi();
        } else {
            closePanel();
            document.getElementById(PANEL_ID)?.style.setProperty('display', 'none', 'important');
        }
    });

    window.APES_DISTANCE_CALCULATOR = Object.freeze({
        open: openPanel,
        close: closePanel,
        calculate: () => calculate(),
        calculateSendPlan: () => {
            const result = calculate();
            return result.valid ? calculateSendPlan(result.durationSeconds) : { valid: false };
        },
        send: openSendTroops,
        useCurrentVillage: () => setCoordinates('origin', getCurrentVillageCoordinates()),
        useMapTarget: () => setCoordinates('target', getVisibleMapCoordinates())
    });

    const begin = () => {
        if (enabled()) mountUi();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', begin, { once: true });
    } else {
        begin();
    }
})();
