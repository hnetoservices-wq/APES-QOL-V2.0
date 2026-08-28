/**
 * APES QoL — Secret Society History Date Picker
 *
 * Makes SS scan comparison explicitly date-driven. The comparison dialog
 * opens blank, requires the user to choose an earlier Scan A and then a later
 * Scan B, and only enables Compare once both dated snapshots are selected.
 */
(() => {
    'use strict';

    const FEATURE_KEY = 'secretSocietyScanner';
    const HISTORY_STORAGE_KEY = 'apes_secret_society_history_v1';
    const PANEL_ID = 'qol-ss-scanner-panel';
    const DIALOG_ID = 'qol-ss-compare-dialog';

    function enabled() {
        return typeof window.isQolEnabled !== 'function' ||
            window.isQolEnabled(FEATURE_KEY) === true;
    }

    function serverKey() {
        return location.hostname.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    }

    function activeSocietyId() {
        const panel = document.getElementById(PANEL_ID);
        const active = panel?.querySelector('.qol-ss-tab.qol-active[data-ss-tab]');
        return String(active?.dataset.ssTab || '').trim();
    }

    function snapshotsForSociety(societyId) {
        try {
            const root = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '{}');
            const snapshots = root?.[serverKey()]?.[societyId]?.snapshots;
            return Array.isArray(snapshots)
                ? snapshots
                    .filter(snapshot => Number.isFinite(Number(snapshot?.scannedAt)))
                    .slice()
                    .sort((a, b) => Number(a.scannedAt) - Number(b.scannedAt))
                : [];
        } catch (_) {
            return [];
        }
    }

    function formatDate(timestamp) {
        const date = new Date(Number(timestamp));
        if (!Number.isFinite(date.getTime())) return 'Unknown date';
        return date.toLocaleString();
    }

    function optionHtml(snapshot) {
        const timestamp = Number(snapshot.scannedAt);
        const label = formatDate(timestamp);
        return `<option value="${timestamp}">${label}</option>`;
    }

    function resetComparisonResult(dialog) {
        const summary = dialog.querySelector('.qol-ss-compare-summary');
        const wrap = dialog.querySelector('.qol-ss-compare-table-wrap');
        if (summary) summary.textContent = 'Select an earlier Scan A and a later Scan B.';
        if (wrap) {
            wrap.innerHTML = '<div class="qol-ss-compare-empty">Choose two dated scans, then select Compare.</div>';
        }
    }

    function enhanceDialog(dialog) {
        if (!enabled() || !dialog || dialog.dataset.qolDatePickerBound === 'true') return;

        const societyId = activeSocietyId();
        const snapshots = snapshotsForSociety(societyId);
        const selectA = dialog.querySelector('[data-compare-a]');
        const selectB = dialog.querySelector('[data-compare-b]');
        const run = dialog.querySelector('[data-compare-run]');

        if (!societyId || snapshots.length < 2 || !selectA || !selectB || !run) return;
        dialog.dataset.qolDatePickerBound = 'true';

        const clearB = () => {
            selectB.innerHTML = '<option value="">Select Scan B…</option>';
            selectB.value = '';
            run.setAttribute('aria-disabled', 'true');
            resetComparisonResult(dialog);
        };

        const populateB = () => {
            const aTime = Number(selectA.value);
            const later = snapshots.filter(snapshot => Number(snapshot.scannedAt) > aTime);
            selectB.innerHTML = [
                '<option value="">Select Scan B…</option>',
                ...later.map(optionHtml)
            ].join('');
            selectB.value = '';
            run.setAttribute('aria-disabled', 'true');
            resetComparisonResult(dialog);
        };

        selectA.innerHTML = [
            '<option value="">Select Scan A…</option>',
            ...snapshots.slice(0, -1).map(optionHtml)
        ].join('');
        selectA.value = '';
        clearB();

        // Capture phase prevents secretSocietyHistory.js from automatically
        // selecting a Scan B after Scan A changes. The user must choose both.
        selectA.addEventListener('change', event => {
            event.stopImmediatePropagation();
            if (!selectA.value) clearB();
            else populateB();
        }, true);

        selectB.addEventListener('change', event => {
            event.stopImmediatePropagation();
            const valid = Boolean(
                selectA.value &&
                selectB.value &&
                Number(selectB.value) > Number(selectA.value)
            );
            run.setAttribute('aria-disabled', String(!valid));
            resetComparisonResult(dialog);
        }, true);
    }

    const observer = new MutationObserver(() => {
        const dialog = document.getElementById(DIALOG_ID);
        if (dialog) enhanceDialog(dialog);
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
