/**
 * APES QoL v2 — Building Alarm × Account Operations Center integration
 *
 * Reads Building Alarm's existing persistent alarm store and merges active
 * alarms into Account Operations Center > Next Events. No second alarm/timer
 * system is created here.
 */
(() => {
    'use strict';

    const ALARM_STORAGE_KEY = 'qol_building_alarms';
    const OVERLAY_ID = 'apes-v2-village-overlay';
    const EVENT_LIST_SELECTOR = `#${OVERLAY_ID} .apes-aoc-events-list`;
    const STYLE_ID = 'apes-building-alarm-aoc-styles';
    const POLL_MS = 500;
    const MAX_EVENTS = 8;
    const MATCH_TOLERANCE_MS = 2200;

    const RESOURCE_SHORT_NAMES = Object.freeze({
        Woodcutter: 'Wood',
        'Clay Pit': 'Clay',
        'Iron Mine': 'Iron',
        Cropland: 'Crop'
    });

    let syncScheduled = false;
    let lastSignature = '';

    function isAlarmFeatureEnabled() {
        if (typeof window.isQolEnabled === 'function') {
            return window.isQolEnabled('buildingAlarm') === true;
        }
        try { return localStorage.getItem('qol_buildingAlarm') !== 'false'; }
        catch (_) { return true; }
    }

    function readAlarms() {
        if (!isAlarmFeatureEnabled()) return [];
        try {
            const parsed = JSON.parse(localStorage.getItem(ALARM_STORAGE_KEY) || '[]');
            if (!Array.isArray(parsed)) return [];
            const now = Date.now() / 1000;
            return parsed
                .filter(alarm => alarm && Number.isFinite(Number(alarm.alarmAt)) && Number.isFinite(Number(alarm.finishAt)))
                .filter(alarm => Number(alarm.finishAt) > now)
                .sort((a, b) => Number(a.alarmAt) - Number(b.alarmAt));
        } catch (_) {
            return [];
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function asTimestampMs(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        return numeric < 100000000000 ? numeric * 1000 : numeric;
    }

    function formatDuration(milliseconds) {
        if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'ready';
        let seconds = Math.ceil(milliseconds / 1000);
        const days = Math.floor(seconds / 86400); seconds %= 86400;
        const hours = Math.floor(seconds / 3600); seconds %= 3600;
        const minutes = Math.floor(seconds / 60); seconds %= 60;
        const hh = String(hours).padStart(2, '0');
        const mm = String(minutes).padStart(2, '0');
        const ss = String(seconds).padStart(2, '0');
        return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
    }

    function eventClock(timestamp) {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit', minute: '2-digit', hour12: false
        });
    }

    function alarmTransition(alarm) {
        const name = String(alarm?.buildingName || 'Construction').trim();
        const levels = String(alarm?.levelText || '').match(/\d+/g) || [];
        if (levels.length >= 2) return `${name} ${levels[0]} → ${levels.at(-1)}`;
        if (levels.length === 1) return `${name} → ${levels[0]}`;
        return name;
    }

    function queueItems(queue) {
        const source = queue?.queues;
        if (!source || typeof source !== 'object') return [];
        const items = [];
        const add = item => {
            if (item && typeof item === 'object' && !Array.isArray(item)) items.push(item);
        };
        const walkBucket = bucket => {
            if (Array.isArray(bucket)) { bucket.forEach(add); return; }
            if (!bucket || typeof bucket !== 'object') return;
            if ('locationId' in bucket || 'finished' in bucket || 'finishTime' in bucket) { add(bucket); return; }
            Object.values(bucket).forEach(value => {
                if (Array.isArray(value)) value.forEach(add);
                else add(value);
            });
        };
        if (Array.isArray(source)) source.forEach(walkBucket);
        else Object.values(source).forEach(walkBucket);
        return items;
    }

    function findAlarmLocation(alarm) {
        const villageId = String(alarm?.villageId || '');
        if (!/^\d+$/.test(villageId)) return null;
        const villages = window.APES_ACCOUNT_OPERATIONS_CENTER?.getVillages?.() || [];
        const village = villages.find(item => String(item?.villageId || '') === villageId);
        if (!village) return null;
        const alarmFinish = asTimestampMs(alarm.finishAt);
        if (!alarmFinish) return null;

        let best = null;
        for (const item of queueItems(village.buildingQueue)) {
            const finish = asTimestampMs(item?.finishTime ?? item?.finished ?? item?.finishAt);
            const location = Number(item?.locationId ?? item?.buildingLocationId ?? item?.location);
            if (!finish || !Number.isFinite(location)) continue;
            const delta = Math.abs(finish - alarmFinish);
            if (delta > MATCH_TOLERANCE_MS) continue;
            if (!best || delta < best.delta) best = { location, delta };
        }
        return best?.location ?? null;
    }

    function alarmEvent(alarm) {
        const now = Date.now();
        const alarmAt = asTimestampMs(alarm.alarmAt);
        const finishAt = asTimestampMs(alarm.finishAt);
        if (!alarmAt || !finishAt || finishAt <= now) return null;
        const ready = alarm.triggered === true || now >= alarmAt;
        return {
            alarm,
            ready,
            at: ready ? now : alarmAt,
            alarmAt,
            finishAt,
            villageId: String(alarm.villageId || ''),
            villageName: String(alarm.villageName || 'Village'),
            transition: alarmTransition(alarm),
            location: findAlarmLocation(alarm)
        };
    }

    function eventNode(event) {
        const node = document.createElement('div');
        node.className = `apes-aoc-event apes-aoc-alarm-event${event.ready ? ' ready' : ''}`;
        node.dataset.apesBuildingAlarmEvent = 'true';
        node.dataset.alarmId = String(event.alarm.id || '');
        node.dataset.eventVillageId = event.villageId;
        node.dataset.eventMs = String(event.at);
        if (Number.isFinite(event.location)) node.dataset.eventBuildingLocation = String(event.location);
        node.title = Number.isFinite(event.location)
            ? `Open ${event.transition} in ${event.villageName}`
            : `Switch to ${event.villageName}`;
        const label = event.ready ? `Alarm ready: ${event.transition}` : `Alarm: ${event.transition}`;
        node.innerHTML = `
            <strong>${event.ready ? 'NOW' : escapeHtml(eventClock(event.at))}</strong>
            <span>${escapeHtml(event.villageName)} — ${escapeHtml(label)}</span>
            <small class="apes-aoc-event-countdown" data-event-ms="${event.at}">${event.ready ? 'ready' : escapeHtml(formatDuration(event.at - Date.now()))}</small>
        `;
        node.addEventListener('click', clickAlarmEvent);
        node.addEventListener('keydown', keyAlarmEvent);
        node.setAttribute('role', 'button');
        node.setAttribute('tabindex', '0');
        return node;
    }

    function openAlarmTarget(node) {
        const villageId = String(node?.dataset?.eventVillageId || '');
        const locationId = String(node?.dataset?.eventBuildingLocation || '');
        if (!/^\d+$/.test(villageId)) return;
        window.APES_ACCOUNT_OPERATIONS_CENTER?.close?.();
        location.hash = /^\d+$/.test(locationId)
            ? `#/page:village/villId:${villageId}/location:${locationId}/window:building`
            : `#/page:village/villId:${villageId}`;
    }

    function clickAlarmEvent(event) {
        event.preventDefault();
        event.stopPropagation();
        openAlarmTarget(event.currentTarget);
    }

    function keyAlarmEvent(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        event.stopPropagation();
        openAlarmTarget(event.currentTarget);
    }

    function nativeEventMs(node) {
        const value = Number(node.querySelector('.apes-aoc-event-countdown[data-event-ms]')?.dataset.eventMs);
        return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
    }

    function isMatchingGenericFreeFinish(node, alarmEventValue) {
        if (!node || node.dataset.apesBuildingAlarmEvent === 'true') return false;
        const text = String(node.textContent || '').replace(/\s+/g, ' ').trim();
        if (!/Free finish(?: ready)?:/i.test(text)) return false;
        if (!text.includes(alarmEventValue.villageName)) return false;

        const eventMs = nativeEventMs(node);
        if (!alarmEventValue.ready && Number.isFinite(eventMs) && Math.abs(eventMs - alarmEventValue.alarmAt) <= MATCH_TOLERANCE_MS) {
            return true;
        }

        const name = String(alarmEventValue.alarm?.buildingName || '').trim();
        const shortName = RESOURCE_SHORT_NAMES[name] || name;
        return Boolean(shortName && text.toLowerCase().includes(shortName.toLowerCase()));
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${OVERLAY_ID} .apes-aoc-event.apes-aoc-alarm-event{
                border-color:rgba(215,169,69,.62)!important;
                background:linear-gradient(90deg,rgba(106,76,24,.42),rgba(255,255,255,.035))!important;
                box-shadow:inset 3px 0 0 rgba(222,174,66,.9)!important;
            }
            #${OVERLAY_ID} .apes-aoc-event.apes-aoc-alarm-event>strong{color:#ffd978!important}
            #${OVERLAY_ID} .apes-aoc-event.apes-aoc-alarm-event.ready{
                border-color:rgba(114,183,71,.78)!important;
                background:linear-gradient(90deg,rgba(47,91,33,.62),rgba(255,255,255,.04))!important;
                box-shadow:inset 3px 0 0 rgba(128,205,78,.95),0 0 10px rgba(104,180,59,.12)!important;
            }
            #${OVERLAY_ID} .apes-aoc-event.apes-aoc-alarm-event.ready>strong,
            #${OVERLAY_ID} .apes-aoc-event.apes-aoc-alarm-event.ready>small{color:#bff08d!important}
        `;
        document.head.appendChild(style);
    }

    function signatureFor(nativeNodes, alarms) {
        const native = nativeNodes.map(node => `${nativeEventMs(node)}|${String(node.textContent || '').replace(/\s+/g, ' ').trim()}`).join('||');
        const now = Date.now();
        const alarm = alarms.map(item => {
            const ready = item.triggered === true || now >= Number(item.alarmAt) * 1000;
            return [item.id, item.villageId, item.alarmAt, item.finishAt, ready ? 1 : 0, item.triggered ? 1 : 0].join('|');
        }).join('||');
        return `${native}###${alarm}`;
    }

    function syncTimeline() {
        syncScheduled = false;
        injectStyles();
        const list = document.querySelector(EVENT_LIST_SELECTOR);
        if (!list) return;

        const alarms = readAlarms();
        const nativeNodes = [...list.querySelectorAll('.apes-aoc-event:not([data-apes-building-alarm-event])')];
        const signature = signatureFor(nativeNodes, alarms);
        const existingAlarmCount = list.querySelectorAll('[data-apes-building-alarm-event]').length;
        if (signature === lastSignature && existingAlarmCount === alarms.length) return;
        lastSignature = signature;

        list.querySelectorAll('[data-apes-building-alarm-event]').forEach(node => node.remove());
        const alarmEvents = alarms.map(alarmEvent).filter(Boolean);

        for (const alarm of alarmEvents) {
            nativeNodes.forEach(node => {
                if (node.isConnected && isMatchingGenericFreeFinish(node, alarm)) node.remove();
            });
            list.appendChild(eventNode(alarm));
        }

        const all = [...list.querySelectorAll('.apes-aoc-event')];
        all.sort((a, b) => {
            const aReady = a.classList.contains('apes-aoc-alarm-event') && a.classList.contains('ready');
            const bReady = b.classList.contains('apes-aoc-alarm-event') && b.classList.contains('ready');
            if (aReady !== bReady) return aReady ? -1 : 1;
            return nativeEventMs(a) - nativeEventMs(b);
        });
        all.forEach((node, index) => {
            if (index < MAX_EVENTS) list.appendChild(node);
            else node.remove();
        });

        if (!list.querySelector('.apes-aoc-event') && !list.querySelector('.apes-aoc-events-empty')) {
            list.innerHTML = '<span class="apes-aoc-events-empty">No upcoming account events found.</span>';
        } else if (list.querySelector('.apes-aoc-event')) {
            list.querySelector('.apes-aoc-events-empty')?.remove();
        }
    }

    function scheduleSync() {
        if (syncScheduled) return;
        syncScheduled = true;
        requestAnimationFrame(syncTimeline);
    }

    const begin = () => {
        injectStyles();
        const observer = new MutationObserver(scheduleSync);
        observer.observe(document.documentElement, { childList:true, subtree:true });
        window.addEventListener('qol_setting_changed', event => {
            if (event.detail?.key === 'buildingAlarm') {
                lastSignature = '';
                scheduleSync();
            }
        });
        window.addEventListener('hashchange', scheduleSync);
        window.setInterval(scheduleSync, POLL_MS);
        scheduleSync();
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, { once:true });
    else begin();
})();
