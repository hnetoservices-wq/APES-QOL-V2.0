/**
 * APES QoL — Building Alarm instant-finish cleanup
 *
 * Captures the construction identity before Travian removes/rebuilds the row.
 * The native alarm module's delayed cleanup can otherwise lose the finish
 * timestamp after a free Instant Finish action.
 */
(() => {
    'use strict';

    const FEATURE_KEY = 'buildingAlarm';
    const STORAGE_KEY = 'qol_building_alarms';
    const PANEL_ID = 'qol-building-alarm-panel';

    function isEnabled() {
        return typeof window.isQolEnabled === 'function'
            ? window.isQolEnabled(FEATURE_KEY) === true
            : true;
    }

    function serverNow() {
        const serverClock =
            document.querySelector('span[i18ndt][full="true"]') ||
            document.querySelector('#servertime[i18ndt], #servertime');
        const value = Number(serverClock?.getAttribute('i18ndt'));
        return Number.isFinite(value) ? value : Date.now() / 1000;
    }

    function villageId() {
        return String(location.hash || '').match(/villId:(\d+)/i)?.[1] || '';
    }

    function finishTime(contentRow) {
        if (!contentRow) return null;
        const countdown = contentRow.querySelector('.detailsTime span[countdown]');
        const progress = contentRow.querySelector('.progressbar[finish-time]');
        const value = Number(
            countdown?.getAttribute('countdown') ||
            progress?.getAttribute('finish-time')
        );
        return Number.isFinite(value) ? value : null;
    }

    function readAlarms() {
        try {
            const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(value) ? value : [];
        } catch (_) {
            return [];
        }
    }

    function saveAlarms(alarms) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
        } catch (_) {}
    }

    document.addEventListener('click', event => {
        if (!isEnabled()) return;

        const finishButton = event.target?.closest?.(
            'button[premium-feature="finishNow"]'
        );
        if (!finishButton) return;

        const contentRow = finishButton.closest('.detailsContent');
        const capturedFinishAt = finishTime(contentRow);
        const capturedVillageId = villageId();
        if (capturedFinishAt === null) return;

        const alarms = readAlarms();
        const matchingAlarm = alarms.find(alarm =>
            String(alarm.villageId || '') === String(capturedVillageId) &&
            Number(alarm.finishAt) === Number(capturedFinishAt)
        );

        // Preserve the previous rule: only a construction already inside the
        // free five-minute window is removed by an Instant Finish click.
        if (!matchingAlarm || serverNow() < Number(matchingAlarm.alarmAt)) return;

        const alarmId = String(matchingAlarm.id || '');

        window.setTimeout(() => {
            const panel = document.getElementById(PANEL_ID);
            const rows = panel
                ? Array.from(panel.querySelectorAll('[data-alarm-id]'))
                : [];
            const matchingRow = rows.find(row =>
                String(row.dataset.alarmId || '') === alarmId
            );
            const removeButton = matchingRow?.querySelector(
                '.qol-building-alarm-remove'
            );

            // Prefer the native panel's own remove handler so counts, sections,
            // clock state and summary all rerender through the normal path.
            if (removeButton) {
                removeButton.click();
                return;
            }

            // If the manager is closed, update storage directly. The next open
            // will render from the cleaned alarm list.
            const current = readAlarms();
            const remaining = current.filter(alarm =>
                String(alarm.id || '') !== alarmId
            );
            if (remaining.length !== current.length) saveAlarms(remaining);
        }, 700);
    }, true);
})();
