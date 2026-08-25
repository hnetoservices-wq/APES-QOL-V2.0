/**
 * APES QoL Extension
 * Module: Culture Point Manager + CP Planner
 *
 * Unified workflow:
 * - Scan current/target CP and CP/day.
 * - Scan every village for Town Halls and queued celebrations.
 * - Predict the next CP target using queued celebration start times.
 * - Identify the next expansion slot from the fixed CP slot table.
 * - Plan toward any expansion slot up to slot 50.
 * - Show a five-slot CP roadmap using the active celebration plan.
 * - Simulate 24/7 celebrations for a user-defined planning period.
 * - Plan Artwork usage as instant CP events, limited to one per day.
 * - Lock the game screen while automated CP scanning is running.
 */
(function initCpManagerModule() {
    'use strict';

    const FEATURE_KEY = 'cpManager';
    const PANEL_ID = 'qol-cp-manager-panel';
    const PLANNER_ID = 'qol-cp-planner-panel';
    const TOGGLE_ID = 'qol-cp-toggle-btn';
    const STYLE_ID = 'qol-cp-manager-styles';
    const MENU_CHECKBOX_ID = 'qol-chk-cp-manager';
    const SCAN_OVERLAY_ID = 'qol-cp-scan-overlay';

    const MAIN_BUILDING_LOCATION = 27;
    const TOWN_HALL_BUILDING_ID = 24;
    const MAX_VILLAGE_HOPS = 100;
    const DAY_MS = 86400000;
    const SMALL_CELEBRATION_CAP = 500;
    const BIG_CELEBRATION_CAP = 2000;
    const ARTWORK_CAP = 2000;

    // Fixed Culture Point thresholds for expansion slots 1-50.
    // Source: Travian Kingdoms Help Center - Culture points.
    const CP_SLOT_TARGETS = Object.freeze([
        0,
        1000,
        5000,
        10000,
        20000,
        40000,
        70000,
        110000,
        150000,
        210000,
        270000,
        350000,
        430000,
        530000,
        640000,
        750000,
        880000,
        1030000,
        1180000,
        1350000,
        1530000,
        1720000,
        1930000,
        2150000,
        2390000,
        2640000,
        2900000,
        3170000,
        3470000,
        3770000,
        4090000,
        4430000,
        4780000,
        5150000,
        5530000,
        5930000,
        6340000,
        6770000,
        7220000,
        7680000,
        8160000,
        8650000,
        9170000,
        9690000,
        10240000,
        10800000,
        11380000,
        11980000,
        12600000,
        13230000
    ]);

    const CELEBRATION_DURATIONS_X1 = {
        1:  { small: '24:00:00' },
        2:  { small: '23:08:10' },
        3:  { small: '22:18:11' },
        4:  { small: '21:30:01' },
        5:  { small: '20:43:34' },
        6:  { small: '19:58:48' },
        7:  { small: '19:15:39' },
        8:  { small: '18:34:03' },
        9:  { small: '17:53:56' },
        10: { small: '17:15:17', big: '43:08:11' },
        11: { small: '16:38:00', big: '41:35:01' },
        12: { small: '16:02:05', big: '40:05:12' },
        13: { small: '15:27:27', big: '38:38:36' },
        14: { small: '14:54:03', big: '37:15:08' },
        15: { small: '14:21:52', big: '35:54:40' },
        16: { small: '13:50:50', big: '34:37:06' },
        17: { small: '13:20:56', big: '33:22:20' },
        18: { small: '12:52:06', big: '32:10:15' },
        19: { small: '12:24:18', big: '31:00:45' },
        20: { small: '11:57:30', big: '29:53:46' }
    };

    let isScanning = false;
    let lastScanResult = null;

    function isEnabled() {
        return typeof window.isQolEnabled === 'function'
            ? window.isQolEnabled(FEATURE_KEY) === true
            : localStorage.getItem(`qol_${FEATURE_KEY}`) !== 'false';
    }

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function parseInteger(value) {
        const digits = String(value || '').replace(/[^0-9]/g, '');
        return digits ? Number.parseInt(digits, 10) : null;
    }

    function formatNumber(value, decimals = 0) {
        return Number.isFinite(value)
            ? Number(value).toLocaleString('en-US', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            })
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

    function normalizeName(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function timeStringToSeconds(value) {
        const parts = String(value || '').split(':').map(Number);
        if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return null;
        return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    }

    function secondsToTimeString(seconds) {
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
        return index >= 0 && index < CP_SLOT_TARGETS.length
            ? CP_SLOT_TARGETS[index]
            : null;
    }

    function findSlotByTarget(target) {
        if (!Number.isFinite(target)) return null;
        const index = CP_SLOT_TARGETS.findIndex(value => value === target);
        return index >= 0 ? index + 1 : null;
    }

    function getNextExpansionSlot(result) {
        const scannedSlot = findSlotByTarget(result?.target);
        if (scannedSlot) return scannedSlot;

        const current = Number(result?.current || 0);
        const index = CP_SLOT_TARGETS.findIndex(target => target > current);
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
        const day = date.getDate();
        const month = date.toLocaleString('en-GB', { month: 'short' });
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day} ${month} ${hours}h${minutes}`;
    }

    function formatPredictionResult(targetMs, celebrationsApplied = []) {
        const roundedTargetMs = Math.ceil(targetMs / 60000) * 60000;
        const totalMinutes = Math.max(0, Math.ceil((roundedTargetMs - Date.now()) / 60000));
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const targetDate = new Date(roundedTargetMs);

        if (totalMinutes <= 0) {
            return {
                text: `Next CP target should now be reached (${formatTargetDate(targetDate)})`,
                targetDate,
                exactMinutes: 0,
                celebrationsApplied
            };
        }

        return {
            text: `Next CP in ${days} ${days === 1 ? 'day' : 'days'}, ${hours} ${hours === 1 ? 'hour' : 'hours'} on ${formatTargetDate(targetDate)}`,
            targetDate,
            exactMinutes: totalMinutes,
            celebrationsApplied
        };
    }

    function buildPrediction(current, target, cpPerDay, celebrationEvents = [], baselineMs = Date.now()) {
        if (current >= target) {
            return { text: 'Next CP target reached', targetDate: null, exactMinutes: 0, celebrationsApplied: [] };
        }

        const ratePerMs = cpPerDay > 0 ? cpPerDay / DAY_MS : 0;
        const events = celebrationEvents
            .filter(event => event.startMs > baselineMs && event.reward > 0)
            .sort((a, b) => a.startMs - b.startMs);

        let cp = current;
        let cursor = baselineMs;
        const applied = [];

        for (const event of events) {
            const before = cp + ((event.startMs - cursor) * ratePerMs);
            if (ratePerMs > 0 && before >= target) {
                return formatPredictionResult(cursor + ((target - cp) / ratePerMs), applied);
            }

            cp = before + event.reward;
            cursor = event.startMs;
            applied.push(event);

            if (cp >= target) return formatPredictionResult(event.startMs, applied);
        }

        if (ratePerMs <= 0) {
            return { text: 'Next CP estimate unavailable', targetDate: null, exactMinutes: null, celebrationsApplied: applied };
        }

        return formatPredictionResult(cursor + ((target - cp) / ratePerMs), applied);
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
                if (Math.abs(ratio - 3) < 0.12) return { speed: 3, source: 'celebration timing' };
                if (Math.abs(ratio - 1) < 0.12) return { speed: 1, source: 'celebration timing' };
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

            #${PANEL_ID},#${PANEL_ID} *,#${PLANNER_ID},#${PLANNER_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${PANEL_ID},#${PLANNER_ID}{position:fixed!important;display:none;flex-direction:column!important;border:3px solid var(--qol-border)!important;border-radius:4px!important;background:#f7f5f0!important;color:#333!important;box-shadow:0 10px 30px rgba(0,0,0,.5)!important;overflow:hidden!important;z-index:999999!important}
            #${PANEL_ID}{width:560px!important;max-width:94vw!important;max-height:86vh!important}
            #${PLANNER_ID}{width:760px!important;max-width:94vw!important;max-height:86vh!important;z-index:1000000!important}

            #${PANEL_ID} .qol-cp-header,#${PLANNER_ID} .qol-cp-planner-head{height:34px!important;padding:6px 10px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-dark))!important;color:#f7f5f0!important;font-size:14px!important;font-weight:bold!important;display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 auto!important;cursor:move!important;user-select:none!important}
            #${PANEL_ID} .qol-cp-close,#${PLANNER_ID} .qol-cp-planner-close{cursor:pointer!important;color:#fff!important;font-size:21px!important;font-weight:bold!important;line-height:1!important;padding:0 5px!important;border-radius:3px!important;background:rgba(0,0,0,.2)!important}
            #${PANEL_ID} .qol-cp-close:hover,#${PLANNER_ID} .qol-cp-planner-close:hover{background:rgba(255,255,255,.16)!important}

            #${PANEL_ID} .qol-cp-body{display:flex!important;flex-direction:column!important;gap:9px!important;padding:10px!important;background:#f7f5f0!important;overflow-y:auto!important}
            #${PANEL_ID} .qol-cp-description{padding:7px 9px!important;background:#fff6e5!important;border:1px solid #d4c2a5!important;border-radius:4px!important;color:#5b4630!important;font-size:11px!important;line-height:1.4!important}
            #${PANEL_ID} .qol-cp-controls{display:flex!important;align-items:center!important;gap:7px!important;flex-wrap:wrap!important}
            #${PANEL_ID} .qol-cp-action-btn{min-width:120px!important;height:28px!important;padding:5px 11px!important;border:1px solid var(--qol-action-border)!important;border-radius:3px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:11px!important;font-weight:bold!important;white-space:nowrap!important;cursor:pointer!important;user-select:none!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
            #${PANEL_ID} .qol-cp-action-btn.secondary{background:linear-gradient(to bottom,#937951,#6b5335)!important}
            #${PANEL_ID} .qol-cp-action-btn.hidden{display:none!important}
            #${PANEL_ID} .qol-cp-action-btn.disabled{opacity:.45!important;pointer-events:none!important}
            #${PANEL_ID} .qol-cp-status{flex:1 1 160px!important;min-height:18px!important;color:#6c5a43!important;font-size:10px!important;line-height:1.35!important}
            #${PANEL_ID} .qol-cp-status[data-tone=working]{color:#8a5a16!important;font-weight:bold!important}
            #${PANEL_ID} .qol-cp-status[data-tone=success]{color:#4f7328!important;font-weight:bold!important}
            #${PANEL_ID} .qol-cp-status[data-tone=error]{color:#a52a2a!important;font-weight:bold!important}

            #${PANEL_ID} .qol-cp-results{display:none;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important}
            #${PANEL_ID} .qol-cp-card{min-width:0!important;padding:8px 10px!important;background:#fff!important;border:1px solid #c7b99e!important;border-radius:3px!important}
            #${PANEL_ID} .qol-cp-card.highlight{background:#fff6e5!important;border-color:#bda57e!important}
            #${PANEL_ID} .qol-cp-card.full-width{grid-column:1/-1!important}
            #${PANEL_ID} .qol-cp-card-label{display:block!important;margin-bottom:4px!important;color:#6a573d!important;font-size:9px!important;font-weight:bold!important;text-transform:uppercase!important;letter-spacing:.3px!important}
            #${PANEL_ID} .qol-cp-card-value{display:block!important;color:#3f3020!important;font-size:16px!important;font-weight:bold!important;font-variant-numeric:tabular-nums!important}
            #${PANEL_ID} .qol-cp-card.full-width .qol-cp-card-value{font-size:14px!important}
            #${PANEL_ID} .qol-cp-progress-box{display:none;padding:8px 10px!important;background:#fff!important;border:1px solid #c7b99e!important;border-radius:3px!important}
            #${PANEL_ID} .qol-cp-progress-head{display:flex!important;justify-content:space-between!important;margin-bottom:6px!important;color:#5b4630!important;font-size:10px!important;font-weight:bold!important}
            #${PANEL_ID} .qol-cp-progress-track{height:9px!important;border:1px solid #b9a589!important;border-radius:8px!important;background:#eee8dc!important;overflow:hidden!important}
            #${PANEL_ID} .qol-cp-progress-bar{height:100%!important;width:0;background:linear-gradient(to bottom,#7ea743,#5f8733)!important}

            #${PANEL_ID} .qol-cp-box{display:none;border:1px solid #c7b99e!important;border-radius:3px!important;background:#fff!important;overflow:hidden!important}
            #${PANEL_ID} .qol-cp-box-heading{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:7px 9px!important;border-bottom:1px solid #c7b99e!important;background:#e9dfcc!important;color:var(--qol-accent-deep)!important;font-size:10px!important;font-weight:bold!important;text-transform:uppercase!important}
            #${PANEL_ID} .qol-cp-count{min-width:20px!important;padding:1px 5px!important;border-radius:10px!important;background:var(--qol-accent)!important;color:#fff!important;text-align:center!important;font-size:9px!important}
            #${PANEL_ID} .qol-cp-table-wrap{max-height:150px!important;overflow:auto!important}
            #${PANEL_ID} table,#${PLANNER_ID} table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:10px!important}
            #${PANEL_ID} th,#${PANEL_ID} td,#${PLANNER_ID} th,#${PLANNER_ID} td{padding:6px 8px!important;border-bottom:1px solid #e4dccd!important;color:#4b3b28!important;text-align:left!important;vertical-align:middle!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
            #${PANEL_ID} th,#${PLANNER_ID} th{background:#f4eee2!important;color:#6a573d!important;font-size:9px!important;text-transform:uppercase!important;position:sticky!important;top:0!important;z-index:2!important}
            #${PANEL_ID} .qol-cp-box-meta{padding:5px 8px!important;border-top:1px solid #e4dccd!important;background:#faf7f1!important;color:#7a6a55!important;font-size:9px!important}
            #${PANEL_ID} .qol-cp-celebrations{display:none;padding:7px 9px!important;border:1px solid #d5c4a9!important;border-radius:3px!important;background:#fffaf0!important;color:#5b4630!important;font-size:10px!important;line-height:1.45!important}

            #${PLANNER_ID} .qol-cp-planner-title-wrap{display:flex!important;align-items:center!important;gap:8px!important;min-width:0!important}
            #${PLANNER_ID} .qol-cp-speed{font-size:10px!important;font-weight:normal!important;opacity:.9!important;white-space:nowrap!important}
            #${PLANNER_ID} .qol-cp-planner-body{display:flex!important;flex-direction:column!important;min-height:0!important;background:#fbf7ef!important;overflow:hidden!important}
            #${PLANNER_ID} .qol-cp-planner-summary{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:6px!important;padding:8px!important;border-bottom:1px solid #d6c8ae!important;flex:0 0 auto!important}
            #${PLANNER_ID} .qol-cp-plan-stat{padding:6px 8px!important;background:#fff!important;border:1px solid #d3c4aa!important;border-radius:3px!important;min-width:0!important}
            #${PLANNER_ID} .qol-cp-plan-stat span{display:block!important;color:#77654d!important;font-size:8px!important;font-weight:bold!important;text-transform:uppercase!important}
            #${PLANNER_ID} .qol-cp-plan-stat strong{display:block!important;margin-top:2px!important;color:#3f3020!important;font-size:13px!important;overflow:hidden!important;text-overflow:ellipsis!important}
            #${PLANNER_ID} .qol-cp-planner-controls{display:grid!important;grid-template-columns:minmax(0,1.25fr) minmax(0,.72fr) minmax(0,.8fr)!important;gap:6px!important;padding:7px 8px!important;background:#f4eee2!important;border-bottom:1px solid #d6c8ae!important;flex:0 0 auto!important}
            #${PLANNER_ID} .qol-cp-target-control,#${PLANNER_ID} .qol-cp-period-control,#${PLANNER_ID} .qol-cp-artwork-control{display:flex!important;align-items:center!important;gap:7px!important;min-width:0!important;padding:6px 7px!important;background:#fffaf0!important;border:1px solid #d6c8ae!important;border-radius:3px!important;color:#5b4630!important;font-size:10px!important}
            #${PLANNER_ID} .qol-cp-target-control strong,#${PLANNER_ID} .qol-cp-period-control strong,#${PLANNER_ID} .qol-cp-artwork-control strong{font-size:9px!important;color:var(--qol-accent-deep)!important;text-transform:uppercase!important;white-space:nowrap!important}
            #${PLANNER_ID} .qol-cp-target-select{appearance:auto!important;-webkit-appearance:auto!important;min-width:190px!important;max-width:250px!important;height:26px!important;padding:2px 5px!important;border:1px solid #a99473!important;border-radius:3px!important;background:#fff!important;color:#493821!important;font-size:10px!important}
            #${PLANNER_ID} .qol-cp-target-remaining{margin-left:auto!important;color:var(--qol-accent)!important;font-size:9px!important;font-weight:bold!important;white-space:nowrap!important}
            #${PLANNER_ID} .qol-cp-period-input,#${PLANNER_ID} .qol-cp-artwork-input{appearance:auto!important;-webkit-appearance:auto!important;width:62px!important;height:25px!important;padding:2px 5px!important;border:1px solid #a99473!important;border-radius:3px!important;background:#fff!important;color:#493821!important;font-size:11px!important;text-align:center!important}
            #${PLANNER_ID} .qol-cp-period-hint,#${PLANNER_ID} .qol-cp-artwork-hint{color:#84735d!important;font-size:9px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
            #${PLANNER_ID} .qol-cp-planner-table-wrap{overflow:auto!important;max-height:32vh!important;background:#fff!important}
            #${PLANNER_ID} .qol-cp-planner-table th:nth-child(1),#${PLANNER_ID} .qol-cp-planner-table td:nth-child(1){width:24%!important}
            #${PLANNER_ID} .qol-cp-planner-table th:nth-child(2),#${PLANNER_ID} .qol-cp-planner-table td:nth-child(2){width:14%!important;text-align:center!important}
            #${PLANNER_ID} .qol-cp-planner-table th:nth-child(3),#${PLANNER_ID} .qol-cp-planner-table td:nth-child(3){width:17%!important;text-align:center!important}
            #${PLANNER_ID} .qol-cp-planner-table th:nth-child(4),#${PLANNER_ID} .qol-cp-planner-table td:nth-child(4){width:10%!important;text-align:center!important}
            #${PLANNER_ID} .qol-cp-planner-table th:nth-child(5),#${PLANNER_ID} .qol-cp-planner-table td:nth-child(5){width:17%!important;text-align:center!important}
            #${PLANNER_ID} .qol-cp-planner-table th:nth-child(6),#${PLANNER_ID} .qol-cp-planner-table td:nth-child(6){width:18%!important;text-align:right!important}
            #${PLANNER_ID} .qol-cp-plan-select{display:inline-block!important;appearance:auto!important;-webkit-appearance:auto!important;width:100%!important;min-width:64px!important;max-width:112px!important;height:28px!important;line-height:normal!important;padding:3px 6px!important;border:1px solid #a99473!important;border-radius:3px!important;background-color:#fff!important;color:#493821!important;-webkit-text-fill-color:#493821!important;font-size:11px!important;font-weight:normal!important;opacity:1!important;visibility:visible!important}
            #${PLANNER_ID} .qol-cp-plan-select option,#${PLANNER_ID} .qol-cp-target-select option{background:#fff!important;color:#493821!important;font-size:10px!important}
            #${PLANNER_ID} .qol-cp-plan-select:disabled{background:#eee8dc!important;color:#8b7d69!important;-webkit-text-fill-color:#8b7d69!important;opacity:.75!important}
            #${PLANNER_ID} .qol-cp-247-check{appearance:auto!important;-webkit-appearance:checkbox!important;width:16px!important;height:16px!important;margin:0!important;vertical-align:middle!important;cursor:pointer!important;opacity:1!important;visibility:visible!important}
            #${PLANNER_ID} .qol-cp-247-check:disabled{opacity:.4!important;cursor:default!important}
            #${PLANNER_ID} .qol-cp-roadmap{background:#fff!important;border-top:1px solid #d6c8ae!important;flex:0 0 auto!important}
            #${PLANNER_ID} .qol-cp-roadmap-head{display:flex!important;align-items:center!important;justify-content:space-between!important;padding:6px 9px!important;background:#e9dfcc!important;color:var(--qol-accent-deep)!important;font-size:9px!important;font-weight:bold!important;text-transform:uppercase!important}
            #${PLANNER_ID} .qol-cp-roadmap-head span:last-child{font-weight:normal!important;text-transform:none!important;color:#7a6a55!important}
            #${PLANNER_ID} .qol-cp-roadmap-wrap{max-height:138px!important;overflow:auto!important}
            #${PLANNER_ID} .qol-cp-roadmap-table th:nth-child(1),#${PLANNER_ID} .qol-cp-roadmap-table td:nth-child(1){width:15%!important;text-align:center!important}
            #${PLANNER_ID} .qol-cp-roadmap-table th:nth-child(2),#${PLANNER_ID} .qol-cp-roadmap-table td:nth-child(2){width:27%!important;text-align:right!important}
            #${PLANNER_ID} .qol-cp-roadmap-table th:nth-child(3),#${PLANNER_ID} .qol-cp-roadmap-table td:nth-child(3){width:27%!important;text-align:right!important}
            #${PLANNER_ID} .qol-cp-roadmap-table th:nth-child(4),#${PLANNER_ID} .qol-cp-roadmap-table td:nth-child(4){width:31%!important;text-align:right!important}
            #${PLANNER_ID} .qol-cp-roadmap-row.selected td{background:#fff6e5!important;color:var(--qol-accent-deep)!important;font-weight:bold!important}
        `;
        document.head.appendChild(style);
    }

    function getCurrentVillageName() {
        const selectors = [
            '.currentVillageName.dropdown .selectedItem .villageEntry',
            '#villageList .currentVillageName .selectedItem .villageEntry',
            '.currentVillageName .villageEntry',
            '.villageEntry.active',
            '.active .villageEntry'
        ];

        for (const selector of selectors) {
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
        const left = Math.max(8, Math.min(rect.left, maxLeft));
        const top = Math.max(8, Math.min(rect.top, maxTop));
        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
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
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
        const top = Math.max(8, Math.min(rect.bottom + 18, window.innerHeight - height - 8));

        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
        panel.style.setProperty('right', 'auto', 'important');
        panel.style.setProperty('bottom', 'auto', 'important');
    }

    function positionPlannerBesideMain(force = false) {
        const main = document.getElementById(PANEL_ID);
        const planner = document.getElementById(PLANNER_ID);
        if (!main || !planner || getComputedStyle(planner).display === 'none') return;
        if (!force && planner.dataset.userPositioned === 'true') return;

        const mainRect = main.getBoundingClientRect();
        const plannerWidth = planner.offsetWidth || 760;
        const plannerHeight = planner.offsetHeight || 540;
        const preferredLeft = mainRect.right + 10;
        let left = preferredLeft;

        if (preferredLeft + plannerWidth > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - plannerWidth - 8);
        }

        const top = Math.max(8, Math.min(mainRect.top, window.innerHeight - plannerHeight - 8));
        planner.style.setProperty('left', `${left}px`, 'important');
        planner.style.setProperty('top', `${top}px`, 'important');
        planner.style.setProperty('right', 'auto', 'important');
        planner.style.setProperty('bottom', 'auto', 'important');
    }

    function makeDraggable(panel, handle, onMove) {
        if (!panel || !handle || handle.dataset.qolDragBound === 'true') return;
        handle.dataset.qolDragBound = 'true';

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('.qol-cp-close,.qol-cp-planner-close')) return;
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
            const width = panel.offsetWidth;
            const height = panel.offsetHeight;
            const left = Math.max(8, Math.min(event.clientX - offsetX, window.innerWidth - width - 8));
            const top = Math.max(8, Math.min(event.clientY - offsetY, window.innerHeight - height - 8));
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
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background-color: rgba(0, 0, 0, 0.7) !important;
            z-index: 2147483646 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            color: white !important;
            font-family: Arial, sans-serif !important;
            font-size: 15px !important;
            font-weight: bold !important;
            flex-direction: column !important;
            gap: 8px !important;
            text-align: center !important;
            cursor: wait !important;
            user-select: none !important;
            pointer-events: auto !important;
        `;
        overlay.innerHTML = `
            <div>Scanning CP...</div>
            <div class="qol-cp-scan-overlay-status" style="max-width:min(520px,80vw)!important;font-size:11px!important;font-weight:normal!important;color:#ddd!important;line-height:1.45!important;">Starting CP scan...</div>
            <div style="margin-top:2px!important;font-size:10px!important;font-weight:normal!important;color:#aaa!important;">Please wait while APES checks your villages and Town Halls.</div>
        `;
        document.body.appendChild(overlay);
    }

    function updateScanOverlay(message) {
        const status = document.querySelector(`#${SCAN_OVERLAY_ID} .qol-cp-scan-overlay-status`);
        if (status) status.textContent = message || 'Scanning culture point information...';
    }

    function removeScanOverlay() {
        document.getElementById(SCAN_OVERLAY_ID)?.remove();
    }

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

    function findTownBox() {
        return Array.from(document.querySelectorAll('.foundTown.contentBox'))
            .find(box => box.querySelector('.townConditionTable')) || null;
    }

    function readTownState() {
        const table = findTownBox()?.querySelector('.townConditionTable');
        if (!table) return null;

        const cultureCell = Array.from(table.querySelectorAll('td[ng-if="!village.isTown"]'))
            .find(cell => cell.querySelector('.currentValue'));

        if (cultureCell) {
            const current = parseInteger(cultureCell.querySelector('.currentValue')?.textContent);
            const candidates = Array.from(cultureCell.querySelectorAll('span'))
                .filter(element => !element.classList.contains('currentValue'))
                .map(element => parseInteger(element.textContent))
                .filter(Number.isFinite);
            const target = candidates.at(-1);
            if (Number.isFinite(current) && Number.isFinite(target)) {
                return { type: 'village', current, target };
            }
        }

        const box = findTownBox();
        const city = table.classList.contains('town') ||
            Boolean(table.querySelector('td[ng-if="village.isTown"]')) ||
            Boolean(box?.querySelector('.buildingDescription span[ng-if="village.isTown"]'));
        return city ? { type: 'city' } : null;
    }

    function setVillageHash(parts) {
        window.location.hash = `#/${parts.filter(Boolean).join('/')}`;
    }

    function villageRoute() {
        const route = ['page:village'];
        const villageId = getVillageIdFromHash();
        if (villageId) route.push(`villId:${villageId}`);
        return route;
    }

    function openCityFoundingWindow() {
        setVillageHash([...villageRoute(), `location:${MAIN_BUILDING_LOCATION}`, 'window:building']);
    }

    function openCulturePointsOverview() {
        setVillageHash([...villageRoute(), 'window:villagesOverview', 'tab:CulturePoints']);
    }

    function openVillageBase() {
        setVillageHash(villageRoute());
    }

    function openTownHallWindow(location) {
        setVillageHash([...villageRoute(), `location:${location}`, 'window:building']);
    }

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

        const rect = button.getBoundingClientRect();
        const options = {
            view: window,
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
        };

        if (typeof PointerEvent === 'function') {
            button.dispatchEvent(new PointerEvent('pointerover', { ...options, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
            button.dispatchEvent(new PointerEvent('pointerdown', { ...options, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
        }

        button.dispatchEvent(new MouseEvent('mouseover', options));
        button.dispatchEvent(new MouseEvent('mousedown', { ...options, buttons: 1 }));

        if (typeof PointerEvent === 'function') {
            button.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
        }

        button.dispatchEvent(new MouseEvent('mouseup', options));
        button.dispatchEvent(new MouseEvent('click', options));
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
        if (!clickVillageNavigation(direction)) return false;
        if (!await waitForVillageChange(previous)) return false;
        await sleep(250);
        return true;
    }

    async function restoreStartingVillage(hops) {
        for (let index = 0; index < hops; index += 1) {
            if (!await moveVillage('previous')) return false;
        }
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

        const headers = Array.from(table.querySelectorAll('thead th'))
            .map(th => th.textContent.replace(/\s+/g, ' ').trim());
        let cpIndex = headers.findIndex(text => /CPs?\s*\/\s*day/i.test(text));
        if (cpIndex < 0) cpIndex = 1;

        const villageCp = [];
        table.querySelectorAll('tbody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            const cpPerDay = parseInteger(cells[cpIndex]?.textContent);
            if (!Number.isFinite(cpPerDay)) return;

            const nameCell = cells[0];
            const name = nameCell?.querySelector('.villageName,.villageEntry,a')?.textContent?.trim() ||
                nameCell?.textContent?.replace(/\s+/g, ' ').trim();
            if (name) villageCp.push({ name, cpPerDay });
        });

        const footer = table.querySelectorAll('tfoot tr td');
        let total = parseInteger(footer[cpIndex]?.textContent);
        if (!Number.isFinite(total) && villageCp.length) {
            total = villageCp.reduce((sum, item) => sum + item.cpPerDay, 0);
        }

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

    function readTownHallInCurrentVillage() {
        const view = document.getElementById('villageView');
        if (!view) return null;

        const image = view.querySelector(`img.location.buildingId${TOWN_HALL_BUILDING_ID}`);
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
            villageName: getCurrentVillageName(),
            villageId: getVillageIdFromHash(),
            hasTownHall: true,
            level: Number.isFinite(level) ? level : 1,
            location: Number.isFinite(location) ? location : null,
            celebrations: [],
            allCelebrations: [],
            busyUntilMs: null,
            cpPerDay: null
        };
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
        const displayedReward = parseInteger(card.querySelector('.headerTrapezoidal .content')?.textContent);
        const title = card.querySelector('.itemHead')?.textContent || '';

        if (image?.classList.contains('celebration_small_illu') || /small/i.test(title)) {
            return { type: 'small', reward: displayedReward || SMALL_CELEBRATION_CAP };
        }

        if (image?.classList.contains('celebration_large_illu') || /(large|big)/i.test(title)) {
            return { type: 'big', reward: displayedReward || BIG_CELEBRATION_CAP };
        }

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
            const progressbar = card.querySelector('.progressContainer .progressbar[finish-time][duration]');
            if (!celebration || !progressbar) return;

            const finishSeconds = Number.parseInt(progressbar.getAttribute('finish-time') || '', 10);
            const durationSeconds = Number.parseInt(progressbar.getAttribute('duration') || '', 10);
            const queueCount = Math.max(1, Number.parseInt(card.querySelector('.queueAmount')?.textContent || '1', 10) || 1);
            if (!Number.isFinite(finishSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return;

            const firstStartSeconds = finishSeconds - durationSeconds;

            for (let index = 0; index < queueCount; index += 1) {
                const startSeconds = firstStartSeconds + (index * durationSeconds);
                const finishMs = (startSeconds + durationSeconds) * 1000;
                const startMs = startSeconds * 1000;
                const key = `${townHall.villageId || townHall.villageName}:${celebration.type}:${startSeconds}`;
                if (seen.has(key)) continue;
                seen.add(key);

                const event = {
                    villageName: townHall.villageName,
                    villageId: townHall.villageId,
                    type: celebration.type,
                    reward: celebration.reward,
                    startMs,
                    finishMs,
                    durationSeconds
                };

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
        if (!await waitForVillageView()) throw new Error('The village view could not be loaded for Town Hall scanning.');

        for (let attempt = 0; attempt < MAX_VILLAGE_HOPS; attempt += 1) {
            const identity = getVillageIdentity();
            if (visited.has(identity)) {
                complete = identity === startingIdentity;
                break;
            }

            visited.add(identity);
            openVillageBase();
            await sleep(220);
            if (!await waitForVillageView()) break;

            const villageName = getCurrentVillageName();
            setStatus(`Scanning Town Halls and celebrations: ${villageName} (${visited.size})...`, 'working');

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
                    cpPerDay: null
                };
            } else {
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

            if (!await moveVillage('next')) {
                complete = visited.size === 1;
                break;
            }

            hops += 1;
            if (getVillageIdentity() === startingIdentity) {
                complete = true;
                break;
            }
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
                const result = {
                    current: state.current,
                    target: state.target,
                    villageName: getCurrentVillageName(),
                    skippedCities: hops,
                    readAtMs: Date.now()
                };

                if (hops > 0 && !await restoreStartingVillage(hops)) {
                    throw new Error('Could not return to the starting village.');
                }

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
        const rows = halls.map(village => `
            <tr>
                <td title="${escapeHtml(village.villageName)}">${escapeHtml(village.villageName)}</td>
                <td>Town Hall ${village.level}</td>
                <td style="text-align:center">${village.location ?? '-'}</td>
            </tr>
        `).join('');

        section.innerHTML = `
            <div class="qol-cp-box-heading"><span>Town Halls Detected</span><span class="qol-cp-count">${halls.length}</span></div>
            <div class="qol-cp-table-wrap"><table><thead><tr><th>Village Name</th><th>Town Hall</th><th>Location</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No Town Halls detected.</td></tr>'}</tbody></table></div>
            <div class="qol-cp-box-meta">Scanned ${scan.scannedCount} ${scan.scannedCount === 1 ? 'village' : 'villages'}.${scan.complete ? '' : ' Scan may be incomplete.'}</div>
        `;
        section.style.setProperty('display', 'block', 'important');
    }

    function renderCelebrations(scan) {
        const section = document.querySelector(`#${PANEL_ID} .qol-cp-celebrations`);
        if (!section) return;

        if (!scan.celebrationEvents.length) {
            section.innerHTML = '<strong>Upcoming celebrations:</strong> None detected. Celebrations already started are included in Current CP.';
        } else {
            const total = scan.celebrationEvents.reduce((sum, event) => sum + event.reward, 0);
            const lines = scan.celebrationEvents.map(event =>
                `${escapeHtml(event.villageName)}: ${event.type === 'small' ? 'Small' : 'Big'} +${formatNumber(event.reward)} CP on ${formatTargetDate(new Date(event.startMs))}`
            ).join('<br>');
            section.innerHTML = `<strong>Upcoming celebrations:</strong> ${scan.celebrationEvents.length} queued, +${formatNumber(total)} CP scheduled.<br>${lines}`;
        }

        section.style.setProperty('display', 'block', 'important');
    }

    function renderResult(result) {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;

        const remaining = Math.max(0, result.target - result.current);
        const progress = result.target > 0
            ? Math.max(0, Math.min(100, (result.current / result.target) * 100))
            : 0;
        const nextSlot = getNextExpansionSlot(result);

        const results = panel.querySelector('.qol-cp-results');
        results.innerHTML = `
            <div class="qol-cp-card"><span class="qol-cp-card-label">Current CP</span><span class="qol-cp-card-value">${formatNumber(result.current)}</span></div>
            <div class="qol-cp-card"><span class="qol-cp-card-label">Next Expansion</span><span class="qol-cp-card-value">Slot ${nextSlot} · ${formatNumber(result.target)} CP</span></div>
            <div class="qol-cp-card"><span class="qol-cp-card-label">Remaining CP</span><span class="qol-cp-card-value">${formatNumber(remaining)}</span></div>
            <div class="qol-cp-card highlight"><span class="qol-cp-card-label">Total CP / Day</span><span class="qol-cp-card-value">${formatNumber(result.cpPerDay)}</span></div>
            <div class="qol-cp-card highlight full-width"><span class="qol-cp-card-label">Slot ${nextSlot} Prediction</span><span class="qol-cp-card-value">${escapeHtml(result.prediction.text)}</span></div>
        `;
        results.style.setProperty('display', 'grid', 'important');

        const progressBox = panel.querySelector('.qol-cp-progress-box');
        progressBox.querySelector('.qol-cp-progress-head').innerHTML = `<span>Slot ${nextSlot}: ${formatNumber(result.current)} / ${formatNumber(result.target)}</span><span>${progress.toFixed(1)}%</span>`;
        progressBox.querySelector('.qol-cp-progress-bar').style.setProperty('width', `${progress.toFixed(2)}%`, 'important');
        progressBox.style.setProperty('display', 'block', 'important');

        renderTownHalls(result.townHalls);
        renderCelebrations(result.townHalls);
        setPlanButtonVisible(true);
    }

    function getSmallReward(village) {
        return Number.isFinite(village.cpPerDay)
            ? Math.min(SMALL_CELEBRATION_CAP, village.cpPerDay)
            : SMALL_CELEBRATION_CAP;
    }

    function getBigReward(result) {
        return Math.min(BIG_CELEBRATION_CAP, result.cpPerDay || 0);
    }

    function getArtworkReward(result) {
        const passiveCpPerDay = Number(result?.cpPerDay || 0);
        return Math.min(ARTWORK_CAP, Math.max(0, passiveCpPerDay));
    }

    function getPlannerArtworkCount() {
        const input = document.querySelector(`#${PLANNER_ID} .qol-cp-artwork-input`);
        const value = Number.parseInt(input?.value || '0', 10);
        if (!Number.isFinite(value) || value <= 0) return 0;
        return Math.min(365, Math.max(0, value));
    }

    function buildArtworkEvents(result, artworkCount, now = Date.now()) {
        const reward = getArtworkReward(result);
        const count = Math.max(0, Math.floor(Number(artworkCount) || 0));
        if (reward <= 0 || count <= 0) return [];

        return Array.from({ length: count }, (_, index) => ({
            startMs: now + (index * DAY_MS),
            reward,
            villageName: 'Artwork',
            type: 'artwork',
            source: 'artwork'
        }));
    }

    function getPlannerPeriodDays() {
        const input = document.querySelector(`#${PLANNER_ID} .qol-cp-period-input`);
        const value = Number.parseFloat(input?.value || '1');
        if (!Number.isFinite(value) || value <= 0) return 1;
        return Math.min(365, Math.max(0.25, value));
    }

    function getPlannerTargetSlot() {
        const select = document.querySelector(`#${PLANNER_ID} .qol-cp-target-select`);
        const value = Number.parseInt(select?.value || '', 10);
        if (Number.isFinite(value) && value >= 1 && value <= CP_SLOT_TARGETS.length) return value;
        return lastScanResult ? getNextExpansionSlot(lastScanResult) : null;
    }

    function buildTargetSlotOptions(result) {
        const startSlot = getNextExpansionSlot(result);
        const options = [];
        for (let slot = startSlot; slot <= CP_SLOT_TARGETS.length; slot += 1) {
            options.push(`<option value="${slot}"${slot === startSlot ? ' selected' : ''}>${formatSlotOption(slot)}</option>`);
        }
        return options.join('');
    }

    function count247StartsInPeriod(durationSeconds, busyUntilMs, periodDays, now = Date.now()) {
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
        if (!Number.isFinite(periodDays) || periodDays <= 0) return 0;

        const periodEndMs = now + (periodDays * DAY_MS);
        const firstStartMs = Math.max(now, Number.isFinite(busyUntilMs) ? busyUntilMs : now);
        if (firstStartMs >= periodEndMs) return 0;

        return Math.ceil((periodEndMs - firstStartMs) / (durationSeconds * 1000));
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
            const hasCelebration = type === 'small' || type === 'big';
            const run247 = hasCelebration && Boolean(row.querySelector('.qol-cp-247-check')?.checked);
            const durationSeconds = hasCelebration
                ? getCelebrationDurationSeconds(level, type, speed)
                : null;
            const reward = level > 0 && hasCelebration
                ? (type === 'big' ? getBigReward(lastScanResult) : getSmallReward(village))
                : 0;

            return {
                villageName: village.villageName,
                level,
                type,
                run247,
                durationSeconds,
                reward,
                busyUntilMs: village.busyUntilMs
            };
        });
    }

    function buildPlannerPrediction(result, plans, periodDays, targetCp = result.target, artworkCount = 0) {
        const effectiveTarget = Number.isFinite(targetCp) ? targetCp : result.target;
        const now = Date.now();
        const planEndMs = now + (periodDays * DAY_MS);
        const rate = result.cpPerDay > 0 ? result.cpPerDay / DAY_MS : 0;
        let estimatedCurrent = result.current + (Math.max(0, now - result.readAtMs) * rate);

        result.townHalls.celebrationEvents.forEach(event => {
            if (event.startMs > result.readAtMs && event.startMs <= now) estimatedCurrent += event.reward;
        });

        if (estimatedCurrent >= effectiveTarget) return formatPredictionResult(now, []);

        const fixedEvents = [
            ...result.townHalls.celebrationEvents
                .filter(event => event.startMs > now)
                .map(event => ({ ...event, source: 'queued' })),
            ...buildArtworkEvents(result, artworkCount, now)
        ].sort((a, b) => a.startMs - b.startMs);

        const sequences = plans
            .filter(plan => plan.level > 0 && plan.durationSeconds > 0 && plan.reward > 0)
            .map(plan => ({
                ...plan,
                nextStartMs: Math.max(now, plan.busyUntilMs || now),
                planEndMs,
                source: 'plan'
            }))
            .filter(plan => !plan.run247 || plan.nextStartMs < plan.planEndMs);

        let cp = estimatedCurrent;
        let cursor = now;
        const fixed = [...fixedEvents];
        const applied = [];

        for (let guard = 0; guard < 10000; guard += 1) {
            let next = fixed[0] || null;
            let sequence = null;

            for (const candidate of sequences) {
                if (!next || candidate.nextStartMs < next.startMs) {
                    next = {
                        startMs: candidate.nextStartMs,
                        reward: candidate.reward,
                        villageName: candidate.villageName,
                        type: candidate.type,
                        source: 'plan'
                    };
                    sequence = candidate;
                }
            }

            if (!next) {
                if (rate <= 0) return { text: 'Planner ETA unavailable', targetDate: null, exactMinutes: null };
                return formatPredictionResult(cursor + ((effectiveTarget - cp) / rate), applied);
            }

            const cpBefore = cp + ((next.startMs - cursor) * rate);
            if (rate > 0 && cpBefore >= effectiveTarget) {
                return formatPredictionResult(cursor + ((effectiveTarget - cp) / rate), applied);
            }

            cp = cpBefore + next.reward;
            cursor = next.startMs;
            applied.push(next);
            if (cp >= effectiveTarget) return formatPredictionResult(next.startMs, applied);

            if (next.source === 'queued' || next.source === 'artwork') {
                fixed.shift();
            } else if (sequence) {
                if (sequence.run247) {
                    sequence.nextStartMs += sequence.durationSeconds * 1000;
                    if (sequence.nextStartMs >= sequence.planEndMs) {
                        const index = sequences.indexOf(sequence);
                        if (index >= 0) sequences.splice(index, 1);
                    }
                } else {
                    const index = sequences.indexOf(sequence);
                    if (index >= 0) sequences.splice(index, 1);
                }
            }
        }

        return { text: 'Planner ETA exceeded calculation range', targetDate: null, exactMinutes: null };
    }

    function updateRoadmap(planner, plans, periodDays, selectedSlot, artworkCount) {
        const body = planner.querySelector('.qol-cp-roadmap-body');
        if (!body || !lastScanResult) return;

        const startSlot = getNextExpansionSlot(lastScanResult);
        const endSlot = Math.min(CP_SLOT_TARGETS.length, startSlot + 4);
        const rows = [];

        for (let slot = startSlot; slot <= endSlot; slot += 1) {
            const target = getSlotTarget(slot);
            const remaining = Math.max(0, target - lastScanResult.current);
            const prediction = buildPlannerPrediction(lastScanResult, plans, periodDays, target, artworkCount);
            const eta = target <= lastScanResult.current
                ? 'Unlocked'
                : prediction.targetDate
                    ? formatRoadmapDate(prediction.targetDate)
                    : '-';

            rows.push(`
                <tr class="qol-cp-roadmap-row${slot === selectedSlot ? ' selected' : ''}">
                    <td>Slot ${slot}</td>
                    <td>${formatNumber(target)}</td>
                    <td>${formatNumber(remaining)}</td>
                    <td title="${escapeHtml(prediction.text || '')}">${escapeHtml(eta)}</td>
                </tr>
            `);
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
        const artworkCp = artworkReward * artworkCount;
        const targetSlot = getPlannerTargetSlot() || getNextExpansionSlot(lastScanResult);
        const targetCp = getSlotTarget(targetSlot) ?? lastScanResult.target;
        const now = Date.now();
        let total247CpPeriod = 0;
        let oneOffCelebrationCp = 0;

        planner.querySelectorAll('.qol-cp-plan-row').forEach(row => {
            const index = Number.parseInt(row.dataset.index, 10);
            const village = lastScanResult.townHalls.villages[index];
            const levelSelect = row.querySelector('.qol-cp-level-select');
            const typeSelect = row.querySelector('.qol-cp-type-select');
            const run247Input = row.querySelector('.qol-cp-247-check');
            const level = Number.parseInt(levelSelect.value || '0', 10);

            typeSelect.disabled = level === 0;
            if (level === 0) typeSelect.value = 'none';

            const bigOption = typeSelect.querySelector('option[value="big"]');
            if (bigOption) bigOption.disabled = level < 10;
            if (level < 10 && typeSelect.value === 'big') typeSelect.value = 'none';

            const type = typeSelect.value || 'none';
            const hasCelebration = level > 0 && (type === 'small' || type === 'big');
            run247Input.disabled = !hasCelebration;
            if (!hasCelebration) run247Input.checked = false;

            const duration = hasCelebration
                ? getCelebrationDurationSeconds(level, type, speedInfo.speed)
                : null;
            const reward = hasCelebration
                ? (type === 'big' ? getBigReward(lastScanResult) : getSmallReward(village))
                : 0;

            let displayedContribution = 0;
            let contributionTitle = '';

            if (run247Input.checked && duration > 0 && reward > 0) {
                const starts = count247StartsInPeriod(duration, village.busyUntilMs, periodDays, now);
                displayedContribution = reward * starts;
                total247CpPeriod += displayedContribution;
                contributionTitle = `${formatNumber(reward)} CP per celebration × ${starts} ${starts === 1 ? 'start' : 'starts'} within ${periodDays} ${periodDays === 1 ? 'day' : 'days'} = ${formatNumber(displayedContribution)} CP`;
            } else if (reward > 0) {
                displayedContribution = reward;
                oneOffCelebrationCp += reward;
                contributionTitle = `${formatNumber(reward)} CP from one planned celebration`;
            }

            row.querySelector('.qol-cp-plan-duration').textContent = duration ? secondsToTimeString(duration) : '-';
            row.querySelector('.qol-cp-plan-cpday').textContent = displayedContribution > 0
                ? formatNumber(displayedContribution)
                : '-';
            row.querySelector('.qol-cp-plan-cpday').title = contributionTitle;
        });

        const plans = readPlannerPlans();
        const prediction = buildPlannerPrediction(lastScanResult, plans, periodDays, targetCp, artworkCount);
        const remainingToTarget = Math.max(0, targetCp - lastScanResult.current);

        planner.querySelector('.qol-cp-plan-base').textContent = formatNumber(lastScanResult.cpPerDay);
        planner.querySelector('.qol-cp-plan-celebrations').textContent = formatNumber(total247CpPeriod);
        planner.querySelector('.qol-cp-plan-oneoff').textContent = formatNumber(oneOffCelebrationCp);
        planner.querySelector('.qol-cp-plan-artworks').textContent = formatNumber(artworkCp);
        planner.querySelector('.qol-cp-plan-artworks').title = artworkCount > 0
            ? `${artworkCount} Artwork${artworkCount === 1 ? '' : 's'} × ${formatNumber(artworkReward)} CP each`
            : `${formatNumber(artworkReward)} CP per Artwork`;
        planner.querySelector('.qol-cp-plan-eta').textContent = prediction.text;
        planner.querySelector('.qol-cp-plan-eta').title = prediction.text;
        planner.querySelector('.qol-cp-target-remaining').textContent = `${formatNumber(remainingToTarget)} CP remaining`;
        planner.querySelector('.qol-cp-artwork-hint').textContent = `${formatNumber(artworkReward)} CP each · 1/day`;
        planner.querySelector('.qol-cp-speed').textContent = `Detected x${speedInfo.speed} · ${speedInfo.source}`;

        updateRoadmap(planner, plans, periodDays, targetSlot, artworkCount);
    }

    function buildLevelOptions(village) {
        const start = village.hasTownHall ? Math.max(1, village.level) : 0;
        const options = [];
        for (let level = start; level <= 20; level += 1) {
            options.push(`<option value="${level}"${level === start ? ' selected' : ''}>${level}</option>`);
        }
        return options.join('');
    }

    function renderPlanner() {
        if (!lastScanResult) return;
        const planner = mountPlannerPanel();
        const speedInfo = detectServerSpeed(lastScanResult);
        const nextSlot = getNextExpansionSlot(lastScanResult);
        const artworkReward = getArtworkReward(lastScanResult);

        const rows = lastScanResult.townHalls.villages.map((village, index) => {
            const startLevel = village.hasTownHall ? Math.max(1, village.level) : 0;
            const bigDisabled = startLevel < 10;

            return `
                <tr class="qol-cp-plan-row" data-index="${index}">
                    <td title="${escapeHtml(village.villageName)}">${escapeHtml(village.villageName)}</td>
                    <td><select class="qol-cp-plan-select qol-cp-level-select">${buildLevelOptions(village)}</select></td>
                    <td>
                        <select class="qol-cp-plan-select qol-cp-type-select"${startLevel === 0 ? ' disabled' : ''}>
                            <option value="none" selected>None</option>
                            <option value="small">Small</option>
                            <option value="big"${bigDisabled ? ' disabled' : ''}>Big</option>
                        </select>
                    </td>
                    <td><input type="checkbox" class="qol-cp-247-check" aria-label="Run celebrations 24/7" disabled></td>
                    <td class="qol-cp-plan-duration">-</td>
                    <td class="qol-cp-plan-cpday">-</td>
                </tr>
            `;
        }).join('');

        planner.querySelector('.qol-cp-planner-body').innerHTML = `
            <div class="qol-cp-planner-summary">
                <div class="qol-cp-plan-stat"><span>Base CP / Day</span><strong class="qol-cp-plan-base">-</strong></div>
                <div class="qol-cp-plan-stat"><span>24/7 CP / Period</span><strong class="qol-cp-plan-celebrations">-</strong></div>
                <div class="qol-cp-plan-stat"><span>One-off Celebration CP</span><strong class="qol-cp-plan-oneoff">-</strong></div>
                <div class="qol-cp-plan-stat"><span>Artwork CP</span><strong class="qol-cp-plan-artworks">0</strong></div>
                <div class="qol-cp-plan-stat"><span>Planner ETA</span><strong class="qol-cp-plan-eta" style="font-size:10px!important">-</strong></div>
            </div>
            <div class="qol-cp-planner-controls">
                <div class="qol-cp-target-control">
                    <strong>Target expansion</strong>
                    <select class="qol-cp-target-select" aria-label="Target expansion slot">${buildTargetSlotOptions(lastScanResult)}</select>
                    <span class="qol-cp-target-remaining">${formatNumber(Math.max(0, lastScanResult.target - lastScanResult.current))} CP remaining</span>
                </div>
                <div class="qol-cp-period-control">
                    <strong>24/7 period</strong>
                    <input type="number" class="qol-cp-period-input" min="1" max="365" step="1" value="30" aria-label="24/7 celebration planning period in days">
                    <span>days</span>
                    <span class="qol-cp-period-hint">Starts inside period count.</span>
                </div>
                <div class="qol-cp-artwork-control">
                    <strong>Artworks</strong>
                    <input type="number" class="qol-cp-artwork-input" min="0" max="365" step="1" value="0" aria-label="Number of Artworks to use">
                    <span class="qol-cp-artwork-hint">${formatNumber(artworkReward)} CP each · 1/day</span>
                </div>
            </div>
            <div class="qol-cp-planner-table-wrap">
                <table class="qol-cp-planner-table">
                    <thead><tr><th>Village</th><th>Town Hall</th><th>Celebration</th><th>24/7</th><th>Duration</th><th>Extra CP / Period*</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="qol-cp-roadmap">
                <div class="qol-cp-roadmap-head"><span>CP Roadmap</span><span>Next 5 expansion slots from Slot ${nextSlot}</span></div>
                <div class="qol-cp-roadmap-wrap">
                    <table class="qol-cp-roadmap-table">
                        <thead><tr><th>Slot</th><th>Target CP</th><th>Remaining</th><th>ETA</th></tr></thead>
                        <tbody class="qol-cp-roadmap-body"></tbody>
                    </table>
                </div>
            </div>
        `;

        planner.querySelector('.qol-cp-speed').textContent = `Detected x${speedInfo.speed} · ${speedInfo.source}`;
        planner.querySelectorAll('select,input').forEach(control => control.addEventListener('change', updatePlanner));
        planner.querySelector('.qol-cp-period-input')?.addEventListener('input', updatePlanner);
        planner.querySelector('.qol-cp-artwork-input')?.addEventListener('input', updatePlanner);
        planner.style.setProperty('display', 'flex', 'important');
        planner.dataset.userPositioned = 'false';
        requestAnimationFrame(() => {
            positionPlannerBesideMain(true);
            updatePlanner();
        });
    }

    function togglePlanner() {
        if (!lastScanResult) return;
        const planner = mountPlannerPanel();

        if (getComputedStyle(planner).display !== 'none') {
            planner.style.setProperty('display', 'none', 'important');
            return;
        }

        renderPlanner();
    }

    function resetResults() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;

        lastScanResult = null;
        setPlanButtonVisible(false);
        panel.querySelector('.qol-cp-results').innerHTML = '';
        panel.querySelector('.qol-cp-results').style.display = 'none';
        panel.querySelector('.qol-cp-progress-box').style.display = 'none';
        panel.querySelector('.qol-cp-townhalls').style.display = 'none';
        panel.querySelector('.qol-cp-celebrations').style.display = 'none';
        document.getElementById(PLANNER_ID)?.style.setProperty('display', 'none', 'important');
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

            setStatus('Scanning all villages for Town Halls and celebrations...', 'working');
            const townHalls = await scanAllVillages(requirement.readAtMs);
            attachVillageCp(townHalls.villages, culture);

            const prediction = buildPrediction(
                requirement.current,
                requirement.target,
                culture.total,
                townHalls.celebrationEvents,
                requirement.readAtMs
            );

            const result = {
                ...requirement,
                cpPerDay: culture.total,
                villageCp: culture.villageCp,
                prediction,
                townHalls
            };

            if (window.location.hash !== originalHash) {
                window.location.hash = originalHash;
                await sleep(150);
            }

            lastScanResult = result;
            renderResult(result);

            const hallCount = townHalls.villages.filter(village => village.hasTownHall).length;
            const nextSlot = getNextExpansionSlot(result);
            setStatus(
                townHalls.complete
                    ? `CP scan complete. Next expansion is Slot ${nextSlot}. ${hallCount} Town Hall${hallCount === 1 ? '' : 's'} detected. Ready to plan.`
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
        planner.innerHTML = `
            <div class="qol-cp-planner-head">
                <div class="qol-cp-planner-title-wrap"><span>CP Planner</span><span class="qol-cp-speed"></span></div>
                <span class="qol-cp-planner-close" title="Close">&times;</span>
            </div>
            <div class="qol-cp-planner-body"></div>
        `;

        planner.querySelector('.qol-cp-planner-close').addEventListener('click', event => {
            event.stopPropagation();
            planner.style.setProperty('display', 'none', 'important');
        });

        document.body.appendChild(planner);
        makeDraggable(planner, planner.querySelector('.qol-cp-planner-head'));
        return planner;
    }

    function mountPanel() {
        let panel = document.getElementById(PANEL_ID);
        if (panel) return panel;

        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="qol-cp-header"><span>CP Manager</span><span class="qol-cp-close" title="Close">&times;</span></div>
            <div class="qol-cp-body">
                <div class="qol-cp-description">Scan CP progress, daily production, Town Halls and celebrations. The scan identifies your next expansion slot; <strong>Plan CP</strong> can then project future slots using celebrations and planned Artworks.</div>
                <div class="qol-cp-controls">
                    <div class="qol-cp-action-btn qol-cp-scan-btn" role="button" tabindex="0">Scan CP</div>
                    <div class="qol-cp-action-btn secondary qol-cp-plan-btn hidden" role="button" tabindex="0">Plan CP</div>
                    <div class="qol-cp-status" data-tone="neutral">Ready to scan.</div>
                </div>
                <div class="qol-cp-results"></div>
                <div class="qol-cp-progress-box"><div class="qol-cp-progress-head"></div><div class="qol-cp-progress-track"><div class="qol-cp-progress-bar"></div></div></div>
                <div class="qol-cp-townhalls qol-cp-box"></div>
                <div class="qol-cp-celebrations"></div>
            </div>
        `;

        const closeButton = panel.querySelector('.qol-cp-close');
        closeButton.addEventListener('click', event => {
            event.stopPropagation();
            panel.style.setProperty('display', 'none', 'important');
            document.getElementById(PLANNER_ID)?.style.setProperty('display', 'none', 'important');
        });

        const scanButton = panel.querySelector('.qol-cp-scan-btn');
        scanButton.addEventListener('click', event => {
            event.stopPropagation();
            if (!isScanning) void scanCulturePoints();
        });
        scanButton.addEventListener('keydown', event => {
            if ((event.key === 'Enter' || event.key === ' ') && !isScanning) {
                event.preventDefault();
                void scanCulturePoints();
            }
        });

        const planButton = panel.querySelector('.qol-cp-plan-btn');
        planButton.addEventListener('click', event => {
            event.stopPropagation();
            togglePlanner();
        });
        planButton.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                togglePlanner();
            }
        });

        document.body.appendChild(panel);
        makeDraggable(panel, panel.querySelector('.qol-cp-header'), () => {
            const planner = document.getElementById(PLANNER_ID);
            if (planner && getComputedStyle(planner).display !== 'none' && planner.dataset.userPositioned !== 'true') {
                positionPlannerBesideMain(true);
            }
        });
        return panel;
    }

    function togglePanel() {
        const panel = mountPanel();

        if (getComputedStyle(panel).display !== 'none') {
            panel.style.setProperty('display', 'none', 'important');
            document.getElementById(PLANNER_ID)?.style.setProperty('display', 'none', 'important');
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

        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            togglePanel();
        };

        button.addEventListener('click', activate);
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });

        document.body.appendChild(button);
        if (typeof window.qolRepositionAllButtons === 'function') window.qolRepositionAllButtons();
        return button;
    }

    function positionToggleButton() {
        const button = document.getElementById(TOGGLE_ID) || mountToggleButton();
        const villageList = document.getElementById('villageList');

        if (!isEnabled() || !villageList) {
            button.style.setProperty('display', 'none', 'important');
            return;
        }

        const villageRect = villageList.getBoundingClientRect();
        if (villageRect.width <= 0 || villageRect.height <= 0) return;

        const precedingIds = [
            'qol-cog-btn',
            'qol-help-toggle-btn',
            'qol-rally-point-toggle-btn',
            'qol-watchlist-toggle',
            'qol-checklist-toggle-btn',
            'qol-npc-calc-toggle-btn',
            'qol-oasis-toggle-btn',
            'qol-report-archive-toggle'
        ];

        let left = villageRect.right + 20;
        precedingIds.forEach(id => {
            const element = document.getElementById(id);
            if (!element || getComputedStyle(element).display === 'none') return;
            const rect = element.getBoundingClientRect();
            if (rect.width > 0) left = Math.max(left, rect.right + 6);
        });

        button.style.setProperty('left', `${left}px`, 'important');
        button.style.setProperty('top', `${villageRect.top + 4}px`, 'important');
        button.style.setProperty('display', 'flex', 'important');
    }

    function ensureSettingsCard() {
        const checkbox = document.querySelector(
            `#qol-advanced-feature-grid #${MENU_CHECKBOX_ID}`
        );
        if (checkbox) checkbox.checked = isEnabled();
    }

    function destroyUI() {
        removeScanOverlay();
        document.getElementById(PANEL_ID)?.remove();
        document.getElementById(PLANNER_ID)?.remove();
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
        mountToggleButton();
        positionToggleButton();
    }

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key === FEATURE_KEY) ensureUI();
    });

    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source === 'cpManager') return;
        document.getElementById(PANEL_ID)?.style.setProperty('display', 'none', 'important');
        document.getElementById(PLANNER_ID)?.style.setProperty('display', 'none', 'important');
    });

    window.addEventListener('resize', () => {
        positionToggleButton();
        const panel = document.getElementById(PANEL_ID);
        const planner = document.getElementById(PLANNER_ID);
        if (panel && getComputedStyle(panel).display !== 'none') clampPanelToViewport(panel);
        if (planner && getComputedStyle(planner).display !== 'none') {
            if (planner.dataset.userPositioned === 'true') clampPanelToViewport(planner);
            else positionPlannerBesideMain(true);
        }
    });

    window.addEventListener('pagehide', removeScanOverlay);
    window.addEventListener('beforeunload', removeScanOverlay);

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const planner = document.getElementById(PLANNER_ID);
        if (planner && getComputedStyle(planner).display !== 'none') {
            planner.style.setProperty('display', 'none', 'important');
            return;
        }
        document.getElementById(PANEL_ID)?.style.setProperty('display', 'none', 'important');
    }, true);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureUI, { once: true });
    } else {
        ensureUI();
    }

    window.setInterval(ensureUI, 1200);
    console.log('[APES CP Manager] Expansion-slot planner + Artwork planning initialized.');
})();
