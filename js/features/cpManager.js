/**
 * APES QoL Extension
 * Module: Culture Point Manager + CP Planner + Trade Route Planner
 */
(function initCpManagerModule() {
    'use strict';

    const FEATURE_KEY = 'cpManager';
    const PANEL_ID = 'qol-cp-manager-panel';
    const PLANNER_ID = 'qol-cp-planner-panel';
    const TRADE_PLANNER_ID = 'qol-cp-trade-planner-panel';
    const TOGGLE_ID = 'qol-cp-toggle-btn';
    const STYLE_ID = 'qol-cp-manager-styles';
    const MENU_CHECKBOX_ID = 'qol-chk-cp-manager';
    const SCAN_OVERLAY_ID = 'qol-cp-scan-overlay';

    const MAIN_BUILDING_LOCATION = 27;
    const MARKETPLACE_BUILDING_ID = 17;
    const TOWN_HALL_BUILDING_ID = 24;
    const MAX_VILLAGE_HOPS = 100;
    const DAY_MS = 86400000;
    const SMALL_CELEBRATION_CAP = 500;
    const BIG_CELEBRATION_CAP = 2000;
    const ARTWORK_CAP = 2000;

    const RESOURCE_KEYS = Object.freeze(['wood', 'clay', 'iron', 'crop']);
    const RESOURCE_LABELS = Object.freeze({ wood: 'Wood', clay: 'Clay', iron: 'Iron', crop: 'Crop' });
    const RESOURCE_ICON_CLASSES = Object.freeze({
        wood: 'unit_wood_small_illu resType1',
        clay: 'unit_clay_small_illu resType2',
        iron: 'unit_iron_small_illu resType3',
        crop: 'unit_crop_small_illu resType4'
    });
    const CELEBRATION_COSTS = Object.freeze({
        small: Object.freeze({ wood: 3800, clay: 4000, iron: 3030, crop: 9500 }),
        big: Object.freeze({ wood: 16200, clay: 20250, iron: 17500, crop: 47700 })
    });

    const CP_SLOT_TARGETS = Object.freeze([
        0, 1000, 5000, 10000, 20000, 40000, 70000, 110000, 150000, 210000,
        270000, 350000, 430000, 530000, 640000, 750000, 880000, 1030000, 1180000, 1350000,
        1530000, 1720000, 1930000, 2150000, 2390000, 2640000, 2900000, 3170000, 3470000, 3770000,
        4090000, 4430000, 4780000, 5150000, 5530000, 5930000, 6340000, 6770000, 7220000, 7680000,
        8160000, 8650000, 9170000, 9690000, 10240000, 10800000, 11380000, 11980000, 12600000, 13230000
    ]);

    const CELEBRATION_DURATIONS_X1 = Object.freeze({
        1:{small:'24:00:00'},2:{small:'23:08:10'},3:{small:'22:18:11'},4:{small:'21:30:01'},5:{small:'20:43:34'},
        6:{small:'19:58:48'},7:{small:'19:15:39'},8:{small:'18:34:03'},9:{small:'17:53:56'},
        10:{small:'17:15:17',big:'43:08:11'},11:{small:'16:38:00',big:'41:35:01'},12:{small:'16:02:05',big:'40:05:12'},
        13:{small:'15:27:27',big:'38:38:36'},14:{small:'14:54:03',big:'37:15:08'},15:{small:'14:21:52',big:'35:54:40'},
        16:{small:'13:50:50',big:'34:37:06'},17:{small:'13:20:56',big:'33:22:20'},18:{small:'12:52:06',big:'32:10:15'},
        19:{small:'12:24:18',big:'31:00:45'},20:{small:'11:57:30',big:'29:53:46'}
    });

    let isScanning = false;
    let lastScanResult = null;

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function isEnabled() {
        return typeof window.isQolEnabled === 'function'
            ? window.isQolEnabled(FEATURE_KEY) === true
            : localStorage.getItem(`qol_${FEATURE_KEY}`) !== 'false';
    }

    function parseInteger(value) {
        const digits = String(value || '').replace(/[^0-9]/g, '');
        return digits ? Number.parseInt(digits, 10) : null;
    }

    function normalizeNumericText(value) {
        return String(value ?? '')
            .replace(/\u2212/g, '-')
            .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
            .replace(/\s+/g, '')
            .trim();
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
        return Number.isFinite(number) ? (negative ? -number : number) : null;
    }

    function directText(element) {
        if (!element) return '';
        return Array.from(element.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent || '')
            .join(' ')
            .trim();
    }

    function formatNumber(value, decimals = 0) {
        return Number.isFinite(value)
            ? Number(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
            : '-';
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function resourceIcon(resource, extraClass = '') {
        const label = RESOURCE_LABELS[resource] || 'Resource';
        return `<i class="qol-cp-game-resource-icon ${RESOURCE_ICON_CLASSES[resource] || ''} ${extraClass}" title="${label}" aria-label="${label}" role="img"></i>`;
    }

    function normalizeName(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function timeStringToSeconds(value) {
        const parts = String(value || '').split(':').map(Number);
        return parts.length === 3 && parts.every(Number.isFinite)
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : null;
    }

    function secondsToTimeString(seconds) {
        if (!Number.isFinite(seconds)) return '-';
        const total = Math.max(0, Math.round(seconds));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const secs = total % 60;
        return [hours, minutes, secs].map(part => String(part).padStart(2, '0')).join(':');
    }

    function getCelebrationDurationSeconds(level, type, speed = 1) {
        const base = timeStringToSeconds(CELEBRATION_DURATIONS_X1[level]?.[type]);
        return Number.isFinite(base) ? Math.round(base / speed) : null;
    }

    function getSlotTarget(slot) {
        const index = Number.parseInt(slot, 10) - 1;
        return index >= 0 && index < CP_SLOT_TARGETS.length ? CP_SLOT_TARGETS[index] : null;
    }

    function findSlotByTarget(target) {
        const index = Number.isFinite(target) ? CP_SLOT_TARGETS.findIndex(value => value === target) : -1;
        return index >= 0 ? index + 1 : null;
    }

    function getNextExpansionSlot(result) {
        const scanned = findSlotByTarget(result?.target);
        if (scanned) return scanned;
        const index = CP_SLOT_TARGETS.findIndex(target => target > Number(result?.current || 0));
        return index >= 0 ? index + 1 : CP_SLOT_TARGETS.length;
    }

    function formatSlotOption(slot) {
        return `Slot ${slot} — ${formatNumber(getSlotTarget(slot))} CP`;
    }

    function getOrdinalSuffix(day) {
        const n = day % 100;
        if (n >= 11 && n <= 13) return 'th';
        if (day % 10 === 1) return 'st';
        if (day % 10 === 2) return 'nd';
        if (day % 10 === 3) return 'rd';
        return 'th';
    }

    function formatTargetDate(date) {
        const day = date.getDate();
        const month = date.toLocaleString('en-GB', { month: 'long' });
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}${getOrdinalSuffix(day)} ${month}, at ${hours}h${minutes}m`;
    }

    function formatRoadmapDate(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '-';
        return `${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })} ${String(date.getHours()).padStart(2, '0')}h${String(date.getMinutes()).padStart(2, '0')}`;
    }

    function formatPredictionResult(targetMs, celebrationsApplied = []) {
        const rounded = Math.ceil(targetMs / 60000) * 60000;
        const totalMinutes = Math.max(0, Math.ceil((rounded - Date.now()) / 60000));
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const targetDate = new Date(rounded);
        return totalMinutes <= 0
            ? { text: `Next CP target should now be reached (${formatTargetDate(targetDate)})`, targetDate, exactMinutes: 0, celebrationsApplied }
            : { text: `Next CP in ${days} ${days === 1 ? 'day' : 'days'}, ${hours} ${hours === 1 ? 'hour' : 'hours'} on ${formatTargetDate(targetDate)}`, targetDate, exactMinutes: totalMinutes, celebrationsApplied };
    }

    function buildPrediction(current, target, cpPerDay, celebrationEvents = [], baselineMs = Date.now()) {
        if (current >= target) return { text: 'Next CP target reached', targetDate: null, exactMinutes: 0, celebrationsApplied: [] };
        const rate = cpPerDay > 0 ? cpPerDay / DAY_MS : 0;
        const events = celebrationEvents.filter(event => event.startMs > baselineMs && event.reward > 0).sort((a, b) => a.startMs - b.startMs);
        let cp = current;
        let cursor = baselineMs;
        const applied = [];
        for (const event of events) {
            const before = cp + ((event.startMs - cursor) * rate);
            if (rate > 0 && before >= target) return formatPredictionResult(cursor + ((target - cp) / rate), applied);
            cp = before + event.reward;
            cursor = event.startMs;
            applied.push(event);
            if (cp >= target) return formatPredictionResult(event.startMs, applied);
        }
        return rate <= 0
            ? { text: 'Next CP estimate unavailable', targetDate: null, exactMinutes: null, celebrationsApplied: applied }
            : formatPredictionResult(cursor + ((target - cp) / rate), applied);
    }

    function detectServerSpeed(result) {
        const hostname = String(window.location.hostname || '').toLowerCase();
        if (/x3/.test(hostname)) return { speed: 3, source: 'server name' };
        for (const village of result?.townHalls?.villages || []) {
            if (!village.hasTownHall || !Number.isFinite(village.level)) continue;
            for (const event of village.allCelebrations || []) {
                const base = getCelebrationDurationSeconds(village.level, event.type, 1);
                if (!base || !event.durationSeconds) continue;
                const ratio = base / event.durationSeconds;
                if (Math.abs(ratio - 3) < .12) return { speed: 3, source: 'celebration timing' };
                if (Math.abs(ratio - 1) < .12) return { speed: 1, source: 'celebration timing' };
            }
        }
        return { speed: 1, source: 'standard server' };
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${TOGGLE_ID}{position:fixed!important;width:30px!important;height:30px!important;background:var(--qol-accent-soft)!important;border:2px solid var(--qol-accent)!important;border-radius:50%!important;display:none;align-items:center!important;justify-content:center!important;cursor:pointer!important;z-index:9999!important;box-shadow:0 2px 5px rgba(0,0,0,.28)!important;box-sizing:border-box!important;padding:0!important;margin:0!important;user-select:none!important}
#${TOGGLE_ID}:hover{transform:scale(1.08)!important;background:#f7f5f0!important}
#${TOGGLE_ID} svg{width:18px!important;height:18px!important;fill:none!important;stroke:var(--qol-accent)!important;stroke-width:2!important;stroke-linecap:round!important;stroke-linejoin:round!important;pointer-events:none!important}
body.qol-menu-open #${TOGGLE_ID}{filter:blur(3px)!important;opacity:.35!important;pointer-events:none!important}

#${PANEL_ID},#${PANEL_ID} *,#${PLANNER_ID},#${PLANNER_ID} *,#${TRADE_PLANNER_ID},#${TRADE_PLANNER_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
#${PANEL_ID},#${PLANNER_ID},#${TRADE_PLANNER_ID}{position:fixed!important;display:none;flex-direction:column!important;border:3px solid var(--qol-border)!important;border-radius:4px!important;background:#f7f5f0!important;color:#333!important;box-shadow:0 10px 30px rgba(0,0,0,.5)!important;overflow:hidden!important;z-index:999999!important}
#${PANEL_ID}{width:560px!important;max-width:94vw!important;max-height:86vh!important}
#${PLANNER_ID}{width:min(900px,96vw)!important;min-width:min(700px,96vw)!important;min-height:430px!important;max-width:96vw!important;max-height:90vh!important;resize:both!important;z-index:1000000!important}
#${TRADE_PLANNER_ID}{width:min(1180px,96vw)!important;min-width:min(820px,96vw)!important;min-height:360px!important;max-width:96vw!important;max-height:90vh!important;resize:both!important;z-index:1000000!important}

#${PANEL_ID} .qol-cp-header,#${PLANNER_ID} .qol-cp-planner-head,#${TRADE_PLANNER_ID} .qol-cp-trade-head{height:34px!important;padding:6px 10px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-dark))!important;color:#f7f5f0!important;font-size:14px!important;font-weight:bold!important;display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 auto!important;cursor:move!important;user-select:none!important}
#${PANEL_ID} .qol-cp-close,#${PLANNER_ID} .qol-cp-planner-close,#${TRADE_PLANNER_ID} .qol-cp-trade-close{cursor:pointer!important;color:#fff!important;font-size:21px!important;font-weight:bold!important;line-height:1!important;padding:0 5px!important;border-radius:3px!important;background:rgba(0,0,0,.2)!important}

#${PANEL_ID} .qol-cp-body{display:flex!important;flex-direction:column!important;gap:9px!important;padding:10px!important;background:#f7f5f0!important;overflow-y:auto!important}
#${PANEL_ID} .qol-cp-description{padding:7px 9px!important;background:#fff6e5!important;border:1px solid #d4c2a5!important;border-radius:4px!important;color:#5b4630!important;font-size:11px!important;line-height:1.4!important}
#${PANEL_ID} .qol-cp-controls{display:flex!important;align-items:center!important;gap:7px!important;flex-wrap:wrap!important}
#${PANEL_ID} .qol-cp-action-btn{min-width:120px!important;height:28px!important;padding:5px 11px!important;border:1px solid var(--qol-action-border)!important;border-radius:3px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:11px!important;font-weight:bold!important;white-space:nowrap!important;cursor:pointer!important;user-select:none!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
#${PANEL_ID} .qol-cp-action-btn.secondary{background:linear-gradient(to bottom,#937951,#6b5335)!important}
#${PANEL_ID} .qol-cp-action-btn.hidden{display:none!important}
#${PANEL_ID} .qol-cp-action-btn.disabled{opacity:.45!important;pointer-events:none!important}
#${PANEL_ID} .qol-cp-status{flex:1 1 100%!important;min-height:18px!important;color:#6c5a43!important;font-size:10px!important;line-height:1.35!important}
#${PANEL_ID} .qol-cp-status[data-tone=working]{color:#8a5a16!important;font-weight:bold!important}
#${PANEL_ID} .qol-cp-status[data-tone=success]{color:#4f7328!important;font-weight:bold!important}
#${PANEL_ID} .qol-cp-status[data-tone=error]{color:#a52a2a!important;font-weight:bold!important}

#${PANEL_ID} .qol-cp-results{display:none;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}
#${PANEL_ID} .qol-cp-card{min-width:0!important;padding:8px 10px!important;background:#fff!important;border:1px solid #c7b99e!important;border-radius:3px!important}
#${PANEL_ID} .qol-cp-card.highlight{background:#fff6e5!important;border-color:#bda57e!important}
#${PANEL_ID} .qol-cp-card.full-width{grid-column:1/-1!important}
#${PANEL_ID} .qol-cp-card-label{display:block!important;margin-bottom:4px!important;color:#6a573d!important;font-size:9px!important;font-weight:bold!important;text-transform:uppercase!important}
#${PANEL_ID} .qol-cp-card-value{display:block!important;color:#3f3020!important;font-size:16px!important;font-weight:bold!important}
#${PANEL_ID} .qol-cp-card.full-width .qol-cp-card-value{font-size:14px!important}
#${PANEL_ID} .qol-cp-progress-box{display:none;padding:8px 10px!important;background:#fff!important;border:1px solid #c7b99e!important;border-radius:3px!important}
#${PANEL_ID} .qol-cp-progress-head{display:flex!important;justify-content:space-between!important;margin-bottom:6px!important;color:#5b4630!important;font-size:10px!important;font-weight:bold!important}
#${PANEL_ID} .qol-cp-progress-track{height:9px!important;border:1px solid #b9a589!important;border-radius:8px!important;background:#eee8dc!important;overflow:hidden!important}
#${PANEL_ID} .qol-cp-progress-bar{height:100%!important;width:0;background:linear-gradient(to bottom,#7ea743,#5f8733)!important}
#${PANEL_ID} .qol-cp-box{display:none;border:1px solid #c7b99e!important;border-radius:3px!important;background:#fff!important;overflow:hidden!important}
#${PANEL_ID} .qol-cp-box-heading{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:7px 9px!important;border-bottom:1px solid #c7b99e!important;background:#e9dfcc!important;color:var(--qol-accent-deep)!important;font-size:10px!important;font-weight:bold!important;text-transform:uppercase!important}
#${PANEL_ID} .qol-cp-count{min-width:20px!important;padding:1px 5px!important;border-radius:10px!important;background:var(--qol-accent)!important;color:#fff!important;text-align:center!important;font-size:9px!important}
#${PANEL_ID} .qol-cp-table-wrap{max-height:150px!important;overflow:auto!important}
#${PANEL_ID} table,#${PLANNER_ID} table,#${TRADE_PLANNER_ID} table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:10px!important}
#${PANEL_ID} th,#${PANEL_ID} td,#${PLANNER_ID} th,#${PLANNER_ID} td,#${TRADE_PLANNER_ID} th,#${TRADE_PLANNER_ID} td{padding:6px 8px!important;border-bottom:1px solid #e4dccd!important;color:#4b3b28!important;text-align:left!important;vertical-align:middle!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
#${PANEL_ID} th,#${PLANNER_ID} th,#${TRADE_PLANNER_ID} th{background:#f4eee2!important;color:#6a573d!important;font-size:9px!important;text-transform:uppercase!important;position:sticky!important;top:0!important;z-index:2!important}
#${PANEL_ID} .qol-cp-box-meta{padding:5px 8px!important;border-top:1px solid #e4dccd!important;background:#faf7f1!important;color:#7a6a55!important;font-size:9px!important}
#${PANEL_ID} .qol-cp-celebrations{display:none;padding:7px 9px!important;border:1px solid #d5c4a9!important;border-radius:3px!important;background:#fffaf0!important;color:#5b4630!important;font-size:10px!important;line-height:1.45!important}

#${PLANNER_ID} .qol-cp-planner-title-wrap,#${TRADE_PLANNER_ID} .qol-cp-trade-title-wrap{display:flex!important;align-items:center!important;gap:8px!important;min-width:0!important}
#${PLANNER_ID} .qol-cp-speed,#${TRADE_PLANNER_ID} .qol-cp-trade-speed{font-size:10px!important;font-weight:normal!important;opacity:.9!important;white-space:nowrap!important}
#${PLANNER_ID} .qol-cp-planner-body{display:flex!important;flex-direction:column!important;min-width:0!important;min-height:0!important;height:100%!important;background:#fbf7ef!important;overflow:hidden!important}
#${PLANNER_ID} .qol-cp-planner-summary{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:6px!important;padding:8px!important;border-bottom:1px solid #d6c8ae!important;flex:0 0 auto!important}
#${PLANNER_ID} .qol-cp-plan-stat{padding:6px 8px!important;background:#fff!important;border:1px solid #d3c4aa!important;border-radius:3px!important;min-width:0!important}
#${PLANNER_ID} .qol-cp-plan-stat span{display:block!important;color:#77654d!important;font-size:8px!important;font-weight:bold!important;text-transform:uppercase!important}
#${PLANNER_ID} .qol-cp-plan-stat strong{display:block!important;margin-top:2px!important;color:#3f3020!important;font-size:13px!important;overflow:hidden!important;text-overflow:ellipsis!important}
#${PLANNER_ID} .qol-cp-planner-controls{display:grid!important;grid-template-columns:minmax(330px,1.25fr) minmax(190px,.72fr) minmax(210px,.8fr)!important;gap:6px!important;padding:7px 8px!important;background:#f4eee2!important;border-bottom:1px solid #d6c8ae!important;flex:0 0 auto!important}
#${PLANNER_ID} .qol-cp-target-control,#${PLANNER_ID} .qol-cp-period-control,#${PLANNER_ID} .qol-cp-artwork-control{display:flex!important;align-items:center!important;gap:7px!important;min-width:0!important;padding:6px 7px!important;background:#fffaf0!important;border:1px solid #d6c8ae!important;border-radius:3px!important;color:#5b4630!important;font-size:10px!important}
#${PLANNER_ID} .qol-cp-target-control strong,#${PLANNER_ID} .qol-cp-period-control strong,#${PLANNER_ID} .qol-cp-artwork-control strong{font-size:9px!important;color:var(--qol-accent-deep)!important;text-transform:uppercase!important;white-space:nowrap!important}
#${PLANNER_ID} .qol-cp-target-select{appearance:auto!important;-webkit-appearance:auto!important;min-width:190px!important;max-width:250px!important;height:26px!important;padding:2px 5px!important;border:1px solid #a99473!important;border-radius:3px!important;background:#fff!important;color:#493821!important;font-size:10px!important}
#${PLANNER_ID} .qol-cp-target-remaining{margin-left:auto!important;color:var(--qol-accent)!important;font-size:9px!important;font-weight:bold!important;white-space:nowrap!important}
#${PLANNER_ID} .qol-cp-period-input,#${PLANNER_ID} .qol-cp-artwork-input{appearance:auto!important;-webkit-appearance:auto!important;width:62px!important;height:25px!important;padding:2px 5px!important;border:1px solid #a99473!important;border-radius:3px!important;background:#fff!important;color:#493821!important;font-size:11px!important;text-align:center!important}
#${PLANNER_ID} .qol-cp-period-hint,#${PLANNER_ID} .qol-cp-artwork-hint{color:#84735d!important;font-size:9px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
#${PLANNER_ID} .qol-cp-planner-table-wrap{overflow:auto!important;min-height:120px!important;max-height:none!important;background:#fff!important;flex:1 1 auto!important}
#${PLANNER_ID} .qol-cp-plan-select{display:inline-block!important;appearance:auto!important;-webkit-appearance:auto!important;width:100%!important;min-width:64px!important;max-width:112px!important;height:28px!important;padding:3px 6px!important;border:1px solid #a99473!important;border-radius:3px!important;background:#fff!important;color:#493821!important;font-size:11px!important}
#${PLANNER_ID} .qol-cp-247-check{appearance:auto!important;-webkit-appearance:checkbox!important;width:16px!important;height:16px!important;margin:0!important}
#${PLANNER_ID} .qol-cp-roadmap{background:#fff!important;border-top:1px solid #d6c8ae!important;flex:0 0 auto!important}
#${PLANNER_ID} .qol-cp-roadmap-head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:6px 9px!important;background:#e9dfcc!important;color:var(--qol-accent-deep)!important;font-size:9px!important;font-weight:bold!important;text-transform:uppercase!important}
#${PLANNER_ID} .qol-cp-roadmap-wrap{max-height:138px!important;overflow:auto!important}
#${PLANNER_ID} .qol-cp-roadmap-row.selected td{background:#fff6e5!important;color:var(--qol-accent-deep)!important;font-weight:bold!important}

#${TRADE_PLANNER_ID} .qol-cp-trade-body{display:flex!important;flex-direction:column!important;min-width:0!important;min-height:0!important;height:100%!important;background:#fbf7ef!important;overflow:hidden!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-note{padding:7px 9px!important;border-bottom:1px solid #d6c8ae!important;background:#fff6e5!important;color:#5b4630!important;font-size:10px!important;line-height:1.4!important;flex:0 0 auto!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-summary{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:6px!important;padding:8px!important;border-bottom:1px solid #d6c8ae!important;flex:0 0 auto!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-stat{padding:6px 8px!important;border:1px solid #d3c4aa!important;border-radius:3px!important;background:#fff!important;min-width:0!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-stat span{display:flex!important;align-items:center!important;gap:5px!important;color:#77654d!important;font-size:8px!important;font-weight:bold!important;text-transform:uppercase!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-stat strong{display:block!important;margin-top:2px!important;color:#3f3020!important;font-size:13px!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-table-wrap{overflow:auto!important;background:#fff!important;flex:1 1 auto!important;min-height:120px!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-table{min-width:1110px!important;table-layout:fixed!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-table th:nth-child(1),#${TRADE_PLANNER_ID} .qol-cp-trade-table td:nth-child(1){width:150px!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-table th:nth-child(2),#${TRADE_PLANNER_ID} .qol-cp-trade-table td:nth-child(2){width:62px!important;text-align:center!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-table th:nth-child(3),#${TRADE_PLANNER_ID} .qol-cp-trade-table td:nth-child(3){width:105px!important;text-align:center!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-table th:nth-child(4),#${TRADE_PLANNER_ID} .qol-cp-trade-table td:nth-child(4){width:88px!important;text-align:center!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-table th:nth-child(n+5):nth-child(-n+8),#${TRADE_PLANNER_ID} .qol-cp-trade-table td:nth-child(n+5):nth-child(-n+8){width:140px!important;text-align:right!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-table th:nth-child(9),#${TRADE_PLANNER_ID} .qol-cp-trade-table td:nth-child(9){width:75px!important;text-align:center!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-table th:nth-child(10),#${TRADE_PLANNER_ID} .qol-cp-trade-table td:nth-child(10){width:110px!important;text-align:center!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-resource-head{text-align:center!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-select{display:inline-block!important;appearance:auto!important;-webkit-appearance:auto!important;height:27px!important;padding:3px 5px!important;border:1px solid #a99473!important;border-radius:3px!important;background:#fff!important;color:#493821!important;font-size:10px!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-celeb{width:92px!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-frequency{width:62px!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-resource{display:flex!important;flex-direction:column!important;align-items:flex-end!important;gap:1px!important;line-height:1.15!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-resource strong{font-size:11px!important;font-weight:bold!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-resource span{font-size:8px!important;color:#7b6a54!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-resource em{font-size:8px!important;font-style:normal!important;font-weight:bold!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-resource[data-tone=positive] strong,#${TRADE_PLANNER_ID} .qol-cp-trade-resource[data-tone=positive] em{color:#4f7328!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-resource[data-tone=negative] strong,#${TRADE_PLANNER_ID} .qol-cp-trade-resource[data-tone=negative] em{color:#9b2b26!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-resource[data-tone=neutral] strong,#${TRADE_PLANNER_ID} .qol-cp-trade-resource[data-tone=neutral] em{color:#8a6a25!important}
#${TRADE_PLANNER_ID} .qol-cp-trade-missing{color:#9b2b26!important;font-size:9px!important;font-style:italic!important}
#${TRADE_PLANNER_ID} .qol-cp-open-market-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:88px!important;height:25px!important;padding:3px 8px!important;border:1px solid var(--qol-action-border)!important;border-radius:3px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:9px!important;font-weight:bold!important;cursor:pointer!important;user-select:none!important}
#${TRADE_PLANNER_ID} .qol-cp-open-market-btn:hover{filter:brightness(1.08)!important}
#${TRADE_PLANNER_ID} .qol-cp-no-market{color:#9b2b26!important;font-size:9px!important;font-style:italic!important}
.qol-cp-game-resource-icon{display:inline-block!important;width:18px!important;height:18px!important;min-width:18px!important;vertical-align:middle!important;background-repeat:no-repeat!important;transform:none!important}
#${TRADE_PLANNER_ID} th .qol-cp-game-resource-icon{margin:auto!important}
`;
        document.head.appendChild(style);
    }

    function getCurrentVillageName() {
        for (const selector of ['.currentVillageName.dropdown .selectedItem .villageEntry','#villageList .currentVillageName .selectedItem .villageEntry','.currentVillageName .villageEntry','.villageEntry.active','.active .villageEntry']) {
            const text = document.querySelector(selector)?.textContent?.replace(/[\r\n]+/g, ' ').trim();
            if (text) return text;
        }
        return 'Current village';
    }

    function getVillageIdFromHash() {
        return (window.location.hash || '').match(/(?:^|\/)villId:([^/]+)/)?.[1] || null;
    }

    function getVillageIdentity() {
        const id = getVillageIdFromHash();
        return id ? `id:${id}` : `name:${getCurrentVillageName()}`;
    }

    function clampPanelToViewport(panel) {
        const rect = panel.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
        const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
        panel.style.setProperty('left', `${Math.max(8, Math.min(rect.left, maxLeft))}px`, 'important');
        panel.style.setProperty('top', `${Math.max(8, Math.min(rect.top, maxTop))}px`, 'important');
        panel.style.setProperty('right', 'auto', 'important');
        panel.style.setProperty('bottom', 'auto', 'important');
    }

    function positionPanelUnderButton(panel, force = false) {
        if (!force && panel.dataset.userPositioned === 'true') return;
        const button = document.getElementById(TOGGLE_ID);
        if (!button) return;
        const rect = button.getBoundingClientRect();
        const width = panel.offsetWidth || 560;
        const height = panel.offsetHeight || 500;
        panel.style.setProperty('left', `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`, 'important');
        panel.style.setProperty('top', `${Math.max(8, Math.min(rect.bottom + 18, window.innerHeight - height - 8))}px`, 'important');
        panel.style.setProperty('right', 'auto', 'important');
        panel.style.setProperty('bottom', 'auto', 'important');
    }

    function positionSecondaryBesideMain(panel, force = false, defaultWidth = 760, defaultHeight = 540) {
        const main = document.getElementById(PANEL_ID);
        if (!main || !panel || getComputedStyle(panel).display === 'none' || (!force && panel.dataset.userPositioned === 'true')) return;
        const mainRect = main.getBoundingClientRect();
        const width = panel.offsetWidth || defaultWidth;
        const height = panel.offsetHeight || defaultHeight;
        const preferred = mainRect.right + 10;
        const left = preferred + width <= window.innerWidth - 8 ? preferred : Math.max(8, window.innerWidth - width - 8);
        const top = Math.max(8, Math.min(mainRect.top, window.innerHeight - height - 8));
        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
        panel.style.setProperty('right', 'auto', 'important');
        panel.style.setProperty('bottom', 'auto', 'important');
    }

    function positionPlannerBesideMain(force = false) {
        positionSecondaryBesideMain(document.getElementById(PLANNER_ID), force, 900, 560);
    }

    function positionTradePlannerBesideMain(force = false) {
        positionSecondaryBesideMain(document.getElementById(TRADE_PLANNER_ID), force, 1180, 560);
    }

    function makeDraggable(panel, handle, onMove) {
        if (!panel || !handle || handle.dataset.qolDragBound === 'true') return;
        handle.dataset.qolDragBound = 'true';
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('.qol-cp-close,.qol-cp-planner-close,.qol-cp-trade-close')) return;
            const rect = panel.getBoundingClientRect();
            dragging = true;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            panel.dataset.userPositioned = 'true';
            handle.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });
        handle.addEventListener('pointermove', event => {
            if (!dragging) return;
            const left = Math.max(8, Math.min(event.clientX - offsetX, window.innerWidth - panel.offsetWidth - 8));
            const top = Math.max(8, Math.min(event.clientY - offsetY, window.innerHeight - panel.offsetHeight - 8));
            panel.style.setProperty('left', `${left}px`, 'important');
            panel.style.setProperty('top', `${top}px`, 'important');
            panel.style.setProperty('right', 'auto', 'important');
            panel.style.setProperty('bottom', 'auto', 'important');
            onMove?.();
            event.preventDefault();
        });
        const finish = event => {
            if (!dragging) return;
            dragging = false;
            try { handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
        };
        handle.addEventListener('pointerup', finish);
        handle.addEventListener('pointercancel', finish);
    }

    function showScanOverlay() {
        removeScanOverlay();
        if (!document.body) return;
        const overlay = document.createElement('div');
        overlay.id = SCAN_OVERLAY_ID;
        overlay.style.cssText = 'position:fixed!important;top:0!important;left:0!important;width:100vw!important;height:100vh!important;background:rgba(0,0,0,.7)!important;z-index:2147483646!important;display:flex!important;align-items:center!important;justify-content:center!important;color:white!important;font:700 15px Arial!important;flex-direction:column!important;gap:8px!important;text-align:center!important;cursor:wait!important;user-select:none!important;pointer-events:auto!important';
        overlay.innerHTML = '<div>Scanning CP...</div><div class="qol-cp-scan-overlay-status" style="max-width:min(520px,80vw)!important;font-size:11px!important;font-weight:normal!important;color:#ddd!important;line-height:1.45!important">Starting CP scan...</div><div style="font-size:10px!important;font-weight:normal!important;color:#aaa!important">Please wait while APES checks your villages, Town Halls, Marketplaces and resource production.</div>';
        document.body.appendChild(overlay);
    }

    function updateScanOverlay(message) {
        const status = document.querySelector(`#${SCAN_OVERLAY_ID} .qol-cp-scan-overlay-status`);
        if (status) status.textContent = message || 'Scanning culture point information...';
    }

    function removeScanOverlay() { document.getElementById(SCAN_OVERLAY_ID)?.remove(); }

    function setStatus(message, tone = 'neutral') {
        const element = document.querySelector(`#${PANEL_ID} .qol-cp-status`);
        if (element) {
            element.textContent = message;
            element.dataset.tone = tone;
        }
        if (isScanning) updateScanOverlay(message);
    }

    function setScanButtonState(disabled, text) {
        const button = document.querySelector(`#${PANEL_ID} .qol-cp-scan-btn`);
        if (!button) return;
        button.classList.toggle('disabled', disabled);
        button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        if (text) button.textContent = text;
    }

    function setPlanButtonVisible(visible) {
        document.querySelector(`#${PANEL_ID} .qol-cp-plan-btn`)?.classList.toggle('hidden', !visible);
    }

    function setTradeButtonVisible(visible) {
        document.querySelector(`#${PANEL_ID} .qol-cp-trade-btn`)?.classList.toggle('hidden', !visible);
    }

    function findTownBox() {
        return Array.from(document.querySelectorAll('.foundTown.contentBox')).find(box => box.querySelector('.townConditionTable')) || null;
    }

    function readTownState() {
        const table = findTownBox()?.querySelector('.townConditionTable');
        if (!table) return null;
        const cultureCell = Array.from(table.querySelectorAll('td[ng-if="!village.isTown"]')).find(cell => cell.querySelector('.currentValue'));
        if (cultureCell) {
            const current = parseInteger(cultureCell.querySelector('.currentValue')?.textContent);
            const candidates = Array.from(cultureCell.querySelectorAll('span'))
                .filter(element => !element.classList.contains('currentValue'))
                .map(element => parseInteger(element.textContent))
                .filter(Number.isFinite);
            const target = candidates.at(-1);
            if (Number.isFinite(current) && Number.isFinite(target)) return { type: 'village', current, target };
        }
        const box = findTownBox();
        const city = table.classList.contains('town') || Boolean(table.querySelector('td[ng-if="village.isTown"]')) || Boolean(box?.querySelector('.buildingDescription span[ng-if="village.isTown"]'));
        return city ? { type: 'city' } : null;
    }

    function setVillageHash(parts) { window.location.hash = `#/${parts.filter(Boolean).join('/')}`; }
    function villageRoute() { const route = ['page:village']; const id = getVillageIdFromHash(); if (id) route.push(`villId:${id}`); return route; }
    function openCityFoundingWindow() { setVillageHash([...villageRoute(), `location:${MAIN_BUILDING_LOCATION}`, 'window:building']); }
    function openCulturePointsOverview() { setVillageHash([...villageRoute(), 'window:villagesOverview', 'tab:CulturePoints']); }
    function openVillageBase() { setVillageHash(villageRoute()); }
    function openTownHallWindow(location) { setVillageHash([...villageRoute(), `location:${location}`, 'window:building']); }

    async function waitForTownState(timeout = 7000) {
        const started = performance.now();
        while (performance.now() - started < timeout) {
            const state = readTownState();
            if (state) return state;
            await sleep(100);
        }
        return null;
    }

    function findVillageNavigationButton(direction) {
        const buttons = Array.from(document.querySelectorAll(`#villageList .navigation.${direction}`));
        return buttons.find(button => {
            const style = getComputedStyle(button);
            const rect = button.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        }) || document.querySelector(`.currentVillageName.dropdown a.navigation.${direction}.clickable`) || buttons[0] || null;
    }

    function clickVillageNavigation(direction) {
        const button = findVillageNavigationButton(direction);
        if (!button) return false;
        button.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true, composed: true, button: 0 }));
        return true;
    }

    async function waitForVillageChange(previous, timeout = 5000) {
        const started = performance.now();
        while (performance.now() - started < timeout) {
            await sleep(100);
            if (getVillageIdentity() !== previous) return true;
        }
        return false;
    }

    async function moveVillage(direction) {
        const previous = getVillageIdentity();
        if (!clickVillageNavigation(direction) || !await waitForVillageChange(previous)) return false;
        await sleep(250);
        return true;
    }

    async function restoreStartingVillage(hops) {
        for (let index = 0; index < hops; index += 1) if (!await moveVillage('previous')) return false;
        return true;
    }

    function getCulturePointsTable() {
        return document.querySelector('.loadedTab.tabCulturePoints.currentTab .cpOverview table.villagesTable') ||
            document.querySelector('.loadedTab.tabCulturePoints.activeTab .cpOverview table.villagesTable') ||
            document.querySelector('.cpOverview table.villagesTable');
    }

    function readCulturePointsOverview() {
        const table = getCulturePointsTable();
        if (!table) return null;
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.replace(/\s+/g, ' ').trim());
        let cpIndex = headers.findIndex(text => /CPs?\s*\/\s*day/i.test(text));
        if (cpIndex < 0) cpIndex = 1;
        const villageCp = [];
        table.querySelectorAll('tbody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            const cpPerDay = parseInteger(cells[cpIndex]?.textContent);
            if (!Number.isFinite(cpPerDay)) return;
            const nameCell = cells[0];
            const name = nameCell?.querySelector('.villageName,.villageEntry,a')?.textContent?.trim() || nameCell?.textContent?.replace(/\s+/g, ' ').trim();
            if (name) villageCp.push({ name, cpPerDay });
        });
        const footer = table.querySelectorAll('tfoot tr td');
        let total = parseInteger(footer[cpIndex]?.textContent);
        if (!Number.isFinite(total) && villageCp.length) total = villageCp.reduce((sum, item) => sum + item.cpPerDay, 0);
        return Number.isFinite(total) ? { total, villageCp } : null;
    }

    async function waitForCulturePointsOverview(timeout = 7000) {
        const started = performance.now();
        while (performance.now() - started < timeout) {
            const data = readCulturePointsOverview();
            if (data) return data;
            await sleep(100);
        }
        return null;
    }

    async function waitForVillageView(timeout = 6000) {
        const started = performance.now();
        while (performance.now() - started < timeout) {
            const view = document.getElementById('villageView');
            if (view && view.querySelector('building-location')) return view;
            await sleep(100);
        }
        return null;
    }

    function readCurrentVillageProduction() {
        const result = {};
        for (const key of RESOURCE_KEYS) {
            const stock = document.querySelector(`#resourceBar .stockContainer.${key}`);
            const block = stock?.closest('[ng-repeat]') || stock?.parentElement;
            const productionNode = block?.querySelector('.production .value');
            const production = parseSignedInteger(directText(productionNode));
            result[key] = Number.isFinite(production) ? production : null;
        }
        return result;
    }

    async function waitForCurrentVillageProduction(timeout = 2500) {
        const started = performance.now();
        let latest = readCurrentVillageProduction();
        while (performance.now() - started < timeout) {
            if (RESOURCE_KEYS.every(key => Number.isFinite(latest[key]))) return latest;
            await sleep(100);
            latest = readCurrentVillageProduction();
        }
        return latest;
    }

    function readBuildingInCurrentVillage(buildingId) {
        const view = document.getElementById('villageView');
        if (!view) return null;
        const image = view.querySelector(`img.location.buildingId${buildingId}`);
        if (!image) return null;
        const wrapper = image.closest('building-location');
        if (!wrapper) return null;
        const level = Number.parseInt(wrapper.querySelector('.buildingLevel')?.textContent?.trim() || '', 10);
        let location = Number.parseInt(String(image.id || '').match(/^buildingImage(\d+)$/)?.[1] || '', 10);
        if (!Number.isFinite(location)) {
            const locationClass = Array.from(wrapper.classList).find(name => /^buildingLocation\d+$/.test(name));
            if (locationClass) location = Number.parseInt(locationClass.replace('buildingLocation', ''), 10);
        }
        return {
            buildingId,
            level: Number.isFinite(level) ? level : 1,
            location: Number.isFinite(location) ? location : null
        };
    }

    function readTownHallInCurrentVillage() {
        const townHall = readBuildingInCurrentVillage(TOWN_HALL_BUILDING_ID);
        if (!townHall) return null;
        return {
            villageName: getCurrentVillageName(), villageId: getVillageIdFromHash(), hasTownHall: true,
            level: townHall.level, location: townHall.location,
            celebrations: [], allCelebrations: [], busyUntilMs: null, cpPerDay: null, production: null,
            hasMarket: false, marketLevel: 0, marketLocation: null
        };
    }

    function readMarketplaceInCurrentVillage() {
        return readBuildingInCurrentVillage(MARKETPLACE_BUILDING_ID);
    }

    async function waitForTownHallContent(timeout = 5500) {
        const started = performance.now();
        while (performance.now() - started < timeout) {
            if (document.querySelector('.celebrationBox') || document.querySelectorAll('.orderItem.item.celebration').length > 0) return true;
            await sleep(100);
        }
        return false;
    }

    function getCelebrationType(card) {
        const image = card.querySelector('img.itemImage.celebration');
        const reward = parseInteger(card.querySelector('.headerTrapezoidal .content')?.textContent);
        const title = card.querySelector('.itemHead')?.textContent || '';
        if (image?.classList.contains('celebration_small_illu') || /small/i.test(title)) return { type: 'small', reward: reward || SMALL_CELEBRATION_CAP };
        if (image?.classList.contains('celebration_large_illu') || /(large|big)/i.test(title)) return { type: 'big', reward: reward || BIG_CELEBRATION_CAP };
        return null;
    }

    function readCelebrationsForCurrentTownHall(townHall, cpReadAtMs) {
        const cards = Array.from(document.querySelectorAll('.orderItem.item.celebration'));
        const all = [];
        const future = [];
        const seen = new Set();
        let busyUntilMs = null;
        cards.forEach(card => {
            const celebration = getCelebrationType(card);
            const progress = card.querySelector('.progressContainer .progressbar[finish-time][duration]');
            if (!celebration || !progress) return;
            const finish = Number.parseInt(progress.getAttribute('finish-time') || '', 10);
            const duration = Number.parseInt(progress.getAttribute('duration') || '', 10);
            const count = Math.max(1, Number.parseInt(card.querySelector('.queueAmount')?.textContent || '1', 10) || 1);
            if (!Number.isFinite(finish) || !Number.isFinite(duration) || duration <= 0) return;
            const first = finish - duration;
            for (let i = 0; i < count; i += 1) {
                const startSeconds = first + i * duration;
                const startMs = startSeconds * 1000;
                const finishMs = (startSeconds + duration) * 1000;
                const key = `${townHall.villageId || townHall.villageName}:${celebration.type}:${startSeconds}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const event = { villageName: townHall.villageName, villageId: townHall.villageId, type: celebration.type, reward: celebration.reward, startMs, finishMs, durationSeconds: duration };
                all.push(event);
                if (startMs > cpReadAtMs) future.push(event);
                if (!busyUntilMs || finishMs > busyUntilMs) busyUntilMs = finishMs;
            }
        });
        all.sort((a, b) => a.startMs - b.startMs);
        future.sort((a, b) => a.startMs - b.startMs);
        return { all, future, busyUntilMs };
    }

    async function scanTownHallCelebrations(townHall, cpReadAtMs) {
        if (!Number.isFinite(townHall.location)) return;
        openTownHallWindow(townHall.location);
        await sleep(250);
        if (!await waitForTownHallContent()) return;
        const data = readCelebrationsForCurrentTownHall(townHall, cpReadAtMs);
        townHall.celebrations = data.future;
        townHall.allCelebrations = data.all;
        townHall.busyUntilMs = data.busyUntilMs;
    }

    async function scanAllVillages(cpReadAtMs) {
        const startingIdentity = getVillageIdentity();
        const visited = new Set();
        const villages = [];
        const celebrationEvents = [];
        let hops = 0;
        let complete = false;
        openVillageBase();
        await sleep(300);
        if (!await waitForVillageView()) throw new Error('The village view could not be loaded for Town Hall and Marketplace scanning.');
        for (let attempt = 0; attempt < MAX_VILLAGE_HOPS; attempt += 1) {
            const identity = getVillageIdentity();
            if (visited.has(identity)) { complete = identity === startingIdentity; break; }
            visited.add(identity);
            openVillageBase();
            await sleep(220);
            if (!await waitForVillageView()) break;
            const villageName = getCurrentVillageName();
            setStatus(`Scanning Town Halls, Marketplaces, celebrations and production: ${villageName} (${visited.size})...`, 'working');
            const production = await waitForCurrentVillageProduction();
            const marketplace = readMarketplaceInCurrentVillage();
            let village = readTownHallInCurrentVillage();
            if (!village) {
                village = {
                    villageName,
                    villageId: getVillageIdFromHash(),
                    hasTownHall: false,
                    level: 0,
                    location: null,
                    celebrations: [],
                    allCelebrations: [],
                    busyUntilMs: null,
                    cpPerDay: null,
                    production,
                    hasMarket: Boolean(marketplace),
                    marketLevel: marketplace?.level || 0,
                    marketLocation: Number.isFinite(marketplace?.location) ? marketplace.location : null
                };
            } else {
                village.production = production;
                village.hasMarket = Boolean(marketplace);
                village.marketLevel = marketplace?.level || 0;
                village.marketLocation = Number.isFinite(marketplace?.location) ? marketplace.location : null;
                try {
                    await scanTownHallCelebrations(village, cpReadAtMs);
                    village.celebrations.forEach(event => celebrationEvents.push(event));
                } catch (error) {
                    console.warn(`[APES CP Manager] Celebration scan failed for ${villageName}.`, error);
                }
            }
            villages.push(village);
            openVillageBase();
            await sleep(120);
            if (!await moveVillage('next')) { complete = visited.size === 1; break; }
            hops += 1;
            if (getVillageIdentity() === startingIdentity) { complete = true; break; }
        }
        if (!complete && hops > 0) await restoreStartingVillage(hops);
        const uniqueEvents = [];
        const seenEvents = new Set();
        celebrationEvents.sort((a, b) => a.startMs - b.startMs).forEach(event => {
            const key = `${event.villageId || event.villageName}:${event.type}:${event.startMs}`;
            if (seenEvents.has(key)) return;
            seenEvents.add(key);
            uniqueEvents.push(event);
        });
        return { villages, celebrationEvents: uniqueEvents, scannedCount: visited.size, complete };
    }

    async function scanCpRequirement() {
        let hops = 0;
        const startingIdentity = getVillageIdentity();
        const visited = new Set();
        openCityFoundingWindow();
        await sleep(250);
        for (let attempt = 0; attempt < MAX_VILLAGE_HOPS; attempt += 1) {
            const identity = getVillageIdentity();
            if (visited.has(identity)) throw new Error('Every available village appears to be a city.');
            visited.add(identity);
            openCityFoundingWindow();
            await sleep(200);
            const state = await waitForTownState();
            if (!state) throw new Error('The City founding section could not be found in Main Building location 27.');
            if (state.type === 'village') {
                const result = { current: state.current, target: state.target, villageName: getCurrentVillageName(), skippedCities: hops, readAtMs: Date.now() };
                if (hops > 0 && !await restoreStartingVillage(hops)) throw new Error('Could not return to the starting village.');
                return result;
            }
            setStatus(`City detected in ${getCurrentVillageName()}. Checking the next village...`, 'working');
            if (!await moveVillage('next')) throw new Error('The next-village control could not be used.');
            hops += 1;
            if (getVillageIdentity() === startingIdentity) throw new Error('Every available village appears to be a city.');
        }
        throw new Error('Could not determine current and target CP.');
    }

    function attachVillageCp(villages, culture) {
        const cpMap = new Map(culture.villageCp.map(item => [normalizeName(item.name), item.cpPerDay]));
        villages.forEach(village => {
            const key = normalizeName(village.villageName);
            let cp = cpMap.get(key);
            if (!Number.isFinite(cp)) {
                const found = culture.villageCp.find(item => {
                    const itemName = normalizeName(item.name);
                    return itemName.includes(key) || key.includes(itemName);
                });
                cp = found?.cpPerDay;
            }
            village.cpPerDay = Number.isFinite(cp) ? cp : null;
        });
    }

    function renderTownHalls(scan) {
        const section = document.querySelector(`#${PANEL_ID} .qol-cp-townhalls`);
        if (!section) return;
        const halls = scan.villages.filter(village => village.hasTownHall);
        const rows = halls.map(village => `<tr><td title="${escapeHtml(village.villageName)}">${escapeHtml(village.villageName)}</td><td>Town Hall ${village.level}</td><td style="text-align:center">${RESOURCE_KEYS.every(key => Number.isFinite(village.production?.[key])) ? '✓' : '—'}</td></tr>`).join('');
        section.innerHTML = `<div class="qol-cp-box-heading"><span>Town Halls Detected</span><span class="qol-cp-count">${halls.length}</span></div><div class="qol-cp-table-wrap"><table><thead><tr><th>Village Name</th><th>Town Hall</th><th>Production</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No Town Halls detected.</td></tr>'}</tbody></table></div><div class="qol-cp-box-meta">Scanned ${scan.scannedCount} ${scan.scannedCount === 1 ? 'village' : 'villages'}.${scan.complete ? '' : ' Scan may be incomplete.'}</div>`;
        section.style.setProperty('display', 'block', 'important');
    }

    function renderCelebrations(scan) {
        const section = document.querySelector(`#${PANEL_ID} .qol-cp-celebrations`);
        if (!section) return;
        if (!scan.celebrationEvents.length) {
            section.innerHTML = '<strong>Upcoming celebrations:</strong> None detected. Celebrations already started are included in Current CP.';
        } else {
            const total = scan.celebrationEvents.reduce((sum, event) => sum + event.reward, 0);
            const lines = scan.celebrationEvents.map(event => `${escapeHtml(event.villageName)}: ${event.type === 'small' ? 'Small' : 'Big'} +${formatNumber(event.reward)} CP on ${formatTargetDate(new Date(event.startMs))}`).join('<br>');
            section.innerHTML = `<strong>Upcoming celebrations:</strong> ${scan.celebrationEvents.length} queued, +${formatNumber(total)} CP scheduled.<br>${lines}`;
        }
        section.style.setProperty('display', 'block', 'important');
    }

    function renderResult(result) {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const remaining = Math.max(0, result.target - result.current);
        const progress = result.target > 0 ? Math.max(0, Math.min(100, result.current / result.target * 100)) : 0;
        const nextSlot = getNextExpansionSlot(result);
        const results = panel.querySelector('.qol-cp-results');
        results.innerHTML = `<div class="qol-cp-card"><span class="qol-cp-card-label">Current CP</span><span class="qol-cp-card-value">${formatNumber(result.current)}</span></div><div class="qol-cp-card"><span class="qol-cp-card-label">Next Expansion</span><span class="qol-cp-card-value">Slot ${nextSlot} · ${formatNumber(result.target)} CP</span></div><div class="qol-cp-card"><span class="qol-cp-card-label">Remaining CP</span><span class="qol-cp-card-value">${formatNumber(remaining)}</span></div><div class="qol-cp-card highlight"><span class="qol-cp-card-label">Total CP / Day</span><span class="qol-cp-card-value">${formatNumber(result.cpPerDay)}</span></div><div class="qol-cp-card highlight full-width"><span class="qol-cp-card-label">Slot ${nextSlot} Prediction</span><span class="qol-cp-card-value">${escapeHtml(result.prediction.text)}</span></div>`;
        results.style.setProperty('display', 'grid', 'important');
        const box = panel.querySelector('.qol-cp-progress-box');
        box.querySelector('.qol-cp-progress-head').innerHTML = `<span>Slot ${nextSlot}: ${formatNumber(result.current)} / ${formatNumber(result.target)}</span><span>${progress.toFixed(1)}%</span>`;
        box.querySelector('.qol-cp-progress-bar').style.setProperty('width', `${progress.toFixed(2)}%`, 'important');
        box.style.setProperty('display', 'block', 'important');
        renderTownHalls(result.townHalls);
        renderCelebrations(result.townHalls);
        setPlanButtonVisible(true);
        setTradeButtonVisible(result.townHalls.villages.some(village => village.hasTownHall));
    }

    function getSmallReward(village) { return Number.isFinite(village.cpPerDay) ? Math.min(SMALL_CELEBRATION_CAP, village.cpPerDay) : SMALL_CELEBRATION_CAP; }
    function getBigReward(result) { return Math.min(BIG_CELEBRATION_CAP, result.cpPerDay || 0); }
    function getArtworkReward(result) { return Math.min(ARTWORK_CAP, Math.max(0, Number(result?.cpPerDay || 0))); }
    function getPlannerArtworkCount() { const value = Number.parseInt(document.querySelector(`#${PLANNER_ID} .qol-cp-artwork-input`)?.value || '0', 10); return Number.isFinite(value) && value > 0 ? Math.min(365, value) : 0; }
    function buildArtworkEvents(result, count, now = Date.now()) { const reward = getArtworkReward(result); return reward > 0 && count > 0 ? Array.from({ length: count }, (_, index) => ({ startMs: now + index * DAY_MS, reward, villageName: 'Artwork', type: 'artwork', source: 'artwork' })) : []; }
    function getPlannerPeriodDays() { const value = Number.parseFloat(document.querySelector(`#${PLANNER_ID} .qol-cp-period-input`)?.value || '1'); return Number.isFinite(value) && value > 0 ? Math.min(365, Math.max(.25, value)) : 1; }
    function getPlannerTargetSlot() { const value = Number.parseInt(document.querySelector(`#${PLANNER_ID} .qol-cp-target-select`)?.value || '', 10); return Number.isFinite(value) && value >= 1 && value <= CP_SLOT_TARGETS.length ? value : lastScanResult ? getNextExpansionSlot(lastScanResult) : null; }

    function buildTargetSlotOptions(result) {
        const start = getNextExpansionSlot(result);
        const options = [];
        for (let slot = start; slot <= CP_SLOT_TARGETS.length; slot += 1) options.push(`<option value="${slot}"${slot === start ? ' selected' : ''}>${formatSlotOption(slot)}</option>`);
        return options.join('');
    }

    function count247StartsInPeriod(duration, busyUntil, periodDays, now = Date.now()) {
        if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(periodDays) || periodDays <= 0) return 0;
        const end = now + periodDays * DAY_MS;
        const first = Math.max(now, Number.isFinite(busyUntil) ? busyUntil : now);
        return first >= end ? 0 : Math.ceil((end - first) / (duration * 1000));
    }

    function readPlannerPlans() {
        const planner = document.getElementById(PLANNER_ID);
        if (!planner || !lastScanResult) return [];
        const speed = detectServerSpeed(lastScanResult).speed;
        return Array.from(planner.querySelectorAll('.qol-cp-plan-row')).map(row => {
            const index = Number.parseInt(row.dataset.index, 10);
            const village = lastScanResult.townHalls.villages[index];
            const level = Number.parseInt(row.querySelector('.qol-cp-level-select')?.value || '0', 10);
            const type = row.querySelector('.qol-cp-type-select')?.value || 'none';
            const has = type === 'small' || type === 'big';
            const run247 = has && Boolean(row.querySelector('.qol-cp-247-check')?.checked);
            const durationSeconds = has ? getCelebrationDurationSeconds(level, type, speed) : null;
            const reward = level > 0 && has ? (type === 'big' ? getBigReward(lastScanResult) : getSmallReward(village)) : 0;
            return { villageName: village.villageName, level, type, run247, durationSeconds, reward, busyUntilMs: village.busyUntilMs };
        });
    }

    function buildPlannerPrediction(result, plans, periodDays, targetCp = result.target, artworkCount = 0) {
        const target = Number.isFinite(targetCp) ? targetCp : result.target;
        const now = Date.now();
        const planEnd = now + periodDays * DAY_MS;
        const rate = result.cpPerDay > 0 ? result.cpPerDay / DAY_MS : 0;
        let cp = result.current + Math.max(0, now - result.readAtMs) * rate;
        result.townHalls.celebrationEvents.forEach(event => { if (event.startMs > result.readAtMs && event.startMs <= now) cp += event.reward; });
        if (cp >= target) return formatPredictionResult(now, []);
        const fixed = [
            ...result.townHalls.celebrationEvents.filter(event => event.startMs > now).map(event => ({ ...event, source: 'queued' })),
            ...buildArtworkEvents(result, artworkCount, now)
        ].sort((a, b) => a.startMs - b.startMs);
        const sequences = plans.filter(plan => plan.level > 0 && plan.durationSeconds > 0 && plan.reward > 0)
            .map(plan => ({ ...plan, nextStartMs: Math.max(now, plan.busyUntilMs || now), planEndMs: planEnd, source: 'plan' }))
            .filter(plan => !plan.run247 || plan.nextStartMs < plan.planEndMs);
        let cursor = now;
        const applied = [];
        for (let guard = 0; guard < 10000; guard += 1) {
            let next = fixed[0] || null;
            let sequence = null;
            for (const candidate of sequences) {
                if (!next || candidate.nextStartMs < next.startMs) {
                    next = { startMs: candidate.nextStartMs, reward: candidate.reward, villageName: candidate.villageName, type: candidate.type, source: 'plan' };
                    sequence = candidate;
                }
            }
            if (!next) return rate <= 0 ? { text: 'Planner ETA unavailable', targetDate: null, exactMinutes: null } : formatPredictionResult(cursor + ((target - cp) / rate), applied);
            const before = cp + (next.startMs - cursor) * rate;
            if (rate > 0 && before >= target) return formatPredictionResult(cursor + ((target - cp) / rate), applied);
            cp = before + next.reward;
            cursor = next.startMs;
            applied.push(next);
            if (cp >= target) return formatPredictionResult(next.startMs, applied);
            if (next.source === 'queued' || next.source === 'artwork') fixed.shift();
            else if (sequence) {
                if (sequence.run247) {
                    sequence.nextStartMs += sequence.durationSeconds * 1000;
                    if (sequence.nextStartMs >= sequence.planEndMs) sequences.splice(sequences.indexOf(sequence), 1);
                } else sequences.splice(sequences.indexOf(sequence), 1);
            }
        }
        return { text: 'Planner ETA exceeded calculation range', targetDate: null, exactMinutes: null };
    }

    function updateRoadmap(planner, plans, periodDays, selectedSlot, artworkCount) {
        const body = planner.querySelector('.qol-cp-roadmap-body');
        if (!body || !lastScanResult) return;
        const start = getNextExpansionSlot(lastScanResult);
        const end = Math.min(CP_SLOT_TARGETS.length, start + 4);
        const rows = [];
        for (let slot = start; slot <= end; slot += 1) {
            const target = getSlotTarget(slot);
            const remaining = Math.max(0, target - lastScanResult.current);
            const prediction = buildPlannerPrediction(lastScanResult, plans, periodDays, target, artworkCount);
            const eta = target <= lastScanResult.current ? 'Unlocked' : prediction.targetDate ? formatRoadmapDate(prediction.targetDate) : '-';
            rows.push(`<tr class="qol-cp-roadmap-row${slot === selectedSlot ? ' selected' : ''}"><td>Slot ${slot}</td><td>${formatNumber(target)}</td><td>${formatNumber(remaining)}</td><td title="${escapeHtml(prediction.text || '')}">${escapeHtml(eta)}</td></tr>`);
        }
        body.innerHTML = rows.join('');
    }

    function updatePlanner() {
        if (!lastScanResult) return;
        const planner = document.getElementById(PLANNER_ID);
        if (!planner) return;
        const speedInfo = detectServerSpeed(lastScanResult);
        const periodDays = getPlannerPeriodDays();
        const artworkCount = getPlannerArtworkCount();
        const artworkReward = getArtworkReward(lastScanResult);
        const targetSlot = getPlannerTargetSlot() || getNextExpansionSlot(lastScanResult);
        const targetCp = getSlotTarget(targetSlot) ?? lastScanResult.target;
        const now = Date.now();
        let total247 = 0;
        let oneOff = 0;
        planner.querySelectorAll('.qol-cp-plan-row').forEach(row => {
            const index = Number.parseInt(row.dataset.index, 10);
            const village = lastScanResult.townHalls.villages[index];
            const levelSelect = row.querySelector('.qol-cp-level-select');
            const typeSelect = row.querySelector('.qol-cp-type-select');
            const check = row.querySelector('.qol-cp-247-check');
            const level = Number.parseInt(levelSelect.value || '0', 10);
            typeSelect.disabled = level === 0;
            if (level === 0) typeSelect.value = 'none';
            const big = typeSelect.querySelector('option[value="big"]');
            if (big) big.disabled = level < 10;
            if (level < 10 && typeSelect.value === 'big') typeSelect.value = 'none';
            const type = typeSelect.value || 'none';
            const has = level > 0 && (type === 'small' || type === 'big');
            check.disabled = !has;
            if (!has) check.checked = false;
            const duration = has ? getCelebrationDurationSeconds(level, type, speedInfo.speed) : null;
            const reward = has ? (type === 'big' ? getBigReward(lastScanResult) : getSmallReward(village)) : 0;
            let contribution = 0;
            let title = '';
            if (check.checked && duration > 0 && reward > 0) {
                const starts = count247StartsInPeriod(duration, village.busyUntilMs, periodDays, now);
                contribution = reward * starts;
                total247 += contribution;
                title = `${formatNumber(reward)} CP × ${starts} starts = ${formatNumber(contribution)} CP`;
            } else if (reward > 0) {
                contribution = reward;
                oneOff += reward;
                title = `${formatNumber(reward)} CP from one planned celebration`;
            }
            row.querySelector('.qol-cp-plan-duration').textContent = duration ? secondsToTimeString(duration) : '-';
            row.querySelector('.qol-cp-plan-cpday').textContent = contribution > 0 ? formatNumber(contribution) : '-';
            row.querySelector('.qol-cp-plan-cpday').title = title;
        });
        const plans = readPlannerPlans();
        const prediction = buildPlannerPrediction(lastScanResult, plans, periodDays, targetCp, artworkCount);
        const remaining = Math.max(0, targetCp - lastScanResult.current);
        planner.querySelector('.qol-cp-plan-base').textContent = formatNumber(lastScanResult.cpPerDay);
        planner.querySelector('.qol-cp-plan-celebrations').textContent = formatNumber(total247);
        planner.querySelector('.qol-cp-plan-oneoff').textContent = formatNumber(oneOff);
        planner.querySelector('.qol-cp-plan-artworks').textContent = formatNumber(artworkReward * artworkCount);
        planner.querySelector('.qol-cp-plan-eta').textContent = prediction.text;
        planner.querySelector('.qol-cp-target-remaining').textContent = `${formatNumber(remaining)} CP remaining`;
        planner.querySelector('.qol-cp-artwork-hint').textContent = `${formatNumber(artworkReward)} CP each · 1/day`;
        planner.querySelector('.qol-cp-speed').textContent = `Detected x${speedInfo.speed} · ${speedInfo.source}`;
        updateRoadmap(planner, plans, periodDays, targetSlot, artworkCount);
    }

    function buildLevelOptions(village) {
        const start = village.hasTownHall ? Math.max(1, village.level) : 0;
        const options = [];
        for (let level = start; level <= 20; level += 1) options.push(`<option value="${level}"${level === start ? ' selected' : ''}>${level}</option>`);
        return options.join('');
    }

    function renderPlanner() {
        if (!lastScanResult) return;
        const planner = mountPlannerPanel();
        document.getElementById(TRADE_PLANNER_ID)?.style.setProperty('display', 'none', 'important');
        const speedInfo = detectServerSpeed(lastScanResult);
        const nextSlot = getNextExpansionSlot(lastScanResult);
        const artworkReward = getArtworkReward(lastScanResult);
        const rows = lastScanResult.townHalls.villages.map((village, index) => {
            const start = village.hasTownHall ? Math.max(1, village.level) : 0;
            return `<tr class="qol-cp-plan-row" data-index="${index}"><td>${escapeHtml(village.villageName)}</td><td><select class="qol-cp-plan-select qol-cp-level-select">${buildLevelOptions(village)}</select></td><td><select class="qol-cp-plan-select qol-cp-type-select"${start === 0 ? ' disabled' : ''}><option value="none" selected>None</option><option value="small">Small</option><option value="big"${start < 10 ? ' disabled' : ''}>Big</option></select></td><td><input type="checkbox" class="qol-cp-247-check" disabled></td><td class="qol-cp-plan-duration">-</td><td class="qol-cp-plan-cpday">-</td></tr>`;
        }).join('');
        planner.querySelector('.qol-cp-planner-body').innerHTML = `<div class="qol-cp-planner-summary"><div class="qol-cp-plan-stat"><span>Base CP / Day</span><strong class="qol-cp-plan-base">-</strong></div><div class="qol-cp-plan-stat"><span>24/7 CP / Period</span><strong class="qol-cp-plan-celebrations">-</strong></div><div class="qol-cp-plan-stat"><span>One-off Celebration CP</span><strong class="qol-cp-plan-oneoff">-</strong></div><div class="qol-cp-plan-stat"><span>Artwork CP</span><strong class="qol-cp-plan-artworks">0</strong></div><div class="qol-cp-plan-stat"><span>Planner ETA</span><strong class="qol-cp-plan-eta" style="font-size:10px!important">-</strong></div></div><div class="qol-cp-planner-controls"><div class="qol-cp-target-control"><strong>Target expansion</strong><select class="qol-cp-target-select">${buildTargetSlotOptions(lastScanResult)}</select><span class="qol-cp-target-remaining"></span></div><div class="qol-cp-period-control"><strong>24/7 period</strong><input type="number" class="qol-cp-period-input" min="1" max="365" value="30"><span>days</span><span class="qol-cp-period-hint">Starts inside period count.</span></div><div class="qol-cp-artwork-control"><strong>Artworks</strong><input type="number" class="qol-cp-artwork-input" min="0" max="365" value="0"><span class="qol-cp-artwork-hint">${formatNumber(artworkReward)} CP each · 1/day</span></div></div><div class="qol-cp-planner-table-wrap"><table><thead><tr><th>Village</th><th>Town Hall</th><th>Celebration</th><th>24/7</th><th>Duration</th><th>Extra CP / Period*</th></tr></thead><tbody>${rows}</tbody></table></div><div class="qol-cp-roadmap"><div class="qol-cp-roadmap-head"><span>CP Roadmap</span><span>Next 5 expansion slots from Slot ${nextSlot}</span></div><div class="qol-cp-roadmap-wrap"><table><thead><tr><th>Slot</th><th>Target CP</th><th>Remaining</th><th>ETA</th></tr></thead><tbody class="qol-cp-roadmap-body"></tbody></table></div></div>`;
        planner.querySelector('.qol-cp-speed').textContent = `Detected x${speedInfo.speed} · ${speedInfo.source}`;
        planner.querySelectorAll('select,input').forEach(control => control.addEventListener('change', updatePlanner));
        planner.querySelector('.qol-cp-period-input')?.addEventListener('input', updatePlanner);
        planner.querySelector('.qol-cp-artwork-input')?.addEventListener('input', updatePlanner);
        planner.style.setProperty('display', 'flex', 'important');
        planner.dataset.userPositioned = 'false';
        requestAnimationFrame(() => { positionPlannerBesideMain(true); updatePlanner(); });
    }

    function togglePlanner() {
        if (!lastScanResult) return;
        const planner = mountPlannerPanel();
        if (getComputedStyle(planner).display !== 'none') planner.style.setProperty('display', 'none', 'important');
        else renderPlanner();
    }

    function getTradeCalculation(village, type, frequency, speed) {
        const selected = type === 'small' || type === 'big' ? type : 'none';
        const durationSeconds = selected === 'none' ? null : getCelebrationDurationSeconds(village.level, selected, speed);
        const hours = durationSeconds ? durationSeconds / 3600 : null;
        const resources = {};
        for (const key of RESOURCE_KEYS) {
            const production = Number(village.production?.[key]);
            if (!Number.isFinite(production)) { resources[key] = { production: null, reserve: null, disposable: null, perRoute: null }; continue; }
            const reserve = selected === 'none' ? 0 : (hours && CELEBRATION_COSTS[selected]?.[key] ? Math.ceil(CELEBRATION_COSTS[selected][key] / hours) : null);
            if (!Number.isFinite(reserve)) { resources[key] = { production, reserve: null, disposable: null, perRoute: null }; continue; }
            const disposable = production - reserve;
            resources[key] = { production, reserve, disposable, perRoute: Math.floor(disposable / Math.max(1, Number(frequency) || 1)) };
        }
        return { durationSeconds, resources };
    }

    function tradeResourceHtml(calc) {
        if (!calc || !Number.isFinite(calc.production) || !Number.isFinite(calc.disposable)) return '<span class="qol-cp-trade-missing">Production unavailable</span>';
        const tone = calc.disposable > 0 ? 'positive' : calc.disposable < 0 ? 'negative' : 'neutral';
        return `<div class="qol-cp-trade-resource" data-tone="${tone}"><strong>${formatNumber(calc.disposable)}/h ${calc.disposable < 0 ? 'needed' : 'free'}</strong><span>${formatNumber(calc.production)} prod · ${formatNumber(calc.reserve)} reserve</span><em>${formatNumber(calc.perRoute)} / route</em></div>`;
    }

    function updateTradePlanner() {
        if (!lastScanResult) return;
        const planner = document.getElementById(TRADE_PLANNER_ID);
        if (!planner) return;
        const speedInfo = detectServerSpeed(lastScanResult);
        const totals = { wood: 0, clay: 0, iron: 0, crop: 0 };
        const valid = { wood: false, clay: false, iron: false, crop: false };
        planner.querySelectorAll('.qol-cp-trade-row').forEach(row => {
            const village = lastScanResult.townHalls.villages[Number.parseInt(row.dataset.index, 10)];
            if (!village) return;
            const typeSelect = row.querySelector('.qol-cp-trade-celeb');
            const frequency = Number.parseInt(row.querySelector('.qol-cp-trade-frequency')?.value || '1', 10) || 1;
            const big = typeSelect?.querySelector('option[value="big"]');
            if (big) big.disabled = village.level < 10;
            if (village.level < 10 && typeSelect?.value === 'big') typeSelect.value = 'small';
            const calculation = getTradeCalculation(village, typeSelect?.value || 'small', frequency, speedInfo.speed);
            row.querySelector('.qol-cp-trade-duration').textContent = calculation.durationSeconds ? secondsToTimeString(calculation.durationSeconds) : '-';
            for (const key of RESOURCE_KEYS) {
                const cell = row.querySelector(`.qol-cp-trade-${key}`);
                if (cell) cell.innerHTML = tradeResourceHtml(calculation.resources[key]);
                if (Number.isFinite(calculation.resources[key]?.disposable)) {
                    totals[key] += calculation.resources[key].disposable;
                    valid[key] = true;
                }
            }
        });
        for (const key of RESOURCE_KEYS) {
            const target = planner.querySelector(`.qol-cp-trade-total-${key}`);
            if (!target) continue;
            target.textContent = valid[key] ? `${formatNumber(totals[key])}/h` : '-';
            target.style.color = valid[key] ? (totals[key] > 0 ? '#4f7328' : totals[key] < 0 ? '#9b2b26' : '#8a6a25') : '#3f3020';
        }
        planner.querySelector('.qol-cp-trade-speed').textContent = `Detected x${speedInfo.speed} · ${speedInfo.source}`;
    }

    function openMarketTradeRoutes(village) {
        const villageId = String(village?.villageId || '').trim();
        const marketLocation = Number(village?.marketLocation);
        if (!villageId || !Number.isFinite(marketLocation)) return;
        document.getElementById(TRADE_PLANNER_ID)?.style.setProperty('display', 'none', 'important');
        setVillageHash([
            'page:village',
            `villId:${villageId}`,
            `location:${marketLocation}`,
            'window:building',
            'tab:TradeRoute'
        ]);
    }

    function renderTradePlanner() {
        if (!lastScanResult) return;
        const planner = mountTradePlannerPanel();
        document.getElementById(PLANNER_ID)?.style.setProperty('display', 'none', 'important');
        const speedInfo = detectServerSpeed(lastScanResult);
        const rows = lastScanResult.townHalls.villages
            .map((village, index) => ({ village, index }))
            .filter(({ village }) => village.hasTownHall)
            .map(({ village, index }) => {
                const marketCell = village.hasMarket && Number.isFinite(village.marketLocation)
                    ? `<div class="qol-cp-open-market-btn" role="button" tabindex="0" data-market-index="${index}" title="Open Marketplace ${village.marketLevel || ''} at location ${village.marketLocation}">Open Market</div>`
                    : '<span class="qol-cp-no-market">No Market</span>';
                return `<tr class="qol-cp-trade-row" data-index="${index}"><td title="${escapeHtml(village.villageName)}">${escapeHtml(village.villageName)}</td><td>TH ${village.level}</td><td><select class="qol-cp-trade-select qol-cp-trade-celeb"><option value="none">None</option><option value="small" selected>Small</option><option value="big"${village.level < 10 ? ' disabled' : ''}>Big</option></select></td><td class="qol-cp-trade-duration">-</td><td class="qol-cp-trade-wood"></td><td class="qol-cp-trade-clay"></td><td class="qol-cp-trade-iron"></td><td class="qol-cp-trade-crop"></td><td><select class="qol-cp-trade-select qol-cp-trade-frequency"><option value="1" selected>x1</option><option value="2">x2</option><option value="3">x3</option></select></td><td>${marketCell}</td></tr>`;
            })
            .join('');

        const resourceHeaders = RESOURCE_KEYS.map(key => `<th class="qol-cp-trade-resource-head" title="${RESOURCE_LABELS[key]}">${resourceIcon(key)}</th>`).join('');
        const summary = RESOURCE_KEYS.map(key => `<div class="qol-cp-trade-stat"><span>${resourceIcon(key)}<b>Disposable / h</b></span><strong class="qol-cp-trade-total-${key}">-</strong></div>`).join('');

        planner.querySelector('.qol-cp-trade-body').innerHTML = `<div class="qol-cp-trade-note">APES reserves enough resources each hour to restart the selected celebration as soon as it ends. <strong>Free/h</strong> is what remains after that reserve. <strong>/ route</strong> divides the free amount by x1, x2 or x3 routes per hour. Negative values show the hourly import the village needs.</div><div class="qol-cp-trade-summary">${summary}</div><div class="qol-cp-trade-table-wrap"><table class="qol-cp-trade-table"><thead><tr><th>Village</th><th>Town Hall</th><th>Celebration</th><th>Duration</th>${resourceHeaders}<th>Routes/h</th><th>Plan Route</th></tr></thead><tbody>${rows || '<tr><td colspan="10">No Town Halls detected.</td></tr>'}</tbody></table></div>`;
        planner.querySelector('.qol-cp-trade-speed').textContent = `Detected x${speedInfo.speed} · ${speedInfo.source}`;
        planner.querySelectorAll('select').forEach(control => control.addEventListener('change', updateTradePlanner));
        planner.querySelectorAll('.qol-cp-open-market-btn').forEach(button => {
            const activate = event => {
                event.preventDefault();
                event.stopPropagation();
                const village = lastScanResult?.townHalls?.villages?.[Number.parseInt(button.dataset.marketIndex || '', 10)];
                openMarketTradeRoutes(village);
            };
            button.addEventListener('click', activate);
            button.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') activate(event);
            });
        });
        planner.style.setProperty('display', 'flex', 'important');
        planner.dataset.userPositioned = 'false';
        requestAnimationFrame(() => { positionTradePlannerBesideMain(true); updateTradePlanner(); });
    }

    function toggleTradePlanner() {
        if (!lastScanResult) return;
        const planner = mountTradePlannerPanel();
        if (getComputedStyle(planner).display !== 'none') planner.style.setProperty('display', 'none', 'important');
        else renderTradePlanner();
    }

    function resetResults() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        lastScanResult = null;
        setPlanButtonVisible(false);
        setTradeButtonVisible(false);
        panel.querySelector('.qol-cp-results').innerHTML = '';
        panel.querySelector('.qol-cp-results').style.display = 'none';
        panel.querySelector('.qol-cp-progress-box').style.display = 'none';
        panel.querySelector('.qol-cp-townhalls').style.display = 'none';
        panel.querySelector('.qol-cp-celebrations').style.display = 'none';
        document.getElementById(PLANNER_ID)?.style.setProperty('display', 'none', 'important');
        document.getElementById(TRADE_PLANNER_ID)?.style.setProperty('display', 'none', 'important');
    }

    async function scanCulturePoints() {
        if (isScanning || !isEnabled()) return;
        isScanning = true;
        const originalHash = window.location.hash || '';
        resetResults();
        setScanButtonState(true, 'Scanning...');
        showScanOverlay();
        setStatus('Opening Main Building and reading city-founding CP...', 'working');
        try {
            const requirement = await scanCpRequirement();
            setStatus('Opening Villages Overview and reading CP/day...', 'working');
            openCulturePointsOverview();
            await sleep(250);
            const culture = await waitForCulturePointsOverview();
            if (!culture) throw new Error('The Culture Points overview opened, but CP/day could not be read.');
            setStatus('Scanning all villages for Town Halls, Marketplaces, celebrations and production...', 'working');
            const townHalls = await scanAllVillages(requirement.readAtMs);
            attachVillageCp(townHalls.villages, culture);
            const prediction = buildPrediction(requirement.current, requirement.target, culture.total, townHalls.celebrationEvents, requirement.readAtMs);
            const result = { ...requirement, cpPerDay: culture.total, villageCp: culture.villageCp, prediction, townHalls };
            if (window.location.hash !== originalHash) { window.location.hash = originalHash; await sleep(150); }
            lastScanResult = result;
            renderResult(result);
            const hallCount = townHalls.villages.filter(village => village.hasTownHall).length;
            const marketCount = townHalls.villages.filter(village => village.hasMarket && Number.isFinite(village.marketLocation)).length;
            const productionCount = townHalls.villages.filter(village => RESOURCE_KEYS.every(key => Number.isFinite(village.production?.[key]))).length;
            const nextSlot = getNextExpansionSlot(result);
            setStatus(
                townHalls.complete
                    ? `CP scan complete. Next expansion is Slot ${nextSlot}. ${hallCount} Town Hall${hallCount === 1 ? '' : 's'} and ${marketCount} Marketplace${marketCount === 1 ? '' : 's'} detected; production captured in ${productionCount}/${townHalls.scannedCount} villages. Ready to plan.`
                    : `CP scan complete, but village scan may be incomplete (${townHalls.scannedCount} scanned).`,
                townHalls.complete ? 'success' : 'error'
            );
        } catch (error) {
            console.error('[APES CP Manager] Scan failed.', error);
            if (window.location.hash !== originalHash) window.location.hash = originalHash;
            setStatus(error?.message || 'Could not scan culture point information.', 'error');
        } finally {
            removeScanOverlay();
            isScanning = false;
            setScanButtonState(false, 'Scan CP');
            requestAnimationFrame(positionToggleButton);
        }
    }

    function mountPlannerPanel() {
        let planner = document.getElementById(PLANNER_ID);
        if (planner) return planner;
        planner = document.createElement('div');
        planner.id = PLANNER_ID;
        planner.innerHTML = '<div class="qol-cp-planner-head"><div class="qol-cp-planner-title-wrap"><span>CP Planner</span><span class="qol-cp-speed"></span></div><span class="qol-cp-planner-close" title="Close">&times;</span></div><div class="qol-cp-planner-body"></div>';
        planner.querySelector('.qol-cp-planner-close').addEventListener('click', event => { event.stopPropagation(); planner.style.setProperty('display', 'none', 'important'); });
        document.body.appendChild(planner);
        makeDraggable(planner, planner.querySelector('.qol-cp-planner-head'));
        return planner;
    }

    function mountTradePlannerPanel() {
        let planner = document.getElementById(TRADE_PLANNER_ID);
        if (planner) return planner;
        planner = document.createElement('div');
        planner.id = TRADE_PLANNER_ID;
        planner.innerHTML = '<div class="qol-cp-trade-head"><div class="qol-cp-trade-title-wrap"><span>Trade Route Planner</span><span class="qol-cp-trade-speed"></span></div><span class="qol-cp-trade-close" title="Close">&times;</span></div><div class="qol-cp-trade-body"></div>';
        planner.querySelector('.qol-cp-trade-close').addEventListener('click', event => { event.stopPropagation(); planner.style.setProperty('display', 'none', 'important'); });
        document.body.appendChild(planner);
        makeDraggable(planner, planner.querySelector('.qol-cp-trade-head'));
        return planner;
    }

    function mountPanel() {
        let panel = document.getElementById(PANEL_ID);
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `<div class="qol-cp-header"><span>CP Manager</span><span class="qol-cp-close" title="Close">&times;</span></div><div class="qol-cp-body"><div class="qol-cp-description">Scan CP progress, daily production, Town Halls, Marketplaces, celebrations and village resource production. <strong>Plan CP</strong> projects future slots; <strong>Plan Trade Routes</strong> reserves enough resources to keep selected celebrations running continuously and can open each village's scanned Marketplace.</div><div class="qol-cp-controls"><div class="qol-cp-action-btn qol-cp-scan-btn" role="button" tabindex="0">Scan CP</div><div class="qol-cp-action-btn secondary qol-cp-plan-btn hidden" role="button" tabindex="0">Plan CP</div><div class="qol-cp-action-btn secondary qol-cp-trade-btn hidden" role="button" tabindex="0">Plan Trade Routes</div><div class="qol-cp-status" data-tone="neutral">Ready to scan.</div></div><div class="qol-cp-results"></div><div class="qol-cp-progress-box"><div class="qol-cp-progress-head"></div><div class="qol-cp-progress-track"><div class="qol-cp-progress-bar"></div></div></div><div class="qol-cp-townhalls qol-cp-box"></div><div class="qol-cp-celebrations"></div></div>`;
        panel.querySelector('.qol-cp-close').addEventListener('click', event => {
            event.stopPropagation();
            panel.style.setProperty('display', 'none', 'important');
            document.getElementById(PLANNER_ID)?.style.setProperty('display', 'none', 'important');
            document.getElementById(TRADE_PLANNER_ID)?.style.setProperty('display', 'none', 'important');
        });
        panel.querySelector('.qol-cp-scan-btn').addEventListener('click', event => { event.stopPropagation(); if (!isScanning) void scanCulturePoints(); });
        panel.querySelector('.qol-cp-plan-btn').addEventListener('click', event => { event.stopPropagation(); togglePlanner(); });
        panel.querySelector('.qol-cp-trade-btn').addEventListener('click', event => { event.stopPropagation(); toggleTradePlanner(); });
        document.body.appendChild(panel);
        makeDraggable(panel, panel.querySelector('.qol-cp-header'), () => {
            const cp = document.getElementById(PLANNER_ID);
            if (cp && getComputedStyle(cp).display !== 'none' && cp.dataset.userPositioned !== 'true') positionPlannerBesideMain(true);
            const trade = document.getElementById(TRADE_PLANNER_ID);
            if (trade && getComputedStyle(trade).display !== 'none' && trade.dataset.userPositioned !== 'true') positionTradePlannerBesideMain(true);
        });
        return panel;
    }

    function togglePanel() {
        const panel = mountPanel();
        if (getComputedStyle(panel).display !== 'none') {
            panel.style.setProperty('display', 'none', 'important');
            document.getElementById(PLANNER_ID)?.style.setProperty('display', 'none', 'important');
            document.getElementById(TRADE_PLANNER_ID)?.style.setProperty('display', 'none', 'important');
            return;
        }
        window.dispatchEvent(new CustomEvent('qol_close_others', { detail: { source: 'cpManager' } }));
        panel.style.setProperty('display', 'flex', 'important');
        requestAnimationFrame(() => positionPanelUnderButton(panel, panel.dataset.userPositioned !== 'true'));
    }

    function mountToggleButton() {
        let button = document.getElementById(TOGGLE_ID);
        if (button) return button;
        button = document.createElement('div');
        button.id = TOGGLE_ID;
        button.title = 'CP Manager';
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 19V5"></path><path d="M4 19h16"></path><path d="M7 15l3-4 3 2 4-6"></path><path d="M16 7h3v3"></path></svg>';
        button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); togglePanel(); });
        document.body.appendChild(button);
        if (typeof window.qolRepositionAllButtons === 'function') window.qolRepositionAllButtons();
        return button;
    }

    function positionToggleButton() {
        const button = document.getElementById(TOGGLE_ID) || mountToggleButton();
        if (!isEnabled()) { button.style.setProperty('display', 'none', 'important'); return; }
        if (typeof window.qolRepositionAllButtons === 'function') {
            window.qolRepositionAllButtons();
            return;
        }
        const villageList = document.getElementById('villageList');
        if (!villageList) { button.style.setProperty('display', 'none', 'important'); return; }
        const villageRect = villageList.getBoundingClientRect();
        if (villageRect.width <= 0 || villageRect.height <= 0) return;
        button.style.setProperty('left', `${villageRect.right + 20}px`, 'important');
        button.style.setProperty('top', `${villageRect.top + 4}px`, 'important');
        button.style.setProperty('display', 'flex', 'important');
    }

    function ensureSettingsCard() {
        const checkbox = document.querySelector(`#qol-advanced-feature-grid #${MENU_CHECKBOX_ID}`);
        if (checkbox) checkbox.checked = isEnabled();
    }

    function destroyUI() {
        removeScanOverlay();
        document.getElementById(PANEL_ID)?.remove();
        document.getElementById(PLANNER_ID)?.remove();
        document.getElementById(TRADE_PLANNER_ID)?.remove();
        document.getElementById(TOGGLE_ID)?.remove();
        lastScanResult = null;
        isScanning = false;
    }

    function ensureUI() {
        if (!document.body) return;
        ensureSettingsCard();
        if (!isEnabled()) return destroyUI();
        injectStyles();
        mountPanel();
        mountPlannerPanel();
        mountTradePlannerPanel();
        mountToggleButton();
        positionToggleButton();
    }

    window.addEventListener('qol_setting_changed', event => { if (event.detail?.key === FEATURE_KEY) ensureUI(); });
    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source === 'cpManager') return;
        document.getElementById(PANEL_ID)?.style.setProperty('display', 'none', 'important');
        document.getElementById(PLANNER_ID)?.style.setProperty('display', 'none', 'important');
        document.getElementById(TRADE_PLANNER_ID)?.style.setProperty('display', 'none', 'important');
    });
    window.addEventListener('resize', () => {
        positionToggleButton();
        for (const [id, position] of [[PANEL_ID, null], [PLANNER_ID, positionPlannerBesideMain], [TRADE_PLANNER_ID, positionTradePlannerBesideMain]]) {
            const panel = document.getElementById(id);
            if (!panel || getComputedStyle(panel).display === 'none') continue;
            if (id === PANEL_ID || panel.dataset.userPositioned === 'true') clampPanelToViewport(panel);
            else position(true);
        }
    });
    window.addEventListener('pagehide', removeScanOverlay);
    window.addEventListener('beforeunload', removeScanOverlay);
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const trade = document.getElementById(TRADE_PLANNER_ID);
        if (trade && getComputedStyle(trade).display !== 'none') { trade.style.setProperty('display', 'none', 'important'); return; }
        const planner = document.getElementById(PLANNER_ID);
        if (planner && getComputedStyle(planner).display !== 'none') { planner.style.setProperty('display', 'none', 'important'); return; }
        document.getElementById(PANEL_ID)?.style.setProperty('display', 'none', 'important');
    }, true);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureUI, { once: true });
    else ensureUI();

    window.setInterval(ensureUI, 1200);
    console.log('[APES CP Manager] CP + Trade Route planning initialized.');
})();