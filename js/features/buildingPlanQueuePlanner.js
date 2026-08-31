/**
 * APES QoL v2 — Building Plan / Queue Planner
 *
 * Independent per-village development roadmap for buildings and resource fields.
 * Uses Account Operations Center cache data for live levels and BuildingQueue
 * state. Plans remain persistent and do not require their own village scanner.
 */
(() => {
    'use strict';

    const APES = window.APES;
    const FEATURE_KEY = 'buildingPlanQueuePlanner';
    const PANEL_ID = 'qol-building-plan-panel';
    const BUTTON_ID = 'qol-building-plan-toggle-btn';
    const STYLE_ID = 'qol-building-plan-styles';
    const STORAGE_OPTIONS = Object.freeze({ feature: FEATURE_KEY, key: 'plans', scope: 'player' });
    const FALLBACK_KEY = `apes_building_plan_queue_v1_${location.hostname}`;
    const GEOMETRY_KEY = `apes_building_plan_geometry_v1_${location.hostname}`;
    const REFRESH_MS = 1400;
    const MIN_WIDTH = 560;
    const MIN_HEIGHT = 360;
    const DEFAULT_WIDTH = 900;
    const DEFAULT_HEIGHT = 620;

    const RESOURCE_ICONS = Object.freeze({
        wood: 'unit_wood_small_illu resType1',
        clay: 'unit_clay_small_illu resType2',
        iron: 'unit_iron_small_illu resType3',
        crop: 'unit_crop_small_illu resType4'
    });

    // Base level-1 cost + growth factor. Costs are estimates and are rounded
    // to Travian's normal 5-resource increments. Kingdoms-specific Cropland
    // costs use a fixed table because its crop component differs from Legends.
    const BUILDINGS = Object.freeze({
        1:  { name:'Woodcutter', category:'Resource fields', max:20, base:[40,100,50,60], factor:1.67, field:true },
        2:  { name:'Clay Pit', category:'Resource fields', max:20, base:[80,40,80,50], factor:1.67, field:true },
        3:  { name:'Iron Mine', category:'Resource fields', max:20, base:[100,80,30,60], factor:1.67, field:true },
        4:  { name:'Cropland', category:'Resource fields', max:20, field:true, costs:[
            null,[75,90,85,0],[125,150,140,0],[210,250,235,0],[350,420,395,0],
            [585,700,660,0],[975,1170,1105,0],[1625,1950,1845,0],[2715,3260,3080,0],
            [4535,5445,5140,0],[7575,9095,8590,0],[12655,15185,14340,0],
            [21130,25360,23950,0],[35290,42350,39995,0],[58935,70720,66795,0],
            [98420,118105,111545,0],[164365,197240,186280,0],[274490,329385,311085,0],
            [458395,550075,519515,0],[765520,918625,867590,0],[1278420,1534105,1448880,0]
        ] },
        5:  { name:'Sawmill', category:'Production', max:5, base:[520,380,290,90], factor:1.8 },
        6:  { name:'Brickyard', category:'Production', max:5, base:[440,480,320,50], factor:1.8 },
        7:  { name:'Iron Foundry', category:'Production', max:5, base:[200,450,510,120], factor:1.8 },
        8:  { name:'Grain Mill', category:'Production', max:5, base:[500,440,380,1240], factor:1.8 },
        9:  { name:'Bakery', category:'Production', max:5, base:[1200,1480,870,1600], factor:1.8 },
        10: { name:'Warehouse', category:'Infrastructure', max:20, base:[130,160,90,40], factor:1.28 },
        11: { name:'Granary', category:'Infrastructure', max:20, base:[80,100,70,20], factor:1.28 },
        12: { name:'Smithy', category:'Military', max:20, base:[180,250,500,160], factor:1.28 },
        14: { name:'Tournament Square', category:'Military', max:20, base:[1750,2250,1530,240], factor:1.28 },
        15: { name:'Main Building', category:'Infrastructure', max:20, base:[70,40,60,20], factor:1.28 },
        16: { name:'Rally Point', category:'Military', max:20, base:[110,160,90,70], factor:1.28 },
        17: { name:'Marketplace', category:'Infrastructure', max:20, base:[80,70,120,70], factor:1.28 },
        18: { name:'Embassy', category:'Infrastructure', max:20, base:[180,130,150,80], factor:1.28 },
        19: { name:'Barracks', category:'Military', max:20, base:[210,140,260,120], factor:1.28 },
        20: { name:'Stable', category:'Military', max:20, base:[260,140,220,100], factor:1.28 },
        21: { name:'Workshop', category:'Military', max:20, base:[460,510,600,320], factor:1.28 },
        22: { name:'Academy', category:'Military', max:20, base:[220,160,90,40], factor:1.28 },
        23: { name:'Cranny', category:'Infrastructure', max:20, base:[40,50,30,10], factor:1.28 },
        24: { name:'Town Hall', category:'Infrastructure', max:20, base:[1250,1110,1260,600], factor:1.28 },
        25: { name:'Residence', category:'Expansion', max:20, base:[580,460,350,180], factor:1.28 },
        26: { name:'Palace', category:'Expansion', max:20, base:[550,800,750,250], factor:1.28 },
        27: { name:'Treasury', category:'Infrastructure', max:20, base:[2880,2740,2580,990], factor:1.26 },
        28: { name:'Trade Office', category:'Infrastructure', max:20, base:[1400,1330,1200,400], factor:1.28 },
        29: { name:'Great Barracks', category:'Military', max:20, base:[630,420,780,360], factor:1.28 },
        30: { name:'Great Stable', category:'Military', max:20, base:[780,420,660,300], factor:1.28 },
        31: { name:'City Wall', category:'Defence', max:20, base:[70,90,170,70], factor:1.28 },
        32: { name:'Earth Wall', category:'Defence', max:20, base:[120,200,0,80], factor:1.28 },
        33: { name:'Palisade', category:'Defence', max:20, base:[160,100,80,60], factor:1.28 },
        34: { name:"Stonemason's Lodge", category:'Infrastructure', max:20, base:[155,130,125,70], factor:1.28 },
        35: { name:'Brewery', category:'Military', max:20, base:[3210,2050,2750,3830], factor:1.24 },
        36: { name:'Trapper', category:'Defence', max:20, base:[80,120,70,90], factor:1.28 },
        37: { name:"Hero's Mansion", category:'Infrastructure', max:20, base:[700,670,700,240], factor:1.33 },
        38: { name:'Great Warehouse', category:'Infrastructure', max:20, base:[650,800,450,200], factor:1.28 },
        39: { name:'Great Granary', category:'Infrastructure', max:20, base:[400,500,350,100], factor:1.28 },
        40: { name:'Wonder of the World', category:'Special', max:100, base:[66700,69050,72200,13200], factor:1.0275 },
        41: { name:'Horse Drinking Trough', category:'Military', max:20, base:[780,420,660,540], factor:1.28 },
        46: { name:'Healing Tent', category:'Military', max:20, base:[320,280,420,360], factor:1.28 }
    });

    let store = { version:1, villages:{} };
    let storeLoaded = false;
    let loadPromise = null;
    let activeVillageId = '';
    let activeSnapshotVillage = null;
    let refreshTimer = null;
    let resizeState = null;

    function enabled() {
        return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY) === true;
    }
    function clone(value) {
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; }
    }
    function escapeHtml(value) {
        return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
            .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
    }
    function number(value, fallback = null) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    function formatInteger(value) {
        return Math.max(0, Math.round(Number(value) || 0)).toLocaleString();
    }
    function currentVillageIdentity() {
        const hashId = String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
        const contextId = String(APES?.context?.getVillageId?.() || '');
        const villageId = /^\d+$/.test(hashId) ? hashId : (/^\d+$/.test(contextId) ? contextId : '');
        const contextName = String(APES?.context?.getVillageName?.() || '').trim();
        const domName = String(document.querySelector('.currentVillageName .dropdownHead .selectedItem .villageEntry,#villageList .dropdownHead .selectedItem .villageEntry')?.textContent || '').replace(/\s+/g,' ').trim();
        return { villageId, villageName: contextName && contextName !== 'Unknown village' ? contextName : (domName || 'Village') };
    }
    function normalizeStore(raw) {
        const next = { version:1, villages:{} };
        if (!raw?.villages || typeof raw.villages !== 'object') return next;
        Object.entries(raw.villages).forEach(([id, plan]) => {
            if (!/^\d+$/.test(String(id)) || !plan || typeof plan !== 'object') return;
            next.villages[String(id)] = {
                villageId:String(id),
                villageName:String(plan.villageName || 'Village'),
                costReduction:Math.min(30, Math.max(0, Number(plan.costReduction) || 0)),
                createdAt:Number(plan.createdAt) || Date.now(),
                updatedAt:Number(plan.updatedAt) || Date.now(),
                steps:Array.isArray(plan.steps) ? plan.steps.map((step,index) => normalizeStep(step,index)).filter(Boolean) : []
            };
        });
        return next;
    }
    function normalizeStep(step, index = 0) {
        const type = Number(step?.buildingType);
        const definition = BUILDINGS[type];
        if (!definition) return null;
        const targetLevel = Math.min(definition.max, Math.max(1, Number(step?.targetLevel) || 1));
        const locationId = /^\d+$/.test(String(step?.locationId ?? '')) ? String(step.locationId) : '';
        return {
            id:String(step?.id || `step:${Date.now()}:${index}:${Math.random().toString(36).slice(2,7)}`),
            buildingType:type,
            locationId,
            targetLevel,
            note:String(step?.note || '').slice(0,120)
        };
    }
    async function loadStore() {
        if (storeLoaded) return store;
        if (loadPromise) return loadPromise;
        loadPromise = (async () => {
            let saved = null;
            try { if (APES?.storage?.get) saved = await APES.storage.get(STORAGE_OPTIONS, null); }
            catch (error) { console.warn('[APES Building Plan] Storage read failed:', error); }
            if (!saved) {
                try { saved = JSON.parse(localStorage.getItem(FALLBACK_KEY) || 'null'); } catch (_) {}
            }
            store = normalizeStore(saved);
            storeLoaded = true;
            return store;
        })();
        return loadPromise;
    }
    async function saveStore() {
        const snapshot = clone(store);
        try {
            if (APES?.storage?.set) {
                await APES.storage.set(STORAGE_OPTIONS, snapshot);
                return;
            }
        } catch (error) { console.warn('[APES Building Plan] Storage write failed:', error); }
        try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot)); } catch (_) {}
    }
    function planFor(identity = currentVillageIdentity(), create = true) {
        if (!identity.villageId) return null;
        let plan = store.villages[identity.villageId] || null;
        if (!plan && create) {
            plan = {
                villageId:identity.villageId,
                villageName:identity.villageName || 'Village',
                costReduction:0,
                createdAt:Date.now(),
                updatedAt:Date.now(),
                steps:[]
            };
            store.villages[identity.villageId] = plan;
        }
        if (plan && identity.villageName && plan.villageName !== identity.villageName) plan.villageName = identity.villageName;
        return plan;
    }
    function buildingDefinition(type) {
        return BUILDINGS[Number(type)] || { name:`Building ${type}`, max:20, category:'Other' };
    }
    function buildingLevelCost(type, level) {
        const def = BUILDINGS[Number(type)];
        if (!def || level < 1 || level > def.max) return [0,0,0,0];
        if (Array.isArray(def.costs?.[level])) return def.costs[level].slice();
        if (!def.base || !def.factor) return [0,0,0,0];
        return def.base.map(value => Math.round((Number(value) * Math.pow(def.factor, level - 1)) / 5) * 5);
    }
    function sumCosts(type, fromLevelExclusive, toLevelInclusive, reduction = 0) {
        const totals = [0,0,0,0];
        for (let level = Math.max(1, Number(fromLevelExclusive) + 1); level <= Number(toLevelInclusive); level += 1) {
            const cost = buildingLevelCost(type, level);
            cost.forEach((value,index) => { totals[index] += value; });
        }
        const multiplier = 1 - Math.min(30, Math.max(0, Number(reduction) || 0)) / 100;
        return totals.map(value => Math.max(0, Math.round(value * multiplier)));
    }
    function addCosts(a,b) { return [0,1,2,3].map(index => Number(a?.[index] || 0) + Number(b?.[index] || 0)); }
    function totalCost(cost) { return (cost || []).reduce((sum,value) => sum + Number(value || 0),0); }
    function costHtml(cost) {
        return ['wood','clay','iron','crop'].map((resource,index) => `<span class="qol-bp-cost-part"><i class="${RESOURCE_ICONS[resource]}"></i><b>${formatInteger(cost?.[index])}</b></span>`).join('');
    }
    function queueItems(village) {
        const queues = village?.buildingQueue?.queues;
        if (!queues || typeof queues !== 'object') return [];
        const output = [];
        const push = item => { if (item && typeof item === 'object' && !Array.isArray(item)) output.push(item); };
        Object.values(queues).forEach(bucket => {
            if (Array.isArray(bucket)) bucket.forEach(push);
            else if (bucket && typeof bucket === 'object') {
                if ('locationId' in bucket || 'buildingType' in bucket) push(bucket);
                else Object.values(bucket).forEach(value => Array.isArray(value) ? value.forEach(push) : push(value));
            }
        });
        return output;
    }
    function snapshotVillages() {
        return window.APES_ACCOUNT_OPERATIONS_CENTER?.getVillages?.() || [];
    }
    function refreshSnapshotVillage(identity = currentVillageIdentity()) {
        const villages = snapshotVillages();
        activeSnapshotVillage = villages.find(village => String(village?.villageId || '') === String(identity.villageId || '')) || null;
        return activeSnapshotVillage;
    }
    function matchingBuildings(village, type) {
        return (village?.buildings || [])
            .filter(building => Number(building?.buildingType) === Number(type))
            .sort((a,b) => Number(a?.locationId || 999) - Number(b?.locationId || 999));
    }
    function resolveStepBuilding(village, step) {
        const matches = matchingBuildings(village, step.buildingType);
        if (step.locationId) {
            const exact = matches.find(building => String(building?.locationId || '') === String(step.locationId));
            return exact || null;
        }
        return matches.sort((a,b) => Number(b?.lvl || 0) - Number(a?.lvl || 0))[0] || null;
    }
    function queueLocation(item) {
        const value = item?.locationId ?? item?.buildingLocationId ?? item?.location ?? item?.building?.locationId;
        return number(value, null);
    }
    function queueType(item, village) {
        const direct = number(item?.buildingType ?? item?.buildingTypeId ?? item?.building?.buildingType ?? item?.type, null);
        if (direct !== null) return direct;
        const location = queueLocation(item);
        return location === null ? null : number((village?.buildings || []).find(building => Number(building?.locationId) === location)?.buildingType, null);
    }
    function queueFinish(item) {
        const raw = item?.finishTime ?? item?.endTime ?? item?.finishAt ?? item?.finished;
        const numeric = Number(raw);
        if (!Number.isFinite(numeric) || numeric <= 0) return null;
        return numeric < 100000000000 ? numeric * 1000 : numeric;
    }
    function queuedTargetLevel(item, currentLevel, fallbackIndex) {
        const explicit = number(item?.targetLevel ?? item?.targetLvl ?? item?.toLevel, null);
        if (explicit !== null) return explicit;
        const difference = number(item?.levelDifference, null);
        if (difference !== null && difference >= 0) return currentLevel + difference + 1;
        const position = number(item?.queuePosition, null);
        if (position !== null && position >= 0) return currentLevel + position + 1;
        return currentLevel + fallbackIndex + 1;
    }
    function evaluateStep(village, step) {
        const building = resolveStepBuilding(village, step);
        const currentLevel = Math.max(0, number(building?.lvl, 0));
        if (currentLevel >= step.targetLevel) {
            return { status:'complete', currentLevel, queuedLevel:currentLevel, finish:null, building };
        }
        const location = step.locationId || String(building?.locationId || '');
        const matchingQueue = queueItems(village).filter(item => {
            const itemLocation = queueLocation(item);
            if (location && itemLocation !== null) return String(itemLocation) === String(location);
            return Number(queueType(item, village)) === Number(step.buildingType);
        });
        let queuedLevel = currentLevel;
        let finish = null;
        matchingQueue.forEach((item,index) => {
            const target = queuedTargetLevel(item, currentLevel, index);
            if (target > queuedLevel) {
                queuedLevel = target;
                finish = queueFinish(item) || finish;
            }
        });
        if (queuedLevel >= step.targetLevel) return { status:'queued', currentLevel, queuedLevel, finish, building };
        return { status:'pending', currentLevel, queuedLevel, finish, building };
    }
    function stepInstanceKey(step, evaluation) {
        const location = step.locationId || evaluation?.building?.locationId || '';
        return location ? `${step.buildingType}:loc:${location}` : `${step.buildingType}:auto`;
    }
    function evaluatePlan(plan, village) {
        const projected = new Map();
        let remainingTotal = [0,0,0,0];
        let fullPlanTotal = [0,0,0,0];
        const rows = plan.steps.map(step => {
            const evaluation = evaluateStep(village, step);
            const key = stepInstanceKey(step, evaluation);
            const baseline = Math.max(evaluation.currentLevel, projected.get(key) || evaluation.currentLevel);
            const plannedCost = step.targetLevel > baseline
                ? sumCosts(step.buildingType, baseline, step.targetLevel, plan.costReduction)
                : [0,0,0,0];
            const liveRemainingCost = step.targetLevel > evaluation.currentLevel
                ? sumCosts(step.buildingType, evaluation.currentLevel, step.targetLevel, plan.costReduction)
                : [0,0,0,0];
            projected.set(key, Math.max(baseline, step.targetLevel));
            fullPlanTotal = addCosts(fullPlanTotal, plannedCost);
            if (evaluation.status !== 'complete') remainingTotal = addCosts(remainingTotal, plannedCost);
            return { step, evaluation, plannedCost, liveRemainingCost };
        });
        const counts = rows.reduce((acc,row) => {
            acc[row.evaluation.status] += 1;
            return acc;
        }, { complete:0, queued:0, pending:0 });
        return { rows, counts, remainingTotal, fullPlanTotal };
    }
    function formatCountdown(timestamp) {
        if (!timestamp) return '—';
        let seconds = Math.max(0, Math.ceil((Number(timestamp) - Date.now()) / 1000));
        const days = Math.floor(seconds / 86400); seconds %= 86400;
        const hours = Math.floor(seconds / 3600); seconds %= 3600;
        const minutes = Math.floor(seconds / 60); seconds %= 60;
        const text = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
        return days ? `${days}d ${text}` : text;
    }
    function buildingOptions(selectedType = 15) {
        const grouped = new Map();
        Object.entries(BUILDINGS).forEach(([type,def]) => {
            if (!grouped.has(def.category)) grouped.set(def.category, []);
            grouped.get(def.category).push([Number(type),def]);
        });
        return [...grouped.entries()].map(([category,items]) => `<optgroup label="${escapeHtml(category)}">${items.map(([type,def]) => `<option value="${type}"${Number(selectedType) === type ? ' selected' : ''}>${escapeHtml(def.name)}</option>`).join('')}</optgroup>`).join('');
    }
    function instanceOptions(type, selectedLocation = '') {
        const village = activeSnapshotVillage || refreshSnapshotVillage();
        const matches = matchingBuildings(village, type);
        const autoLabel = matches.length ? 'Auto · highest matching level' : 'New / not built yet';
        return `<option value=""${selectedLocation ? '' : ' selected'}>${autoLabel}</option>${matches.map(building => {
            const location = String(building?.locationId || '');
            const level = number(building?.lvl, 0);
            return `<option value="${escapeHtml(location)}"${String(selectedLocation) === location ? ' selected' : ''}>Location ${escapeHtml(location)} · level ${level}</option>`;
        }).join('')}`;
    }
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${BUTTON_ID}{display:none;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;margin:0!important;padding:0!important;border:2px solid var(--qol-accent)!important;border-radius:50%!important;background:var(--qol-accent-soft)!important;color:var(--qol-accent-ink)!important;box-shadow:0 2px 4px rgba(0,0,0,.22)!important;cursor:pointer!important;box-sizing:border-box!important;z-index:9999!important}
            #${BUTTON_ID}:hover{transform:scale(1.08)!important;background:#f7f5f0!important}#${BUTTON_ID} svg{width:17px!important;height:17px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important;pointer-events:none!important}
            #${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${PANEL_ID}{position:fixed!important;inset:0!important;display:none!important;pointer-events:none!important;z-index:2147483638!important}
            #${PANEL_ID}.qol-open{display:block!important}
            #${PANEL_ID} .qol-bp-window{position:absolute!important;left:calc(50% - 450px);top:90px;width:min(${DEFAULT_WIDTH}px,calc(100vw - 24px));height:min(${DEFAULT_HEIGHT}px,calc(100vh - 110px));min-width:min(${MIN_WIDTH}px,calc(100vw - 16px));min-height:min(${MIN_HEIGHT}px,calc(100vh - 16px));max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);display:flex!important;flex-direction:column!important;overflow:hidden!important;border:3px solid var(--qol-border)!important;border-radius:7px!important;background:#f4eee4!important;color:#382b1d!important;box-shadow:0 18px 52px rgba(0,0,0,.48)!important;pointer-events:auto!important}
            #${PANEL_ID} .qol-bp-header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;flex:0 0 auto!important;min-height:48px!important;padding:7px 10px 7px 13px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-deep))!important;color:#fff8e9!important;cursor:move!important;user-select:none!important;touch-action:none!important}
            #${PANEL_ID} .qol-bp-title{display:flex!important;align-items:baseline!important;gap:9px!important;min-width:0!important}#${PANEL_ID} .qol-bp-title strong{font-size:14px!important}#${PANEL_ID} .qol-bp-village{color:#ddceb2!important;font-size:9px!important;font-weight:700!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-bp-close{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:27px!important;height:27px!important;border-radius:4px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;font-size:20px!important;cursor:pointer!important}
            #${PANEL_ID} .qol-bp-body{display:flex!important;flex-direction:column!important;gap:8px!important;flex:1 1 auto!important;min-height:0!important;padding:9px!important;overflow:hidden!important}
            #${PANEL_ID} .qol-bp-summary{display:grid!important;grid-template-columns:minmax(240px,1.1fr) repeat(3,minmax(90px,.45fr)) minmax(250px,1.4fr)!important;gap:6px!important;flex:0 0 auto!important}
            #${PANEL_ID} .qol-bp-stat{min-width:0!important;padding:7px 8px!important;border:1px solid #d0c2ac!important;border-radius:5px!important;background:#fffdf8!important}#${PANEL_ID} .qol-bp-stat small{display:block!important;margin-bottom:3px!important;color:#8a765d!important;font-size:7.5px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.25px!important}#${PANEL_ID} .qol-bp-stat strong{color:#4c3822!important;font-size:11px!important}
            #${PANEL_ID} .qol-bp-progress-track{position:relative!important;height:7px!important;margin-top:6px!important;overflow:hidden!important;border-radius:5px!important;background:#ddd2c1!important}.qol-bp-progress-complete,.qol-bp-progress-queued{position:absolute!important;top:0!important;bottom:0!important;left:0!important}.qol-bp-progress-complete{background:#6f9b34!important;z-index:2!important}.qol-bp-progress-queued{background:#c99a39!important;z-index:1!important}
            #${PANEL_ID} .qol-bp-cost-grid{display:flex!important;align-items:center!important;gap:6px!important;flex-wrap:wrap!important}.qol-bp-cost-part{display:inline-flex!important;align-items:center!important;gap:3px!important;white-space:nowrap!important;color:#59452e!important;font-size:8.5px!important}.qol-bp-cost-part i{display:inline-block!important;width:15px!important;height:15px!important;min-width:15px!important}.qol-bp-cost-part b{font-size:8.5px!important}
            #${PANEL_ID} .qol-bp-add{display:grid!important;grid-template-columns:minmax(180px,1.2fr) minmax(165px,1fr) 92px minmax(150px,1fr) auto!important;align-items:end!important;gap:6px!important;flex:0 0 auto!important;padding:8px!important;border:1px solid #cabcA6!important;border-radius:5px!important;background:#e9dfd0!important}
            #${PANEL_ID} .qol-bp-control{display:flex!important;flex-direction:column!important;gap:3px!important;min-width:0!important}.qol-bp-control label{color:#766249!important;font-size:7.5px!important;font-weight:800!important;text-transform:uppercase!important}.qol-bp-control select,.qol-bp-control input{width:100%!important;height:29px!important;margin:0!important;padding:3px 6px!important;border:1px solid #ad9b7d!important;border-radius:3px!important;background:#fffdf8!important;color:#382b1d!important;font-size:9px!important;outline:none!important}
            #${PANEL_ID} .qol-bp-action{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:76px!important;height:29px!important;padding:0 10px!important;border:1px solid var(--qol-action-border)!important;border-radius:4px!important;background:linear-gradient(var(--qol-accent),var(--qol-accent-gradient-end))!important;color:#fff8eb!important;font-size:8.5px!important;font-weight:800!important;cursor:pointer!important;user-select:none!important;white-space:nowrap!important}.qol-bp-action:hover{filter:brightness(1.08)!important}.qol-bp-action.secondary{border-color:#b09b7a!important;background:#f7f1e7!important;color:#654c30!important;box-shadow:none!important}.qol-bp-action.danger{border-color:#9c5a4b!important;background:#9b4d3f!important;color:#fff!important}
            #${PANEL_ID} .qol-bp-toolbar{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;flex:0 0 auto!important}.qol-bp-toolbar-left,.qol-bp-toolbar-right{display:flex!important;align-items:center!important;gap:6px!important;flex-wrap:wrap!important}.qol-bp-reduction{display:flex!important;align-items:center!important;gap:5px!important;color:#735e43!important;font-size:8px!important;font-weight:800!important}.qol-bp-reduction input{width:54px!important;height:25px!important;margin:0!important;padding:2px 5px!important;border:1px solid #b4a183!important;border-radius:3px!important;background:#fffdf8!important;color:#47331f!important;text-align:center!important;font-size:8.5px!important}
            #${PANEL_ID} .qol-bp-table-wrap{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;border:1px solid #c7b89f!important;border-radius:5px!important;background:#fffdf8!important;scrollbar-width:thin!important}.qol-bp-table{width:100%!important;border-collapse:collapse!important;min-width:830px!important}.qol-bp-table th{position:sticky!important;top:0!important;z-index:3!important;padding:6px!important;border-bottom:1px solid #bbaa8d!important;background:#ded0b9!important;color:var(--qol-accent-deep)!important;font-size:7.5px!important;text-align:left!important;text-transform:uppercase!important;white-space:nowrap!important}.qol-bp-table td{padding:6px!important;border-bottom:1px solid #eee5d6!important;color:#51402d!important;font-size:8.5px!important;vertical-align:middle!important}.qol-bp-table tr:last-child td{border-bottom:0!important}.qol-bp-table tr.complete td{background:#e3e3df!important;color:#777!important}.qol-bp-table tr.queued td{background:#fff9ec!important}.qol-bp-step-index{width:34px!important;color:#8a765b!important;font-weight:800!important;text-align:center!important}.qol-bp-building-name{font-weight:800!important;color:#47331f!important}.qol-bp-building-meta{display:block!important;margin-top:2px!important;color:#8a765b!important;font-size:7.5px!important}.qol-bp-status{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:58px!important;padding:3px 6px!important;border-radius:9px!important;font-size:7.5px!important;font-weight:900!important;text-transform:uppercase!important}.qol-bp-status.pending{background:#eee5d7!important;color:#755d3e!important}.qol-bp-status.queued{background:#f3dfad!important;color:#805e12!important}.qol-bp-status.complete{background:#dbe9ce!important;color:#4c7228!important}.qol-bp-row-actions{display:flex!important;align-items:center!important;gap:3px!important;white-space:nowrap!important}.qol-bp-mini{display:inline-flex!important;align-items:center!important;justify-content:center!important;height:24px!important;min-width:25px!important;padding:0 6px!important;border:1px solid #b9a689!important;border-radius:3px!important;background:#f4ecdf!important;color:#5c452b!important;font-size:8px!important;font-weight:900!important;cursor:pointer!important;user-select:none!important}.qol-bp-mini:hover{background:#e7dbc8!important}.qol-bp-mini.open{border-color:#738d51!important;color:#4f6d2e!important}.qol-bp-mini.delete{border-color:#bc8b80!important;color:#8c4236!important}.qol-bp-empty{padding:25px!important;color:#827159!important;font-size:9px!important;text-align:center!important}
            #${PANEL_ID} .qol-bp-resize{position:absolute!important;z-index:20!important;touch-action:none!important}.qol-bp-resize.e,.qol-bp-resize.w{top:8px!important;bottom:8px!important;width:7px!important;cursor:ew-resize!important}.qol-bp-resize.e{right:-3px!important}.qol-bp-resize.w{left:-3px!important}.qol-bp-resize.n,.qol-bp-resize.s{left:8px!important;right:8px!important;height:7px!important;cursor:ns-resize!important}.qol-bp-resize.n{top:-3px!important}.qol-bp-resize.s{bottom:-3px!important}.qol-bp-resize.ne,.qol-bp-resize.nw,.qol-bp-resize.se,.qol-bp-resize.sw{width:13px!important;height:13px!important}.qol-bp-resize.ne{top:-4px!important;right:-4px!important;cursor:nesw-resize!important}.qol-bp-resize.nw{top:-4px!important;left:-4px!important;cursor:nwse-resize!important}.qol-bp-resize.se{right:-4px!important;bottom:-4px!important;cursor:nwse-resize!important}.qol-bp-resize.sw{left:-4px!important;bottom:-4px!important;cursor:nesw-resize!important}.qol-bp-resize.se::after{content:''!important;position:absolute!important;right:3px!important;bottom:3px!important;width:6px!important;height:6px!important;border-right:2px solid #8d795a!important;border-bottom:2px solid #8d795a!important;opacity:.75!important}
            @media(max-width:900px){#${PANEL_ID} .qol-bp-summary{grid-template-columns:repeat(4,minmax(80px,1fr))!important}.qol-bp-summary .qol-bp-stat:first-child,.qol-bp-summary .qol-bp-stat:last-child{grid-column:span 2!important}#${PANEL_ID} .qol-bp-add{grid-template-columns:1fr 1fr 80px!important}.qol-bp-add .qol-bp-control:nth-child(4){grid-column:1/3!important}.qol-bp-add .qol-bp-action{grid-column:3!important;grid-row:1/3!important;height:100%!important}}
            @media(max-width:650px){#${PANEL_ID} .qol-bp-window{min-width:min(420px,calc(100vw - 12px))!important}#${PANEL_ID} .qol-bp-summary{grid-template-columns:1fr 1fr!important}.qol-bp-summary .qol-bp-stat:first-child,.qol-bp-summary .qol-bp-stat:last-child{grid-column:1/-1!important}#${PANEL_ID} .qol-bp-add{grid-template-columns:1fr 80px!important}.qol-bp-add .qol-bp-control{grid-column:1!important}.qol-bp-add .qol-bp-action{grid-column:2!important;grid-row:1/5!important}}
        `;
        document.head.appendChild(style);
    }
    function toolbarIcon() {
        return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v4H5zM7 10h10v4H7zM9 16h6v4H9z"></path><path d="m4 18 2 2 4-5"></path></svg>';
    }
    function mountToolbarButton() {
        if (!enabled()) return null;
        let button = document.getElementById(BUTTON_ID);
        if (button) return button;
        button = document.createElement('div');
        button.id = BUTTON_ID;
        button.title = 'Building Plan / Queue Planner';
        button.setAttribute('role','button');
        button.setAttribute('tabindex','0');
        button.setAttribute('aria-label','Open Building Plan / Queue Planner');
        button.innerHTML = toolbarIcon();
        const activate = event => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            toggle();
        };
        button.addEventListener('click', activate);
        button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') activate(event); });
        document.body.appendChild(button);
        window.qolRepositionAllButtons?.();
        return button;
    }
    function resizeHandles() {
        return ['n','ne','e','se','s','sw','w','nw'].map(direction => `<span class="qol-bp-resize ${direction}" data-resize="${direction}" aria-hidden="true"></span>`).join('');
    }
    function buildPanel() {
        let root = document.getElementById(PANEL_ID);
        if (root) return root;
        injectStyles();
        root = document.createElement('div');
        root.id = PANEL_ID;
        root.setAttribute('aria-hidden','true');
        root.innerHTML = `
            <div class="qol-bp-window" role="dialog" aria-modal="false" aria-label="Building Plan and Queue Planner">
                ${resizeHandles()}
                <div class="qol-bp-header">
                    <div class="qol-bp-title"><strong>Building Plan / Queue Planner</strong><span class="qol-bp-village" data-village-name>Village</span></div>
                    <span class="qol-bp-close" role="button" tabindex="0" data-close aria-label="Close">×</span>
                </div>
                <div class="qol-bp-body">
                    <div class="qol-bp-summary" data-summary></div>
                    <div class="qol-bp-add">
                        <div class="qol-bp-control"><label>Building / field</label><select data-new-type>${buildingOptions(15)}</select></div>
                        <div class="qol-bp-control"><label>Instance</label><select data-new-location>${instanceOptions(15)}</select></div>
                        <div class="qol-bp-control"><label>Target level</label><input data-new-level type="number" min="1" max="20" step="1" value="10"></div>
                        <div class="qol-bp-control"><label>Note</label><input data-new-note type="text" maxlength="120" placeholder="Optional"></div>
                        <div class="qol-bp-action" data-action="add" role="button" tabindex="0">Add step</div>
                    </div>
                    <div class="qol-bp-toolbar">
                        <div class="qol-bp-toolbar-left"><div class="qol-bp-action secondary" data-action="refresh" role="button" tabindex="0">Refresh status</div></div>
                        <div class="qol-bp-toolbar-right"><label class="qol-bp-reduction">Building cost reduction <input data-cost-reduction type="number" min="0" max="30" step="0.5" value="0">%</label><div class="qol-bp-action danger" data-action="clear" role="button" tabindex="0">Clear plan</div></div>
                    </div>
                    <div class="qol-bp-table-wrap"><div data-plan-body></div></div>
                </div>
            </div>`;
        document.body.appendChild(root);
        bindPanel(root);
        restoreGeometry();
        return root;
    }
    function summaryHtml(plan, evaluated) {
        const total = plan.steps.length;
        const complete = evaluated.counts.complete;
        const queued = evaluated.counts.queued;
        const pending = evaluated.counts.pending;
        const completePct = total ? complete / total * 100 : 0;
        const queuedPct = total ? (complete + queued) / total * 100 : 0;
        return `
            <div class="qol-bp-stat"><small>Plan progress</small><strong>${complete}/${total} complete</strong><div class="qol-bp-progress-track"><span class="qol-bp-progress-queued" style="width:${queuedPct.toFixed(1)}%"></span><span class="qol-bp-progress-complete" style="width:${completePct.toFixed(1)}%"></span></div></div>
            <div class="qol-bp-stat"><small>Pending</small><strong>${pending}</strong></div>
            <div class="qol-bp-stat"><small>Queued</small><strong>${queued}</strong></div>
            <div class="qol-bp-stat"><small>Complete</small><strong>${complete}</strong></div>
            <div class="qol-bp-stat"><small>Estimated remaining resources</small><div class="qol-bp-cost-grid">${costHtml(evaluated.remainingTotal)}</div></div>`;
    }
    function rowHtml(row,index) {
        const { step, evaluation, plannedCost } = row;
        const def = buildingDefinition(step.buildingType);
        const location = step.locationId || evaluation.building?.locationId || '';
        const levelText = evaluation.status === 'queued'
            ? `Current ${evaluation.currentLevel} · queued through ${evaluation.queuedLevel}`
            : `Current ${evaluation.currentLevel}`;
        const instanceText = location ? `Location ${location}` : 'Auto / not bound';
        const finish = evaluation.status === 'queued' && evaluation.finish ? formatCountdown(evaluation.finish) : '—';
        const note = step.note ? `<span class="qol-bp-building-meta">${escapeHtml(step.note)}</span>` : '';
        return `<tr class="${evaluation.status}" data-step-id="${escapeHtml(step.id)}">
            <td class="qol-bp-step-index">${index + 1}</td>
            <td><span class="qol-bp-building-name">${escapeHtml(def.name)}</span><span class="qol-bp-building-meta">${escapeHtml(instanceText)} · ${escapeHtml(levelText)}</span>${note}</td>
            <td><strong>→ ${step.targetLevel}</strong></td>
            <td><span class="qol-bp-status ${evaluation.status}">${evaluation.status}</span></td>
            <td><div class="qol-bp-cost-grid">${costHtml(plannedCost)}</div></td>
            <td>${escapeHtml(finish)}</td>
            <td><div class="qol-bp-row-actions"><span class="qol-bp-mini" data-row-action="up" title="Move up">↑</span><span class="qol-bp-mini" data-row-action="down" title="Move down">↓</span><span class="qol-bp-mini open" data-row-action="open" title="Open building or field">Open</span><span class="qol-bp-mini delete" data-row-action="delete" title="Delete step">×</span></div></td>
        </tr>`;
    }
    function render() {
        if (!storeLoaded) return;
        const root = buildPanel();
        const identity = currentVillageIdentity();
        if (!identity.villageId) return;
        if (activeVillageId !== identity.villageId) activeVillageId = identity.villageId;
        refreshSnapshotVillage(identity);
        const plan = planFor(identity, true);
        const evaluated = evaluatePlan(plan, activeSnapshotVillage);
        const name = root.querySelector('[data-village-name]');
        if (name) name.textContent = plan.villageName || identity.villageName || 'Village';
        const reduction = root.querySelector('[data-cost-reduction]');
        if (reduction && document.activeElement !== reduction) reduction.value = String(plan.costReduction || 0);
        const summary = root.querySelector('[data-summary]');
        if (summary) summary.innerHTML = summaryHtml(plan,evaluated);
        const body = root.querySelector('[data-plan-body]');
        if (body) body.innerHTML = plan.steps.length
            ? `<table class="qol-bp-table"><thead><tr><th>#</th><th>Building</th><th>Target</th><th>Status</th><th>Plan cost</th><th>Queue ETA</th><th>Actions</th></tr></thead><tbody>${evaluated.rows.map(rowHtml).join('')}</tbody></table>`
            : '<div class="qol-bp-empty">No development steps saved for this village yet. Add the first building or field above.</div>';
        updateAddFormInstanceOptions(false);
    }
    function updateAddFormInstanceOptions(resetSelection = true) {
        const root = document.getElementById(PANEL_ID);
        if (!root) return;
        const typeSelect = root.querySelector('[data-new-type]');
        const locationSelect = root.querySelector('[data-new-location]');
        const levelInput = root.querySelector('[data-new-level]');
        if (!typeSelect || !locationSelect || !levelInput) return;
        const type = Number(typeSelect.value);
        const current = resetSelection ? '' : locationSelect.value;
        locationSelect.innerHTML = instanceOptions(type,current);
        const def = buildingDefinition(type);
        levelInput.max = String(def.max || 20);
        if (Number(levelInput.value) > Number(levelInput.max)) levelInput.value = String(levelInput.max);
    }
    async function addStep() {
        const root = document.getElementById(PANEL_ID);
        const identity = currentVillageIdentity();
        const plan = planFor(identity,true);
        if (!root || !plan) return;
        const type = Number(root.querySelector('[data-new-type]')?.value);
        const def = BUILDINGS[type];
        if (!def) return;
        const locationId = String(root.querySelector('[data-new-location]')?.value || '');
        const targetLevel = Math.min(def.max, Math.max(1, Number(root.querySelector('[data-new-level]')?.value) || 1));
        const note = String(root.querySelector('[data-new-note]')?.value || '').trim().slice(0,120);
        const step = normalizeStep({
            id:`${Date.now().toString(36)}:${Math.random().toString(36).slice(2,8)}`,
            buildingType:type, locationId, targetLevel, note
        }, plan.steps.length);
        if (!step) return;
        plan.steps.push(step);
        plan.updatedAt = Date.now();
        await saveStore();
        const noteInput = root.querySelector('[data-new-note]');
        if (noteInput) noteInput.value = '';
        render();
    }
    async function clearPlan() {
        const identity = currentVillageIdentity();
        const plan = planFor(identity,false);
        if (!plan?.steps?.length) return;
        if (!window.confirm(`Clear the Building Plan for ${plan.villageName}?`)) return;
        plan.steps = [];
        plan.updatedAt = Date.now();
        await saveStore();
        render();
    }
    async function handleRowAction(stepId, action) {
        const identity = currentVillageIdentity();
        const plan = planFor(identity,false);
        if (!plan) return;
        const index = plan.steps.findIndex(step => step.id === stepId);
        if (index < 0) return;
        if (action === 'open') {
            openStep(plan.steps[index]);
            return;
        }
        if (action === 'delete') plan.steps.splice(index,1);
        if (action === 'up' && index > 0) [plan.steps[index - 1], plan.steps[index]] = [plan.steps[index], plan.steps[index - 1]];
        if (action === 'down' && index < plan.steps.length - 1) [plan.steps[index + 1], plan.steps[index]] = [plan.steps[index], plan.steps[index + 1]];
        plan.updatedAt = Date.now();
        await saveStore();
        render();
    }
    function openStep(step) {
        const identity = currentVillageIdentity();
        if (!identity.villageId) return;
        refreshSnapshotVillage(identity);
        const evaluation = evaluateStep(activeSnapshotVillage,step);
        const locationId = String(step.locationId || evaluation.building?.locationId || '');
        const def = buildingDefinition(step.buildingType);
        if (/^\d+$/.test(locationId)) {
            const page = def.field || Number(locationId) <= 18 ? 'resources' : 'village';
            location.hash = `#/page:${page}/villId:${identity.villageId}/location:${locationId}/window:building`;
        } else {
            location.hash = `#/page:${def.field ? 'resources' : 'village'}/villId:${identity.villageId}`;
        }
    }
    function saveGeometry() {
        const win = document.querySelector(`#${PANEL_ID} .qol-bp-window`);
        if (!win || !document.getElementById(PANEL_ID)?.classList.contains('qol-open')) return;
        const rect = win.getBoundingClientRect();
        try { localStorage.setItem(GEOMETRY_KEY, JSON.stringify({ left:rect.left, top:rect.top, width:rect.width, height:rect.height })); } catch (_) {}
    }
    function restoreGeometry() {
        const win = document.querySelector(`#${PANEL_ID} .qol-bp-window`);
        if (!win || win.dataset.geometryRestored === 'true') return;
        win.dataset.geometryRestored = 'true';
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(GEOMETRY_KEY) || 'null'); } catch (_) {}
        if (!saved) return;
        const width = Math.min(window.innerWidth - 16, Math.max(Math.min(MIN_WIDTH,window.innerWidth - 16), Number(saved.width) || DEFAULT_WIDTH));
        const height = Math.min(window.innerHeight - 16, Math.max(Math.min(MIN_HEIGHT,window.innerHeight - 16), Number(saved.height) || DEFAULT_HEIGHT));
        const left = Math.max(8, Math.min(Number(saved.left) || 8, window.innerWidth - width - 8));
        const top = Math.max(8, Math.min(Number(saved.top) || 8, window.innerHeight - height - 8));
        Object.entries({ left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px` }).forEach(([property,value]) => win.style.setProperty(property,value,'important'));
    }
    function bindDrag(win) {
        const header = win.querySelector('.qol-bp-header');
        if (!header || header.dataset.dragBound === 'true') return;
        header.dataset.dragBound = 'true';
        header.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('[data-close]')) return;
            const rect = win.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            event.preventDefault();
            const move = moveEvent => {
                const current = win.getBoundingClientRect();
                const left = Math.max(8,Math.min(moveEvent.clientX - offsetX,window.innerWidth - current.width - 8));
                const top = Math.max(8,Math.min(moveEvent.clientY - offsetY,window.innerHeight - current.height - 8));
                win.style.setProperty('left',`${left}px`,'important');
                win.style.setProperty('top',`${top}px`,'important');
            };
            const stop = () => {
                window.removeEventListener('pointermove',move,true);
                window.removeEventListener('pointerup',stop,true);
                window.removeEventListener('pointercancel',stop,true);
                saveGeometry();
            };
            window.addEventListener('pointermove',move,true);
            window.addEventListener('pointerup',stop,true);
            window.addEventListener('pointercancel',stop,true);
        });
    }
    function startResize(event, direction, win) {
        if (event.button !== 0) return;
        const rect = win.getBoundingClientRect();
        resizeState = { direction, startX:event.clientX, startY:event.clientY, left:rect.left, top:rect.top, width:rect.width, height:rect.height };
        event.preventDefault();
        event.stopPropagation();
        const move = moveEvent => {
            if (!resizeState) return;
            const dx = moveEvent.clientX - resizeState.startX;
            const dy = moveEvent.clientY - resizeState.startY;
            let { left, top, width, height } = resizeState;
            if (direction.includes('e')) width += dx;
            if (direction.includes('s')) height += dy;
            if (direction.includes('w')) { width -= dx; left += dx; }
            if (direction.includes('n')) { height -= dy; top += dy; }
            const minW = Math.min(MIN_WIDTH,window.innerWidth - 16);
            const minH = Math.min(MIN_HEIGHT,window.innerHeight - 16);
            if (width < minW) { if (direction.includes('w')) left -= minW - width; width = minW; }
            if (height < minH) { if (direction.includes('n')) top -= minH - height; height = minH; }
            width = Math.min(width,window.innerWidth - 16);
            height = Math.min(height,window.innerHeight - 16);
            left = Math.max(8,Math.min(left,window.innerWidth - width - 8));
            top = Math.max(8,Math.min(top,window.innerHeight - height - 8));
            Object.entries({left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`}).forEach(([property,value]) => win.style.setProperty(property,value,'important'));
        };
        const stop = () => {
            resizeState = null;
            window.removeEventListener('pointermove',move,true);
            window.removeEventListener('pointerup',stop,true);
            window.removeEventListener('pointercancel',stop,true);
            saveGeometry();
        };
        window.addEventListener('pointermove',move,true);
        window.addEventListener('pointerup',stop,true);
        window.addEventListener('pointercancel',stop,true);
    }
    function bindPanel(root) {
        if (root.dataset.bound === 'true') return;
        root.dataset.bound = 'true';
        const win = root.querySelector('.qol-bp-window');
        bindDrag(win);
        root.querySelectorAll('[data-resize]').forEach(handle => handle.addEventListener('pointerdown', event => startResize(event,handle.dataset.resize,win)));
        root.addEventListener('click', event => {
            if (event.target.closest('[data-close]')) { close(); return; }
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (action === 'add') void addStep();
            if (action === 'refresh') render();
            if (action === 'clear') void clearPlan();
            const rowControl = event.target.closest('[data-row-action]');
            if (rowControl) {
                const stepId = rowControl.closest('[data-step-id]')?.dataset.stepId;
                if (stepId) void handleRowAction(stepId,rowControl.dataset.rowAction);
            }
        });
        root.addEventListener('keydown', event => {
            if (!['Enter',' '].includes(event.key)) return;
            const control = event.target.closest('[role="button"],[data-row-action]');
            if (!control) return;
            event.preventDefault();
            control.click();
        });
        root.addEventListener('change', event => {
            if (event.target.matches('[data-new-type]')) updateAddFormInstanceOptions(true);
            if (event.target.matches('[data-cost-reduction]')) {
                const plan = planFor(currentVillageIdentity(),true);
                if (!plan) return;
                plan.costReduction = Math.min(30,Math.max(0,Number(event.target.value) || 0));
                plan.updatedAt = Date.now();
                void saveStore().then(render);
            }
        });
    }
    async function open() {
        if (!enabled()) return;
        await loadStore();
        const root = buildPanel();
        activeVillageId = currentVillageIdentity().villageId;
        refreshSnapshotVillage();
        root.classList.add('qol-open');
        root.setAttribute('aria-hidden','false');
        restoreGeometry();
        render();
        startRefresh();
    }
    function close() {
        saveGeometry();
        const root = document.getElementById(PANEL_ID);
        root?.classList.remove('qol-open');
        root?.setAttribute('aria-hidden','true');
        stopRefresh();
    }
    function toggle() {
        const root = document.getElementById(PANEL_ID);
        if (root?.classList.contains('qol-open')) close();
        else void open();
    }
    function startRefresh() {
        stopRefresh();
        refreshTimer = window.setInterval(() => {
            if (!document.getElementById(PANEL_ID)?.classList.contains('qol-open')) return;
            const identity = currentVillageIdentity();
            if (identity.villageId !== activeVillageId) activeVillageId = identity.villageId;
            render();
        },REFRESH_MS);
    }
    function stopRefresh() {
        if (refreshTimer !== null) window.clearInterval(refreshTimer);
        refreshTimer = null;
    }
    function registerAction() {
        try {
            APES?.actions?.register?.({
                id:'buildingPlan.open',
                label:'Building Plan / Queue Planner',
                description:'Open the persistent per-village building development roadmap.',
                keywords:['building','plan','queue','roadmap','development','upgrade'],
                group:'Planning',
                enabled,
                run:open
            });
        } catch (error) { console.warn('[APES Building Plan] Action registration failed:', error); }
    }
    function refreshFeatureState() {
        injectStyles();
        if (!enabled()) {
            close();
            document.getElementById(BUTTON_ID)?.remove();
            window.qolRepositionAllButtons?.();
            return;
        }
        mountToolbarButton();
        buildPanel();
        window.qolRepositionAllButtons?.();
    }

    window.addEventListener('hashchange', () => {
        if (!document.getElementById(PANEL_ID)?.classList.contains('qol-open')) return;
        window.setTimeout(render,80);
    });
    window.addEventListener('resize', () => {
        const win = document.querySelector(`#${PANEL_ID} .qol-bp-window`);
        if (!win) return;
        const rect = win.getBoundingClientRect();
        const width = Math.min(rect.width,window.innerWidth - 16);
        const height = Math.min(rect.height,window.innerHeight - 16);
        const left = Math.max(8,Math.min(rect.left,window.innerWidth - width - 8));
        const top = Math.max(8,Math.min(rect.top,window.innerHeight - height - 8));
        Object.entries({left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`}).forEach(([property,value]) => win.style.setProperty(property,value,'important'));
        saveGeometry();
    },{passive:true});
    window.addEventListener('qol_setting_changed', event => { if (event.detail?.key === FEATURE_KEY) refreshFeatureState(); });
    window.addEventListener('qol_close_others', event => { if (event.detail?.source !== FEATURE_KEY) close(); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && document.getElementById(PANEL_ID)?.classList.contains('qol-open')) {
            event.preventDefault();
            close();
        }
    },true);

    window.APES_BUILDING_PLAN_QUEUE_PLANNER = Object.freeze({
        open, close, toggle,
        refresh:render,
        getPlan: async villageId => {
            await loadStore();
            return clone(store.villages[String(villageId)] || null);
        }
    });

    registerAction();
    const begin = () => {
        injectStyles();
        void loadStore();
        refreshFeatureState();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',begin,{once:true});
    else begin();
})();
