/**
 * APES QoL v2 — Expansion Readiness Planner
 *
 * Integrates with CP Manager and the Account Operations Center cache.
 * Evaluates CP, Residence/Palace level, settlers/admins, and stored resources
 * for every village. Expansion-slot usage is intentionally treated separately
 * from level-based slot unlocks until Travian's used/free slot state is mapped.
 */
(() => {
    'use strict';

    const FEATURE_KEY = 'cpManager';
    const CP_PANEL_ID = 'qol-cp-manager-panel';
    const BUTTON_CLASS = 'qol-cp-expansion-btn';
    const PANEL_ID = 'qol-cp-expansion-readiness-panel';
    const STYLE_ID = 'qol-cp-expansion-readiness-styles';
    const REFRESH_MS = 800;
    const RESIDENCE = 25;
    const PALACE = 26;
    const RESOURCE_KEYS = ['wood', 'clay', 'iron'];

    const SETTLER_COSTS = Object.freeze({
        standard: {
            1: { wood: 3500, clay: 3000, iron: 4500 },
            2: { wood: 4000, clay: 3500, iron: 3200 },
            3: { wood: 3000, clay: 4000, iron: 3000 }
        },
        mayhem2026: {
            1: { wood: 3500, clay: 3000, iron: 4000 },
            2: { wood: 4000, clay: 3500, iron: 3000 },
            3: { wood: 3000, clay: 4000, iron: 3500 }
        }
    });

    const ADMIN_COSTS = Object.freeze({
        1: { wood: 30750, clay: 27200, iron: 45000 },
        2: { wood: 35500, clay: 26600, iron: 25000 },
        3: { wood: 30750, clay: 45400, iron: 31000 }
    });

    const ADMIN_NAMES = Object.freeze({ 1: 'Senator', 2: 'Chief', 3: 'Chieftain' });
    const RESOURCE_LABELS = Object.freeze({ wood: 'Wood', clay: 'Clay', iron: 'Iron' });
    const RESOURCE_ICONS = Object.freeze({
        wood: 'unit_wood_small_illu resType1',
        clay: 'unit_clay_small_illu resType2',
        iron: 'unit_iron_small_illu resType3'
    });

    let refreshTimer = null;
    let refreshingVillages = false;

    function enabled() {
        return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY) === true;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function integerText(value) {
        const matches = String(value ?? '').match(/-?\d[\d,.]*/g) || [];
        if (!matches.length) return null;
        const raw = matches.at(-1);
        const negative = raw.startsWith('-');
        const digits = raw.replace(/[^0-9]/g, '');
        if (!digits) return null;
        const parsed = Number.parseInt(digits, 10);
        return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
    }

    function formatNumber(value) {
        return Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('en-US') : '-';
    }

    function formatAge(timestamp) {
        const ms = Date.now() - Number(timestamp || 0);
        if (!Number.isFinite(ms) || ms < 0) return 'unknown';
        const minutes = Math.floor(ms / 60000);
        if (minutes < 1) return 'now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    }

    function resourceIcon(key) {
        return `<i class="qol-exp-resource-icon ${RESOURCE_ICONS[key] || ''}" title="${RESOURCE_LABELS[key] || key}"></i>`;
    }

    function isMayhem2026() {
        return /mayhem/i.test(window.location.hostname);
    }

    function getCpState() {
        const panel = document.getElementById(CP_PANEL_ID);
        if (!panel) return null;
        const cards = Array.from(panel.querySelectorAll('.qol-cp-card'));
        const byLabel = label => cards.find(card => card.querySelector('.qol-cp-card-label')?.textContent?.trim() === label);
        const currentCard = byLabel('Current CP');
        const remainingCard = byLabel('Remaining CP');
        const nextCard = byLabel('Next Expansion');
        if (!currentCard || !remainingCard || !nextCard) return null;

        const current = integerText(currentCard.querySelector('.qol-cp-card-value')?.textContent);
        const remaining = integerText(remainingCard.querySelector('.qol-cp-card-value')?.textContent);
        const nextText = nextCard.querySelector('.qol-cp-card-value')?.textContent || '';
        const slot = Number.parseInt(nextText.match(/Slot\s+(\d+)/i)?.[1] || '', 10);
        const targetNumbers = nextText.match(/\d[\d,.]*/g) || [];
        const target = targetNumbers.length > 1
            ? Number.parseInt(targetNumbers.at(-1).replace(/[^0-9]/g, ''), 10)
            : null;
        return {
            current,
            remaining,
            target: Number.isFinite(target) ? target : null,
            slot: Number.isFinite(slot) ? slot : null,
            ready: Number.isFinite(remaining) ? remaining <= 0 : (Number.isFinite(current) && Number.isFinite(target) && current >= target)
        };
    }

    function currentVillages() {
        try {
            const rows = window.APES_VILLAGE_PALETTE?.getVillages?.();
            return Array.isArray(rows) ? rows : [];
        } catch (_) {
            return [];
        }
    }

    function buildingFor(village) {
        const buildings = Array.isArray(village?.buildings) ? village.buildings : [];
        const palace = buildings.find(item => Number(item?.buildingType) === PALACE);
        const residence = buildings.find(item => Number(item?.buildingType) === RESIDENCE);
        const selected = palace || residence || null;
        if (!selected) return null;
        return {
            type: Number(selected.buildingType),
            name: Number(selected.buildingType) === PALACE ? 'Palace' : 'Residence',
            level: number(selected.lvl) ?? 0,
            location: number(selected.locationId)
        };
    }

    function unlockedSlots(building) {
        if (!building) return { unlocked: 0, levels: [], nextLevel: 10 };
        const levels = building.type === PALACE ? [10, 15, 20] : [10, 20];
        return {
            unlocked: levels.filter(level => building.level >= level).length,
            levels,
            nextLevel: levels.find(level => building.level < level) || null
        };
    }

    function localUnitIndex(tribeId, rawIndex) {
        const id = Math.trunc(Number(rawIndex));
        if (!Number.isFinite(id)) return null;
        if (id === 0) return 1;
        if (id >= 1 && id <= 10) return id;
        const tribe = Number(tribeId);
        if (tribe >= 1 && tribe <= 3) {
            const base = (tribe - 1) * 10;
            if (id > base && id <= base + 10) return id - base;
        }
        return null;
    }

    function normaliseUnitCounts(units, tribeId, targetMap) {
        if (Array.isArray(units)) {
            units.forEach((value, index) => {
                const amount = number(value);
                if (!Number.isFinite(amount) || amount <= 0) return;
                const local = localUnitIndex(tribeId, index + 1);
                if (local) targetMap.set(local, (targetMap.get(local) || 0) + amount);
            });
            return;
        }
        if (!units || typeof units !== 'object') return;
        Object.entries(units).forEach(([key, value]) => {
            if (!/^\d+$/.test(String(key))) return;
            const amount = number(value);
            if (!Number.isFinite(amount) || amount <= 0) return;
            const local = localUnitIndex(tribeId, Number(key));
            if (local) targetMap.set(local, (targetMap.get(local) || 0) + amount);
        });
    }

    function stationedExpansionUnits(village) {
        const totals = new Map();
        const ownPlayer = Number(village?.playerId);
        for (const troop of village?.stationaryTroops || []) {
            if (Number.isFinite(ownPlayer) && Number(troop?.playerId) !== ownPlayer) continue;
            normaliseUnitCounts(troop?.units, village?.tribeId, totals);
        }
        return {
            admin: Math.round(totals.get(9) || 0),
            settlers: Math.round(totals.get(10) || 0)
        };
    }

    function queuedExpansionUnits(village) {
        const queue = village?.unitQueue?.unitsInQueue ?? village?.unitQueue;
        const totals = new Map();
        const seen = new WeakSet();
        let structuredFound = false;

        function walk(node, depth = 0) {
            if (!node || typeof node !== 'object' || depth > 7 || seen.has(node)) return;
            seen.add(node);
            if (Array.isArray(node)) {
                node.forEach(item => walk(item, depth + 1));
                return;
            }
            const rawUnit = number(node.unitType ?? node.unitTypeId ?? node.unitId ?? node.unit ?? node.unitIndex);
            const amount = number(node.amount ?? node.count ?? node.quantity ?? node.remaining);
            if (rawUnit !== null && amount !== null && amount > 0) {
                const local = localUnitIndex(village?.tribeId, rawUnit);
                if (local === 9 || local === 10) {
                    totals.set(local, (totals.get(local) || 0) + amount);
                    structuredFound = true;
                }
            }
            Object.values(node).forEach(value => walk(value, depth + 1));
        }
        walk(queue);

        if (!structuredFound) {
            const primitive = new Map();
            if (Array.isArray(queue)) {
                queue.forEach((value, index) => {
                    const amount = number(value);
                    const local = localUnitIndex(village?.tribeId, index + 1);
                    if (amount > 0 && (local === 9 || local === 10)) primitive.set(local, amount);
                });
            }
            primitive.forEach((amount, local) => totals.set(local, amount));
        }

        return {
            admin: Math.round(totals.get(9) || 0),
            settlers: Math.round(totals.get(10) || 0)
        };
    }

    function findDashboardStore(villageIds) {
        const prefix = `apes_village_dashboard_scan_v1:${window.location.hostname}:`;
        let best = null;
        let bestScore = -1;
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key?.startsWith(prefix)) continue;
            let parsed;
            try { parsed = JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { continue; }
            const villages = parsed?.villages;
            if (!villages || typeof villages !== 'object') continue;
            const overlap = villageIds.filter(id => villages[String(id)]).length;
            const newest = Math.max(0, ...Object.values(villages).map(item => Number(item?.scannedAt || 0)));
            const score = overlap * 1e15 + newest;
            if (score > bestScore) {
                bestScore = score;
                best = parsed;
            }
        }
        return best;
    }

    function scannedResourceState(store, villageId) {
        const data = store?.villages?.[String(villageId)] || null;
        return {
            scannedAt: Number(data?.scannedAt || 0),
            resources: data?.resources && typeof data.resources === 'object' ? data.resources : null
        };
    }

    function unitCosts(tribeId) {
        const set = isMayhem2026() ? SETTLER_COSTS.mayhem2026 : SETTLER_COSTS.standard;
        return {
            settler: set[Number(tribeId)] || null,
            admin: ADMIN_COSTS[Number(tribeId)] || null
        };
    }

    function costForMissing(baseCost, missingCount) {
        if (!baseCost || missingCount <= 0) return { wood: 0, clay: 0, iron: 0 };
        return Object.fromEntries(RESOURCE_KEYS.map(key => [key, (baseCost[key] || 0) * missingCount]));
    }

    function resourceReadiness(resources, required) {
        if (!resources) return { known: false, ready: false, deficits: {} };
        const deficits = {};
        let ready = true;
        for (const key of RESOURCE_KEYS) {
            const current = number(resources?.[key]?.current);
            const need = Number(required?.[key] || 0);
            if (!Number.isFinite(current)) {
                deficits[key] = null;
                ready = false;
                continue;
            }
            deficits[key] = Math.max(0, need - current);
            if (deficits[key] > 0) ready = false;
        }
        return { known: true, ready, deficits };
    }

    function deficitText(state) {
        if (!state?.known) return 'Run Refresh Villages';
        const missing = RESOURCE_KEYS.filter(key => Number(state.deficits?.[key]) > 0);
        if (!missing.length) return 'Ready';
        return missing.map(key => `${RESOURCE_LABELS[key]} ${formatNumber(state.deficits[key])}`).join(' · ');
    }

    function readRows() {
        const villages = currentVillages();
        const ids = villages.map(village => String(village?.villageId || '')).filter(Boolean);
        const store = findDashboardStore(ids);
        const cp = getCpState();

        return villages.map(village => {
            const building = buildingFor(village);
            const slots = unlockedSlots(building);
            const stationed = stationedExpansionUnits(village);
            const queued = queuedExpansionUnits(village);
            const settlers = stationed.settlers + queued.settlers;
            const admins = stationed.admin + queued.admin;
            const scan = scannedResourceState(store, village?.villageId);
            const costs = unitCosts(village?.tribeId);
            const missingSettlers = Math.max(0, 3 - settlers);
            const missingAdmins = Math.max(0, 1 - admins);
            const settleResources = resourceReadiness(scan.resources, costForMissing(costs.settler, missingSettlers));
            const chiefResources = resourceReadiness(scan.resources, costForMissing(costs.admin, missingAdmins));
            const levelUnlocked = slots.unlocked > 0;
            const cpReady = cp?.ready === true;

            const settleCandidate = cpReady && levelUnlocked && settlers >= 3;
            const chiefCandidate = cpReady && levelUnlocked && admins >= 1;
            const settleTrainable = cpReady && levelUnlocked && settleResources.ready;
            const chiefTrainable = cpReady && levelUnlocked && chiefResources.ready;

            return {
                village,
                building,
                slots,
                stationed,
                queued,
                settlers,
                admins,
                scan,
                settleResources,
                chiefResources,
                missingSettlers,
                missingAdmins,
                settleCandidate,
                chiefCandidate,
                settleTrainable,
                chiefTrainable,
                cp
            };
        });
    }

    function readinessScore(row) {
        if (row.settleCandidate || row.chiefCandidate) return 0;
        if (row.settleTrainable || row.chiefTrainable) return 1;
        if (row.slots.unlocked > 0) return 2;
        if (row.building) return 3;
        return 4;
    }

    function badge(label, tone, title = '') {
        return `<span class="qol-exp-badge ${tone}"${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(label)}</span>`;
    }

    function buildingHtml(row) {
        if (!row.building) return '<span class="qol-exp-muted">None</span>';
        const next = row.slots.nextLevel ? ` · next slot L${row.slots.nextLevel}` : '';
        return `<div class="qol-exp-stack"><strong>${escapeHtml(row.building.name)} ${row.building.level}</strong><small>${row.slots.unlocked}/${row.slots.levels.length} level slots unlocked${escapeHtml(next)}</small></div>`;
    }

    function unitsHtml(row) {
        const adminName = ADMIN_NAMES[Number(row.village?.tribeId)] || 'Administrator';
        return `<div class="qol-exp-stack"><strong>${row.settlers}/3 Settlers</strong><small>${row.stationed.settlers} stationed${row.queued.settlers ? ` · ${row.queued.settlers} queued` : ''}</small><strong class="qol-exp-admin-line">${row.admins} ${escapeHtml(adminName)}</strong><small>${row.stationed.admin} stationed${row.queued.admin ? ` · ${row.queued.admin} queued` : ''}</small></div>`;
    }

    function resourceHtml(row) {
        const scanned = row.scan.scannedAt ? `Scanned ${formatAge(row.scan.scannedAt)}` : 'No resource scan';
        return `<div class="qol-exp-stack"><strong>Settle: <span class="${row.settleResources.ready ? 'good' : 'warn'}">${escapeHtml(deficitText(row.settleResources))}</span></strong><small>Need ${row.missingSettlers} more settler${row.missingSettlers === 1 ? '' : 's'}</small><strong>Chief: <span class="${row.chiefResources.ready ? 'good' : 'warn'}">${escapeHtml(deficitText(row.chiefResources))}</span></strong><small>${escapeHtml(scanned)}</small></div>`;
    }

    function cpHtml(cp) {
        if (!cp) return '<span class="qol-exp-muted">Run Scan CP</span>';
        if (cp.ready) return `<div class="qol-exp-stack"><strong class="good">CP Ready</strong><small>Slot ${cp.slot || '-'} unlocked by CP</small></div>`;
        return `<div class="qol-exp-stack"><strong class="warn">${formatNumber(cp.remaining)} CP needed</strong><small>Next: Slot ${cp.slot || '-'}</small></div>`;
    }

    function statusHtml(row) {
        const labels = [];
        if (row.settleCandidate) labels.push(badge('SETTLERS READY*', 'good', 'CP, level-based slot and 3 settlers are ready. Verify that an unlocked expansion slot is still free.'));
        else if (row.settleTrainable) labels.push(badge('CAN TRAIN SETTLERS*', 'amber', 'CP, level-based slot and resources are ready. Verify that an unlocked expansion slot is still free.'));
        else labels.push(badge('SETTLE NOT READY', 'bad'));

        if (row.chiefCandidate) labels.push(badge('CHIEF READY*', 'good', 'CP, level-based slot and an administrator are ready. Verify that an unlocked expansion slot is still free.'));
        else if (row.chiefTrainable) labels.push(badge('CAN TRAIN CHIEF*', 'amber', 'CP, level-based slot and resources are ready. Administrator research is not verified.'));
        else labels.push(badge('CHIEF NOT READY', 'bad'));
        return `<div class="qol-exp-statuses">${labels.join('')}</div>`;
    }

    function openAdminBuilding(villageId, location) {
        if (!/^\d+$/.test(String(villageId || '')) || !Number.isFinite(Number(location))) return;
        closePlanner();
        window.location.hash = `#/page:village/villId:${villageId}/location:${location}/window:building`;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
#${PANEL_ID}{position:fixed!important;z-index:1000001!important;display:none;flex-direction:column!important;width:min(1180px,96vw)!important;min-width:min(820px,96vw)!important;height:min(650px,88vh)!important;min-height:420px!important;max-width:96vw!important;max-height:92vh!important;resize:both!important;overflow:hidden!important;border:3px solid var(--qol-border)!important;border-radius:4px!important;background:#f7f5f0!important;color:#333!important;box-shadow:0 10px 30px rgba(0,0,0,.5)!important}
#${PANEL_ID} .qol-exp-head{height:34px!important;flex:0 0 34px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;padding:6px 10px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-dark))!important;color:#f7f5f0!important;font-size:14px!important;font-weight:bold!important;cursor:move!important;user-select:none!important}
#${PANEL_ID} .qol-exp-close{padding:0 5px!important;border-radius:3px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;font-size:21px!important;line-height:1!important;cursor:pointer!important}
#${PANEL_ID} .qol-exp-body{display:flex!important;flex:1 1 auto!important;min-height:0!important;flex-direction:column!important;background:#fbf7ef!important;overflow:hidden!important}
#${PANEL_ID} .qol-exp-top{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr)) auto!important;gap:6px!important;padding:8px!important;border-bottom:1px solid #d6c8ae!important;background:#f4eee2!important;flex:0 0 auto!important}
#${PANEL_ID} .qol-exp-stat{min-width:0!important;padding:6px 8px!important;border:1px solid #d3c4aa!important;border-radius:3px!important;background:#fff!important}
#${PANEL_ID} .qol-exp-stat span{display:block!important;color:#77654d!important;font-size:8px!important;font-weight:bold!important;text-transform:uppercase!important}
#${PANEL_ID} .qol-exp-stat strong{display:block!important;margin-top:2px!important;color:#3f3020!important;font-size:13px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
#${PANEL_ID} .qol-exp-refresh{display:inline-flex!important;align-items:center!important;justify-content:center!important;align-self:stretch!important;min-width:116px!important;padding:0 10px!important;border:1px solid var(--qol-action-border)!important;border-radius:3px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:9px!important;font-weight:bold!important;cursor:pointer!important;user-select:none!important}
#${PANEL_ID} .qol-exp-refresh.busy{opacity:.55!important;pointer-events:none!important;cursor:wait!important}
#${PANEL_ID} .qol-exp-note{padding:7px 9px!important;border-bottom:1px solid #d6c8ae!important;background:#fff6e5!important;color:#5b4630!important;font-size:9px!important;line-height:1.4!important;flex:0 0 auto!important}
#${PANEL_ID} .qol-exp-table-wrap{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;background:#fff!important}
#${PANEL_ID} table{width:100%!important;min-width:1080px!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:9px!important}
#${PANEL_ID} th,#${PANEL_ID} td{padding:6px 7px!important;border-bottom:1px solid #e4dccd!important;color:#4b3b28!important;text-align:left!important;vertical-align:middle!important;white-space:normal!important;overflow:hidden!important}
#${PANEL_ID} th{position:sticky!important;top:0!important;z-index:2!important;background:#f4eee2!important;color:#6a573d!important;font-size:8px!important;text-transform:uppercase!important;white-space:nowrap!important}
#${PANEL_ID} th:nth-child(1){width:150px!important}#${PANEL_ID} th:nth-child(2){width:120px!important}#${PANEL_ID} th:nth-child(3){width:175px!important}#${PANEL_ID} th:nth-child(4){width:115px!important}#${PANEL_ID} th:nth-child(5){width:235px!important}#${PANEL_ID} th:nth-child(6){width:170px!important}#${PANEL_ID} th:nth-child(7){width:110px!important}
#${PANEL_ID} .qol-exp-stack{display:flex!important;flex-direction:column!important;gap:1px!important;min-width:0!important}
#${PANEL_ID} .qol-exp-stack strong{font-size:9.5px!important;color:#4b3b28!important;line-height:1.25!important}
#${PANEL_ID} .qol-exp-stack small{font-size:8px!important;color:#7b6a54!important;line-height:1.25!important}
#${PANEL_ID} .qol-exp-stack .good{color:#4f7328!important}#${PANEL_ID} .qol-exp-stack .warn{color:#9b6b1f!important}
#${PANEL_ID} .qol-exp-admin-line{margin-top:3px!important}
#${PANEL_ID} .qol-exp-statuses{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:3px!important}
#${PANEL_ID} .qol-exp-badge{display:inline-flex!important;align-items:center!important;min-height:20px!important;padding:2px 6px!important;border:1px solid transparent!important;border-radius:999px!important;font-size:7.5px!important;font-weight:800!important;white-space:nowrap!important}
#${PANEL_ID} .qol-exp-badge.good{border-color:#729c49!important;background:#edf7e5!important;color:#416922!important}#${PANEL_ID} .qol-exp-badge.amber{border-color:#b2934e!important;background:#fff6dd!important;color:#7c5b18!important}#${PANEL_ID} .qol-exp-badge.bad{border-color:#b26760!important;background:#fae8e6!important;color:#8f312b!important}
#${PANEL_ID} .qol-exp-open{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:90px!important;height:24px!important;padding:3px 7px!important;border:1px solid var(--qol-action-border)!important;border-radius:3px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:8.5px!important;font-weight:bold!important;cursor:pointer!important;user-select:none!important}
#${PANEL_ID} .qol-exp-muted{color:#9d907e!important;font-style:italic!important;font-size:8.5px!important}
.qol-exp-resource-icon{display:inline-block!important;width:16px!important;height:16px!important;min-width:16px!important;vertical-align:middle!important;background-repeat:no-repeat!important}
`;
        document.head.appendChild(style);
    }

    function ensurePanel() {
        let panel = document.getElementById(PANEL_ID);
        if (panel) return panel;
        injectStyles();
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `<div class="qol-exp-head"><span>Expansion Readiness Planner</span><span class="qol-exp-close" title="Close">&times;</span></div><div class="qol-exp-body"></div>`;
        document.body.appendChild(panel);
        panel.querySelector('.qol-exp-close').addEventListener('click', closePlanner);
        makeDraggable(panel, panel.querySelector('.qol-exp-head'));
        panel.addEventListener('click', event => {
            const refresh = event.target.closest('.qol-exp-refresh');
            if (refresh) {
                event.preventDefault();
                void refreshVillages();
                return;
            }
            const open = event.target.closest('.qol-exp-open');
            if (open) {
                event.preventDefault();
                openAdminBuilding(open.dataset.villageId, Number(open.dataset.location));
            }
        });
        return panel;
    }

    function makeDraggable(panel, handle) {
        if (!panel || !handle || handle.dataset.bound === 'true') return;
        handle.dataset.bound = 'true';
        let dragging = false;
        let dx = 0;
        let dy = 0;
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('.qol-exp-close')) return;
            const rect = panel.getBoundingClientRect();
            dragging = true;
            dx = event.clientX - rect.left;
            dy = event.clientY - rect.top;
            handle.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });
        handle.addEventListener('pointermove', event => {
            if (!dragging) return;
            const left = Math.max(8, Math.min(event.clientX - dx, window.innerWidth - panel.offsetWidth - 8));
            const top = Math.max(8, Math.min(event.clientY - dy, window.innerHeight - panel.offsetHeight - 8));
            panel.style.setProperty('left', `${left}px`, 'important');
            panel.style.setProperty('top', `${top}px`, 'important');
            event.preventDefault();
        });
        const stop = event => {
            dragging = false;
            try { handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
        };
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
    }

    function render() {
        const panel = ensurePanel();
        const body = panel.querySelector('.qol-exp-body');
        const rows = readRows().sort((a, b) => readinessScore(a) - readinessScore(b) || String(a.village?.name || '').localeCompare(String(b.village?.name || ''), undefined, { numeric: true }));
        const cp = getCpState();
        const settleReady = rows.filter(row => row.settleCandidate).length;
        const chiefReady = rows.filter(row => row.chiefCandidate).length;
        const adminBuildings = rows.filter(row => row.building).length;
        const freshest = Math.max(0, ...rows.map(row => Number(row.scan.scannedAt || 0)));

        const htmlRows = rows.map(row => {
            const village = row.village || {};
            const name = village.name || `Village ${village.villageId || ''}`;
            const open = row.building && Number.isFinite(row.building.location)
                ? `<div class="qol-exp-open" data-village-id="${escapeHtml(village.villageId)}" data-location="${row.building.location}">Open ${escapeHtml(row.building.name)}</div>`
                : '<span class="qol-exp-muted">No Residence/Palace</span>';
            return `<tr><td><div class="qol-exp-stack"><strong>${escapeHtml(name)}</strong><small>${Number.isFinite(Number(village.x)) && Number.isFinite(Number(village.y)) ? `(${village.x}|${village.y}) · ` : ''}${escapeHtml(village.isMainVillage ? 'Capital' : '')}</small></div></td><td>${cpHtml(cp)}</td><td>${buildingHtml(row)}</td><td>${unitsHtml(row)}</td><td>${resourceHtml(row)}</td><td>${statusHtml(row)}</td><td>${open}</td></tr>`;
        }).join('');

        body.innerHTML = `
            <div class="qol-exp-top">
                <div class="qol-exp-stat"><span>CP Expansion</span><strong>${cp ? (cp.ready ? `Slot ${cp.slot || '-'} Ready` : `${formatNumber(cp.remaining)} CP Needed`) : 'Run Scan CP'}</strong></div>
                <div class="qol-exp-stat"><span>Settlers Ready*</span><strong>${settleReady}</strong></div>
                <div class="qol-exp-stat"><span>Chief Ready*</span><strong>${chiefReady}</strong></div>
                <div class="qol-exp-stat"><span>Admin Buildings</span><strong>${adminBuildings}/${rows.length || 0}</strong></div>
                <div class="qol-exp-refresh${refreshingVillages ? ' busy' : ''}">${refreshingVillages ? 'Refreshing…' : 'Refresh Villages'}</div>
            </div>
            <div class="qol-exp-note"><strong>* Expansion-slot usage is not yet confirmed automatically.</strong> Residence unlocks slots at levels 10/20; Palace at 10/15/20. “Ready” means CP + level-based slot + required unit are ready. Use <strong>Open Residence/Palace</strong> to verify that one of the unlocked slots is still free. Resource checks use the latest Account Operations Center scan${freshest ? ` (${escapeHtml(formatAge(freshest))})` : ''}. ${isMayhem2026() ? '<strong>Summer Mayhem 2026 settler costs detected.</strong>' : 'Standard Travian Kingdoms settler costs are used.'}</div>
            <div class="qol-exp-table-wrap">
                <table>
                    <thead><tr><th>Village</th><th>CP Slot</th><th>Residence / Palace</th><th>Settlers / Chief</th><th>Resources</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>${htmlRows || '<tr><td colspan="7">Village cache unavailable. Click Refresh Villages or open the Account Operations Center once.</td></tr>'}</tbody>
                </table>
            </div>`;
    }

    async function refreshVillages() {
        if (refreshingVillages) return;
        refreshingVillages = true;
        render();
        try {
            window.APES_VILLAGE_PALETTE?.refresh?.();
            await new Promise(resolve => setTimeout(resolve, 350));
            if (typeof window.APES_VILLAGE_PALETTE?.scan === 'function') {
                await window.APES_VILLAGE_PALETTE.scan();
            }
            window.APES_VILLAGE_PALETTE?.refresh?.();
            await new Promise(resolve => setTimeout(resolve, 350));
        } catch (error) {
            console.warn('[APES Expansion Readiness] Village refresh failed.', error);
        } finally {
            refreshingVillages = false;
            render();
        }
    }

    function positionPanel() {
        const panel = ensurePanel();
        const cp = document.getElementById(CP_PANEL_ID)?.getBoundingClientRect();
        const width = panel.offsetWidth || 1180;
        const height = panel.offsetHeight || 650;
        let left = cp ? cp.right + 10 : Math.max(8, (window.innerWidth - width) / 2);
        if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
        const top = cp ? Math.max(8, Math.min(cp.top, window.innerHeight - height - 8)) : Math.max(8, (window.innerHeight - height) / 2);
        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
    }

    function openPlanner() {
        if (!enabled()) return;
        const panel = ensurePanel();
        window.APES_VILLAGE_PALETTE?.refresh?.();
        render();
        panel.style.setProperty('display', 'flex', 'important');
        requestAnimationFrame(positionPanel);
    }

    function closePlanner() {
        document.getElementById(PANEL_ID)?.style.setProperty('display', 'none', 'important');
    }

    function ensureButton() {
        const cp = document.getElementById(CP_PANEL_ID);
        const controls = cp?.querySelector('.qol-cp-controls');
        const plan = cp?.querySelector('.qol-cp-plan-btn');
        if (!controls || !plan) return;

        let button = controls.querySelector(`.${BUTTON_CLASS}`);
        if (!button) {
            button = document.createElement('div');
            button.className = `qol-cp-action-btn secondary ${BUTTON_CLASS} hidden`;
            button.setAttribute('role', 'button');
            button.setAttribute('tabindex', '0');
            button.textContent = 'Expansion Readiness';
            controls.insertBefore(button, controls.querySelector('.qol-cp-status'));
            const activate = event => {
                event.preventDefault();
                event.stopPropagation();
                openPlanner();
            };
            button.addEventListener('click', activate);
            button.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') activate(event);
            });
        }
        button.classList.toggle('hidden', plan.classList.contains('hidden'));
        if (plan.classList.contains('hidden')) closePlanner();
    }

    function start() {
        injectStyles();
        ensurePanel();
        ensureButton();
        if (refreshTimer === null) refreshTimer = window.setInterval(() => {
            if (!enabled()) {
                closePlanner();
                return;
            }
            ensureButton();
        }, REFRESH_MS);
    }

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== FEATURE_KEY) return;
        if (!event.detail.enabled) closePlanner();
        ensureButton();
    });
    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source !== 'cpManager') closePlanner();
    });
    window.addEventListener('resize', () => {
        const panel = document.getElementById(PANEL_ID);
        if (panel && getComputedStyle(panel).display !== 'none') positionPanel();
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const panel = document.getElementById(PANEL_ID);
        if (panel && getComputedStyle(panel).display !== 'none') {
            event.preventDefault();
            event.stopImmediatePropagation();
            closePlanner();
        }
    }, true);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();

    window.APES_EXPANSION_READINESS = Object.freeze({ open: openPlanner, close: closePlanner, refresh: render });
    console.log('[APES Expansion Readiness] Initialized.');
})();