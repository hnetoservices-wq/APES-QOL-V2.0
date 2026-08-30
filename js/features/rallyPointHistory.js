/**
 * APES QoL v2 — Rally Point Scan History / Delta
 *
 * Observes successful scans from the unified Rally Point workflow, stores
 * player/server-scoped snapshots, and compares any two scans without owning
 * Rally Point pagination itself.
 */
(() => {
    'use strict';

    const FEATURE_KEY = 'rallyPointParser';
    const STORAGE_FEATURE = 'rallyPointHistory';
    const STORAGE_KEY = 'snapshots';
    const PANEL_ID = 'qol-rally-point-scanner';
    const STYLE_ID = 'qol-rally-point-history-styles';
    const HISTORY_TAB = 'history';
    const MAX_SNAPSHOTS_PER_KIND = 50;
    const POLL_MS = 180;

    const KINDS = Object.freeze({
        incoming: Object.freeze({
            label: 'Incomings',
            panel: '[data-qol-rally-panel="incomings"]',
            status: '#qol-merge-status',
            subjectLabel: 'Enemy'
        }),
        outgoing: Object.freeze({
            label: 'Outgoings',
            panel: '[data-qol-rally-panel="outgoings"]',
            status: '#qol-outgoing-status',
            subjectLabel: 'Target'
        })
    });

    const lifecycle = {
        incoming: { inProgress: false, saving: false },
        outgoing: { inProgress: false, saving: false }
    };

    let snapshots = [];
    let loaded = false;
    let loadingPromise = null;
    let pollTimer = null;
    let selectedKind = 'incoming';
    let selectedA = '';
    let selectedB = '';
    const latestDelta = { incoming: null, outgoing: null };

    function enabled() {
        return typeof window.isQolEnabled !== 'function' ||
            window.isQolEnabled(FEATURE_KEY) === true;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function clean(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function normalize(value) {
        return clean(value).toLowerCase();
    }

    function fallbackStorageKey() {
        const server = String(window.location.hostname || 'unknown').toLowerCase();
        const player = String(window.APES?.context?.getPlayerId?.() || 'unknown');
        return `qol_rally_history_v1:${server}:${player}`;
    }

    async function loadSnapshots() {
        if (loaded) return snapshots;
        if (loadingPromise) return loadingPromise;

        loadingPromise = (async () => {
            let stored = [];
            try {
                if (window.APES?.storage) {
                    stored = await window.APES.storage.get({
                        feature: STORAGE_FEATURE,
                        key: STORAGE_KEY,
                        scope: 'player'
                    }, []);
                } else {
                    stored = JSON.parse(localStorage.getItem(fallbackStorageKey()) || '[]');
                }
            } catch (error) {
                console.warn('[APES Rally History] Could not load snapshots.', error);
                stored = [];
            }

            snapshots = Array.isArray(stored)
                ? stored.filter(item => item && KINDS[item.kind] && Array.isArray(item.items))
                : [];
            loaded = true;
            loadingPromise = null;
            return snapshots;
        })();

        return loadingPromise;
    }

    async function persistSnapshots() {
        try {
            if (window.APES?.storage) {
                await window.APES.storage.set({
                    feature: STORAGE_FEATURE,
                    key: STORAGE_KEY,
                    scope: 'player'
                }, snapshots);
            } else {
                localStorage.setItem(fallbackStorageKey(), JSON.stringify(snapshots));
            }
        } catch (error) {
            console.warn('[APES Rally History] Could not save snapshots.', error);
        }
    }

    function getVillageContext() {
        const context = window.APES?.context?.snapshot?.() || {};
        const villageId = String(context.villageId || '').trim();
        let villageName = clean(context.villageName || 'Current village');
        let x = null;
        let y = null;

        try {
            const villages = window.APES_VILLAGE_PALETTE?.getVillages?.();
            const current = Array.isArray(villages)
                ? villages.find(village => String(village?.villageId || '') === villageId)
                : null;
            if (current) {
                villageName = clean(current.name || villageName);
                const cx = Number(current.x);
                const cy = Number(current.y);
                if (Number.isFinite(cx) && Number.isFinite(cy)) {
                    x = cx;
                    y = cy;
                }
            }
        } catch (_) {
            // Context name is enough when dashboard cache is unavailable.
        }

        return { villageId, villageName, x, y };
    }

    function rowCells(row) {
        return Array.from(row.querySelectorAll('td')).map(cell => clean(cell.textContent));
    }

    function baseIdentity(kind, item) {
        return [
            kind,
            normalize(item.subject),
            normalize(item.village),
            normalize(item.type),
            normalize(item.landing)
        ].join('|');
    }

    function stabilizeItems(kind, rawItems) {
        const counts = new Map();
        return rawItems.map(item => {
            const base = baseIdentity(kind, item);
            const occurrence = (counts.get(base) || 0) + 1;
            counts.set(base, occurrence);
            return {
                ...item,
                identity: `${base}#${occurrence}`
            };
        });
    }

    function scrape(kind) {
        const config = KINDS[kind];
        const root = document.querySelector(`#${PANEL_ID} ${config.panel}`);
        if (!root) return [];

        const rows = Array.from(root.querySelectorAll('.qol-rp-table tbody tr'));
        const raw = rows.map(row => {
            const cells = rowCells(row);
            if (cells.length < 5) return null;
            return {
                subject: cells[0],
                village: cells[1],
                type: cells[2],
                remaining: cells[3],
                landing: cells[4]
            };
        }).filter(Boolean);

        return stabilizeItems(kind, raw);
    }

    function snapshotList(kind) {
        return snapshots
            .filter(snapshot => snapshot.kind === kind)
            .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    }

    function compareSnapshots(a, b) {
        if (!a || !b) {
            return { rows: [], newItems: [], removedItems: [], unchangedItems: [] };
        }

        const aMap = new Map((a.items || []).map(item => [item.identity, item]));
        const bMap = new Map((b.items || []).map(item => [item.identity, item]));
        const newItems = [];
        const removedItems = [];
        const unchangedItems = [];
        const rows = [];

        bMap.forEach((item, identity) => {
            if (aMap.has(identity)) {
                const previous = aMap.get(identity);
                unchangedItems.push(item);
                rows.push({ status: 'unchanged', item, previous });
            } else {
                newItems.push(item);
                rows.push({ status: 'new', item, previous: null });
            }
        });

        aMap.forEach((item, identity) => {
            if (bMap.has(identity)) return;
            removedItems.push(item);
            rows.push({ status: 'removed', item, previous: item });
        });

        const order = { new: 0, removed: 1, unchanged: 2 };
        rows.sort((left, right) => {
            return order[left.status] - order[right.status] ||
                String(left.item.landing || '').localeCompare(String(right.item.landing || '')) ||
                String(left.item.subject || '').localeCompare(String(right.item.subject || ''));
        });

        return { rows, newItems, removedItems, unchangedItems };
    }

    function trimHistory() {
        const kept = [];
        Object.keys(KINDS).forEach(kind => {
            kept.push(...snapshotList(kind).slice(0, MAX_SNAPSHOTS_PER_KIND));
        });
        snapshots = kept.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    }

    function formatSnapshotLabel(snapshot) {
        if (!snapshot) return '-';
        const date = new Date(Number(snapshot.createdAt || 0));
        const stamp = Number.isNaN(date.getTime())
            ? 'Unknown time'
            : date.toLocaleString([], {
                year: 'numeric', month: 'short', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        const village = clean(snapshot.villageName || 'Village');
        return `${stamp} · ${snapshot.items?.length || 0} · ${village}`;
    }

    function snapshotHeader(snapshot) {
        if (!snapshot || snapshot.kind !== 'incoming') return '';
        const village = clean(snapshot.villageName || 'Current village');
        if (Number.isFinite(Number(snapshot.x)) && Number.isFinite(Number(snapshot.y))) {
            return `${village} - (${snapshot.x}|${snapshot.y})`;
        }
        return village;
    }

    function copyLine(kind, item) {
        if (kind === 'incoming') {
            return `${item.type} by ${item.subject} from ${item.village} in ${item.remaining} at ${item.landing}`;
        }
        return `${item.type} to ${item.subject} at ${item.village} in ${item.remaining} at ${item.landing}`;
    }

    function copyText(snapshot, items) {
        const lines = (items || []).map(item => copyLine(snapshot.kind, item));
        const header = snapshotHeader(snapshot);
        return [header, ...lines].filter(Boolean).join('\n');
    }

    async function copyItems(snapshot, items, statusTarget = null) {
        if (!snapshot || !items?.length) return false;
        try {
            await navigator.clipboard.writeText(copyText(snapshot, items));
            if (statusTarget) statusTarget.textContent = `Copied ${items.length} new movement${items.length === 1 ? '' : 's'}.`;
            return true;
        } catch (error) {
            console.warn('[APES Rally History] Clipboard write failed.', error);
            if (statusTarget) statusTarget.textContent = 'Could not copy new movements.';
            return false;
        }
    }

    async function saveSnapshot(kind) {
        if (!KINDS[kind] || lifecycle[kind].saving) return;
        lifecycle[kind].saving = true;
        try {
            await loadSnapshots();
            const previous = snapshotList(kind)[0] || null;
            const village = getVillageContext();
            const snapshot = {
                id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                kind,
                createdAt: Date.now(),
                ...village,
                items: scrape(kind)
            };

            snapshots.push(snapshot);
            trimHistory();
            await persistSnapshots();

            if (previous) {
                latestDelta[kind] = {
                    previousId: previous.id,
                    currentId: snapshot.id,
                    ...compareSnapshots(previous, snapshot)
                };
            } else {
                latestDelta[kind] = {
                    baseline: true,
                    previousId: null,
                    currentId: snapshot.id,
                    rows: [],
                    newItems: [],
                    removedItems: [],
                    unchangedItems: []
                };
            }

            updateDeltaBar(kind);
            if (selectedKind === kind) renderHistory();
        } finally {
            lifecycle[kind].saving = false;
        }
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${PANEL_ID} .qol-rp-history-body{display:flex!important;flex-direction:column!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;padding:10px!important;gap:8px!important;background:#f7f5f0!important;color:#4b3822!important;font-family:Arial,sans-serif!important}
#${PANEL_ID} .qol-rp-history-controls{display:grid!important;grid-template-columns:130px minmax(210px,1fr) minmax(210px,1fr) auto auto!important;gap:7px!important;align-items:end!important;padding:8px!important;border:1px solid #d4c2a5!important;border-radius:4px!important;background:#eee7dc!important;flex:0 0 auto!important}
#${PANEL_ID} .qol-rp-history-control{display:flex!important;flex-direction:column!important;gap:3px!important;min-width:0!important}
#${PANEL_ID} .qol-rp-history-control label{color:#6b563d!important;font-size:8px!important;font-weight:bold!important;text-transform:uppercase!important;letter-spacing:.25px!important}
#${PANEL_ID} .qol-rp-history-select{width:100%!important;height:27px!important;margin:0!important;padding:3px 5px!important;border:1px solid #a99473!important;border-radius:3px!important;background:#fff!important;color:#493821!important;font:10px Arial,sans-serif!important;appearance:auto!important;-webkit-appearance:menulist!important}
#${PANEL_ID} .qol-rp-history-action{display:inline-flex!important;align-items:center!important;justify-content:center!important;height:27px!important;min-width:92px!important;padding:3px 9px!important;border:1px solid var(--qol-accent-outline)!important;border-radius:4px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:9px!important;font-weight:bold!important;white-space:nowrap!important;cursor:pointer!important;user-select:none!important}
#${PANEL_ID} .qol-rp-history-action.danger{border-color:#8f211e!important;background:linear-gradient(to bottom,#d9534f,#b52b27)!important}
#${PANEL_ID} .qol-rp-history-action.disabled{opacity:.42!important;pointer-events:none!important}
#${PANEL_ID} .qol-rp-history-summary{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important;flex:0 0 auto!important}
#${PANEL_ID} .qol-rp-history-stat{padding:7px 9px!important;border:1px solid #d3c4aa!important;border-radius:3px!important;background:#fff!important}
#${PANEL_ID} .qol-rp-history-stat span{display:block!important;color:#77654d!important;font-size:8px!important;font-weight:bold!important;text-transform:uppercase!important}
#${PANEL_ID} .qol-rp-history-stat strong{display:block!important;margin-top:2px!important;font-size:15px!important}
#${PANEL_ID} .qol-rp-history-stat.new strong{color:#3f732d!important}#${PANEL_ID} .qol-rp-history-stat.removed strong{color:#982f29!important}#${PANEL_ID} .qol-rp-history-stat.unchanged strong{color:#8a6a25!important}
#${PANEL_ID} .qol-rp-history-message{min-height:18px!important;padding:0 2px!important;color:#6c5a43!important;font-size:9px!important;line-height:1.35!important;flex:0 0 auto!important}
#${PANEL_ID} .qol-rp-history-table-wrap{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;border:1px solid #c7b99e!important;border-radius:3px!important;background:#fff!important}
#${PANEL_ID} .qol-rp-history-table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:10px!important}
#${PANEL_ID} .qol-rp-history-table th,#${PANEL_ID} .qol-rp-history-table td{padding:6px 7px!important;border-bottom:1px solid #e4dccd!important;text-align:left!important;vertical-align:middle!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
#${PANEL_ID} .qol-rp-history-table th{position:sticky!important;top:0!important;z-index:2!important;background:#e9dfcc!important;color:var(--qol-accent-deep)!important;font-size:8px!important;text-transform:uppercase!important}
#${PANEL_ID} .qol-rp-history-table th:nth-child(1){width:82px!important}#${PANEL_ID} .qol-rp-history-table th:nth-child(2){width:150px!important}#${PANEL_ID} .qol-rp-history-table th:nth-child(3){width:155px!important}#${PANEL_ID} .qol-rp-history-table th:nth-child(4){width:105px!important}#${PANEL_ID} .qol-rp-history-table th:nth-child(5){width:125px!important}#${PANEL_ID} .qol-rp-history-table th:nth-child(6){width:150px!important}
#${PANEL_ID} .qol-rp-delta-status{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:66px!important;padding:2px 7px!important;border-radius:10px!important;font-size:8px!important;font-weight:900!important}
#${PANEL_ID} .qol-rp-delta-status.new{border:1px solid #75a15b!important;background:#e7f4df!important;color:#3f732d!important}#${PANEL_ID} .qol-rp-delta-status.removed{border:1px solid #bb716a!important;background:#f8e1df!important;color:#982f29!important}#${PANEL_ID} .qol-rp-delta-status.unchanged{border:1px solid #c2a45f!important;background:#fff3cf!important;color:#80611f!important}
#${PANEL_ID} .qol-rp-history-empty{display:flex!important;align-items:center!important;justify-content:center!important;min-height:150px!important;padding:24px!important;color:#7b6a56!important;text-align:center!important;font-size:11px!important}
#${PANEL_ID} .qol-rp-history-delta-bar{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;padding:6px 8px!important;border:1px solid #d4c2a5!important;border-radius:4px!important;background:#fff6e5!important;color:#5b4630!important;font-size:9px!important;line-height:1.3!important}
#${PANEL_ID} .qol-rp-history-delta-actions{display:flex!important;align-items:center!important;gap:5px!important;flex:0 0 auto!important}
#${PANEL_ID} .qol-rp-history-mini-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;height:23px!important;padding:2px 7px!important;border:1px solid var(--qol-accent-outline)!important;border-radius:3px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:8px!important;font-weight:bold!important;cursor:pointer!important;white-space:nowrap!important}
@media(max-width:860px){#${PANEL_ID} .qol-rp-history-controls{grid-template-columns:1fr 1fr!important}#${PANEL_ID} .qol-rp-history-controls>.qol-rp-history-control:first-child{grid-column:1/-1!important}}
`;
        document.head.appendChild(style);
    }

    function activateHistoryTab() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        panel.querySelectorAll('[data-qol-rally-tab]').forEach(tab => {
            const active = tab.getAttribute('data-qol-rally-tab') === HISTORY_TAB;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panel.querySelectorAll('[data-qol-rally-panel]').forEach(section => {
            section.classList.toggle('active', section.getAttribute('data-qol-rally-panel') === HISTORY_TAB);
        });
        void loadSnapshots().then(renderHistory);
    }

    function ensureHistoryUI() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return null;
        injectStyles();

        const tabs = panel.querySelector('.qol-rally-tabs');
        const content = panel.querySelector('.qol-rally-scanner-content');
        if (!tabs || !content) return null;

        let tab = tabs.querySelector('[data-qol-rally-tab="history"]');
        if (!tab) {
            tab = document.createElement('div');
            tab.className = 'qol-rally-tab';
            tab.setAttribute('data-qol-rally-tab', HISTORY_TAB);
            tab.setAttribute('role', 'tab');
            tab.setAttribute('tabindex', '0');
            tab.setAttribute('aria-selected', 'false');
            tab.textContent = 'History';
            tabs.appendChild(tab);

            const activate = event => {
                event?.preventDefault?.();
                event?.stopPropagation?.();
                activateHistoryTab();
            };
            tab.addEventListener('click', activate);
            tab.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') activate(event);
            });
        }

        let section = content.querySelector('[data-qol-rally-panel="history"]');
        if (!section) {
            section = document.createElement('section');
            section.className = 'qol-rally-tab-panel';
            section.setAttribute('data-qol-rally-panel', HISTORY_TAB);
            section.setAttribute('role', 'tabpanel');
            section.innerHTML = '<div class="qol-rp-history-body"><div class="qol-rp-history-empty">Loading Rally Point history…</div></div>';
            content.appendChild(section);
        }

        Object.keys(KINDS).forEach(updateDeltaBar);
        return section;
    }

    function getSelectedSnapshots(kind) {
        const list = snapshotList(kind);
        if (!list.length) return { list, a: null, b: null };

        let b = list.find(snapshot => snapshot.id === selectedB) || list[0];
        let a = list.find(snapshot => snapshot.id === selectedA) || list[1] || null;

        if (a && b && a.createdAt > b.createdAt && !selectedA && !selectedB) {
            [a, b] = [b, a];
        }

        selectedA = a?.id || '';
        selectedB = b?.id || '';
        return { list, a, b };
    }

    function optionHtml(list, selectedId) {
        return list.map(snapshot => `<option value="${escapeHtml(snapshot.id)}"${snapshot.id === selectedId ? ' selected' : ''}>${escapeHtml(formatSnapshotLabel(snapshot))}</option>`).join('');
    }

    function comparisonRowHtml(row, kind) {
        const config = KINDS[kind];
        const remaining = row.status === 'unchanged'
            ? `${escapeHtml(row.previous?.remaining || '-')} → ${escapeHtml(row.item.remaining || '-')}`
            : escapeHtml(row.item.remaining || '-');
        const statusLabel = row.status === 'new' ? 'NEW' : row.status === 'removed' ? 'REMOVED' : 'UNCHANGED';
        return `<tr><td><span class="qol-rp-delta-status ${row.status}">${statusLabel}</span></td><td title="${escapeHtml(row.item.subject)}">${escapeHtml(row.item.subject)}</td><td title="${escapeHtml(row.item.village)}">${escapeHtml(row.item.village)}</td><td>${escapeHtml(row.item.type)}</td><td>${escapeHtml(row.item.landing)}</td><td title="${config.label} remaining time">${remaining}</td></tr>`;
    }

    function renderHistory() {
        const section = ensureHistoryUI();
        const body = section?.querySelector('.qol-rp-history-body');
        if (!body) return;
        if (!loaded) {
            body.innerHTML = '<div class="qol-rp-history-empty">Loading Rally Point history…</div>';
            void loadSnapshots().then(renderHistory);
            return;
        }

        const { list, a, b } = getSelectedSnapshots(selectedKind);
        const canCompare = Boolean(a && b);
        const comparison = canCompare ? compareSnapshots(a, b) : { rows: [], newItems: [], removedItems: [], unchangedItems: [] };
        const config = KINDS[selectedKind];

        body.innerHTML = `
            <div class="qol-rp-history-controls">
                <div class="qol-rp-history-control"><label>Scan type</label><select class="qol-rp-history-select" data-qol-history-kind><option value="incoming"${selectedKind === 'incoming' ? ' selected' : ''}>Incomings</option><option value="outgoing"${selectedKind === 'outgoing' ? ' selected' : ''}>Outgoings</option></select></div>
                <div class="qol-rp-history-control"><label>Scan A · older</label><select class="qol-rp-history-select" data-qol-history-a ${list.length < 2 ? 'disabled' : ''}>${a ? optionHtml(list, a.id) : '<option>No older scan</option>'}</select></div>
                <div class="qol-rp-history-control"><label>Scan B · newer</label><select class="qol-rp-history-select" data-qol-history-b ${list.length < 1 ? 'disabled' : ''}>${b ? optionHtml(list, b.id) : '<option>No scans saved</option>'}</select></div>
                <div class="qol-rp-history-action${comparison.newItems.length ? '' : ' disabled'}" data-qol-history-copy>Copy New Only</div>
                <div class="qol-rp-history-action danger${list.length ? '' : ' disabled'}" data-qol-history-clear>Clear ${escapeHtml(config.label)}</div>
            </div>
            <div class="qol-rp-history-summary">
                <div class="qol-rp-history-stat new"><span>New</span><strong>${comparison.newItems.length}</strong></div>
                <div class="qol-rp-history-stat removed"><span>Removed</span><strong>${comparison.removedItems.length}</strong></div>
                <div class="qol-rp-history-stat unchanged"><span>Unchanged</span><strong>${comparison.unchangedItems.length}</strong></div>
            </div>
            <div class="qol-rp-history-message">${list.length < 2 ? `Save at least two successful ${escapeHtml(config.label.toLowerCase())} scans to compare them.` : `Comparing ${escapeHtml(formatSnapshotLabel(a))} → ${escapeHtml(formatSnapshotLabel(b))}. Remaining time is not part of movement identity.`}</div>
            <div class="qol-rp-history-table-wrap">${canCompare ? `<table class="qol-rp-history-table"><thead><tr><th>Status</th><th>${escapeHtml(config.subjectLabel)}</th><th>Village</th><th>Type</th><th>Landing</th><th>Remaining A → B</th></tr></thead><tbody>${comparison.rows.map(row => comparisonRowHtml(row, selectedKind)).join('') || '<tr><td colspan="6">No movements in either selected scan.</td></tr>'}</tbody></table>` : '<div class="qol-rp-history-empty">Run another successful scan to create a delta.</div>'}</div>
        `;

        body.querySelector('[data-qol-history-kind]')?.addEventListener('change', event => {
            selectedKind = event.target.value === 'outgoing' ? 'outgoing' : 'incoming';
            selectedA = '';
            selectedB = '';
            renderHistory();
        });
        body.querySelector('[data-qol-history-a]')?.addEventListener('change', event => {
            selectedA = event.target.value;
            renderHistory();
        });
        body.querySelector('[data-qol-history-b]')?.addEventListener('change', event => {
            selectedB = event.target.value;
            renderHistory();
        });
        body.querySelector('[data-qol-history-copy]')?.addEventListener('click', () => {
            void copyItems(b, comparison.newItems, body.querySelector('.qol-rp-history-message'));
        });
        body.querySelector('[data-qol-history-clear]')?.addEventListener('click', async () => {
            if (!list.length) return;
            if (!window.confirm(`Clear all saved ${config.label.toLowerCase()} Rally Point scans?`)) return;
            snapshots = snapshots.filter(snapshot => snapshot.kind !== selectedKind);
            latestDelta[selectedKind] = null;
            selectedA = '';
            selectedB = '';
            await persistSnapshots();
            updateDeltaBar(selectedKind);
            renderHistory();
        });
    }

    function deltaText(kind, delta, currentSnapshot) {
        if (!delta) return '';
        if (delta.baseline) {
            return `Baseline saved: ${currentSnapshot?.items?.length || 0} ${KINDS[kind].label.toLowerCase()} movement${currentSnapshot?.items?.length === 1 ? '' : 's'}.`;
        }
        return `${delta.newItems.length} NEW · ${delta.removedItems.length} removed · ${delta.unchangedItems.length} unchanged`;
    }

    function updateDeltaBar(kind) {
        const panel = document.getElementById(PANEL_ID);
        const config = KINDS[kind];
        const root = panel?.querySelector(config.panel);
        if (!root) return;

        const statusLine = root.querySelector('.qol-rp-status-line');
        if (!statusLine) return;

        let bar = root.querySelector(`.qol-rp-history-delta-bar[data-kind="${kind}"]`);
        const delta = latestDelta[kind];
        if (!delta) {
            bar?.remove();
            return;
        }

        const current = snapshots.find(snapshot => snapshot.id === delta.currentId) || null;
        if (!bar) {
            bar = document.createElement('div');
            bar.className = 'qol-rp-history-delta-bar';
            bar.dataset.kind = kind;
            statusLine.insertAdjacentElement('afterend', bar);
        }

        bar.innerHTML = `<span>${escapeHtml(deltaText(kind, delta, current))}</span><div class="qol-rp-history-delta-actions">${!delta.baseline && delta.newItems.length ? '<div class="qol-rp-history-mini-btn" data-copy-new>Copy New Only</div>' : ''}<div class="qol-rp-history-mini-btn" data-view-history>View History</div></div>`;
        bar.querySelector('[data-view-history]')?.addEventListener('click', event => {
            event.preventDefault();
            selectedKind = kind;
            selectedA = delta.previousId || '';
            selectedB = delta.currentId || '';
            activateHistoryTab();
        });
        bar.querySelector('[data-copy-new]')?.addEventListener('click', event => {
            event.preventDefault();
            void copyItems(current, delta.newItems, bar.querySelector('span'));
        });
    }

    function statusState(kind) {
        const config = KINDS[kind];
        const root = document.querySelector(`#${PANEL_ID} ${config.panel}`);
        const status = root?.querySelector(config.status);
        return {
            tone: status?.dataset?.tone || 'neutral',
            text: clean(status?.textContent)
        };
    }

    function observeScanCompletion(kind) {
        const state = statusState(kind);
        const life = lifecycle[kind];

        if (state.tone === 'working') {
            life.inProgress = true;
            return;
        }

        if (life.inProgress && state.tone === 'success') {
            life.inProgress = false;
            void saveSnapshot(kind);
            return;
        }

        if (life.inProgress && state.tone === 'error') {
            life.inProgress = false;
        }
    }

    function tick() {
        if (!enabled()) return;
        ensureHistoryUI();
        observeScanCompletion('incoming');
        observeScanCompletion('outgoing');
    }

    function start() {
        injectStyles();
        void loadSnapshots().then(() => {
            ensureHistoryUI();
        });
        if (pollTimer === null) pollTimer = window.setInterval(tick, POLL_MS);
    }

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== FEATURE_KEY) return;
        if (event.detail.enabled) start();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    window.APES_RALLY_HISTORY = Object.freeze({
        open(kind = 'incoming') {
            selectedKind = kind === 'outgoing' ? 'outgoing' : 'incoming';
            selectedA = '';
            selectedB = '';
            activateHistoryTab();
        },
        async list(kind = null) {
            await loadSnapshots();
            return kind && KINDS[kind] ? snapshotList(kind) : snapshots.slice();
        }
    });

    console.log('[APES Rally History] Scan history and delta comparison initialized.');
})();
