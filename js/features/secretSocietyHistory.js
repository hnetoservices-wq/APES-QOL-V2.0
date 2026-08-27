/**
 * APES QoL — Secret Society Scan History & Comparison
 *
 * Keeps full local snapshots of each completed Secret Society scan and adds
 * membership notifications plus arbitrary Scan A -> Scan B comparisons.
 * The original scanner remains responsible for navigation and data capture.
 */
(() => {
    'use strict';

    const FEATURE_KEY = 'secretSocietyScanner';
    const CURRENT_STORAGE_KEY = 'apes_secret_society_scans_v1';
    const HISTORY_STORAGE_KEY = 'apes_secret_society_history_v1';
    const PANEL_ID = 'qol-ss-scanner-panel';
    const DIALOG_ID = 'qol-ss-compare-dialog';
    const STYLE_ID = 'qol-ss-history-styles';
    const HISTORY_LIMIT = 50;
    const SYNC_INTERVAL = 800;

    const COLUMNS = Object.freeze([
        { key: 'rank', label: 'Rank', numeric: true },
        { key: 'name', label: 'Member', numeric: false },
        { key: 'villages', label: 'Villages', numeric: true },
        { key: 'population', label: 'Population', numeric: true },
        { key: 'resourcesSent', label: 'Resources Sent', numeric: true },
        { key: 'troopsLostInDefense', label: 'Troops Lost in Defense', numeric: true },
        { key: 'troopsCurrentlyProvided', label: 'Troops Currently Provided', numeric: true }
    ]);

    let lastCurrentSignature = '';
    let uiRefreshQueued = false;
    let deleteCheckTimer = null;

    function enabled() {
        return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY) === true;
    }

    function serverKey() {
        return location.hostname.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    }

    function cleanText(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    }

    function normalizedText(value) {
        return cleanText(value).toLocaleLowerCase();
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function numericValue(value) {
        const source = cleanText(value);
        const digits = source.replace(/\D/g, '');
        if (!digits) return null;
        const parsed = Number(digits) * (/^-/.test(source) ? -1 : 1);
        return Number.isSafeInteger(parsed) ? parsed : null;
    }

    function formatMetric(value) {
        const numeric = numericValue(value);
        return numeric == null ? (cleanText(value) || '—') : numeric.toLocaleString();
    }

    function memberKey(member) {
        return String(member?.playerId || normalizedText(member?.name));
    }

    function compactMember(member) {
        return {
            rank: cleanText(member?.rank),
            name: cleanText(member?.name),
            playerId: cleanText(member?.playerId),
            villages: cleanText(member?.villages),
            population: cleanText(member?.population),
            resourcesSent: cleanText(member?.resourcesSent),
            troopsLostInDefense: cleanText(member?.troopsLostInDefense),
            troopsCurrentlyProvided: cleanText(member?.troopsCurrentlyProvided)
        };
    }

    function summarizeMembers(members, scannedAt) {
        return {
            scannedAt: Number(scannedAt) || Date.now(),
            memberCount: members.length,
            villages: members.reduce((sum, member) => sum + (numericValue(member.villages) || 0), 0),
            population: members.reduce((sum, member) => sum + (numericValue(member.population) || 0), 0)
        };
    }

    function readCurrentScans() {
        try {
            const root = JSON.parse(localStorage.getItem(CURRENT_STORAGE_KEY) || '{}');
            return Array.isArray(root[serverKey()]) ? root[serverKey()] : [];
        } catch (_) {
            return [];
        }
    }

    function readHistoryRoot() {
        try {
            const root = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '{}');
            return root && typeof root === 'object' ? root : {};
        } catch (_) {
            return {};
        }
    }

    function writeHistoryRoot(root) {
        try {
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(root));
        } catch (error) {
            console.warn('[APES Secret Society History] Storage write failed:', error);
        }
    }

    function historyForSociety(societyId) {
        const society = readHistoryRoot()?.[serverKey()]?.[societyId];
        return Array.isArray(society?.snapshots)
            ? society.snapshots.slice().sort((a, b) => Number(a.scannedAt) - Number(b.scannedAt))
            : [];
    }

    function societyHistoryMeta(societyId) {
        return readHistoryRoot()?.[serverKey()]?.[societyId] || null;
    }

    function archiveCurrentScans() {
        if (!enabled()) return false;
        const scans = readCurrentScans();
        if (!scans.length) return false;

        const signature = scans
            .map(scan => `${cleanText(scan?.id)}:${Number(scan?.scannedAt) || 0}:${Array.isArray(scan?.members) ? scan.members.length : 0}`)
            .sort()
            .join('|');
        if (signature === lastCurrentSignature) return false;
        lastCurrentSignature = signature;

        const root = readHistoryRoot();
        const server = serverKey();
        if (!root[server] || typeof root[server] !== 'object') root[server] = {};
        let changed = false;

        scans.forEach(scan => {
            const id = cleanText(scan?.id);
            const scannedAt = Number(scan?.scannedAt);
            const members = Array.isArray(scan?.members)
                ? scan.members.map(compactMember).filter(member => member.name)
                : [];
            if (!id || !Number.isFinite(scannedAt) || scannedAt <= 0 || !members.length) return;

            const society = root[server][id] && typeof root[server][id] === 'object'
                ? root[server][id]
                : { id, name: cleanText(scan?.name) || 'Secret Society', snapshots: [] };

            society.id = id;
            society.name = cleanText(scan?.name) || society.name || 'Secret Society';
            society.societyId = cleanText(scan?.societyId);
            society.route = cleanText(scan?.route);
            if (!Array.isArray(society.snapshots)) society.snapshots = [];

            if (!society.snapshots.some(snapshot => Number(snapshot?.scannedAt) === scannedAt)) {
                society.snapshots.push({
                    scannedAt,
                    summary: summarizeMembers(members, scannedAt),
                    members
                });
                society.snapshots = society.snapshots
                    .filter(snapshot => Number.isFinite(Number(snapshot?.scannedAt)))
                    .sort((a, b) => Number(a.scannedAt) - Number(b.scannedAt))
                    .slice(-HISTORY_LIMIT);
                changed = true;
            }

            root[server][id] = society;
        });

        if (changed) writeHistoryRoot(root);
        return changed;
    }

    function clearHistoryForServer() {
        const root = readHistoryRoot();
        delete root[serverKey()];
        writeHistoryRoot(root);
        lastCurrentSignature = '';
    }

    function activeSocietyId() {
        const panel = document.getElementById(PANEL_ID);
        const activeTab = panel?.querySelector('.qol-ss-tab.qol-active[data-ss-tab]');
        if (activeTab?.dataset.ssTab) return activeTab.dataset.ssTab;
        return cleanText(readCurrentScans()[0]?.id);
    }

    function societyName(societyId) {
        const current = readCurrentScans().find(scan => cleanText(scan?.id) === societyId);
        return cleanText(current?.name) || cleanText(societyHistoryMeta(societyId)?.name) || 'Secret Society';
    }

    function formatScanDate(timestamp) {
        const date = new Date(Number(timestamp));
        return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Unknown date';
    }

    function memberChanges(snapshotA, snapshotB) {
        const a = new Map((snapshotA?.members || []).map(member => [memberKey(member), member]));
        const b = new Map((snapshotB?.members || []).map(member => [memberKey(member), member]));
        const joined = [];
        const left = [];

        b.forEach((member, key) => {
            if (!a.has(key)) joined.push(member);
        });
        a.forEach((member, key) => {
            if (!b.has(key)) left.push(member);
        });

        const sort = (x, y) => x.name.localeCompare(y.name, undefined, { numeric: true, sensitivity: 'base' });
        joined.sort(sort);
        left.sort(sort);
        return { joined, left };
    }

    function comparisonRows(snapshotA, snapshotB) {
        const a = new Map((snapshotA?.members || []).map(member => [memberKey(member), member]));
        const b = new Map((snapshotB?.members || []).map(member => [memberKey(member), member]));
        const order = { joined: 0, left: 1, stayed: 2 };

        return [...new Set([...a.keys(), ...b.keys()])].map(key => {
            const before = a.get(key) || null;
            const after = b.get(key) || null;
            const status = !before ? 'joined' : !after ? 'left' : 'stayed';
            return {
                before,
                after,
                status,
                name: cleanText(after?.name || before?.name)
            };
        }).sort((left, right) => {
            if (order[left.status] !== order[right.status]) return order[left.status] - order[right.status];
            return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
        });
    }

    function deltaHtml(before, after) {
        const a = numericValue(before);
        const b = numericValue(after);
        if (a == null || b == null) return '';
        const delta = b - a;
        const tone = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'stationary';
        const text = delta > 0 ? `+${delta.toLocaleString()}` : delta.toLocaleString();
        return `<small class="qol-ss-compare-delta qol-${tone}">${escapeHtml(text)}</small>`;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${PANEL_ID} .qol-ss-history-notice{display:flex!important;flex-wrap:wrap!important;align-items:flex-start!important;gap:5px 12px!important;flex:0 0 auto!important;min-height:32px!important;padding:7px 9px!important;border:1px solid #cdbb9d!important;border-radius:4px!important;background:#fffaf0!important;color:#5f4931!important;font:9px/1.35 Arial,Helvetica,sans-serif!important}
            #${PANEL_ID} .qol-ss-history-notice-title{flex:0 0 100%!important;color:var(--qol-accent-deep)!important;font-size:8px!important;font-weight:800!important;letter-spacing:.35px!important;text-transform:uppercase!important}
            #${PANEL_ID} .qol-ss-history-line{display:flex!important;align-items:flex-start!important;gap:5px!important;min-width:0!important;max-width:100%!important}
            #${PANEL_ID} .qol-ss-history-line strong{flex:0 0 auto!important;font-size:9px!important}
            #${PANEL_ID} .qol-ss-history-line span{white-space:normal!important;overflow-wrap:anywhere!important}
            #${PANEL_ID} .qol-ss-history-joined strong{color:#35651f!important}
            #${PANEL_ID} .qol-ss-history-left strong{color:#8b2922!important}
            #${PANEL_ID} .qol-ss-history-none{color:#87745c!important;font-style:italic!important}
            #${PANEL_ID} .qol-ss-history-meta{margin-left:auto!important;color:#97836b!important;font-size:8px!important}

            #${DIALOG_ID}{position:fixed!important;inset:0!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:20px!important;background:rgba(20,16,11,.68)!important}
            #${DIALOG_ID},#${DIALOG_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${DIALOG_ID} .qol-ss-compare-card{display:flex!important;flex-direction:column!important;width:min(1180px,calc(100vw - 34px))!important;height:min(720px,calc(100vh - 34px))!important;overflow:hidden!important;border:3px solid var(--qol-border)!important;border-radius:7px!important;background:#f7f5f0!important;box-shadow:0 18px 52px rgba(0,0,0,.56)!important;color:#432f1d!important}
            #${DIALOG_ID} .qol-ss-compare-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;min-height:41px!important;padding:0 10px 0 13px!important;background:linear-gradient(var(--qol-accent-mid),var(--qol-accent-deep))!important;color:#fffaf0!important}
            #${DIALOG_ID} .qol-ss-compare-title{font-size:13px!important;font-weight:800!important}
            #${DIALOG_ID} .qol-ss-compare-close{display:flex!important;align-items:center!important;justify-content:center!important;width:25px!important;height:25px!important;border-radius:4px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;font-size:19px!important;cursor:pointer!important}
            #${DIALOG_ID} .qol-ss-compare-controls{display:grid!important;grid-template-columns:minmax(190px,1fr) 24px minmax(190px,1fr) auto!important;align-items:end!important;gap:8px!important;padding:10px!important;border-bottom:1px solid #d1c1a7!important;background:#f1e9dc!important}
            #${DIALOG_ID} .qol-ss-compare-field{display:flex!important;flex-direction:column!important;gap:4px!important;min-width:0!important}
            #${DIALOG_ID} .qol-ss-compare-field span{color:#6d5437!important;font-size:8px!important;font-weight:800!important;text-transform:uppercase!important}
            #${DIALOG_ID} .qol-ss-compare-select{width:100%!important;height:29px!important;padding:3px 7px!important;border:1px solid #aa9372!important;border-radius:4px!important;background:#fff!important;color:#432f1d!important;font-size:9px!important;appearance:auto!important;-webkit-appearance:auto!important}
            #${DIALOG_ID} .qol-ss-compare-arrow{padding-bottom:7px!important;color:#8a7253!important;font-size:16px!important;text-align:center!important}
            #${DIALOG_ID} .qol-ss-compare-run{display:inline-flex!important;align-items:center!important;justify-content:center!important;height:29px!important;padding:5px 13px!important;border:1px solid var(--qol-action-border)!important;border-radius:4px!important;background:linear-gradient(var(--qol-accent),var(--qol-accent-gradient-end))!important;color:#fff8e9!important;font-size:9px!important;font-weight:800!important;cursor:pointer!important;white-space:nowrap!important}
            #${DIALOG_ID} .qol-ss-compare-run[aria-disabled="true"]{opacity:.5!important;pointer-events:none!important}
            #${DIALOG_ID} .qol-ss-compare-summary{display:flex!important;flex-wrap:wrap!important;gap:6px 15px!important;padding:7px 10px!important;border-bottom:1px solid #ded0ba!important;background:#fffaf0!important;color:#6c5539!important;font-size:8.5px!important}
            #${DIALOG_ID} .qol-ss-compare-summary strong{color:#432f1d!important}
            #${DIALOG_ID} .qol-ss-compare-table-wrap{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;margin:10px!important;border:1px solid #cdbb9d!important;border-radius:4px!important;background:#fff!important;scrollbar-width:thin!important;scrollbar-color:var(--qol-scroll-thumb) #e7ded1!important}
            #${DIALOG_ID} table{width:100%!important;min-width:1750px!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:8.5px!important}
            #${DIALOG_ID} th{position:sticky!important;z-index:3!important;padding:5px 6px!important;border-right:1px solid #cab895!important;border-bottom:1px solid #bda986!important;background:#e5d4b8!important;color:#533b22!important;text-align:center!important;font-size:7.5px!important;text-transform:uppercase!important;white-space:nowrap!important}
            #${DIALOG_ID} thead tr:first-child th{top:0!important}
            #${DIALOG_ID} thead tr:nth-child(2) th{top:25px!important;background:#efe2cc!important}
            #${DIALOG_ID} td{height:29px!important;padding:4px 6px!important;border-top:1px solid #eadfce!important;border-right:1px solid #f0e7d9!important;color:#4d3824!important;text-align:right!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
            #${DIALOG_ID} tbody tr:hover td{background:#fff8e7!important}
            #${DIALOG_ID} .qol-ss-compare-text{text-align:left!important}
            #${DIALOG_ID} .qol-ss-compare-status{text-align:center!important}
            #${DIALOG_ID} .qol-ss-status-badge{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:47px!important;padding:2px 5px!important;border-radius:999px!important;font-size:7px!important;font-weight:800!important;text-transform:uppercase!important}
            #${DIALOG_ID} .qol-ss-status-joined{background:#e5f2d9!important;color:#35651f!important}
            #${DIALOG_ID} .qol-ss-status-left{background:#f4dedb!important;color:#8b2922!important}
            #${DIALOG_ID} .qol-ss-status-stayed{background:#eee7dc!important;color:#79654d!important}
            #${DIALOG_ID} .qol-ss-compare-delta{display:block!important;margin-top:1px!important;font-size:7px!important;font-weight:700!important}
            #${DIALOG_ID} .qol-positive{color:#35651f!important}
            #${DIALOG_ID} .qol-negative{color:#8b2922!important}
            #${DIALOG_ID} .qol-stationary{color:#967016!important}
            #${DIALOG_ID} .qol-ss-compare-empty{padding:38px 20px!important;color:#765f45!important;text-align:center!important;font-size:10px!important}

            @media(max-width:760px){#${DIALOG_ID}{padding:8px!important}#${DIALOG_ID} .qol-ss-compare-card{width:calc(100vw - 16px)!important;height:calc(100vh - 16px)!important}#${DIALOG_ID} .qol-ss-compare-controls{grid-template-columns:1fr!important}#${DIALOG_ID} .qol-ss-compare-arrow{display:none!important}}
        `;
        document.head.appendChild(style);
    }

    function renderComparison(dialog, societyId) {
        const snapshots = historyForSociety(societyId);
        const selectA = dialog.querySelector('[data-compare-a]');
        const selectB = dialog.querySelector('[data-compare-b]');
        const summary = dialog.querySelector('.qol-ss-compare-summary');
        const wrap = dialog.querySelector('.qol-ss-compare-table-wrap');
        const run = dialog.querySelector('[data-compare-run]');
        if (!selectA || !selectB || !summary || !wrap || !run) return;

        const aTime = Number(selectA.value);
        const bTime = Number(selectB.value);
        const snapshotA = snapshots.find(snapshot => Number(snapshot.scannedAt) === aTime);
        const snapshotB = snapshots.find(snapshot => Number(snapshot.scannedAt) === bTime);
        const valid = Boolean(snapshotA && snapshotB && bTime > aTime);
        run.setAttribute('aria-disabled', String(!valid));

        if (!valid) {
            summary.textContent = 'Select an earlier Scan A and a later Scan B.';
            wrap.innerHTML = '<div class="qol-ss-compare-empty">Choose two stored scans to compare.</div>';
            return;
        }

        const changes = memberChanges(snapshotA, snapshotB);
        const rows = comparisonRows(snapshotA, snapshotB);
        summary.innerHTML = `
            <span><strong>Scan A:</strong> ${escapeHtml(formatScanDate(aTime))}</span>
            <span><strong>Scan B:</strong> ${escapeHtml(formatScanDate(bTime))}</span>
            <span class="qol-positive"><strong>${changes.joined.length}</strong> joined</span>
            <span class="qol-negative"><strong>${changes.left.length}</strong> left</span>
            <span><strong>${rows.filter(row => row.status === 'stayed').length}</strong> remained</span>
        `;

        const grouped = COLUMNS.map(column => `<th colspan="2">${escapeHtml(column.label)}</th>`).join('');
        const subheads = COLUMNS.map(() => '<th>A</th><th>B / Δ</th>').join('');
        const tableRows = rows.map(row => {
            const statusLabel = row.status === 'joined' ? 'Joined' : row.status === 'left' ? 'Left' : 'Stayed';
            const cells = COLUMNS.map(column => {
                const beforeValue = row.before?.[column.key];
                const afterValue = row.after?.[column.key];
                const beforeText = row.before ? (column.numeric ? formatMetric(beforeValue) : cleanText(beforeValue) || '—') : '—';
                const afterText = row.after ? (column.numeric ? formatMetric(afterValue) : cleanText(afterValue) || '—') : '—';
                const delta = column.numeric && row.before && row.after ? deltaHtml(beforeValue, afterValue) : '';
                const className = column.numeric ? '' : ' class="qol-ss-compare-text"';
                return `<td${className}>${escapeHtml(beforeText)}</td><td${className}>${escapeHtml(afterText)}${delta}</td>`;
            }).join('');

            return `
                <tr>
                    <td class="qol-ss-compare-status"><span class="qol-ss-status-badge qol-ss-status-${row.status}">${statusLabel}</span></td>
                    ${cells}
                </tr>
            `;
        }).join('');

        wrap.innerHTML = `
            <table>
                <colgroup>
                    <col style="width:62px">
                    ${COLUMNS.map(column => column.numeric
                        ? '<col style="width:85px"><col style="width:101px">'
                        : '<col style="width:145px"><col style="width:145px">').join('')}
                </colgroup>
                <thead>
                    <tr><th rowspan="2">Status</th>${grouped}</tr>
                    <tr>${subheads}</tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        `;
    }

    function populateLaterSelect(dialog, societyId, preferredB = null) {
        const snapshots = historyForSociety(societyId);
        const selectA = dialog.querySelector('[data-compare-a]');
        const selectB = dialog.querySelector('[data-compare-b]');
        if (!selectA || !selectB) return;

        const aTime = Number(selectA.value);
        const later = snapshots.filter(snapshot => Number(snapshot.scannedAt) > aTime);
        selectB.innerHTML = later.map(snapshot =>
            `<option value="${Number(snapshot.scannedAt)}">${escapeHtml(formatScanDate(snapshot.scannedAt))}</option>`
        ).join('');

        const preferred = Number(preferredB);
        if (later.some(snapshot => Number(snapshot.scannedAt) === preferred)) {
            selectB.value = String(preferred);
        } else if (later.length) {
            selectB.value = String(later[later.length - 1].scannedAt);
        }
    }

    function openCompareDialog(societyId) {
        const snapshots = historyForSociety(societyId);
        if (snapshots.length < 2) return;

        document.getElementById(DIALOG_ID)?.remove();
        const dialog = document.createElement('div');
        dialog.id = DIALOG_ID;
        dialog.innerHTML = `
            <div class="qol-ss-compare-card" role="dialog" aria-modal="true" aria-label="Compare Secret Society scans">
                <div class="qol-ss-compare-head">
                    <span class="qol-ss-compare-title">Compare SS Scan · ${escapeHtml(societyName(societyId))}</span>
                    <div class="qol-ss-compare-close" role="button" tabindex="0" aria-label="Close">×</div>
                </div>
                <div class="qol-ss-compare-controls">
                    <label class="qol-ss-compare-field">
                        <span>Scan A · Earlier</span>
                        <select class="qol-ss-compare-select" data-compare-a></select>
                    </label>
                    <div class="qol-ss-compare-arrow">→</div>
                    <label class="qol-ss-compare-field">
                        <span>Scan B · Later</span>
                        <select class="qol-ss-compare-select" data-compare-b></select>
                    </label>
                    <div class="qol-ss-compare-run" data-compare-run role="button" tabindex="0">Compare</div>
                </div>
                <div class="qol-ss-compare-summary"></div>
                <div class="qol-ss-compare-table-wrap"></div>
            </div>
        `;
        document.body.appendChild(dialog);

        const selectA = dialog.querySelector('[data-compare-a]');
        const selectB = dialog.querySelector('[data-compare-b]');
        const run = dialog.querySelector('[data-compare-run]');
        selectA.innerHTML = snapshots.slice(0, -1).map(snapshot =>
            `<option value="${Number(snapshot.scannedAt)}">${escapeHtml(formatScanDate(snapshot.scannedAt))}</option>`
        ).join('');
        selectA.value = String(snapshots[snapshots.length - 2].scannedAt);
        populateLaterSelect(dialog, societyId, snapshots[snapshots.length - 1].scannedAt);
        renderComparison(dialog, societyId);

        const close = () => dialog.remove();
        const closeButton = dialog.querySelector('.qol-ss-compare-close');
        closeButton.addEventListener('click', close);
        closeButton.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') close();
        });
        dialog.addEventListener('click', event => {
            if (event.target === dialog) close();
        });
        selectA.addEventListener('change', () => {
            populateLaterSelect(dialog, societyId);
        });
        const compare = event => {
            event?.preventDefault();
            if (run.getAttribute('aria-disabled') === 'true') return;
            renderComparison(dialog, societyId);
        };
        run.addEventListener('click', compare);
        run.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') compare(event);
        });
        selectB.addEventListener('change', () => run.setAttribute('aria-disabled', 'false'));
    }

    function noticeSignature(societyId, snapshots) {
        return `${societyId}|${snapshots.map(snapshot => Number(snapshot.scannedAt)).join(',')}`;
    }

    function noticeHtml(snapshots) {
        if (snapshots.length < 2) {
            return `
                <div class="qol-ss-history-notice-title">Membership notifications</div>
                <span class="qol-ss-history-none">A second scan is needed before APES can detect players joining or leaving.</span>
                <span class="qol-ss-history-meta">${snapshots.length} stored scan${snapshots.length === 1 ? '' : 's'}</span>
            `;
        }

        const before = snapshots[snapshots.length - 2];
        const after = snapshots[snapshots.length - 1];
        const changes = memberChanges(before, after);
        const lines = [];

        if (changes.joined.length) {
            lines.push(`
                <div class="qol-ss-history-line qol-ss-history-joined">
                    <strong>+ Joined:</strong><span>${escapeHtml(changes.joined.map(member => member.name).join(', '))}</span>
                </div>
            `);
        }
        if (changes.left.length) {
            lines.push(`
                <div class="qol-ss-history-line qol-ss-history-left">
                    <strong>− Left:</strong><span>${escapeHtml(changes.left.map(member => member.name).join(', '))}</span>
                </div>
            `);
        }
        if (!lines.length) {
            lines.push('<span class="qol-ss-history-none">No players joined or left since the previous scan.</span>');
        }

        return `
            <div class="qol-ss-history-notice-title">Membership notifications</div>
            ${lines.join('')}
            <span class="qol-ss-history-meta">${escapeHtml(formatScanDate(before.scannedAt))} → ${escapeHtml(formatScanDate(after.scannedAt))} · ${snapshots.length} stored</span>
        `;
    }

    function bindDeleteMirror(panel) {
        const button = panel.querySelector('[data-ss-delete]');
        if (!button || button.dataset.qolHistoryDeleteBound === 'true') return;
        button.dataset.qolHistoryDeleteBound = 'true';
        button.addEventListener('click', () => {
            window.clearTimeout(deleteCheckTimer);
            deleteCheckTimer = window.setTimeout(() => {
                if (!readCurrentScans().length) {
                    clearHistoryForServer();
                    scheduleUiRefresh();
                }
            }, 900);
        });
    }

    function injectPanelHistoryUi() {
        if (!enabled()) return;
        const panel = document.getElementById(PANEL_ID);
        if (!panel?.classList.contains('qol-ss-open')) return;

        const societyId = activeSocietyId();
        if (!societyId) return;
        const toolbar = panel.querySelector('.qol-ss-toolbar');
        const summary = panel.querySelector('.qol-ss-summary');
        if (!toolbar || !summary) return;

        const snapshots = historyForSociety(societyId);
        let compare = toolbar.querySelector('[data-ss-compare-history]');
        if (!compare) {
            compare = document.createElement('div');
            compare.className = 'qol-ss-action';
            compare.dataset.ssCompareHistory = 'true';
            compare.setAttribute('role', 'button');
            compare.setAttribute('tabindex', '0');
            compare.textContent = 'Compare SS Scan';
            const deleteButton = toolbar.querySelector('[data-ss-delete]');
            toolbar.insertBefore(compare, deleteButton || null);

            const open = event => {
                event?.preventDefault();
                event?.stopPropagation();
                if (compare.getAttribute('aria-disabled') === 'true') return;
                openCompareDialog(activeSocietyId());
            };
            compare.addEventListener('click', open);
            compare.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') open(event);
            });
        }
        compare.setAttribute('aria-disabled', String(snapshots.length < 2));
        compare.title = snapshots.length < 2
            ? 'At least two stored scans are required.'
            : `${snapshots.length} stored scans available`;

        let notice = panel.querySelector('.qol-ss-history-notice');
        if (!notice) {
            notice = document.createElement('div');
            notice.className = 'qol-ss-history-notice';
            summary.insertAdjacentElement('afterend', notice);
        }

        const signature = noticeSignature(societyId, snapshots);
        if (notice.dataset.qolHistorySignature !== signature) {
            notice.dataset.qolHistorySignature = signature;
            notice.innerHTML = noticeHtml(snapshots);
        }

        bindDeleteMirror(panel);
    }

    function scheduleUiRefresh() {
        if (uiRefreshQueued) return;
        uiRefreshQueued = true;
        window.setTimeout(() => {
            uiRefreshQueued = false;
            injectPanelHistoryUi();
        }, 50);
    }

    function sync() {
        const changed = archiveCurrentScans();
        if (changed) scheduleUiRefresh();
        else injectPanelHistoryUi();
    }

    function start() {
        injectStyles();
        sync();

        const observer = new MutationObserver(scheduleUiRefresh);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.setInterval(sync, SYNC_INTERVAL);

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') document.getElementById(DIALOG_ID)?.remove();
        });

        window.addEventListener('qol_setting_changed', event => {
            if (event.detail?.key !== FEATURE_KEY) return;
            if (event.detail.enabled) sync();
            else document.getElementById(DIALOG_ID)?.remove();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
