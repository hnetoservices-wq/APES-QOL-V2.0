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
    const STYLE_ID = 'qol-ss-history-date-picker-styles';

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

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${DIALOG_ID} .qol-ss-compare-field{
                display:flex!important;
                flex-direction:column!important;
                gap:4px!important;
                min-width:0!important;
            }

            #${DIALOG_ID} select.qol-ss-compare-select,
            #${DIALOG_ID} [data-compare-a],
            #${DIALOG_ID} [data-compare-b]{
                display:block!important;
                position:static!important;
                visibility:visible!important;
                opacity:1!important;
                pointer-events:auto!important;
                width:100%!important;
                min-width:180px!important;
                height:30px!important;
                min-height:30px!important;
                margin:0!important;
                padding:4px 28px 4px 8px!important;
                border:1px solid #aa9372!important;
                border-radius:4px!important;
                background:#fff!important;
                color:#432f1d!important;
                font:9px Arial,Helvetica,sans-serif!important;
                line-height:20px!important;
                appearance:auto!important;
                -webkit-appearance:menulist!important;
                box-shadow:none!important;
                transform:none!important;
                clip:auto!important;
                clip-path:none!important;
            }

            #${DIALOG_ID} select.qol-ss-compare-select option,
            #${DIALOG_ID} [data-compare-a] option,
            #${DIALOG_ID} [data-compare-b] option{
                display:block!important;
                background:#fff!important;
                color:#432f1d!important;
                font:10px Arial,Helvetica,sans-serif!important;
            }

            #${DIALOG_ID} select.qol-ss-compare-select:focus,
            #${DIALOG_ID} [data-compare-a]:focus,
            #${DIALOG_ID} [data-compare-b]:focus{
                outline:none!important;
                border-color:var(--qol-accent)!important;
                box-shadow:0 0 0 1px var(--qol-accent-soft)!important;
            }
        `;
        document.head.appendChild(style);
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

        injectStyles();

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

    injectStyles();

    const observer = new MutationObserver(() => {
        const dialog = document.getElementById(DIALOG_ID);
        if (dialog) enhanceDialog(dialog);
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();
