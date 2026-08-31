/**
 * APES QoL v2 — Resource Upgrade Planner preference + per-village scan state.
 *
 * Keeps the feature preference when APES server cache is cleared and makes the
 * planner's scanned village state persistent by numeric villId. Each village is
 * scanned once, restored automatically when revisited, and keeps its own
 * roadmap/results context without another navigation scan.
 */
(() => {
    'use strict';

    const APES = window.APES;
    const FEATURE_KEY = 'resourceUpgradePlanner';
    const PREFERENCE_KEY = 'qolpref_resourceUpgradePlanner';
    const PANEL_ID = 'qol-resource-upgrade-planner-overlay';
    const VILLAGE_STATE_STORAGE = Object.freeze({
        feature: FEATURE_KEY,
        key: 'villageScanStates',
        scope: 'player'
    });
    const FALLBACK_KEY = `apes_resource_upgrade_village_states_v1_${location.hostname}`;
    const SYNC_INTERVAL_MS = 700;
    const SCAN_WATCH_MS = 220;

    const originalIsEnabled = window.isQolEnabled;
    let villageStore = { version: 1, villages: {} };
    let storeLoaded = false;
    let storeLoadPromise = null;
    let appliedVillageId = '';
    let appliedHasSavedState = false;
    let restoreBusy = false;
    let pendingScan = null;
    let scanWatchTimer = null;
    let lastSavedFingerprint = '';

    window.isQolEnabled = function(key) {
        if (key === FEATURE_KEY) {
            try {
                const saved = localStorage.getItem(PREFERENCE_KEY);
                if (saved !== null) return saved !== 'false';
            } catch (_) {}
        }
        return typeof originalIsEnabled === 'function' ? originalIsEnabled(key) : true;
    };

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== FEATURE_KEY) return;
        try { localStorage.setItem(PREFERENCE_KEY, String(event.detail.enabled !== false)); } catch (_) {}
    });

    function clone(value) {
        try { return JSON.parse(JSON.stringify(value)); }
        catch (_) { return null; }
    }

    function normalizeStore(raw) {
        const output = { version: 1, villages: {} };
        if (!raw || typeof raw !== 'object' || !raw.villages || typeof raw.villages !== 'object') return output;
        for (const [key, entry] of Object.entries(raw.villages)) {
            if (!/^id:\d+$/.test(key) || !entry || typeof entry !== 'object' || !entry.state) continue;
            const villageId = String(entry.villageId || key.slice(3));
            if (!/^\d+$/.test(villageId)) continue;
            output.villages[`id:${villageId}`] = {
                villageId,
                villageName: String(entry.villageName || 'Village'),
                scannedAt: Number(entry.scannedAt) || Date.now(),
                updatedAt: Number(entry.updatedAt) || Number(entry.scannedAt) || Date.now(),
                state: clone(entry.state)
            };
        }
        return output;
    }

    async function loadStore() {
        if (storeLoaded) return villageStore;
        if (storeLoadPromise) return storeLoadPromise;
        storeLoadPromise = (async () => {
            let saved = null;
            try {
                if (APES?.storage?.get) saved = await APES.storage.get(VILLAGE_STATE_STORAGE, null);
            } catch (error) {
                console.warn('[APES Resource Planner] Per-village state read failed:', error);
            }
            if (!saved) {
                try { saved = JSON.parse(localStorage.getItem(FALLBACK_KEY) || 'null'); } catch (_) {}
            }
            villageStore = normalizeStore(saved);
            storeLoaded = true;
            return villageStore;
        })();
        return storeLoadPromise;
    }

    async function saveStore() {
        const snapshot = clone(villageStore) || { version: 1, villages: {} };
        try {
            if (APES?.storage?.set) {
                await APES.storage.set(VILLAGE_STATE_STORAGE, snapshot);
                return;
            }
        } catch (error) {
            console.warn('[APES Resource Planner] Per-village state write failed:', error);
        }
        try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot)); } catch (_) {}
    }

    function currentVillageIdentity() {
        const hashId = String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
        const contextId = String(APES?.context?.getVillageId?.() || '');
        const villageId = /^\d+$/.test(hashId)
            ? hashId
            : (/^\d+$/.test(contextId) ? contextId : '');
        const contextName = String(APES?.context?.getVillageName?.() || '').trim();
        const domName = String(document.querySelector(
            '.currentVillageName .dropdownHead .selectedItem .villageEntry, ' +
            '#villageList .dropdownHead .selectedItem .villageEntry, ' +
            '.dropdownHead .selectedItem .villageEntry'
        )?.textContent || '').replace(/\s+/g, ' ').trim();
        return {
            villageId,
            villageName: contextName && contextName !== 'Unknown village'
                ? contextName
                : (domName || 'Village')
        };
    }

    function villageKey(villageId) {
        const id = String(villageId || '');
        return /^\d+$/.test(id) ? `id:${id}` : '';
    }

    function plannerApi() {
        const api = window.APES_RESOURCE_UPGRADE_PLANNER;
        return api?.getState && api?.setState ? api : null;
    }

    function panel() {
        return document.getElementById(PANEL_ID);
    }

    function panelIsOpen() {
        return panel()?.classList.contains('qol-open') === true;
    }

    function roadmapWasActive() {
        return panel()?.querySelector('[data-tab="roadmap"].active') !== null;
    }

    function clickCalculate() {
        const control = panel()?.querySelector('[data-action="calculate"]');
        if (!control) return false;
        control.click();
        return true;
    }

    function restoreRoadmapTab(keepRoadmap) {
        if (!keepRoadmap) return;
        let attempts = 0;
        const timer = window.setInterval(() => {
            attempts += 1;
            const tab = panel()?.querySelector('[data-tab="roadmap"]');
            if (tab) {
                window.clearInterval(timer);
                tab.click();
                return;
            }
            if (attempts >= 12) window.clearInterval(timer);
        }, 80);
    }

    function hideResultsForUnscannedVillage() {
        const root = panel()?.querySelector('[data-results]');
        if (!root) return;
        root.classList.remove('show');
        root.innerHTML = '';
    }

    function blankStateFrom(current) {
        const source = current && typeof current === 'object' ? current : {};
        return {
            layout: '4-4-4-6',
            maxLevel: 10,
            speed: [1, 2, 3, 5].includes(Number(source.speed)) ? Number(source.speed) : 1,
            steps: Math.min(100, Math.max(15, Number(source.steps) || 15)),
            goldBoost: source.goldBoost === true,
            fields: { wood: [], clay: [], iron: [], crop: [] },
            buildings: { sawmill: 0, brickyard: 0, foundry: 0, mill: 0, bakery: 0, embassy: 0 },
            oases: [],
            completionPlanKey: '',
            completedSteps: []
        };
    }

    function updateLoadedStatus(entry, identity) {
        const status = panel()?.querySelector('[data-scan-status]');
        if (!status || !entry) return;
        const ageMinutes = Math.max(0, Math.floor((Date.now() - Number(entry.scannedAt || 0)) / 60000));
        status.textContent = `Loaded saved scan for ${identity.villageName}${ageMinutes > 0 ? ` · ${ageMinutes}m old` : ''}.`;
        status.dataset.tone = 'success';
    }

    function updateUnscannedStatus(identity) {
        const status = panel()?.querySelector('[data-scan-status]');
        if (!status) return;
        status.textContent = `${identity.villageName} has not been scanned yet.`;
        status.dataset.tone = 'neutral';
    }

    async function restoreActiveVillage(force = false) {
        if (restoreBusy) return;
        const api = plannerApi();
        if (!api) return;
        const identity = currentVillageIdentity();
        if (!identity.villageId) return;
        if (!force && appliedVillageId === identity.villageId) {
            if (panelIsOpen() && appliedHasSavedState) ensureCurrentVillageResults();
            return;
        }

        restoreBusy = true;
        try {
            await loadStore();
            const key = villageKey(identity.villageId);
            const entry = key ? villageStore.villages[key] || null : null;
            const keepRoadmap = roadmapWasActive();

            if (entry?.state) {
                await api.setState(clone(entry.state));
                appliedHasSavedState = true;
                lastSavedFingerprint = JSON.stringify(entry.state);
                if (panel()) {
                    clickCalculate();
                    restoreRoadmapTab(keepRoadmap);
                    updateLoadedStatus(entry, identity);
                }
            } else {
                const current = api.getState?.() || null;
                await api.setState(blankStateFrom(current));
                appliedHasSavedState = false;
                lastSavedFingerprint = '';
                hideResultsForUnscannedVillage();
                if (panel()) updateUnscannedStatus(identity);
            }
            appliedVillageId = identity.villageId;
        } catch (error) {
            console.warn('[APES Resource Planner] Could not restore village planner state:', error);
        } finally {
            restoreBusy = false;
        }
    }

    function ensureCurrentVillageResults() {
        if (!panelIsOpen() || !appliedHasSavedState) return;
        const results = panel()?.querySelector('[data-results]');
        if (results?.classList.contains('show')) return;
        const keepRoadmap = roadmapWasActive();
        if (clickCalculate()) restoreRoadmapTab(keepRoadmap);
    }

    async function saveVillageState(identity, state, scannedAt = Date.now()) {
        if (!identity?.villageId || !state) return;
        await loadStore();
        const key = villageKey(identity.villageId);
        if (!key) return;
        const now = Date.now();
        villageStore.villages[key] = {
            villageId: identity.villageId,
            villageName: identity.villageName || 'Village',
            scannedAt: Number(scannedAt) || now,
            updatedAt: now,
            state: clone(state)
        };
        lastSavedFingerprint = JSON.stringify(state);
        appliedVillageId = identity.villageId;
        appliedHasSavedState = true;
        await saveStore();
        window.dispatchEvent(new CustomEvent('apes_resource_upgrade_village_state_saved', {
            detail: {
                villageId: identity.villageId,
                villageName: identity.villageName || 'Village',
                scannedAt: Number(scannedAt) || now
            }
        }));
    }

    function stopScanWatch() {
        if (scanWatchTimer !== null) window.clearInterval(scanWatchTimer);
        scanWatchTimer = null;
    }

    function startScanWatch(identity) {
        stopScanWatch();
        pendingScan = {
            villageId: identity.villageId,
            villageName: identity.villageName,
            startedAt: Date.now()
        };
        scanWatchTimer = window.setInterval(async () => {
            if (!pendingScan) {
                stopScanWatch();
                return;
            }
            const currentPanel = panel();
            const status = currentPanel?.querySelector('[data-scan-status]');
            const scanControl = currentPanel?.querySelector('[data-action="scan"]');
            const busy = scanControl?.classList.contains('qol-disabled') || scanControl?.getAttribute('aria-disabled') === 'true';
            const tone = String(status?.dataset?.tone || '');
            const text = String(status?.textContent || '').trim();

            if (tone === 'error' && !busy) {
                pendingScan = null;
                stopScanWatch();
                return;
            }
            if (busy || tone !== 'success' || !/^Scanned\s+/i.test(text)) return;

            const api = plannerApi();
            const scanned = pendingScan;
            pendingScan = null;
            stopScanWatch();
            const state = api?.getState?.();
            if (!state) return;
            await saveVillageState(scanned, state, Date.now());
        }, SCAN_WATCH_MS);
    }

    async function persistCurrentVillageEdits() {
        if (restoreBusy || pendingScan) return;
        const identity = currentVillageIdentity();
        if (!identity.villageId || appliedVillageId !== identity.villageId || !appliedHasSavedState) return;
        const api = plannerApi();
        const state = api?.getState?.();
        if (!state) return;
        const fingerprint = JSON.stringify(state);
        if (fingerprint === lastSavedFingerprint) return;
        await saveVillageState(identity, state, villageStore.villages[villageKey(identity.villageId)]?.scannedAt || Date.now());
    }

    function handlePlannerClick(event) {
        const scanControl = event.target.closest?.(`#${PANEL_ID} [data-action="scan"]`);
        if (!scanControl) return;
        const identity = currentVillageIdentity();
        if (!identity.villageId) return;
        startScanWatch(identity);
    }

    function handlePlannerChange(event) {
        const target = event.target;
        if (!target || !panel()?.contains(target)) return;
        if (target.closest?.('[data-rup-roadmap-complete]')) return;
        window.setTimeout(() => { void persistCurrentVillageEdits(); }, 80);
    }

    function scheduleRestore(force = false) {
        window.setTimeout(() => { void restoreActiveVillage(force); }, 0);
    }

    document.addEventListener('click', handlePlannerClick, true);
    document.addEventListener('change', handlePlannerChange, true);

    window.addEventListener('hashchange', () => scheduleRestore(false));
    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key === FEATURE_KEY && event.detail.enabled !== false) scheduleRestore(true);
    });

    const observer = new MutationObserver(() => {
        if (!panelIsOpen()) return;
        scheduleRestore(false);
        ensureCurrentVillageResults();
    });
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });

    window.setInterval(() => {
        const identity = currentVillageIdentity();
        if (!identity.villageId) return;
        if (identity.villageId !== appliedVillageId) {
            void restoreActiveVillage(false);
            return;
        }
        ensureCurrentVillageResults();
    }, SYNC_INTERVAL_MS);

    loadStore().then(() => scheduleRestore(true));

    window.APES_RESOURCE_UPGRADE_VILLAGE_STATES = Object.freeze({
        get: async villageId => {
            await loadStore();
            const entry = villageStore.villages[villageKey(villageId)];
            return entry ? clone(entry) : null;
        },
        list: async () => {
            await loadStore();
            return Object.values(villageStore.villages).map(entry => ({
                villageId: entry.villageId,
                villageName: entry.villageName,
                scannedAt: entry.scannedAt,
                updatedAt: entry.updatedAt
            }));
        }
    });
})();
