(function initNpcCalculatorModule() {
    'use strict';

    const FEATURE_KEY = 'npcCalculator';
    const PANEL_ID = 'qol-calc-container';
    const TOGGLE_ID = 'qol-npc-calc-toggle-btn';
    const STYLE_ID = 'qol-npc-calculator-styles';
    const RESOURCE_KEYS = ['wood', 'clay', 'iron', 'crop'];
    const RESOURCE_META = {
        wood: { label: 'Wood', icon: 'unit_wood_small_illu resType1', storage: 'Warehouse', fallback: 1 },
        clay: { label: 'Clay', icon: 'unit_clay_small_illu resType2', storage: 'Warehouse', fallback: 2 },
        iron: { label: 'Iron', icon: 'unit_iron_small_illu resType3', storage: 'Warehouse', fallback: 3 },
        crop: { label: 'Crop', icon: 'unit_crop_small_illu resType4', storage: 'Granary', fallback: 4 }
    };

    const ALL_TRIBE_UNITS = {
        romans: {
            name: 'Roman',
            units: [
                { name: 'Legionnaire', wood: 75, clay: 50, iron: 100, crop: 0, building: 'barracks' },
                { name: 'Praetorian', wood: 80, clay: 100, iron: 160, crop: 0, building: 'barracks' },
                { name: 'Imperian', wood: 100, clay: 110, iron: 140, crop: 0, building: 'barracks' },
                { name: 'Equites Legati', wood: 100, clay: 140, iron: 10, crop: 0, building: 'stables' },
                { name: 'Equites Imperatoris', wood: 350, clay: 260, iron: 180, crop: 0, building: 'stables' },
                { name: 'Equites Caesaris', wood: 280, clay: 340, iron: 600, crop: 0, building: 'stables' },
                { name: 'Battering Ram', wood: 700, clay: 180, iron: 400, crop: 0, building: 'workshop' },
                { name: 'Fire Catapult', wood: 690, clay: 1000, iron: 400, crop: 0, building: 'workshop' }
            ]
        },
        teutons: {
            name: 'Teuton',
            units: [
                { name: 'Clubswinger', wood: 85, clay: 65, iron: 30, crop: 0, building: 'barracks' },
                { name: 'Spearfighter', wood: 125, clay: 50, iron: 65, crop: 0, building: 'barracks' },
                { name: 'Axefighter', wood: 80, clay: 65, iron: 130, crop: 0, building: 'barracks' },
                { name: 'Scout', wood: 140, clay: 80, iron: 30, crop: 0, building: 'barracks' },
                { name: 'Paladin', wood: 330, clay: 170, iron: 200, crop: 0, building: 'stables' },
                { name: 'Teutonic Knight', wood: 280, clay: 320, iron: 260, crop: 0, building: 'stables' },
                { name: 'Ram', wood: 800, clay: 150, iron: 250, crop: 0, building: 'workshop' },
                { name: 'Catapult', wood: 660, clay: 900, iron: 370, crop: 0, building: 'workshop' }
            ]
        },
        gauls: {
            name: 'Gaul',
            units: [
                { name: 'Phalanx', wood: 85, clay: 100, iron: 50, crop: 0, building: 'barracks' },
                { name: 'Swordsman', wood: 95, clay: 60, iron: 140, crop: 0, building: 'barracks' },
                { name: 'Pathfinder', wood: 140, clay: 110, iron: 20, crop: 0, building: 'stables' },
                { name: 'Theutates Thunder', wood: 200, clay: 280, iron: 130, crop: 0, building: 'stables' },
                { name: 'Druidrider', wood: 300, clay: 270, iron: 190, crop: 0, building: 'stables' },
                { name: 'Haeduan', wood: 300, clay: 380, iron: 440, crop: 0, building: 'stables' },
                { name: 'Ram', wood: 750, clay: 370, iron: 220, crop: 0, building: 'workshop' },
                { name: 'Trebuchet', wood: 590, clay: 1200, iron: 400, crop: 0, building: 'workshop' }
            ]
        }
    };

    const SIEGE_UNITS = new Set(['Battering Ram', 'Fire Catapult', 'Ram', 'Trebuchet', 'Catapult']);
    const FEALTY_BUILDING_DISCOUNTS = {
        8:{workshop:.03,stables:0,barracks:0}, 9:{workshop:.035,stables:.035,barracks:0},
        10:{workshop:.04,stables:.04,barracks:.04}, 11:{workshop:.045,stables:.045,barracks:.045},
        12:{workshop:.05,stables:.05,barracks:.05}, 13:{workshop:.055,stables:.055,barracks:.055},
        14:{workshop:.06,stables:.06,barracks:.06}, 15:{workshop:.065,stables:.065,barracks:.065},
        16:{workshop:.07,stables:.07,barracks:.07}, 17:{workshop:.075,stables:.075,barracks:.075},
        18:{workshop:.08,stables:.08,barracks:.08}, 19:{workshop:.085,stables:.085,barracks:.085},
        20:{workshop:.09,stables:.09,barracks:.09}
    };

    let panel = null;
    let toggleButton = null;
    let selectedTribe = 'romans';
    let selectedPassIndex = 0;
    let latestCalculation = null;

    function isEnabled() {
        return typeof window.isQolEnabled === 'function' ? window.isQolEnabled(FEATURE_KEY) === true : true;
    }

    function formatNumber(value) {
        return Math.max(0, Math.round(Number(value) || 0)).toLocaleString();
    }

    function parseInteger(value) {
        const text = String(value ?? '')
            .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
            .replace(/\u00a0/g, ' ')
            .trim();
        if (!text) return null;
        const compact = text.replace(/\s+/g, '').match(/^([\d]+(?:[.,]\d+)?)([kKmM])$/);
        if (compact) {
            const number = Number.parseFloat(compact[1].replace(',', '.'));
            const multiplier = compact[2].toLowerCase() === 'm' ? 1000000 : 1000;
            return Number.isFinite(number) ? Math.round(number * multiplier) : null;
        }
        const digits = text.replace(/[^0-9]/g, '');
        if (!digits) return null;
        const number = Number.parseInt(digits, 10);
        return Number.isFinite(number) ? number : null;
    }

    function directText(element) {
        if (!element) return '';
        return Array.from(element.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent || '')
            .join(' ')
            .trim();
    }

    function parseResourceText(text) {
        const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
        if (!cleaned) return { current: null, capacity: null };
        const slash = cleaned.match(/([\d.,kKmM\s]+)\s*\/\s*([\d.,kKmM\s]+)/);
        if (!slash) return { current: parseInteger(cleaned), capacity: null };
        return { current: parseInteger(slash[1]), capacity: parseInteger(slash[2]) };
    }

    function readResource(key) {
        const meta = RESOURCE_META[key];
        const stock = document.querySelector(`#resourceBar .stockContainer.${key}`)
            || document.querySelector(`.stockContainer.${key}`);
        const progressbar = stock?.querySelector('[progressbar], .progressbar');
        const amountNode = progressbar?.querySelector('.values .amount.wrapper, .values .amount, .amount.wrapper, .amount');
        const capacityNode = progressbar?.querySelector('.values .capacity, .capacity');
        const fallbackNode = document.querySelector(`#stockBarResource${meta.fallback}`);
        const stockText = parseResourceText(progressbar?.textContent || stock?.textContent || '');
        const fallbackText = parseResourceText(fallbackNode?.textContent || '');
        const current = parseInteger(progressbar?.getAttribute('value'))
            ?? parseInteger(directText(amountNode))
            ?? parseInteger(amountNode?.textContent)
            ?? stockText.current
            ?? fallbackText.current
            ?? 0;
        const capacity = parseInteger(progressbar?.getAttribute('max-value'))
            ?? parseInteger(progressbar?.getAttribute('max'))
            ?? parseInteger(directText(capacityNode))
            ?? parseInteger(capacityNode?.textContent)
            ?? stockText.capacity
            ?? fallbackText.capacity;
        return {
            current: Number.isFinite(current) ? current : 0,
            capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null
        };
    }

    function getVillageResources() {
        const values = Object.fromEntries(RESOURCE_KEYS.map(key => [key, readResource(key)]));
        return { ...values, total: RESOURCE_KEYS.reduce((sum, key) => sum + values[key].current, 0) };
    }

    function detectUserTribe() {
        const html = document.documentElement?.outerHTML || '';
        if (document.querySelector('.tribe2,.nation2,[class*="tribe2"],[class*="nation2"],.unit_u11') || /tribe2|nation2/.test(html)) return 'teutons';
        if (document.querySelector('.tribe3,.nation3,[class*="tribe3"],[class*="nation3"],.unit_u21') || /tribe3|nation3/.test(html)) return 'gauls';
        return 'romans';
    }

    function calculateUnitCosts(unit, fealty, great) {
        const discount = FEALTY_BUILDING_DISCOUNTS[fealty]?.[unit.building] || 0;
        const multiplier = great ? 3 : 1;
        const factor = 1 - discount;
        const result = {};
        RESOURCE_KEYS.forEach(key => {
            result[key] = Math.floor((unit[key] || 0) * factor) * multiplier;
        });
        result.total = RESOURCE_KEYS.reduce((sum, key) => sum + result[key], 0);
        return result;
    }

    function getCapacityLimitedMaximum(costs, resources, availableTotal) {
        if (!costs.total) return 0;
        const limits = [Math.floor(Math.max(0, availableTotal) / costs.total)];
        RESOURCE_KEYS.forEach(key => {
            if (!costs[key]) return;
            const cap = resources[key].capacity;
            if (Number.isFinite(cap) && cap > 0) limits.push(Math.floor(cap / costs[key]));
        });
        return Math.max(0, Math.min(...limits));
    }

    function getTotalResourceMaximum(costs, availableTotal) {
        if (!costs.total) return 0;
        return Math.max(0, Math.floor(Math.max(0, availableTotal) / costs.total));
    }

    function resourceIcon(key) {
        return `<i class="${RESOURCE_META[key].icon}" aria-hidden="true"></i>`;
    }

    function buildResourceCards(prefix, stockMode) {
        return RESOURCE_KEYS.map(key => {
            const meta = stockMode
                ? `<div class="qol-npc-resource-meta"><span id="${prefix}-${key}-capacity">Cap —</span><span id="${prefix}-${key}-percent">—</span></div>`
                : `<div class="qol-npc-resource-meta"><span id="${prefix}-${key}-required">Need 0</span><span id="${prefix}-${key}-overflow">Leaves 0</span></div>`;
            return `<div class="qol-npc-resource-card" data-resource="${key}">
                <div class="qol-npc-resource-head">${resourceIcon(key)}<span>${RESOURCE_META[key].label}</span></div>
                <strong id="${prefix}-${key}">0</strong>${meta}
                <div class="qol-npc-meter"><span id="${prefix}-${key}-meter"></span></div>
            </div>`;
        }).join('');
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
#${PANEL_ID}{position:fixed!important;display:none!important;flex-direction:column!important;width:min(960px,96vw)!important;min-width:min(740px,96vw)!important;height:min(640px,90vh)!important;min-height:540px!important;max-width:96vw!important;max-height:92vh!important;resize:both!important;overflow:hidden!important;z-index:1000000!important;border:2px solid var(--qol-border)!important;border-radius:7px!important;background:#eee8dc!important;color:#3f3020!important;box-shadow:0 14px 38px rgba(0,0,0,.46)!important}
#${PANEL_ID}.qol-open{display:flex!important}
#${PANEL_ID} .qol-npc-header{display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 40px!important;min-height:40px!important;padding:6px 9px 6px 13px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-dark))!important;color:#fff!important;cursor:move!important;user-select:none!important;touch-action:none!important}
#${PANEL_ID} .qol-npc-title{display:flex!important;align-items:center!important;gap:9px!important;font-size:15px!important;font-weight:800!important}
#${PANEL_ID} .qol-npc-title small{display:inline-flex!important;align-items:center!important;height:18px!important;padding:2px 7px!important;border:1px solid rgba(255,255,255,.25)!important;border-radius:999px!important;background:rgba(0,0,0,.15)!important;color:#e8dec8!important;font-size:8px!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.55px!important}
#${PANEL_ID} .qol-npc-close{all:unset!important;box-sizing:border-box!important;display:flex!important;align-items:center!important;justify-content:center!important;width:27px!important;height:27px!important;border-radius:4px!important;background:rgba(0,0,0,.22)!important;color:#fff!important;font-size:21px!important;font-weight:bold!important;cursor:pointer!important}
#${PANEL_ID} .qol-npc-close:hover{background:rgba(255,255,255,.14)!important}
#${PANEL_ID} .qol-npc-body{display:flex!important;flex-direction:column!important;gap:8px!important;flex:1 1 auto!important;min-height:0!important;padding:9px!important;overflow:hidden!important;background:#eee8dc!important}
#${PANEL_ID} .qol-npc-controls{display:grid!important;grid-template-columns:minmax(290px,1.2fr) 88px 112px minmax(210px,.95fr)!important;gap:9px!important;align-items:end!important;flex:0 0 auto!important;padding:9px 10px!important;border:1px solid #cdbb9f!important;border-radius:5px!important;background:#faf7f1!important}
#${PANEL_ID} .qol-npc-field{display:flex!important;flex-direction:column!important;gap:5px!important;min-width:0!important;color:#715b3e!important;font-size:8px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.38px!important}
#${PANEL_ID} .qol-npc-tribe-options{display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:4px!important;min-width:0!important;padding:2px!important;border:1px solid #c9b89c!important;border-radius:5px!important;background:#eee5d7!important}
#${PANEL_ID} .qol-npc-tribe-option{all:unset!important;box-sizing:border-box!important;display:flex!important;align-items:center!important;justify-content:center!important;height:29px!important;padding:4px 8px!important;border-radius:3px!important;background:#fbf8f2!important;color:#634f35!important;font-size:10px!important;font-weight:800!important;text-align:center!important;cursor:pointer!important;user-select:none!important}
#${PANEL_ID} .qol-npc-tribe-option:hover,#${PANEL_ID} .qol-npc-tribe-option:focus-visible{background:#fff!important;color:#49361f!important;box-shadow:inset 0 0 0 1px #b7a487!important}
#${PANEL_ID} .qol-npc-tribe-option.active{background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;box-shadow:inset 0 0 0 1px var(--qol-action-border),0 1px 2px rgba(0,0,0,.15)!important}
#${PANEL_ID} input[type=number]{display:block!important;visibility:visible!important;opacity:1!important;height:34px!important;margin:0!important;padding:5px 8px!important;border:1px solid #9f8767!important;border-radius:4px!important;background:#fff!important;color:#342719!important;font-size:11px!important;font-weight:700!important;text-align:center!important;box-shadow:none!important}
#${PANEL_ID} .qol-npc-btn{all:unset!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;height:34px!important;padding:5px 11px!important;border:1px solid var(--qol-action-border)!important;border-radius:4px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:10px!important;font-weight:800!important;cursor:pointer!important;user-select:none!important;white-space:nowrap!important}
#${PANEL_ID} .qol-npc-btn:hover,#${PANEL_ID} .qol-npc-btn:focus-visible{filter:brightness(1.06)!important}
#${PANEL_ID} .qol-npc-btn.secondary{background:linear-gradient(#fffdf9,#e9dfd0)!important;color:#5d472d!important;border-color:#967d5c!important}
#${PANEL_ID} .qol-npc-btn.danger{background:linear-gradient(#d9605c,#b6322e)!important;border-color:#8e2421!important}
#${PANEL_ID} .qol-npc-btn.disabled{opacity:.48!important;cursor:default!important;filter:none!important}
#${PANEL_ID} .qol-npc-helper{align-self:center!important;color:#75634c!important;font-size:9px!important;line-height:1.38!important}
#${PANEL_ID} .qol-npc-helper strong{color:#4d3823!important}
#${PANEL_ID} .qol-npc-summaries{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;flex:0 0 auto!important;min-width:0!important}
#${PANEL_ID} .qol-npc-summary{min-width:0!important;border:1px solid #c9b89d!important;border-radius:5px!important;background:#fff!important;overflow:hidden!important}
#${PANEL_ID} .qol-npc-summary-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;min-height:30px!important;padding:6px 9px!important;background:#e7ddcc!important;color:#60492f!important;font-size:9px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.35px!important}
#${PANEL_ID} .qol-npc-summary-head strong{font-size:11px!important;color:#3d2e1f!important}
#${PANEL_ID} .qol-npc-resource-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important}
#${PANEL_ID} .qol-npc-resource-card{position:relative!important;min-width:0!important;min-height:78px!important;padding:8px!important;border-right:1px solid #ece3d5!important;background:#fff!important}
#${PANEL_ID} .qol-npc-resource-card:last-child{border-right:0!important}
#${PANEL_ID} .qol-npc-resource-card.capped{background:#fff1e8!important}
#${PANEL_ID} .qol-npc-resource-card.capped::after{content:''!important;position:absolute!important;left:0!important;right:0!important;bottom:0!important;height:3px!important;background:#c45d34!important}
#${PANEL_ID} .qol-npc-resource-head{display:flex!important;align-items:center!important;gap:5px!important;color:#715d43!important;font-size:8px!important;font-weight:800!important;text-transform:uppercase!important;white-space:nowrap!important}
#${PANEL_ID} .qol-npc-resource-card>strong{display:block!important;margin-top:4px!important;color:#392a1c!important;font-size:15px!important;font-weight:800!important;line-height:18px!important;font-variant-numeric:tabular-nums!important}
#${PANEL_ID} .qol-npc-resource-meta{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:5px!important;margin-top:2px!important;color:#86735b!important;font-size:7.5px!important;line-height:10px!important;white-space:nowrap!important}
#${PANEL_ID} .qol-npc-resource-meta .overflow{color:#a64028!important;font-weight:800!important}
#${PANEL_ID} .qol-npc-meter{height:4px!important;margin-top:5px!important;border-radius:999px!important;background:#eee7da!important;overflow:hidden!important}
#${PANEL_ID} .qol-npc-meter span{display:block!important;width:0;height:100%!important;border-radius:999px!important;background:linear-gradient(to right,var(--qol-accent),var(--qol-accent-dark))!important;transition:width .16s ease!important}
#${PANEL_ID} .qol-npc-resource-card.capped .qol-npc-meter span{background:#bd5835!important}
#${PANEL_ID} .qol-npc-summary-foot{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;min-height:34px!important;padding:5px 8px!important;border-top:1px solid #e7ddcf!important;background:#faf6ee!important;color:#715f47!important;font-size:8px!important}
#${PANEL_ID} .qol-npc-summary-foot strong{color:#47351f!important;font-size:9px!important}
#${PANEL_ID} .qol-npc-summary-actions{display:flex!important;align-items:center!important;gap:6px!important}
#${PANEL_ID} .qol-npc-pill{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:21px!important;padding:3px 8px!important;border-radius:999px!important;font-size:8px!important;font-weight:800!important;white-space:nowrap!important}
#${PANEL_ID} .qol-npc-pill.good{border:1px solid #87a863!important;background:#eef7e6!important;color:#486d2b!important}
#${PANEL_ID} .qol-npc-pill.warn{border:1px solid #c57a58!important;background:#fff0e7!important;color:#9b4428!important}
#${PANEL_ID} .qol-npc-mini-action{all:unset!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:23px!important;padding:3px 8px!important;border:1px solid var(--qol-action-border)!important;border-radius:4px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:8px!important;font-weight:800!important;cursor:pointer!important;white-space:nowrap!important}
#${PANEL_ID} .qol-npc-mini-action.disabled{opacity:.45!important;cursor:default!important}
#${PANEL_ID} .qol-npc-banner{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;flex:0 0 auto!important;min-height:36px!important;padding:7px 10px!important;border:1px solid #b9ab92!important;border-radius:5px!important;background:#f8f4ec!important;color:#64523b!important;font-size:9px!important}
#${PANEL_ID} .qol-npc-banner-main{display:flex!important;align-items:center!important;gap:8px!important;min-width:0!important;font-weight:800!important}
#${PANEL_ID} .qol-npc-banner-dot{flex:0 0 9px!important;width:9px!important;height:9px!important;border-radius:50%!important;background:#a8977a!important}
#${PANEL_ID} .qol-npc-banner-sub{color:#837159!important;font-size:8px!important;white-space:nowrap!important}
#${PANEL_ID} .qol-npc-banner[data-tone="success"]{border-color:#9ab77c!important;background:#f2f8eb!important;color:#4f6d31!important}
#${PANEL_ID} .qol-npc-banner[data-tone="success"] .qol-npc-banner-dot{background:#79a04b!important}
#${PANEL_ID} .qol-npc-banner[data-tone="warning"]{border-color:#d09a75!important;background:#fff3e9!important;color:#93472d!important}
#${PANEL_ID} .qol-npc-banner[data-tone="warning"] .qol-npc-banner-dot{background:#c35d36!important}
#${PANEL_ID} .qol-npc-pass-plan{display:none!important;flex:0 0 auto!important;border:1px solid #c9b89d!important;border-radius:5px!important;background:#fbf8f1!important;overflow:hidden!important}
#${PANEL_ID} .qol-npc-pass-plan.visible{display:block!important}
#${PANEL_ID} .qol-npc-pass-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:6px 8px!important;border-bottom:1px solid #e4d9c7!important;background:#eee5d7!important;color:#5d492f!important;font-size:8px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.3px!important}
#${PANEL_ID} .qol-npc-pass-tabs{display:flex!important;align-items:center!important;gap:4px!important;flex-wrap:wrap!important}
#${PANEL_ID} .qol-npc-pass-tab{all:unset!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:48px!important;height:24px!important;padding:3px 7px!important;border:1px solid #b9a78a!important;border-radius:4px!important;background:#fffaf3!important;color:#6e5839!important;font-size:8px!important;font-weight:800!important;cursor:pointer!important}
#${PANEL_ID} .qol-npc-pass-tab.active{border-color:var(--qol-action-border)!important;background:var(--qol-accent-soft)!important;color:var(--qol-accent-ink)!important}
#${PANEL_ID} .qol-npc-pass-detail{display:grid!important;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr)!important;gap:10px!important;padding:7px 9px!important;color:#6f5d45!important;font-size:8px!important;line-height:1.4!important}
#${PANEL_ID} .qol-npc-pass-detail strong{color:#48351f!important}
#${PANEL_ID} .qol-npc-pass-train{min-width:0!important}
#${PANEL_ID} .qol-npc-pass-resource-line{display:flex!important;align-items:center!important;gap:8px!important;justify-content:flex-end!important;flex-wrap:wrap!important}
#${PANEL_ID} .qol-npc-pass-resource{display:inline-flex!important;align-items:center!important;gap:3px!important;white-space:nowrap!important}
#${PANEL_ID} .qol-npc-plan{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;min-height:155px!important;border:1px solid #c9b89d!important;border-radius:5px!important;background:#fff!important;overflow:hidden!important}
#${PANEL_ID} .qol-npc-plan-scroll{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;background:#fff!important}
#${PANEL_ID} table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:9px!important}
#${PANEL_ID} th,#${PANEL_ID} td{padding:7px 8px!important;border-bottom:1px solid #e7ded1!important;vertical-align:middle!important;color:#3f3020!important}
#${PANEL_ID} th{position:sticky!important;top:0!important;z-index:2!important;background:#e7ddcc!important;color:#60492f!important;font-size:8px!important;text-transform:uppercase!important;letter-spacing:.28px!important}
#${PANEL_ID} tbody tr:hover{background:#fffaf2!important}
#${PANEL_ID} th.num,#${PANEL_ID} td.num{text-align:right!important}#${PANEL_ID} th.center,#${PANEL_ID} td.center{text-align:center!important}
#${PANEL_ID} .qol-npc-unit-select{display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;height:31px!important;margin:0!important;padding:4px 7px!important;border:1px solid #9f8767!important;border-radius:4px!important;background:#fff!important;color:#342719!important;font-size:10px!important;font-weight:700!important;appearance:auto!important;-webkit-appearance:menulist!important}
#${PANEL_ID} .qol-npc-count{width:86px!important;height:31px!important}
#${PANEL_ID} .qol-npc-mode{all:unset!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:70px!important;height:25px!important;padding:3px 9px!important;border:1px solid #bba98d!important;border-radius:999px!important;background:#f7f2e9!important;color:#695638!important;font-size:8px!important;font-weight:800!important;white-space:nowrap!important;cursor:pointer!important;user-select:none!important}
#${PANEL_ID} .qol-npc-mode.great{border-color:var(--qol-action-border)!important;background:var(--qol-accent-soft)!important;color:var(--qol-accent-ink)!important}
#${PANEL_ID} .qol-npc-mode.siege{border-color:#ccc0ad!important;background:#eee8dd!important;color:#8a7b65!important;cursor:default!important}
#${PANEL_ID} .qol-npc-delete{all:unset!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;width:24px!important;height:24px!important;border-radius:3px!important;color:#a00000!important;font-size:18px!important;font-weight:bold!important;cursor:pointer!important}
#${PANEL_ID} .qol-npc-delete:hover,#${PANEL_ID} .qol-npc-delete:focus-visible{background:#f7d8d6!important}
#${PANEL_ID} .qol-npc-footer{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;flex:0 0 44px!important;padding:6px 8px!important;border-top:1px solid #c9b89d!important;background:#f7f1e6!important}
#${PANEL_ID} .qol-npc-footer-actions{display:flex!important;gap:6px!important}
#${PANEL_ID} .qol-npc-status-wrap{display:flex!important;flex-direction:column!important;align-items:flex-end!important;min-width:0!important;gap:1px!important}
#${PANEL_ID} .qol-npc-status{min-width:0!important;color:#5e4b32!important;font-size:9px!important;font-weight:800!important;text-align:right!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
#${PANEL_ID} .qol-npc-status-detail{color:#88755d!important;font-size:8px!important;text-align:right!important;white-space:nowrap!important}
#${PANEL_ID} .qol-npc-status[data-tone="success"]{color:#55772f!important}#${PANEL_ID} .qol-npc-status[data-tone="warning"]{color:#a34d2c!important}
@media(max-width:800px){#${PANEL_ID}{min-width:94vw!important}#${PANEL_ID} .qol-npc-controls{grid-template-columns:1fr 90px 112px!important}#${PANEL_ID} .qol-npc-helper{grid-column:1/-1!important}#${PANEL_ID} .qol-npc-summaries{grid-template-columns:1fr!important}#${PANEL_ID} .qol-npc-pass-detail{grid-template-columns:1fr!important}#${PANEL_ID} .qol-npc-pass-resource-line{justify-content:flex-start!important}}
`;
        document.head.appendChild(style);
    }

    function bindActivation(node, handler) {
        if (!node) return;
        node.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            handler(event);
        });
        node.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            handler(event);
        });
    }

    function makeDraggable(element, handle) {
        let dragging = false, dx = 0, dy = 0;
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('.qol-npc-close')) return;
            const rect = element.getBoundingClientRect();
            dragging = true;
            dx = event.clientX - rect.left;
            dy = event.clientY - rect.top;
            try { handle.setPointerCapture(event.pointerId); } catch (_) {}
            event.preventDefault();
        });
        handle.addEventListener('pointermove', event => {
            if (!dragging) return;
            const left = Math.max(8, Math.min(event.clientX - dx, window.innerWidth - element.offsetWidth - 8));
            const top = Math.max(8, Math.min(event.clientY - dy, window.innerHeight - element.offsetHeight - 8));
            element.style.setProperty('left', `${left}px`, 'important');
            element.style.setProperty('top', `${top}px`, 'important');
            event.preventDefault();
        });
        const stop = event => {
            dragging = false;
            try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
        };
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
    }

    function positionPanel() {
        if (!panel) return;
        const toolbar = document.getElementById('qol-responsive-toolbar');
        const cog = document.getElementById('qol-cog-btn');
        const anchor = toolbar?.getBoundingClientRect?.() || cog?.getBoundingClientRect?.();
        const width = panel.offsetWidth || 960;
        const height = panel.offsetHeight || 640;
        const left = Math.max(8, Math.min(anchor?.left ?? 20, window.innerWidth - width - 8));
        const top = Math.max(8, Math.min(anchor ? anchor.bottom + 18 : 80, window.innerHeight - height - 8));
        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
        panel.style.setProperty('right', 'auto', 'important');
        panel.style.setProperty('bottom', 'auto', 'important');
    }

    function setStatus(message, tone = 'neutral', detail = '') {
        const node = panel?.querySelector('.qol-npc-status');
        const detailNode = panel?.querySelector('.qol-npc-status-detail');
        if (node) {
            node.textContent = message;
            node.dataset.tone = tone;
        }
        if (detailNode) detailNode.textContent = detail;
    }

    function setBanner(message, tone = 'neutral', detail = '') {
        const banner = panel?.querySelector('.qol-npc-banner');
        if (!banner) return;
        banner.dataset.tone = tone;
        banner.querySelector('.qol-npc-banner-text').textContent = message;
        banner.querySelector('.qol-npc-banner-sub').textContent = detail;
    }

    function setTribe(tribeKey, rebuild = true) {
        if (!ALL_TRIBE_UNITS[tribeKey]) return;
        selectedTribe = tribeKey;
        panel?.querySelectorAll('.qol-npc-tribe-option').forEach(control => {
            const active = control.dataset.tribe === selectedTribe;
            control.classList.toggle('active', active);
            control.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        if (rebuild) replaceRowsForTribe(selectedTribe);
    }

    function syncModeControl(row) {
        const select = row.querySelector('.qol-npc-unit-select');
        const mode = row.querySelector('.qol-npc-mode');
        const siege = SIEGE_UNITS.has(select.value);
        if (siege) row.dataset.great = 'false';
        const great = row.dataset.great === 'true' && !siege;
        mode.classList.toggle('great', great);
        mode.classList.toggle('siege', siege);
        mode.textContent = siege ? 'Siege' : (great ? 'GS / GB' : 'Normal');
        mode.setAttribute('aria-pressed', great ? 'true' : 'false');
        mode.setAttribute('aria-disabled', siege ? 'true' : 'false');
    }

    function createRow(tribeKey) {
        const units = ALL_TRIBE_UNITS[tribeKey]?.units || ALL_TRIBE_UNITS.romans.units;
        const row = document.createElement('tr');
        row.className = 'qol-npc-row';
        row.dataset.great = 'false';
        row.innerHTML = `
            <td><select class="qol-npc-unit-select">${units.map(unit => `<option value="${unit.name}">${unit.name}</option>`).join('')}</select></td>
            <td><span class="qol-npc-mode" role="button" tabindex="0" aria-pressed="false">Normal</span></td>
            <td class="num qol-npc-max">0</td>
            <td class="center"><input class="qol-npc-count" type="number" min="0" value="0" inputmode="numeric"></td>
            <td class="num qol-npc-cost">0</td>
            <td class="center"><span class="qol-npc-delete" role="button" tabindex="0" title="Delete entry">×</span></td>`;
        const select = row.querySelector('.qol-npc-unit-select');
        const mode = row.querySelector('.qol-npc-mode');
        const count = row.querySelector('.qol-npc-count');

        select.addEventListener('change', () => {
            syncModeControl(row);
            updateCalculations();
        });
        bindActivation(mode, () => {
            if (SIEGE_UNITS.has(select.value)) return;
            row.dataset.great = row.dataset.great === 'true' ? 'false' : 'true';
            syncModeControl(row);
            updateCalculations();
        });
        count.addEventListener('input', updateCalculations);
        count.addEventListener('focus', event => event.target.select());
        bindActivation(row.querySelector('.qol-npc-delete'), () => {
            row.remove();
            updateCalculations();
        });
        syncModeControl(row);
        return row;
    }

    function replaceRowsForTribe(tribeKey) {
        const body = panel?.querySelector('#qol-npc-plan-body');
        if (!body) return;
        const counts = [...body.querySelectorAll('.qol-npc-row')].map(row => row.querySelector('.qol-npc-count')?.value || '0');
        body.innerHTML = '';
        (counts.length ? counts : ['0']).forEach(value => {
            const row = createRow(tribeKey);
            row.querySelector('.qol-npc-count').value = value;
            body.appendChild(row);
        });
        selectedPassIndex = 0;
        updateCalculations();
    }

    function addEntry() {
        const body = panel?.querySelector('#qol-npc-plan-body');
        if (!body) return;
        const row = createRow(selectedTribe);
        body.appendChild(row);
        updateCalculations();
        row.querySelector('.qol-npc-count')?.focus();
    }

    function clearPlan() {
        const body = panel?.querySelector('#qol-npc-plan-body');
        if (!body) return;
        body.innerHTML = '';
        body.appendChild(createRow(selectedTribe));
        selectedPassIndex = 0;
        updateCalculations();
        setStatus('Training plan cleared.', 'neutral', 'Enter troop counts to build a new plan.');
    }

    function totalOfResources(values) {
        return RESOURCE_KEYS.reduce((sum, key) => sum + (Number(values?.[key]) || 0), 0);
    }

    function capacitiesFor(resources) {
        return Object.fromEntries(RESOURCE_KEYS.map(key => [key,
            Number.isFinite(resources[key].capacity) && resources[key].capacity > 0 ? resources[key].capacity : Number.POSITIVE_INFINITY
        ]));
    }

    function runGreedyPasses(entries, resources, order) {
        const caps = capacitiesFor(resources);
        const remaining = entries.map(entry => entry.count);
        const passes = [];
        let guard = 0;

        while (remaining.some(count => count > 0) && guard < 100) {
            guard += 1;
            const used = { wood:0, clay:0, iron:0, crop:0 };
            const allocations = [];
            let progressed = false;

            order.forEach(index => {
                const entry = entries[index];
                if (!entry || remaining[index] <= 0) return;
                let fit = remaining[index];
                RESOURCE_KEYS.forEach(key => {
                    const cost = entry.costs[key];
                    if (!cost) return;
                    fit = Math.min(fit, Math.floor(Math.max(0, caps[key] - used[key]) / cost));
                });
                fit = Math.max(0, Math.floor(fit));
                if (!fit) return;
                remaining[index] -= fit;
                RESOURCE_KEYS.forEach(key => { used[key] += entry.costs[key] * fit; });
                allocations.push({ entryIndex:index, count:fit });
                progressed = true;
            });

            if (!progressed) {
                return { passes, impossible:true };
            }
            passes.push({ resources:used, allocations });
        }

        return { passes, impossible:remaining.some(count => count > 0) };
    }

    function buildCandidateOrders(entries, resources) {
        const base = entries.map((_, index) => index);
        const orders = [base, [...base].reverse()];
        orders.push([...base].sort((a, b) => entries[b].costs.total - entries[a].costs.total));
        RESOURCE_KEYS.forEach(key => {
            const cap = resources[key].capacity || 1;
            orders.push([...base].sort((a, b) => (entries[b].costs[key] / cap) - (entries[a].costs[key] / cap)));
        });
        orders.push([...base].sort((a, b) => {
            const dominant = entry => Math.max(...RESOURCE_KEYS.map(key => {
                const cap = resources[key].capacity || Number.POSITIVE_INFINITY;
                return cap === Number.POSITIVE_INFINITY ? 0 : entry.costs[key] / cap;
            }));
            return dominant(entries[b]) - dominant(entries[a]);
        }));
        const seen = new Set();
        return orders.filter(order => {
            const signature = order.join(',');
            if (seen.has(signature)) return false;
            seen.add(signature);
            return true;
        });
    }

    function makeValidNpcDistribution(required, preferredStock, resources) {
        const caps = capacitiesFor(resources);
        const target = { wood:required.wood, clay:required.clay, iron:required.iron, crop:required.crop };
        let leftover = Math.max(0, totalOfResources(preferredStock) - totalOfResources(required));

        RESOURCE_KEYS.forEach(key => {
            if (leftover <= 0) return;
            const desired = Math.max(0, (preferredStock[key] || 0) - target[key]);
            const space = Math.max(0, caps[key] - target[key]);
            const add = Math.min(leftover, desired, space);
            target[key] += add;
            leftover -= add;
        });

        const bySpace = [...RESOURCE_KEYS].sort((a, b) => (caps[b] - target[b]) - (caps[a] - target[a]));
        bySpace.forEach(key => {
            if (leftover <= 0) return;
            const space = Math.max(0, caps[key] - target[key]);
            const add = Math.min(leftover, space);
            target[key] += add;
            leftover -= add;
        });

        return { target, unresolved:leftover };
    }

    function buildExecutionPlan(entries, resources) {
        const positiveEntries = entries.filter(entry => entry.count > 0);
        if (!positiveEntries.length) return { passes:[], impossible:false };

        const impossibleUnit = positiveEntries.find(entry => RESOURCE_KEYS.some(key => {
            const cap = resources[key].capacity;
            return entry.costs[key] > 0 && Number.isFinite(cap) && entry.costs[key] > cap;
        }));
        if (impossibleUnit) return { passes:[], impossible:true, impossibleUnit:impossibleUnit.label };

        const candidates = buildCandidateOrders(positiveEntries, resources)
            .map(order => runGreedyPasses(positiveEntries, resources, order))
            .filter(result => !result.impossible);
        if (!candidates.length) return { passes:[], impossible:true };
        candidates.sort((a, b) => a.passes.length - b.passes.length);
        const chosen = candidates[0];

        let stock = Object.fromEntries(RESOURCE_KEYS.map(key => [key, resources[key].current]));
        const passes = chosen.passes.map((pass, index) => {
            const distribution = makeValidNpcDistribution(pass.resources, stock, resources);
            const target = distribution.target;
            const before = { ...stock };
            const after = {};
            RESOURCE_KEYS.forEach(key => {
                after[key] = Math.max(0, target[key] - pass.resources[key]);
            });
            stock = after;
            const allocations = pass.allocations.map(item => {
                const entry = positiveEntries[item.entryIndex];
                return {
                    label: entry.label,
                    mode: entry.mode,
                    count: item.count,
                    costs: entry.costs
                };
            });
            return {
                index,
                required:{ ...pass.resources },
                target,
                before,
                after,
                allocations,
                cost:totalOfResources(pass.resources),
                targetTotal:totalOfResources(target),
                unresolved:distribution.unresolved
            };
        });

        return { passes, impossible:false };
    }

    function renderPassPlan() {
        const wrap = panel?.querySelector('.qol-npc-pass-plan');
        const tabs = panel?.querySelector('.qol-npc-pass-tabs');
        const detail = panel?.querySelector('.qol-npc-pass-detail');
        const passes = latestCalculation?.execution?.passes || [];
        if (!wrap || !tabs || !detail) return;
        wrap.classList.toggle('visible', passes.length > 0);
        if (!passes.length) {
            tabs.innerHTML = '';
            detail.innerHTML = '';
            return;
        }

        selectedPassIndex = Math.max(0, Math.min(selectedPassIndex, passes.length - 1));
        tabs.innerHTML = passes.map((pass, index) => `<span class="qol-npc-pass-tab ${index === selectedPassIndex ? 'active' : ''}" role="button" tabindex="0" data-pass-index="${index}">Pass ${index + 1}</span>`).join('');
        tabs.querySelectorAll('.qol-npc-pass-tab').forEach(control => {
            bindActivation(control, () => {
                selectedPassIndex = Number(control.dataset.passIndex) || 0;
                renderPassPlan();
                renderSelectedPass();
            });
        });

        const pass = passes[selectedPassIndex];
        const trainText = pass.allocations.map(item => `${formatNumber(item.count)} ${item.label}${item.mode !== 'Normal' && item.mode !== 'Siege' ? ` (${item.mode})` : ''}`).join(' · ');
        const resources = RESOURCE_KEYS.map(key => `<span class="qol-npc-pass-resource">${resourceIcon(key)}<strong>${formatNumber(pass.target[key])}</strong></span>`).join('');
        detail.innerHTML = `<div class="qol-npc-pass-train"><strong>Train:</strong> ${trainText || '—'}<br><span>Consumes ${formatNumber(pass.cost)} resources in this pass.</span></div><div class="qol-npc-pass-resource-line">${resources}</div>`;
    }

    function renderSelectedPass() {
        const passes = latestCalculation?.execution?.passes || [];
        const pass = passes[selectedPassIndex] || null;
        const action = panel?.querySelector('#qol-npc-market-copy');
        const passNode = panel?.querySelector('#qol-npc-passes');
        if (passNode) {
            const count = passes.length || 1;
            passNode.textContent = passes.length ? `Pass ${selectedPassIndex + 1}/${count}` : '1 pass';
            passNode.className = `qol-npc-pill ${count > 1 ? 'warn' : 'good'}`;
        }
        if (action) action.classList.toggle('disabled', !pass);

        RESOURCE_KEYS.forEach(key => {
            const card = panel?.querySelector(`.qol-npc-summary.npc [data-resource="${key}"]`);
            const valueNode = panel?.querySelector(`#qol-npc-dist-${key}`);
            const requiredNode = panel?.querySelector(`#qol-npc-dist-${key}-required`);
            const overflowNode = panel?.querySelector(`#qol-npc-dist-${key}-overflow`);
            const meter = panel?.querySelector(`#qol-npc-dist-${key}-meter`);
            const cap = latestCalculation?.resources?.[key]?.capacity;
            const target = pass?.target?.[key] || 0;
            const required = pass?.required?.[key] || 0;
            const leaves = Math.max(0, target - required);
            if (valueNode) valueNode.textContent = formatNumber(target);
            if (requiredNode) requiredNode.textContent = `Need ${formatNumber(required)}`;
            if (overflowNode) {
                overflowNode.textContent = pass ? `Leaves ${formatNumber(leaves)}` : 'Leaves 0';
                overflowNode.classList.remove('overflow');
            }
            card?.classList.toggle('capped', Number.isFinite(cap) && cap > 0 && target >= cap && required > 0);
            const ratio = Number.isFinite(cap) && cap > 0 ? Math.max(0, Math.min(100, Math.round((target / cap) * 100))) : (target > 0 ? 100 : 0);
            if (meter) meter.style.width = `${ratio}%`;
        });

        const targetTotal = panel?.querySelector('#qol-npc-dist-total');
        if (targetTotal) targetTotal.textContent = formatNumber(pass?.targetTotal || 0);
    }

    function getCurrentVillageId() {
        const hashMatch = String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i);
        if (hashMatch) return hashMatch[1];
        const anyMatch = String(location.href || '').match(/villId:(\d+)/i);
        return anyMatch?.[1] || null;
    }

    function parseLocationFromElement(element) {
        if (!element) return null;
        const idMatch = String(element.id || '').match(/(?:buildingImage|location)(\d+)/i);
        if (idMatch) return Number.parseInt(idMatch[1], 10);
        const classes = Array.from(element.classList || []);
        const locationClass = classes.find(name => /^buildingLocation\d+$/.test(name) || /^location\d+$/.test(name));
        if (!locationClass) return null;
        return Number.parseInt(locationClass.replace(/\D/g, ''), 10);
    }

    function findMarketplaceLocation(villageId) {
        const openMarketplace = document.querySelector('.buildingDetails.marketplace')?.closest('.modalWrapper, .modal, window');
        if (openMarketplace) {
            const status = openMarketplace.querySelector('.buildingStatus[class*="location"]');
            const direct = parseLocationFromElement(status);
            if (Number.isFinite(direct)) return direct;
        }

        const image = document.querySelector('#villageView img.location.buildingId17, img.location.buildingId17');
        const imageLocation = parseLocationFromElement(image);
        if (Number.isFinite(imageLocation)) return imageLocation;
        const wrapper = image?.closest('building-location');
        const wrapperLocation = parseLocationFromElement(wrapper);
        if (Number.isFinite(wrapperLocation)) return wrapperLocation;

        try {
            for (let index = 0; index < localStorage.length; index += 1) {
                const key = localStorage.key(index);
                if (!key || !key.startsWith('apes_village_dashboard_scan_v1:')) continue;
                const parsed = JSON.parse(localStorage.getItem(key) || '{}');
                const village = parsed?.villages?.[String(villageId)] || parsed?.villages?.[Number(villageId)];
                const market = village?.buildings?.find?.(building => Number(building.type) === 17 || /market/i.test(building.label || ''));
                if (Number.isFinite(Number(market?.location))) return Number(market.location);
            }
        } catch (_) {}
        return null;
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                const ok = document.execCommand('copy');
                textarea.remove();
                return ok;
            } catch (_) {
                return false;
            }
        }
    }

    function formatDistributionForClipboard(pass) {
        return RESOURCE_KEYS.map(key => `${RESOURCE_META[key].label}: ${Math.round(pass.target[key] || 0)}`).join('\n');
    }

    async function openNpcMarketAndCopy() {
        const pass = latestCalculation?.execution?.passes?.[selectedPassIndex];
        if (!pass) {
            setStatus('No NPC pass selected.', 'warning', 'Enter troop counts first.');
            return;
        }
        const villageId = getCurrentVillageId();
        if (!villageId) {
            setStatus('Could not identify the current village.', 'warning', 'Open the calculator from a village first.');
            return;
        }
        const copied = await copyText(formatDistributionForClipboard(pass));
        const marketLocation = findMarketplaceLocation(villageId);
        if (!Number.isFinite(marketLocation)) {
            setStatus(copied ? 'Distribution copied.' : 'Could not copy distribution.', 'warning', 'Marketplace location unknown. Run Account Operations Center Scan Now once.');
            return;
        }
        closePanel();
        location.hash = `#/page:village/villId:${villageId}/location:${marketLocation}/window:building/tab:NpcTrade`;
    }

    function updateCalculations() {
        if (!panel) return;
        const resources = getVillageResources();
        const fealty = Math.min(20, Math.max(1, Number.parseInt(panel.querySelector('#qol-npc-fealty')?.value || '1', 10) || 1));
        const units = ALL_TRIBE_UNITS[selectedTribe]?.units || ALL_TRIBE_UNITS.romans.units;

        RESOURCE_KEYS.forEach(key => {
            const current = resources[key].current;
            const capacity = resources[key].capacity;
            const percent = Number.isFinite(capacity) && capacity > 0 ? Math.max(0, Math.min(100, Math.round((current / capacity) * 100))) : null;
            panel.querySelector(`#qol-npc-stock-${key}`).textContent = formatNumber(current);
            panel.querySelector(`#qol-npc-stock-${key}-capacity`).textContent = Number.isFinite(capacity) ? `Cap ${formatNumber(capacity)}` : 'Cap unknown';
            panel.querySelector(`#qol-npc-stock-${key}-percent`).textContent = percent == null ? '—' : `${percent}%`;
            panel.querySelector(`#qol-npc-stock-${key}-meter`).style.width = `${percent ?? 0}%`;
        });
        panel.querySelector('#qol-npc-stock-total').textContent = formatNumber(resources.total);

        let availableTotal = resources.total;
        let totalCost = 0;
        let totalUnits = 0;
        const required = { wood:0, clay:0, iron:0, crop:0 };
        const rows = [...panel.querySelectorAll('.qol-npc-row')];
        const plannedEntries = [];

        rows.forEach(row => {
            const select = row.querySelector('.qol-npc-unit-select');
            const unit = units.find(item => item.name === select.value) || units[0];
            const great = row.dataset.great === 'true' && !SIEGE_UNITS.has(select.value);
            const costs = calculateUnitCosts(unit, fealty, great);
            const oneBatchMaximum = getCapacityLimitedMaximum(costs, resources, availableTotal);
            const totalMaximum = getTotalResourceMaximum(costs, availableTotal);
            row.querySelector('.qol-npc-max').textContent = formatNumber(oneBatchMaximum);
            row.querySelector('.qol-npc-max').title = 'Maximum this unit can fit in one storage-aware NPC pass';
            const input = row.querySelector('.qol-npc-count');
            input.max = String(totalMaximum);
            let count = Math.max(0, Number.parseInt(input.value || '0', 10) || 0);
            if (count > totalMaximum) {
                count = totalMaximum;
                input.value = String(count);
            }
            const rowCost = costs.total * count;
            row.querySelector('.qol-npc-cost').textContent = formatNumber(rowCost);
            row.querySelector('.qol-npc-cost').title = RESOURCE_KEYS.map(key => `${formatNumber(costs[key] * count)} ${RESOURCE_META[key].label}`).join(' · ');
            totalCost += rowCost;
            totalUnits += count;
            availableTotal = Math.max(0, availableTotal - rowCost);
            RESOURCE_KEYS.forEach(key => { required[key] += costs[key] * count; });
            plannedEntries.push({
                label:unit.name,
                mode:SIEGE_UNITS.has(unit.name) ? 'Siege' : (great ? 'GS / GB' : 'Normal'),
                count,
                costs
            });
        });

        const overflow = {};
        RESOURCE_KEYS.forEach(key => {
            const cap = resources[key].capacity;
            overflow[key] = Number.isFinite(cap) ? Math.max(0, required[key] - cap) : 0;
        });
        const overflowTotal = RESOURCE_KEYS.reduce((sum, key) => sum + overflow[key], 0);
        const execution = buildExecutionPlan(plannedEntries, resources);
        latestCalculation = { resources, required, overflow, overflowTotal, execution, totalCost, totalUnits };
        selectedPassIndex = Math.max(0, Math.min(selectedPassIndex, Math.max(0, execution.passes.length - 1)));

        const remaining = Math.max(0, resources.total - totalCost);
        panel.querySelector('#qol-npc-remaining').textContent = formatNumber(remaining);
        panel.querySelector('#qol-npc-units').textContent = formatNumber(totalUnits);
        panel.querySelector('#qol-npc-plan-cost').textContent = formatNumber(totalCost);
        panel.querySelector('#qol-npc-overflow').textContent = formatNumber(overflowTotal);

        renderPassPlan();
        renderSelectedPass();

        if (!rows.length) {
            setBanner('Add a training entry to begin planning.', 'neutral', 'No NPC target yet.');
            setStatus('No training entries.', 'neutral', 'Add an entry to start.');
        } else if (!totalUnits) {
            setBanner('Build your troop plan.', 'neutral', 'NPC targets will update instantly.');
            setStatus(`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} ready.`, 'neutral', 'Enter troop counts.');
        } else if (execution.impossible) {
            setBanner('This plan cannot fit the current storage.', 'warning', execution.impossibleUnit ? `${execution.impossibleUnit} costs exceed a storage cap.` : 'Increase Warehouse / Granary capacity.');
            setStatus(`${formatNumber(totalUnits)} troops · ${formatNumber(totalCost)} resources`, 'warning', 'No valid NPC pass plan available.');
        } else if (execution.passes.length > 1) {
            const blocked = RESOURCE_KEYS.filter(key => overflow[key] > 0).map(key => RESOURCE_META[key].label).join(', ');
            setBanner(`Split across ${execution.passes.length} NPC passes${blocked ? ` · ${blocked} is the limiter` : ''}.`, 'warning', 'Select each pass below, copy it, NPC, train, then continue.');
            setStatus(`${formatNumber(totalUnits)} troops · ${formatNumber(totalCost)} resources`, 'warning', `${execution.passes.length} NPC passes planned.`);
        } else {
            setBanner('Fits in one NPC pass.', 'success', 'The copied target is a complete valid NPC distribution.');
            setStatus(`${formatNumber(totalUnits)} troops · ${formatNumber(totalCost)} resources`, 'success', 'One NPC pass.');
        }
    }

    function buildPanel() {
        const existing = document.getElementById(PANEL_ID);
        if (existing) {
            panel = existing;
            return;
        }
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
<div class="qol-npc-header">
  <div class="qol-npc-title"><span>NPC Calculator</span><small>Storage-aware</small></div>
  <span class="qol-npc-close" role="button" tabindex="0" title="Close">×</span>
</div>
<div class="qol-npc-body">
  <div class="qol-npc-controls">
    <div class="qol-npc-field">
      <span>Tribe</span>
      <div class="qol-npc-tribe-options" role="group" aria-label="Tribe">
        <span class="qol-npc-tribe-option" role="button" tabindex="0" data-tribe="romans" aria-pressed="false">Roman</span>
        <span class="qol-npc-tribe-option" role="button" tabindex="0" data-tribe="teutons" aria-pressed="false">Teuton</span>
        <span class="qol-npc-tribe-option" role="button" tabindex="0" data-tribe="gauls" aria-pressed="false">Gaul</span>
      </div>
    </div>
    <label class="qol-npc-field">Fealty<input id="qol-npc-fealty" type="number" min="1" max="20" value="1"></label>
    <div class="qol-npc-btn secondary" id="qol-npc-refresh" role="button" tabindex="0">Refresh stock</div>
    <div class="qol-npc-helper">NPC targets now include all resources currently in storage, obey <strong>Warehouse / Granary caps</strong>, and can be split into executable passes.</div>
  </div>
  <div class="qol-npc-summaries">
    <section class="qol-npc-summary stock"><div class="qol-npc-summary-head"><span>Village stock</span><span>Total <strong id="qol-npc-stock-total">0</strong></span></div><div class="qol-npc-resource-grid">${buildResourceCards('qol-npc-stock',true)}</div><div class="qol-npc-summary-foot"><span>After full plan: <strong id="qol-npc-remaining">0</strong></span><span>Troops: <strong id="qol-npc-units">0</strong></span></div></section>
    <section class="qol-npc-summary npc"><div class="qol-npc-summary-head"><span>NPC target</span><span>Total <strong id="qol-npc-dist-total">0</strong></span></div><div class="qol-npc-resource-grid">${buildResourceCards('qol-npc-dist',false)}</div><div class="qol-npc-summary-foot"><span>Full plan: <strong id="qol-npc-plan-cost">0</strong> · One-pass overflow: <strong id="qol-npc-overflow">0</strong></span><div class="qol-npc-summary-actions"><span id="qol-npc-passes" class="qol-npc-pill good">1 pass</span><span id="qol-npc-market-copy" class="qol-npc-mini-action disabled" role="button" tabindex="0">Copy + Open NPC</span></div></div></section>
  </div>
  <div class="qol-npc-banner" data-tone="neutral"><div class="qol-npc-banner-main"><span class="qol-npc-banner-dot"></span><span class="qol-npc-banner-text">Build your troop plan.</span></div><span class="qol-npc-banner-sub">NPC targets update instantly.</span></div>
  <div class="qol-npc-pass-plan"><div class="qol-npc-pass-head"><span>Execution plan</span><div class="qol-npc-pass-tabs"></div></div><div class="qol-npc-pass-detail"></div></div>
  <section class="qol-npc-plan">
    <div class="qol-npc-plan-scroll"><table><thead><tr><th style="width:27%">Unit</th><th style="width:18%">Training mode</th><th class="num" style="width:16%">Max one batch</th><th class="center" style="width:14%">Plan</th><th class="num" style="width:17%">Cost</th><th style="width:8%"></th></tr></thead><tbody id="qol-npc-plan-body"></tbody></table></div>
    <div class="qol-npc-footer"><div class="qol-npc-footer-actions"><div class="qol-npc-btn" id="qol-npc-add" role="button" tabindex="0">Add entry</div><div class="qol-npc-btn danger" id="qol-npc-clear" role="button" tabindex="0">Clear plan</div></div><div class="qol-npc-status-wrap"><div class="qol-npc-status" data-tone="neutral">Ready.</div><div class="qol-npc-status-detail">Enter troop counts.</div></div></div>
  </section>
</div>`;
        document.body.appendChild(panel);
        makeDraggable(panel, panel.querySelector('.qol-npc-header'));
        bindActivation(panel.querySelector('.qol-npc-close'), closePanel);
        selectedTribe = detectUserTribe();
        panel.querySelectorAll('.qol-npc-tribe-option').forEach(control => {
            bindActivation(control, () => setTribe(control.dataset.tribe, true));
        });
        setTribe(selectedTribe, false);
        panel.querySelector('#qol-npc-fealty').addEventListener('input', event => {
            const value = Math.min(20, Math.max(1, Number.parseInt(event.target.value || '1', 10) || 1));
            event.target.value = String(value);
            updateCalculations();
        });
        bindActivation(panel.querySelector('#qol-npc-refresh'), () => {
            updateCalculations();
            setStatus('Village stock refreshed.', 'success', 'Storage capacities reread from the HUD.');
        });
        bindActivation(panel.querySelector('#qol-npc-market-copy'), openNpcMarketAndCopy);
        bindActivation(panel.querySelector('#qol-npc-add'), addEntry);
        bindActivation(panel.querySelector('#qol-npc-clear'), clearPlan);
        panel.querySelector('#qol-npc-plan-body').appendChild(createRow(selectedTribe));
        updateCalculations();
    }

    function openPanel() {
        if (!panel) buildPanel();
        window.dispatchEvent(new CustomEvent('qol_close_others', { detail: { source: 'npcCalculator' } }));
        panel.classList.add('qol-open');
        updateCalculations();
        requestAnimationFrame(positionPanel);
    }

    function closePanel() {
        panel?.classList.remove('qol-open');
    }

    function buildToggleButton() {
        const existing = document.getElementById(TOGGLE_ID);
        if (existing) {
            toggleButton = existing;
            return;
        }
        toggleButton = document.createElement('div');
        toggleButton.id = TOGGLE_ID;
        toggleButton.title = 'NPC Calculator';
        toggleButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14v4M8 18h.01M12 18h.01"></path></svg>`;
        toggleButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (panel?.classList.contains('qol-open')) closePanel();
            else openPanel();
        });
        document.body.appendChild(toggleButton);
        window.qolRepositionAllButtons?.();
    }

    function buildUI() {
        if (!isEnabled()) return;
        ensureStyles();
        buildPanel();
        buildToggleButton();
        closePanel();
        window.qolRepositionAllButtons?.();
    }

    function destroyUI() {
        panel?.remove();
        toggleButton?.remove();
        panel = null;
        toggleButton = null;
        latestCalculation = null;
        window.qolRepositionAllButtons?.();
    }

    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source !== 'npcCalculator') closePanel();
    });
    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== FEATURE_KEY) return;
        if (event.detail.enabled) buildUI();
        else destroyUI();
    });
    window.addEventListener('resize', () => {
        if (!panel?.classList.contains('qol-open')) return;
        const rect = panel.getBoundingClientRect();
        if (rect.right > window.innerWidth || rect.bottom > window.innerHeight) positionPanel();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && panel?.classList.contains('qol-open')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            closePanel();
        }
    }, true);

    const start = () => {
        if (isEnabled()) buildUI();
        console.log('[NPC Calculator] Multi-pass storage-aware planner initialized.');
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
    else start();
})();
