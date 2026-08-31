/**
 * APES QoL v2 — Resource Upgrade Planner UI integration.
 * Adds the planner to Settings, the responsive toolbar dropdown and the G wheel,
 * and turns calculated recommendations into persistent per-village roadmaps.
 */
(() => {
    'use strict';

    const APES = window.APES;
    const FEATURE_KEY = 'resourceUpgradePlanner';
    const BUTTON_ID = 'qol-resource-planner-toggle-btn';
    const PANEL_ID = 'qol-resource-upgrade-planner-overlay';
    const CHECKBOX_ID = 'qol-chk-resource-upgrade-planner';
    const TOOLBAR_ENTRY_ATTR = 'data-rup-toolbar-entry';
    const RADIAL_ACTION_ID = 'resources.open';
    const ROADMAP_STYLE_ID = 'qol-resource-upgrade-roadmap-styles';
    const ROADMAP_STORAGE_OPTIONS = Object.freeze({ feature: FEATURE_KEY, key: 'roadmaps', scope: 'player' });
    const ROADMAP_FALLBACK_KEY = `apes_resource_upgrade_roadmaps_v1_${window.location.hostname}`;
    const BRIDGE_UI_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_UI';
    const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
    const BRIDGE_REQUEST_TYPE = 'REQUEST_SNAPSHOT';
    const BRIDGE_RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';
    const ITEMS_PER_RING = 8;
    const FIRST_RING_RADIUS = 150;
    const MIN_ITEM_DISTANCE = 126;
    const RING_GAP = 120;
    const RESOURCE_BUILDING_TYPES = Object.freeze({ wood: 1, clay: 2, iron: 3, crop: 4 });
    const PRODUCTION_BUILDING_TYPES = Object.freeze({ sawmill: 5, brickyard: 6, foundry: 7, mill: 8, bakery: 9 });
    const RESOURCE_ICONS = Object.freeze({
        wood: 'unit_wood_small_illu resType1',
        clay: 'unit_clay_small_illu resType2',
        iron: 'unit_iron_small_illu resType3',
        crop: 'unit_crop_small_illu resType4'
    });

    let scheduled = false;
    let roadmapStore = { version: 1, villages: {}, suppressed: {} };
    let roadmapLoaded = false;
    let roadmapLoadPromise = null;
    let roadmapRefreshBusy = false;
    let lastRoadmapRefreshAt = 0;
    let lastRoadmapSnapshot = null;
    let roadmapPollTimer = null;

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

    function openPlanner() {
        if (window.APES_RESOURCE_UPGRADE_PLANNER?.open) {
            return window.APES_RESOURCE_UPGRADE_PLANNER.open();
        }
        return APES?.ui?.activateById?.(BUTTON_ID);
    }

    function setEnabled(value) {
        try { localStorage.setItem(`qol_${FEATURE_KEY}`, String(Boolean(value))); } catch (_) {}
        window.dispatchEvent(new CustomEvent('qol_setting_changed', {
            detail: { key: FEATURE_KEY, enabled: Boolean(value) }
        }));
    }

    function injectSettingsCard() {
        const grid = document.getElementById('qol-advanced-feature-grid') ||
            document.getElementById('qol-basic-feature-grid');
        if (!grid) return;

        let checkbox = document.getElementById(CHECKBOX_ID);
        if (!checkbox) {
            const card = document.createElement('article');
            card.className = 'qol-feature-card';
            card.dataset.featureKey = FEATURE_KEY;
            card.innerHTML = `
                <span class="qol-feature-icon" aria-hidden="true">↥</span>
                <div class="qol-feature-copy">
                    <h3 class="qol-feature-name">Resource Upgrade Planner</h3>
                    <p class="qol-feature-desc">Calculates efficient resource upgrades and tracks them as a persistent, queue-aware village roadmap.</p>
                </div>
                <label class="qol-switch" title="Toggle Resource Upgrade Planner">
                    <input type="checkbox" id="${CHECKBOX_ID}" class="qol-checkbox">
                    <span class="qol-switch-track" aria-hidden="true"></span>
                    <span class="qol-visually-hidden">Toggle Resource Upgrade Planner</span>
                </label>
            `;
            grid.appendChild(card);
            checkbox = card.querySelector(`#${CHECKBOX_ID}`);
            checkbox.addEventListener('change', event => setEnabled(event.target.checked));

            const heading = grid.previousElementSibling;
            const count = heading?.querySelector('.qol-section-count');
            if (count && count.dataset.rupCounted !== 'true') {
                const current = Number.parseInt(count.textContent, 10);
                if (Number.isFinite(current)) count.textContent = `${current + 1} tools`;
                count.dataset.rupCounted = 'true';
            }
        }
        checkbox.checked = enabled();
    }

    function injectCollapsedToolbarEntry() {
        const dropdown = document.getElementById('qol-toolbar-dropdown');
        if (!dropdown?.classList.contains('qol-open')) return;
        const existing = dropdown.querySelector(`[${TOOLBAR_ENTRY_ATTR}]`);
        if (!enabled()) {
            existing?.remove();
            return;
        }
        if (existing) return;

        const item = document.createElement('div');
        item.className = 'qol-toolbar-menu-item';
        item.setAttribute(TOOLBAR_ENTRY_ATTR, 'true');
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.innerHTML = '<span>Resource Upgrade Planner</span><span class="qol-toolbar-menu-arrow">›</span>';
        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            dropdown.classList.remove('qol-open');
            void openPlanner();
        };
        item.addEventListener('click', activate);
        item.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });

        const settings = dropdown.querySelector('[data-open-settings="true"]');
        if (settings) dropdown.insertBefore(item, settings);
        else dropdown.appendChild(item);
    }

    function visibleToolbarControls() {
        const selectors = [
            '#qol-help-toggle-btn', '#qol-rally-point-toggle-btn', '#qol-watchlist-toggle',
            '#qol-checklist-toggle-btn', '#qol-npc-calc-toggle-btn', '#qol-distance-calc-toggle-btn',
            '#qol-oasis-toggle-btn', '#qol-report-archive-toggle', '#qol-cp-toggle-btn',
            '#qol-ss-scanner-toggle-btn', '#qol-tribe-skins-toggle-btn'
        ].join(',');
        return [...document.querySelectorAll(selectors)]
            .map(element => ({ element, rect: element.getBoundingClientRect() }))
            .filter(item => item.rect.width > 0 && item.rect.height > 0)
            .filter(item => {
                const style = getComputedStyle(item.element);
                return style.display !== 'none' && style.visibility !== 'hidden';
            });
    }

    function positionPlannerButton() {
        const button = document.getElementById(BUTTON_ID);
        if (!button) return;
        if (!enabled() || document.body?.classList.contains('qol-toolbar-collapsed')) {
            button.style.setProperty('display', 'none', 'important');
            return;
        }

        const villageList = document.getElementById('villageList');
        const villageRect = villageList?.getBoundingClientRect();
        if (!villageRect || villageRect.width <= 0 || villageRect.height <= 0) {
            button.style.setProperty('display', 'none', 'important');
            return;
        }

        const controls = visibleToolbarControls();
        const anchor = controls.length
            ? controls.reduce((rightmost, item) => item.rect.right > rightmost.rect.right ? item : rightmost)
            : null;
        const cog = document.getElementById('qol-cog-btn')?.getBoundingClientRect();
        const left = Math.round((anchor?.rect.right ?? cog?.right ?? villageRect.right + 50) + 6);
        const top = Math.round(anchor?.rect.top ?? cog?.top ?? villageRect.top + 4);
        button.style.setProperty('left', `${left}px`, 'important');
        button.style.setProperty('top', `${top}px`, 'important');
        button.style.setProperty('right', 'auto', 'important');
        button.style.setProperty('display', 'flex', 'important');
    }

    function radialIcon() {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 19h16M6 16v-5M10 16V7M14 16v-3M18 16V4"/>
                <path d="m5 8 4-4 4 3 6-5"/>
            </svg>
        `;
    }

    function getRingRadius(itemCount, ringIndex) {
        const minimum = itemCount > 1
            ? MIN_ITEM_DISTANCE / (2 * Math.sin(Math.PI / itemCount))
            : 0;
        return Math.max(FIRST_RING_RADIUS + ringIndex * RING_GAP, minimum);
    }

    function layoutRadialItems(container) {
        const items = [...container.querySelectorAll('.apes-v2-radial-item')];
        items.forEach((item, index) => {
            const ringIndex = Math.floor(index / ITEMS_PER_RING);
            const ringStart = ringIndex * ITEMS_PER_RING;
            const ringCount = Math.min(ITEMS_PER_RING, items.length - ringStart);
            const positionInRing = index - ringStart;
            const angle = -Math.PI / 2 + (Math.PI * 2 * positionInRing) / ringCount;
            const radius = getRingRadius(ringCount, ringIndex);
            item.style.setProperty('--apes-x', `${(Math.cos(angle) * radius).toFixed(2)}px`);
            item.style.setProperty('--apes-y', `${(Math.sin(angle) * radius).toFixed(2)}px`);
        });

        const rings = Math.max(1, Math.ceil(items.length / ITEMS_PER_RING));
        const lastStart = (rings - 1) * ITEMS_PER_RING;
        const lastCount = Math.max(1, Math.min(ITEMS_PER_RING, items.length - lastStart));
        const radius = getRingRadius(lastCount, rings - 1);
        container.closest('.apes-v2-radial')?.style.setProperty('--apes-radial-size', `${radius * 2 + 130}px`);
    }

    function injectRadialItem() {
        const overlay = document.getElementById('apes-v2-command-overlay');
        const container = overlay?.querySelector('.apes-v2-radial-items');
        if (!container) return;
        let item = container.querySelector(`[data-apes-action-id="${RADIAL_ACTION_ID}"]`);
        if (!enabled()) {
            if (item) {
                item.remove();
                layoutRadialItems(container);
            }
            return;
        }
        if (!item) {
            item = document.createElement('div');
            item.className = 'apes-v2-radial-item';
            item.dataset.apesActionId = RADIAL_ACTION_ID;
            item.dataset.label = 'Resource Upgrade Planner';
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.title = 'Resource Upgrade Planner';
            item.innerHTML = `<span class="apes-v2-radial-icon">${radialIcon()}</span><span class="apes-v2-radial-label">Resource Upgrade Planner</span>`;
            container.appendChild(item);
        }
        layoutRadialItems(container);
    }

    function registerRadialAction() {
        if (!APES?.actions?.register) return;
        try {
            APES.actions.register({
                id: RADIAL_ACTION_ID,
                label: 'Resource Upgrade Planner',
                description: 'Open Resource Upgrade Planner.',
                keywords: ['resources', 'fields', 'production', 'upgrade', 'planner', 'roadmap', 'queue'],
                group: 'Radial menu',
                enabled,
                run: openPlanner
            });
        } catch (error) {
            console.warn('[APES Resource Planner] radial action registration failed:', error);
        }
    }

    function normalizeRoadmapStore(raw) {
        const output = { version: 1, villages: {}, suppressed: {} };
        if (!raw || typeof raw !== 'object') return output;
        if (raw.suppressed && typeof raw.suppressed === 'object') {
            for (const [key, value] of Object.entries(raw.suppressed)) {
                if (value === true) output.suppressed[key] = true;
            }
        }
        if (!raw.villages || typeof raw.villages !== 'object') return output;
        for (const [key, roadmap] of Object.entries(raw.villages)) {
            if (!roadmap || typeof roadmap !== 'object' || !Array.isArray(roadmap.steps)) continue;
            output.villages[key] = {
                villageId: String(roadmap.villageId || ''),
                villageName: String(roadmap.villageName || 'Village'),
                createdAt: Number(roadmap.createdAt) || Date.now(),
                updatedAt: Number(roadmap.updatedAt) || Number(roadmap.createdAt) || Date.now(),
                sourcePlanKey: String(roadmap.sourcePlanKey || ''),
                manualDone: Array.isArray(roadmap.manualDone) ? [...new Set(roadmap.manualDone.map(String))] : [],
                steps: roadmap.steps.map((step, index) => ({
                    id: String(step.id || `legacy:${index + 1}`),
                    step: Number(step.step) || index + 1,
                    kind: step.kind === 'building' ? 'building' : 'field',
                    resource: String(step.resource || ''),
                    index: Number.isInteger(Number(step.index)) ? Number(step.index) : null,
                    building: String(step.building || ''),
                    fromLevel: Number(step.fromLevel) || 0,
                    toLevel: Number(step.toLevel) || 0,
                    label: String(step.label || `Step ${index + 1}`),
                    cost: Array.isArray(step.cost) ? step.cost.slice(0, 4).map(value => Number(value) || 0) : [0, 0, 0, 0],
                    roiHours: Number(step.roiHours) || 0,
                    elapsedHours: Number(step.elapsedHours) || 0
                })).filter(step => step.toLevel > 0)
            };
        }
        return output;
    }

    async function loadRoadmaps() {
        if (roadmapLoaded) return roadmapStore;
        if (roadmapLoadPromise) return roadmapLoadPromise;
        roadmapLoadPromise = (async () => {
            let saved = null;
            try {
                if (APES?.storage?.get) saved = await APES.storage.get(ROADMAP_STORAGE_OPTIONS, null);
            } catch (error) {
                console.warn('[APES Resource Planner] roadmap storage read failed:', error);
            }
            if (!saved) {
                try { saved = JSON.parse(localStorage.getItem(ROADMAP_FALLBACK_KEY) || 'null'); } catch (_) {}
            }
            roadmapStore = normalizeRoadmapStore(saved);
            roadmapLoaded = true;
            return roadmapStore;
        })();
        return roadmapLoadPromise;
    }

    async function saveRoadmaps() {
        const snapshot = JSON.parse(JSON.stringify(roadmapStore));
        try {
            if (APES?.storage?.set) {
                await APES.storage.set(ROADMAP_STORAGE_OPTIONS, snapshot);
                return;
            }
        } catch (error) {
            console.warn('[APES Resource Planner] roadmap storage write failed:', error);
        }
        try { localStorage.setItem(ROADMAP_FALLBACK_KEY, JSON.stringify(snapshot)); } catch (_) {}
    }

    function currentVillageIdentity() {
        const hashId = String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
        const contextId = String(APES?.context?.getVillageId?.() || '');
        const villageId = /^\d+$/.test(hashId || contextId) ? (hashId || contextId) : '';
        const contextName = String(APES?.context?.getVillageName?.() || '').trim();
        const domName = String(document.querySelector(
            '.currentVillageName .dropdownHead .selectedItem .villageEntry, #villageList .dropdownHead .selectedItem .villageEntry'
        )?.textContent || '').trim();
        return {
            villageId,
            villageName: contextName && contextName !== 'Unknown village' ? contextName : (domName || 'Village')
        };
    }

    function roadmapKey(identity = currentVillageIdentity()) {
        if (identity.villageId) return `id:${identity.villageId}`;
        const name = String(identity.villageName || '').trim().toLocaleLowerCase();
        return name ? `name:${name}` : '';
    }

    function roadmapStepId(row) {
        return [
            row.kind,
            row.resource || row.building || '',
            Number.isInteger(Number(row.index)) ? Number(row.index) : '',
            Number(row.fromLevel) || 0,
            Number(row.toLevel) || 0
        ].join(':');
    }

    function planKey(results) {
        return (results || []).map(roadmapStepId).join('|');
    }

    function currentCalculationResults() {
        try {
            const plan = window.APES_RESOURCE_UPGRADE_PLANNER?.calculate?.();
            return Array.isArray(plan?.results) ? plan.results : [];
        } catch (_) {
            return [];
        }
    }

    function buildRoadmap(results, identity, previous = null) {
        const newIds = new Set(results.map(roadmapStepId));
        const preservedDone = (previous?.manualDone || []).filter(id => newIds.has(id));
        const now = Date.now();
        return {
            villageId: identity.villageId,
            villageName: identity.villageName,
            createdAt: previous?.createdAt || now,
            updatedAt: now,
            sourcePlanKey: planKey(results),
            manualDone: preservedDone,
            steps: results.map(row => ({
                id: roadmapStepId(row),
                step: Number(row.step) || 0,
                kind: row.kind === 'building' ? 'building' : 'field',
                resource: String(row.resource || ''),
                index: Number.isInteger(Number(row.index)) ? Number(row.index) : null,
                building: String(row.building || ''),
                fromLevel: Number(row.fromLevel) || 0,
                toLevel: Number(row.toLevel) || 0,
                label: String(row.label || ''),
                cost: Array.isArray(row.cost) ? row.cost.slice(0, 4).map(value => Number(value) || 0) : [0, 0, 0, 0],
                roiHours: Number(row.roiHours) || 0,
                elapsedHours: Number(row.elapsedHours) || 0
            }))
        };
    }

    async function createRoadmapFromCurrentPlan(force = false) {
        await loadRoadmaps();
        const identity = currentVillageIdentity();
        const key = roadmapKey(identity);
        const results = currentCalculationResults();
        if (!key || !results.length) return null;
        const existing = roadmapStore.villages[key] || null;
        if (existing && !force) return existing;
        roadmapStore.villages[key] = buildRoadmap(results, identity, existing);
        delete roadmapStore.suppressed[key];
        await saveRoadmaps();
        return roadmapStore.villages[key];
    }

    async function ensureAutomaticRoadmap() {
        await loadRoadmaps();
        const resultsRoot = document.querySelector(`#${PANEL_ID} [data-results].show`);
        if (!resultsRoot) return null;
        const identity = currentVillageIdentity();
        const key = roadmapKey(identity);
        if (!key || roadmapStore.villages[key] || roadmapStore.suppressed[key]) return roadmapStore.villages[key] || null;
        return createRoadmapFromCurrentPlan(false);
    }

    function requestDashboardSnapshot(timeoutMs = 1200) {
        return new Promise(resolve => {
            let settled = false;
            const cleanup = value => {
                if (settled) return;
                settled = true;
                window.removeEventListener('message', onMessage);
                window.clearTimeout(timer);
                resolve(value);
            };
            const onMessage = event => {
                if (event.source !== window) return;
                if (event.data?.source !== BRIDGE_SOURCE || event.data?.type !== BRIDGE_RESPONSE_TYPE) return;
                cleanup(event.data.payload || null);
            };
            const timer = window.setTimeout(() => cleanup(null), timeoutMs);
            window.addEventListener('message', onMessage);
            window.postMessage({ source: BRIDGE_UI_SOURCE, type: BRIDGE_REQUEST_TYPE }, window.location.origin);
        });
    }

    function queueItems(village) {
        const queues = village?.buildingQueue?.queues;
        if (!queues || typeof queues !== 'object') return [];
        return Object.values(queues).flatMap(bucket => Array.isArray(bucket) ? bucket : []);
    }

    function stepBuildingType(step) {
        if (step.kind === 'field') return RESOURCE_BUILDING_TYPES[step.resource] || null;
        return PRODUCTION_BUILDING_TYPES[step.building] || null;
    }

    function resolveStepBuilding(village, step) {
        const type = stepBuildingType(step);
        if (!type) return { type: null, building: null, location: null, level: 0 };
        const buildings = (village?.buildings || []).filter(building => Number(building?.buildingType) === type);
        if (step.kind === 'field') {
            buildings.sort((a, b) => Number(a.locationId || 0) - Number(b.locationId || 0));
            const building = buildings[Number(step.index) || 0] || null;
            return {
                type,
                building,
                location: Number.isFinite(Number(building?.locationId)) ? Number(building.locationId) : null,
                level: Math.max(0, Number(building?.lvl) || 0)
            };
        }
        const building = buildings[0] || null;
        return {
            type,
            building,
            location: Number.isFinite(Number(building?.locationId)) ? Number(building.locationId) : null,
            level: Math.max(0, Number(building?.lvl) || 0)
        };
    }

    function queueTargetLevel(item, currentLevel, fallbackIndex) {
        const difference = Number(item?.levelDifference);
        if (Number.isFinite(difference) && difference >= 0) return currentLevel + difference + 1;
        const position = Number(item?.queuePosition);
        if (Number.isFinite(position) && position >= 0) return currentLevel + position + 1;
        return currentLevel + fallbackIndex + 1;
    }

    function evaluateRoadmapStep(village, roadmap, step) {
        const manual = new Set(roadmap.manualDone || []).has(step.id);
        if (manual) return { status: 'complete', label: 'Complete', reason: 'Manual', auto: false, finishTime: null };

        const resolved = resolveStepBuilding(village, step);
        if (resolved.level >= step.toLevel) {
            return { status: 'complete', label: 'Complete', reason: `Level ${resolved.level}`, auto: true, finishTime: null };
        }

        const allQueue = queueItems(village);
        let matching = allQueue.filter(item => {
            if (resolved.location !== null) return Number(item?.locationId) === resolved.location;
            return Number(item?.buildingType) === resolved.type;
        });
        matching = matching.sort((a, b) => {
            const aPos = Number(a?.queuePosition);
            const bPos = Number(b?.queuePosition);
            return (Number.isFinite(aPos) ? aPos : 999) - (Number.isFinite(bPos) ? bPos : 999);
        });

        let queuedMatch = null;
        matching.forEach((item, index) => {
            const target = queueTargetLevel(item, resolved.level, index);
            if (target >= step.toLevel && !queuedMatch) queuedMatch = { item, target };
        });
        if (queuedMatch) {
            return {
                status: 'queued',
                label: 'Queued',
                reason: `→ ${step.toLevel}`,
                auto: true,
                finishTime: Number(queuedMatch.item?.finishTime) || null
            };
        }

        return {
            status: 'pending',
            label: 'Pending',
            reason: resolved.location === null && step.kind === 'building' ? 'Not built' : `Current ${resolved.level}`,
            auto: true,
            finishTime: null
        };
    }

    function formatCountdown(seconds) {
        const remaining = Math.max(0, Math.floor(Number(seconds || 0) - Date.now() / 1000));
        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        const s = remaining % 60;
        return h > 0
            ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function formatDate(timestamp) {
        if (!Number.isFinite(Number(timestamp))) return '—';
        return new Date(Number(timestamp)).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    function formatCost(cost) {
        return ['wood', 'clay', 'iron', 'crop'].map((resource, index) => `
            <span class="qol-rup-roadmap-cost" title="${resource}">
                <i class="qol-rup-roadmap-resource ${RESOURCE_ICONS[resource]}"></i>
                <strong>${Number(cost?.[index] || 0).toLocaleString()}</strong>
            </span>
        `).join('');
    }

    function roadmapCheckbox(step, evaluation) {
        const checked = evaluation.status === 'complete' ? ' checked' : '';
        const disabled = evaluation.auto && evaluation.status === 'complete' ? ' disabled' : '';
        const title = evaluation.auto && evaluation.status === 'complete'
            ? 'Automatically completed from the current village level'
            : 'Mark this roadmap step complete manually';
        return `<label class="qol-rup-step-check" title="${title}">
            <input type="checkbox" data-rup-roadmap-complete="${escapeHtml(step.id)}"${checked}${disabled}>
            <span class="qol-rup-step-check-box" aria-hidden="true"></span>
        </label>`;
    }

    function roadmapViewHtml(roadmap, village) {
        const identity = currentVillageIdentity();
        if (!roadmap) {
            return `
                <div class="qol-rup-roadmap-empty">
                    <strong>No roadmap saved for ${escapeHtml(identity.villageName)}.</strong>
                    <span>Calculate recommendations, then create a persistent roadmap for this village.</span>
                    <div class="qol-rup-roadmap-actions"><div class="qol-rup-roadmap-action" data-rup-roadmap-action="create" role="button" tabindex="0">Create Roadmap</div></div>
                </div>`;
        }

        const evaluations = roadmap.steps.map(step => ({ step, evaluation: evaluateRoadmapStep(village, roadmap, step) }));
        const counts = evaluations.reduce((totals, item) => {
            totals[item.evaluation.status] = (totals[item.evaluation.status] || 0) + 1;
            return totals;
        }, { complete: 0, queued: 0, pending: 0 });
        const rows = evaluations.map(({ step, evaluation }) => {
            const queuedTime = evaluation.status === 'queued' && evaluation.finishTime
                ? `<span class="qol-rup-roadmap-queue-time">${formatCountdown(evaluation.finishTime)}</span>`
                : '';
            return `<tr class="qol-rup-roadmap-row qol-rup-roadmap-${evaluation.status}">
                <td class="qol-rup-step">${step.step}</td>
                <td class="qol-rup-action-name">${escapeHtml(step.label)}</td>
                <td><strong>${step.fromLevel} → ${step.toLevel}</strong></td>
                <td><span class="qol-rup-roadmap-status ${evaluation.status}">${evaluation.label}</span>${queuedTime}<small>${escapeHtml(evaluation.reason)}</small></td>
                <td>${formatCost(step.cost)}</td>
                <td>${Number(step.roiHours || 0) > 0 ? `${Math.round(step.roiHours * 10) / 10}h` : '—'}</td>
                <td class="qol-rup-done-column">${roadmapCheckbox(step, evaluation)}</td>
            </tr>`;
        }).join('');

        const liveText = village
            ? 'Live cache connected'
            : 'Waiting for village cache';
        return `
            <div class="qol-rup-roadmap-toolbar">
                <div class="qol-rup-roadmap-meta">
                    <strong>${escapeHtml(roadmap.villageName)}</strong>
                    <span>Saved ${formatDate(roadmap.createdAt)} · ${liveText}</span>
                </div>
                <div class="qol-rup-roadmap-summary">
                    <span class="complete">${counts.complete} Complete</span>
                    <span class="queued">${counts.queued} Queued</span>
                    <span class="pending">${counts.pending} Pending</span>
                </div>
                <div class="qol-rup-roadmap-actions">
                    <div class="qol-rup-roadmap-action" data-rup-roadmap-action="refresh" role="button" tabindex="0">Refresh Status</div>
                    <div class="qol-rup-roadmap-action" data-rup-roadmap-action="replace" role="button" tabindex="0">Replace Roadmap</div>
                    <div class="qol-rup-roadmap-action danger" data-rup-roadmap-action="clear" role="button" tabindex="0">Clear</div>
                </div>
            </div>
            ${counts.complete === roadmap.steps.length && roadmap.steps.length
                ? '<div class="qol-rup-roadmap-complete-banner">Roadmap complete. This village has reached every saved recommendation.</div>'
                : ''}
            <div class="qol-rup-table-wrap qol-rup-roadmap-table"><table>
                <thead><tr><th>#</th><th>Upgrade</th><th>Target</th><th>Status</th><th>Cost</th><th>ROI</th><th class="qol-rup-done-column">Done</th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>`;
    }

    function injectRoadmapStyles() {
        if (document.getElementById(ROADMAP_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = ROADMAP_STYLE_ID;
        style.textContent = `
            #${PANEL_ID} .qol-rup-roadmap-toolbar{display:grid!important;grid-template-columns:minmax(190px,1fr) auto auto!important;align-items:center!important;gap:10px!important;margin-bottom:6px!important;padding:7px 8px!important;border:1px solid #c8b99f!important;border-radius:4px!important;background:#f8f4ec!important}
            #${PANEL_ID} .qol-rup-roadmap-meta{display:flex!important;flex-direction:column!important;gap:2px!important;min-width:0!important;color:#6f5a40!important;font-size:8px!important}
            #${PANEL_ID} .qol-rup-roadmap-meta strong{color:#47351f!important;font-size:10px!important}.qol-rup-roadmap-meta span{white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
            #${PANEL_ID} .qol-rup-roadmap-summary{display:flex!important;align-items:center!important;gap:4px!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-rup-roadmap-summary span,#${PANEL_ID} .qol-rup-roadmap-status{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:20px!important;padding:2px 7px!important;border:1px solid #b8a98f!important;border-radius:999px!important;background:#eee7dc!important;color:#68583f!important;font-size:7.5px!important;font-weight:800!important}
            #${PANEL_ID} .qol-rup-roadmap-summary .complete,#${PANEL_ID} .qol-rup-roadmap-status.complete{border-color:#91ac73!important;background:#edf5e5!important;color:#4d6d2d!important}
            #${PANEL_ID} .qol-rup-roadmap-summary .queued,#${PANEL_ID} .qol-rup-roadmap-status.queued{border-color:#cfaa59!important;background:#fff3d8!important;color:#8b6418!important}
            #${PANEL_ID} .qol-rup-roadmap-summary .pending,#${PANEL_ID} .qol-rup-roadmap-status.pending{border-color:#b8a98f!important;background:#eee7dc!important;color:#68583f!important}
            #${PANEL_ID} .qol-rup-roadmap-actions{display:flex!important;align-items:center!important;gap:5px!important;flex-wrap:wrap!important}
            #${PANEL_ID} .qol-rup-roadmap-action{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:27px!important;padding:0 9px!important;border:1px solid var(--qol-action-border)!important;border-radius:4px!important;background:linear-gradient(var(--qol-accent),var(--qol-accent-gradient-end))!important;color:#fff8eb!important;font-size:8px!important;font-weight:800!important;cursor:pointer!important;user-select:none!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-rup-roadmap-action:hover{filter:brightness(1.07)!important}#${PANEL_ID} .qol-rup-roadmap-action.danger{border-color:#8e443a!important;background:linear-gradient(#bd6558,#95463b)!important}
            #${PANEL_ID} .qol-rup-roadmap-table td{vertical-align:middle!important}#${PANEL_ID} .qol-rup-roadmap-table small{display:block!important;margin-top:2px!important;color:#8a785f!important;font-size:7px!important}
            #${PANEL_ID} .qol-rup-roadmap-row.qol-rup-roadmap-complete td{background:#dddcd8!important;color:#777!important}#${PANEL_ID} .qol-rup-roadmap-row.qol-rup-roadmap-complete .qol-rup-action-name{color:#777!important}
            #${PANEL_ID} .qol-rup-roadmap-row.qol-rup-roadmap-queued td{background:#fffaf0!important}
            #${PANEL_ID} .qol-rup-roadmap-queue-time{display:inline-block!important;margin-left:5px!important;color:#916618!important;font-size:8px!important;font-weight:800!important;font-variant-numeric:tabular-nums!important}
            #${PANEL_ID} .qol-rup-roadmap-cost{display:inline-flex!important;align-items:center!important;gap:2px!important;margin-right:6px!important;white-space:nowrap!important;font-size:8px!important}#${PANEL_ID} .qol-rup-roadmap-resource{display:inline-block!important;width:14px!important;height:14px!important;min-width:14px!important}
            #${PANEL_ID} .qol-rup-roadmap-empty{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:6px!important;padding:14px!important;border:1px dashed #bda98a!important;border-radius:4px!important;background:#fffdf8!important;color:#76634a!important;font-size:9px!important}#${PANEL_ID} .qol-rup-roadmap-empty strong{color:#49351f!important;font-size:10px!important}
            #${PANEL_ID} .qol-rup-roadmap-complete-banner{margin-bottom:6px!important;padding:7px 9px!important;border:1px solid #91ac73!important;border-radius:4px!important;background:#edf5e5!important;color:#4d6d2d!important;font-size:9px!important;font-weight:800!important}
            @media(max-width:850px){#${PANEL_ID} .qol-rup-roadmap-toolbar{grid-template-columns:1fr!important}#${PANEL_ID} .qol-rup-roadmap-summary{flex-wrap:wrap!important}}
        `;
        document.head.appendChild(style);
    }

    function ensureRoadmapShell() {
        const results = document.querySelector(`#${PANEL_ID} [data-results].show`);
        if (!results) return null;
        const tabs = results.querySelector('.qol-rup-tabs');
        if (!tabs) return null;
        let tab = tabs.querySelector('[data-tab="roadmap"]');
        if (!tab) {
            tab = document.createElement('div');
            tab.className = 'qol-rup-tab';
            tab.dataset.tab = 'roadmap';
            tab.setAttribute('role', 'button');
            tab.setAttribute('tabindex', '0');
            tab.textContent = 'Roadmap';
            tabs.appendChild(tab);
        }
        let view = results.querySelector('[data-view="roadmap"]');
        if (!view) {
            view = document.createElement('div');
            view.className = 'qol-rup-view';
            view.dataset.view = 'roadmap';
            view.dataset.rupRoadmapView = 'true';
            results.appendChild(view);
        }
        return view;
    }

    function villageFromSnapshot(snapshot, identity = currentVillageIdentity()) {
        if (!snapshot?.villages?.length) return null;
        if (identity.villageId) {
            const byId = snapshot.villages.find(village => String(village.villageId) === String(identity.villageId));
            if (byId) return byId;
        }
        const normalizedName = String(identity.villageName || '').trim().toLocaleLowerCase();
        return snapshot.villages.find(village => String(village.name || '').trim().toLocaleLowerCase() === normalizedName) || null;
    }

    function renderRoadmap(snapshot = lastRoadmapSnapshot) {
        const view = ensureRoadmapShell();
        if (!view || !roadmapLoaded) return;
        const identity = currentVillageIdentity();
        const key = roadmapKey(identity);
        const roadmap = key ? roadmapStore.villages[key] || null : null;
        const village = villageFromSnapshot(snapshot, identity);
        const html = roadmapViewHtml(roadmap, village);
        const signature = JSON.stringify({
            key,
            roadmapUpdated: roadmap?.updatedAt || 0,
            manualDone: roadmap?.manualDone || [],
            villageLevelState: village?.buildings?.map(building => [building.buildingType, building.locationId, building.lvl]) || [],
            queueState: queueItems(village).map(item => [item.locationId, item.buildingType, item.levelDifference, item.queuePosition, item.finishTime]),
            tick: Math.floor(Date.now() / 2000)
        });
        if (view.dataset.rupRoadmapSignature === signature) return;
        view.dataset.rupRoadmapSignature = signature;
        view.innerHTML = html;
    }

    async function refreshRoadmapStatus(force = false) {
        if (roadmapRefreshBusy) return;
        const panel = document.getElementById(PANEL_ID);
        if (!panel?.classList.contains('qol-open')) return;
        const now = Date.now();
        if (!force && now - lastRoadmapRefreshAt < 1400) {
            renderRoadmap(lastRoadmapSnapshot);
            return;
        }
        roadmapRefreshBusy = true;
        try {
            const snapshot = await requestDashboardSnapshot();
            if (snapshot) lastRoadmapSnapshot = snapshot;
            lastRoadmapRefreshAt = Date.now();
            renderRoadmap(lastRoadmapSnapshot);
        } finally {
            roadmapRefreshBusy = false;
        }
    }

    async function syncRoadmapUI() {
        injectRoadmapStyles();
        await loadRoadmaps();
        const view = ensureRoadmapShell();
        if (!view) return;
        await ensureAutomaticRoadmap();
        renderRoadmap(lastRoadmapSnapshot);
        void refreshRoadmapStatus(false);
    }

    async function handleRoadmapAction(action) {
        const identity = currentVillageIdentity();
        const key = roadmapKey(identity);
        if (!key) return;
        await loadRoadmaps();

        if (action === 'create') {
            const roadmap = await createRoadmapFromCurrentPlan(true);
            if (!roadmap) return;
            renderRoadmap(lastRoadmapSnapshot);
            void refreshRoadmapStatus(true);
            return;
        }
        if (action === 'refresh') {
            void refreshRoadmapStatus(true);
            return;
        }
        if (action === 'replace') {
            if (!window.confirm(`Replace the saved roadmap for ${identity.villageName} with the recommendations currently shown?`)) return;
            await createRoadmapFromCurrentPlan(true);
            renderRoadmap(lastRoadmapSnapshot);
            void refreshRoadmapStatus(true);
            return;
        }
        if (action === 'clear') {
            if (!window.confirm(`Clear the saved Resource Upgrade roadmap for ${identity.villageName}?`)) return;
            delete roadmapStore.villages[key];
            roadmapStore.suppressed[key] = true;
            await saveRoadmaps();
            renderRoadmap(lastRoadmapSnapshot);
        }
    }

    async function setManualRoadmapCompletion(stepId, completed) {
        await loadRoadmaps();
        const key = roadmapKey();
        const roadmap = key ? roadmapStore.villages[key] : null;
        if (!roadmap) return;
        const done = new Set(roadmap.manualDone || []);
        if (completed) done.add(String(stepId));
        else done.delete(String(stepId));
        roadmap.manualDone = [...done];
        roadmap.updatedAt = Date.now();
        await saveRoadmaps();
        renderRoadmap(lastRoadmapSnapshot);
    }

    function bindRoadmapEvents() {
        document.addEventListener('click', event => {
            const actionNode = event.target.closest?.('[data-rup-roadmap-action]');
            if (!actionNode || !document.getElementById(PANEL_ID)?.contains(actionNode)) return;
            event.preventDefault();
            event.stopPropagation();
            void handleRoadmapAction(actionNode.dataset.rupRoadmapAction);
        }, true);

        document.addEventListener('change', event => {
            const checkbox = event.target.closest?.('[data-rup-roadmap-complete]');
            if (!checkbox || !document.getElementById(PANEL_ID)?.contains(checkbox)) return;
            event.stopPropagation();
            void setManualRoadmapCompletion(checkbox.dataset.rupRoadmapComplete, checkbox.checked === true);
        }, true);
    }

    function sync() {
        scheduled = false;
        injectSettingsCard();
        injectCollapsedToolbarEntry();
        injectRadialItem();
        positionPlannerButton();
        void syncRoadmapUI();
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(sync);
    }

    registerRadialAction();
    bindRoadmapEvents();

    const begin = () => {
        sync();
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        window.addEventListener('resize', schedule, { passive: true });
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('hashchange', schedule);
        window.addEventListener('qol_setting_changed', schedule);
        window.setTimeout(schedule, 250);
        window.setTimeout(schedule, 1000);
        roadmapPollTimer = window.setInterval(() => {
            const panel = document.getElementById(PANEL_ID);
            if (!panel?.classList.contains('qol-open')) return;
            renderRoadmap(lastRoadmapSnapshot);
            void refreshRoadmapStatus(false);
        }, 2000);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, { once: true });
    else begin();
})();
