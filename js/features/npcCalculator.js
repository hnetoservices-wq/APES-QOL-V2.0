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
        const factor = 1 - discount;
        const multiplier = great ? 3 : 1;
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

    function resourceIcon(key) {
        return `<i class="${RESOURCE_META[key].icon}" aria-hidden="true"></i>`;
    }

    function buildResourceCards(prefix, mode) {
        return RESOURCE_KEYS.map(key => {
            const extra = mode === 'stock'
                ? `<div class="qol-npc-resource-sub"><span id="${prefix}-${key}-capacity">Cap —</span></div>`
                : `<div class="qol-npc-resource-sub"><span id="${prefix}-${key}-required">Need 0</span><span id="${prefix}-${key}-overflow"></span></div>`;
            return `<div class="qol-npc-resource-card" data-resource="${key}"><div class="qol-npc-resource-head">${resourceIcon(key)}<span>${RESOURCE_META[key].label}</span></div><strong id="${prefix}-${key}">0</strong>${extra}</div>`;
        }).join('');
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
#${PANEL_ID}{position:fixed!important;display:none!important;flex-direction:column!important;width:min(900px,96vw)!important;min-width:min(680px,96vw)!important;height:min(610px,90vh)!important;min-height:460px!important;max-width:96vw!important;max-height:92vh!important;resize:both!important;overflow:hidden!important;z-index:1000000!important;border:3px solid var(--qol-border)!important;border-radius:6px!important;background:#f5f1e8!important;color:#3f3020!important;box-shadow:0 14px 38px rgba(0,0,0,.48)!important}
#${PANEL_ID}.qol-open{display:flex!important}
#${PANEL_ID} .qol-npc-header{display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 38px!important;min-height:38px!important;padding:6px 10px 6px 12px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-dark))!important;color:#fff!important;cursor:move!important;user-select:none!important;touch-action:none!important}
#${PANEL_ID} .qol-npc-title{display:flex!important;align-items:center!important;gap:8px!important;font-size:14px!important;font-weight:800!important}#${PANEL_ID} .qol-npc-title small{font-size:8px!important;font-weight:600!important;color:#ded2bd!important;text-transform:uppercase!important;letter-spacing:.55px!important}
#${PANEL_ID} .qol-npc-close{display:flex!important;align-items:center!important;justify-content:center!important;width:26px!important;height:26px!important;border-radius:4px!important;background:rgba(0,0,0,.22)!important;color:#fff!important;font-size:21px!important;font-weight:bold!important;cursor:pointer!important}
#${PANEL_ID} .qol-npc-body{display:flex!important;flex-direction:column!important;gap:8px!important;flex:1 1 auto!important;min-height:0!important;padding:9px!important;overflow:hidden!important}
#${PANEL_ID} .qol-npc-controls{display:grid!important;grid-template-columns:minmax(250px,1.15fr) 90px auto minmax(180px,1fr)!important;gap:8px!important;align-items:end!important;flex:0 0 auto!important;padding:8px!important;border:1px solid #d2c3aa!important;border-radius:4px!important;background:#fff!important}
#${PANEL_ID} .qol-npc-field{display:flex!important;flex-direction:column!important;gap:4px!important;min-width:0!important;color:#715b3e!important;font-size:8px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.35px!important}
#${PANEL_ID} .qol-npc-tribe-options{display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:4px!important;min-width:0!important}
#${PANEL_ID} .qol-npc-tribe-option{display:flex!important;align-items:center!important;justify-content:center!important;height:30px!important;padding:4px 7px!important;border:1px solid #a88e69!important;border-radius:3px!important;background:#f8f4ed!important;color:#5f4a31!important;font-size:10px!important;font-weight:800!important;cursor:pointer!important;user-select:none!important}
#${PANEL_ID} .qol-npc-tribe-option:hover{background:#fffaf0!important}#${PANEL_ID} .qol-npc-tribe-option.active{border-color:var(--qol-action-border)!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important}
#${PANEL_ID} input[type=number]{display:block!important;visibility:visible!important;opacity:1!important;height:30px!important;margin:0!important;padding:4px 7px!important;border:1px solid #a88e69!important;border-radius:3px!important;background:#fff!important;color:#342719!important;font-size:11px!important;font-weight:700!important;text-align:center!important;box-shadow:none!important}
#${PANEL_ID} .qol-npc-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;height:30px!important;padding:5px 11px!important;border:1px solid var(--qol-action-border)!important;border-radius:3px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:10px!important;font-weight:800!important;cursor:pointer!important;user-select:none!important;white-space:nowrap!important}#${PANEL_ID} .qol-npc-btn.secondary{background:linear-gradient(#fffdf8,#e8dece)!important;color:#5d472d!important;border-color:#9e8665!important}#${PANEL_ID} .qol-npc-btn.danger{background:linear-gradient(#d9605c,#b6322e)!important;border-color:#8e2421!important}
#${PANEL_ID} .qol-npc-helper{align-self:center!important;color:#77654e!important;font-size:9px!important;line-height:1.35!important}#${PANEL_ID} .qol-npc-helper strong{color:#4d3823!important}
#${PANEL_ID} .qol-npc-summaries{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important;flex:0 0 auto!important;min-width:0!important}
#${PANEL_ID} .qol-npc-summary{min-width:0!important;border:1px solid #cdbda3!important;border-radius:4px!important;background:#fff!important;overflow:hidden!important}#${PANEL_ID} .qol-npc-summary-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;min-height:29px!important;padding:6px 8px!important;background:#e8decc!important;color:#60492f!important;font-size:9px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.35px!important}#${PANEL_ID} .qol-npc-summary-head strong{font-size:10px!important;color:#3d2e1f!important}
#${PANEL_ID} .qol-npc-resource-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important}#${PANEL_ID} .qol-npc-resource-card{min-width:0!important;padding:7px 7px 6px!important;border-right:1px solid #ece3d5!important}#${PANEL_ID} .qol-npc-resource-card:last-child{border-right:0!important}#${PANEL_ID} .qol-npc-resource-card.capped{background:#fff1e8!important;box-shadow:inset 0 -3px 0 #c56a3b!important}
#${PANEL_ID} .qol-npc-resource-head{display:flex!important;align-items:center!important;gap:4px!important;color:#715d43!important;font-size:8px!important;font-weight:800!important;text-transform:uppercase!important;white-space:nowrap!important}#${PANEL_ID} .qol-npc-resource-card>strong{display:block!important;margin-top:4px!important;color:#392a1c!important;font-size:14px!important;font-weight:800!important;line-height:17px!important;font-variant-numeric:tabular-nums!important}#${PANEL_ID} .qol-npc-resource-sub{display:flex!important;flex-direction:column!important;gap:1px!important;margin-top:2px!important;color:#87745c!important;font-size:7.5px!important;line-height:10px!important}#${PANEL_ID} .qol-npc-resource-sub .overflow{color:#ad452b!important;font-weight:800!important}
#${PANEL_ID} .qol-npc-summary-foot{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;min-height:34px!important;padding:5px 8px!important;border-top:1px solid #e7ddcf!important;background:#faf6ee!important;color:#715f47!important;font-size:8px!important}#${PANEL_ID} .qol-npc-summary-foot strong{color:#47351f!important;font-size:9px!important}.qol-npc-pill{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:22px!important;padding:3px 7px!important;border-radius:999px!important;font-size:8px!important;font-weight:800!important;white-space:nowrap!important}.qol-npc-pill.good{border:1px solid #8dac68!important;background:#eef7e6!important;color:#486d2b!important}.qol-npc-pill.warn{border:1px solid #c57a58!important;background:#fff0e7!important;color:#9b4428!important}
#${PANEL_ID} .qol-npc-plan{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;min-height:0!important;border:1px solid #cdbda3!important;border-radius:4px!important;background:#fff!important;overflow:hidden!important}#${PANEL_ID} .qol-npc-plan-scroll{flex:1 1 auto!important;min-height:0!important;overflow:auto!important}#${PANEL_ID} table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:9px!important}#${PANEL_ID} th,#${PANEL_ID} td{padding:7px 8px!important;border-bottom:1px solid #e7ded1!important;vertical-align:middle!important;color:#3f3020!important}#${PANEL_ID} th{position:sticky!important;top:0!important;z-index:2!important;background:#e8decc!important;color:#60492f!important;font-size:8px!important;text-transform:uppercase!important;letter-spacing:.25px!important}#${PANEL_ID} th.num,#${PANEL_ID} td.num{text-align:right!important}#${PANEL_ID} th.center,#${PANEL_ID} td.center{text-align:center!important}
#${PANEL_ID} .qol-npc-unit-select{display:block!important;visibility:visible!important;opacity:1!important;width:100%!important;height:30px!important;margin:0!important;padding:4px 7px!important;border:1px solid #a88e69!important;border-radius:3px!important;background:#fff!important;color:#342719!important;font-size:10px!important;font-weight:700!important;appearance:auto!important;-webkit-appearance:menulist!important}#${PANEL_ID} .qol-npc-count{width:88px!important}#${PANEL_ID} .qol-npc-mode{display:flex!important;align-items:center!important;gap:6px!important;font-size:8px!important;font-weight:700!important;white-space:nowrap!important}#${PANEL_ID} .qol-npc-mode input{width:14px!important;height:14px!important;margin:0!important}#${PANEL_ID} .qol-npc-delete{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:24px!important;height:24px!important;border-radius:3px!important;color:#a00000!important;font-size:18px!important;font-weight:bold!important;cursor:pointer!important}.qol-npc-delete:hover{background:#f7d8d6!important}
#${PANEL_ID} .qol-npc-footer{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;flex:0 0 43px!important;padding:6px 8px!important;border-top:1px solid #cdbda3!important;background:#f7f1e6!important}#${PANEL_ID} .qol-npc-footer-actions{display:flex!important;gap:6px!important}.qol-npc-status{min-width:0!important;color:#78644a!important;font-size:8px!important;text-align:right!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}.qol-npc-status[data-tone="success"]{color:#55772f!important;font-weight:800!important}.qol-npc-status[data-tone="warning"]{color:#a34d2c!important;font-weight:800!important}
@media(max-width:760px){#${PANEL_ID}{min-width:94vw!important}#${PANEL_ID} .qol-npc-controls{grid-template-columns:1fr 90px auto!important}#${PANEL_ID} .qol-npc-helper{grid-column:1/-1!important}#${PANEL_ID} .qol-npc-summaries{grid-template-columns:1fr!important}}
`;
        document.head.appendChild(style);
    }

    function makeDraggable(element, handle) {
        let dragging = false, dx = 0, dy = 0;
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('.qol-npc-close')) return;
            const rect = element.getBoundingClientRect();
            dragging = true; dx = event.clientX - rect.left; dy = event.clientY - rect.top;
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
        const stop = event => { dragging = false; try { handle.releasePointerCapture(event.pointerId); } catch (_) {} };
        handle.addEventListener('pointerup', stop); handle.addEventListener('pointercancel', stop);
    }

    function positionPanel() {
        if (!panel) return;
        const toolbar = document.getElementById('qol-responsive-toolbar');
        const cog = document.getElementById('qol-cog-btn');
        const anchor = toolbar?.getBoundingClientRect?.() || cog?.getBoundingClientRect?.();
        const width = panel.offsetWidth || 900;
        const height = panel.offsetHeight || 610;
        const left = Math.max(8, Math.min(anchor?.left ?? 20, window.innerWidth - width - 8));
        const preferredTop = anchor ? anchor.bottom + 18 : 80;
        const top = Math.max(8, Math.min(preferredTop, window.innerHeight - height - 8));
        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
        panel.style.setProperty('right', 'auto', 'important');
        panel.style.setProperty('bottom', 'auto', 'important');
    }

    function setStatus(message, tone = 'neutral') {
        const node = panel?.querySelector('.qol-npc-status');
        if (!node) return;
        node.textContent = message;
        node.dataset.tone = tone;
    }

    function setTribe(tribeKey, rebuild = true) {
        if (!ALL_TRIBE_UNITS[tribeKey]) return;
        selectedTribe = tribeKey;
        panel?.querySelectorAll('.qol-npc-tribe-option').forEach(button => {
            button.classList.toggle('active', button.dataset.tribe === selectedTribe);
            button.setAttribute('aria-pressed', button.dataset.tribe === selectedTribe ? 'true' : 'false');
        });
        if (rebuild) replaceRowsForTribe(selectedTribe);
    }

    function createRow(tribeKey, preferredUnit = '') {
        const units = ALL_TRIBE_UNITS[tribeKey]?.units || ALL_TRIBE_UNITS.romans.units;
        const row = document.createElement('tr');
        row.className = 'qol-npc-row';
        row.innerHTML = `<td><select class="qol-npc-unit-select">${units.map(unit => `<option value="${unit.name}">${unit.name}</option>`).join('')}</select></td><td><label class="qol-npc-mode"><input class="qol-npc-great" type="checkbox"><span>Normal</span></label></td><td class="num qol-npc-max">0</td><td class="center"><input class="qol-npc-count" type="number" min="0" value="0" inputmode="numeric"></td><td class="num qol-npc-cost">0</td><td class="center"><span class="qol-npc-delete" role="button" tabindex="0" title="Delete entry">×</span></td>`;
        const select = row.querySelector('.qol-npc-unit-select');
        if (units.some(unit => unit.name === preferredUnit)) select.value = preferredUnit;
        const great = row.querySelector('.qol-npc-great');
        const modeLabel = row.querySelector('.qol-npc-mode span');
        const count = row.querySelector('.qol-npc-count');
        const syncMode = () => {
            const siege = SIEGE_UNITS.has(select.value);
            great.disabled = siege;
            if (siege) great.checked = false;
            modeLabel.textContent = siege ? 'Siege' : (great.checked ? 'GS/GB' : 'Normal');
        };
        select.addEventListener('change', () => { syncMode(); updateCalculations(); });
        great.addEventListener('change', () => { syncMode(); updateCalculations(); });
        count.addEventListener('input', updateCalculations);
        count.addEventListener('focus', event => event.target.select());
        const remove = event => { event.preventDefault(); event.stopPropagation(); row.remove(); updateCalculations(); };
        row.querySelector('.qol-npc-delete').addEventListener('click', remove);
        row.querySelector('.qol-npc-delete').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') remove(event); });
        syncMode();
        return row;
    }

    function replaceRowsForTribe(tribeKey) {
        const body = panel?.querySelector('#qol-npc-plan-body');
        if (!body) return;
        const existing = [...body.querySelectorAll('.qol-npc-row')];
        if (!existing.length) body.appendChild(createRow(tribeKey));
        else existing.forEach(row => {
            const oldUnit = row.querySelector('.qol-npc-unit-select')?.value;
            const oldCount = row.querySelector('.qol-npc-count')?.value || '0';
            const replacement = createRow(tribeKey, oldUnit);
            replacement.querySelector('.qol-npc-count').value = oldCount;
            row.replaceWith(replacement);
        });
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
        updateCalculations();
        setStatus('Training plan cleared.');
    }

    function updateCalculations() {
        if (!panel) return;
        const resources = getVillageResources();
        const fealty = Math.min(20, Math.max(1, Number.parseInt(panel.querySelector('#qol-npc-fealty')?.value || '1', 10) || 1));
        const units = ALL_TRIBE_UNITS[selectedTribe]?.units || ALL_TRIBE_UNITS.romans.units;

        RESOURCE_KEYS.forEach(key => {
            panel.querySelector(`#qol-npc-stock-${key}`).textContent = formatNumber(resources[key].current);
            panel.querySelector(`#qol-npc-stock-${key}-capacity`).textContent = Number.isFinite(resources[key].capacity) ? `Cap ${formatNumber(resources[key].capacity)}` : 'Cap unknown';
        });
        panel.querySelector('#qol-npc-stock-total').textContent = formatNumber(resources.total);

        let availableTotal = resources.total;
        let totalCost = 0;
        let totalUnits = 0;
        const required = { wood:0, clay:0, iron:0, crop:0 };
        const rows = [...panel.querySelectorAll('.qol-npc-row')];

        rows.forEach(row => {
            const select = row.querySelector('.qol-npc-unit-select');
            const unit = units.find(item => item.name === select.value) || units[0];
            const greatInput = row.querySelector('.qol-npc-great');
            const costs = calculateUnitCosts(unit, fealty, Boolean(greatInput.checked && !greatInput.disabled));
            const maximum = getCapacityLimitedMaximum(costs, resources, availableTotal);
            row.querySelector('.qol-npc-max').textContent = formatNumber(maximum);
            row.querySelector('.qol-npc-max').title = 'Maximum that fits total resources and one storage batch';
            const input = row.querySelector('.qol-npc-count');
            input.max = String(maximum);
            let count = Math.max(0, Number.parseInt(input.value || '0', 10) || 0);
            if (count > maximum) { count = maximum; input.value = String(count); }
            const rowCost = costs.total * count;
            row.querySelector('.qol-npc-cost').textContent = formatNumber(rowCost);
            row.querySelector('.qol-npc-cost').title = RESOURCE_KEYS.map(key => `${formatNumber(costs[key] * count)} ${RESOURCE_META[key].label}`).join(' · ');
            totalCost += rowCost;
            totalUnits += count;
            availableTotal = Math.max(0, availableTotal - rowCost);
            RESOURCE_KEYS.forEach(key => { required[key] += costs[key] * count; });
        });

        const recommended = {};
        const overflow = {};
        RESOURCE_KEYS.forEach(key => {
            const cap = resources[key].capacity;
            recommended[key] = Number.isFinite(cap) ? Math.min(required[key], cap) : required[key];
            overflow[key] = Math.max(0, required[key] - recommended[key]);
            const card = panel.querySelector(`.qol-npc-summary.npc [data-resource="${key}"]`);
            card?.classList.toggle('capped', overflow[key] > 0);
            panel.querySelector(`#qol-npc-dist-${key}`).textContent = formatNumber(recommended[key]);
            panel.querySelector(`#qol-npc-dist-${key}-required`).textContent = `Need ${formatNumber(required[key])}`;
            const overflowNode = panel.querySelector(`#qol-npc-dist-${key}-overflow`);
            overflowNode.textContent = overflow[key] ? `+${formatNumber(overflow[key])} overflow` : 'Fits storage';
            overflowNode.classList.toggle('overflow', overflow[key] > 0);
        });

        const recommendedTotal = RESOURCE_KEYS.reduce((sum, key) => sum + recommended[key], 0);
        const overflowTotal = RESOURCE_KEYS.reduce((sum, key) => sum + overflow[key], 0);
        const capacityPasses = Math.max(1, ...RESOURCE_KEYS.map(key => {
            const cap = resources[key].capacity;
            return required[key] > 0 && Number.isFinite(cap) && cap > 0 ? Math.ceil(required[key] / cap) : 1;
        }));
        const remaining = Math.max(0, resources.total - totalCost);
        panel.querySelector('#qol-npc-dist-total').textContent = formatNumber(recommendedTotal);
        panel.querySelector('#qol-npc-remaining').textContent = formatNumber(remaining);
        panel.querySelector('#qol-npc-units').textContent = formatNumber(totalUnits);
        panel.querySelector('#qol-npc-plan-cost').textContent = formatNumber(totalCost);
        panel.querySelector('#qol-npc-overflow').textContent = formatNumber(overflowTotal);
        const passNode = panel.querySelector('#qol-npc-passes');
        passNode.textContent = overflowTotal ? `${capacityPasses}+ passes` : '1 pass';
        passNode.className = `qol-npc-pill ${overflowTotal ? 'warn' : 'good'}`;

        if (!rows.length) setStatus('Add a training entry to begin planning.');
        else if (!totalUnits) setStatus(`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} ready. Enter troop counts.`);
        else if (overflowTotal) {
            const blocked = RESOURCE_KEYS.filter(key => overflow[key] > 0).map(key => RESOURCE_META[key].label).join(', ');
            setStatus(`Storage cap reached: ${blocked}. Split the plan across ${capacityPasses}+ passes.`, 'warning');
        } else setStatus(`${formatNumber(totalUnits)} troops · ${formatNumber(totalCost)} resources · fits one NPC pass.`, 'success');
    }

    function buildPanel() {
        const existing = document.getElementById(PANEL_ID);
        if (existing) { panel = existing; return; }
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.classList.remove('qol-open');
        panel.innerHTML = `
<div class="qol-npc-header"><div class="qol-npc-title"><span>NPC Calculator</span><small>Storage-aware</small></div><span class="qol-npc-close" title="Close">×</span></div>
<div class="qol-npc-body">
  <div class="qol-npc-controls">
    <div class="qol-npc-field"><span>Tribe</span><div class="qol-npc-tribe-options" role="group" aria-label="Tribe"><button type="button" class="qol-npc-tribe-option" data-tribe="romans">Roman</button><button type="button" class="qol-npc-tribe-option" data-tribe="teutons">Teuton</button><button type="button" class="qol-npc-tribe-option" data-tribe="gauls">Gaul</button></div></div>
    <label class="qol-npc-field">Fealty<input id="qol-npc-fealty" type="number" min="1" max="20" value="1"></label>
    <div class="qol-npc-btn secondary" id="qol-npc-refresh" role="button" tabindex="0">Refresh stock</div>
    <div class="qol-npc-helper">NPC targets are capped at the village's <strong>Warehouse/Granary capacity</strong>. Overflow means another NPC/training pass.</div>
  </div>
  <div class="qol-npc-summaries">
    <section class="qol-npc-summary stock"><div class="qol-npc-summary-head"><span>Village stock</span><span>Total <strong id="qol-npc-stock-total">0</strong></span></div><div class="qol-npc-resource-grid">${buildResourceCards('qol-npc-stock','stock')}</div><div class="qol-npc-summary-foot"><span>After planned training: <strong id="qol-npc-remaining">0</strong></span><span>Troops: <strong id="qol-npc-units">0</strong></span></div></section>
    <section class="qol-npc-summary npc"><div class="qol-npc-summary-head"><span>NPC now</span><span>Target <strong id="qol-npc-dist-total">0</strong></span></div><div class="qol-npc-resource-grid">${buildResourceCards('qol-npc-dist','npc')}</div><div class="qol-npc-summary-foot"><span>Plan cost: <strong id="qol-npc-plan-cost">0</strong> · Overflow: <strong id="qol-npc-overflow">0</strong></span><span id="qol-npc-passes" class="qol-npc-pill good">1 pass</span></div></section>
  </div>
  <section class="qol-npc-plan"><div class="qol-npc-plan-scroll"><table><thead><tr><th style="width:27%">Unit</th><th style="width:18%">Training mode</th><th class="num" style="width:16%">Max one batch</th><th class="center" style="width:14%">Plan</th><th class="num" style="width:17%">Cost</th><th style="width:8%"></th></tr></thead><tbody id="qol-npc-plan-body"></tbody></table></div><div class="qol-npc-footer"><div class="qol-npc-footer-actions"><div class="qol-npc-btn" id="qol-npc-add" role="button" tabindex="0">Add entry</div><div class="qol-npc-btn danger" id="qol-npc-clear" role="button" tabindex="0">Clear plan</div></div><div class="qol-npc-status" data-tone="neutral">Ready.</div></div></section>
</div>`;
        document.body.appendChild(panel);
        makeDraggable(panel, panel.querySelector('.qol-npc-header'));
        panel.querySelector('.qol-npc-close').addEventListener('click', closePanel);
        selectedTribe = detectUserTribe();
        panel.querySelectorAll('.qol-npc-tribe-option').forEach(button => button.addEventListener('click', event => {
            event.preventDefault(); event.stopPropagation(); setTribe(button.dataset.tribe, true);
        }));
        setTribe(selectedTribe, false);
        panel.querySelector('#qol-npc-fealty').addEventListener('input', event => {
            const value = Math.min(20, Math.max(1, Number.parseInt(event.target.value || '1', 10) || 1));
            event.target.value = String(value); updateCalculations();
        });
        const bind = (selector, fn) => {
            const node = panel.querySelector(selector); if (!node) return;
            node.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); fn(); });
            node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); fn(); } });
        };
        bind('#qol-npc-refresh', () => { updateCalculations(); setStatus('Village stock and storage capacities refreshed.', 'success'); });
        bind('#qol-npc-add', addEntry);
        bind('#qol-npc-clear', clearPlan);
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

    function closePanel() { panel?.classList.remove('qol-open'); }

    function buildToggleButton() {
        const existing = document.getElementById(TOGGLE_ID);
        if (existing) { toggleButton = existing; return; }
        toggleButton = document.createElement('div');
        toggleButton.id = TOGGLE_ID;
        toggleButton.title = 'NPC Calculator';
        toggleButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14v4M8 18h.01M12 18h.01"></path></svg>`;
        toggleButton.addEventListener('click', event => {
            event.preventDefault(); event.stopPropagation();
            if (panel?.classList.contains('qol-open')) closePanel(); else openPanel();
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
        panel?.remove(); toggleButton?.remove(); panel = null; toggleButton = null; window.qolRepositionAllButtons?.();
    }

    window.addEventListener('qol_close_others', event => { if (event.detail?.source !== 'npcCalculator') closePanel(); });
    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== FEATURE_KEY) return;
        if (event.detail.enabled) buildUI(); else destroyUI();
    });
    window.addEventListener('resize', () => {
        if (!panel?.classList.contains('qol-open')) return;
        const rect = panel.getBoundingClientRect();
        if (rect.right > window.innerWidth || rect.bottom > window.innerHeight) positionPanel();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && panel?.classList.contains('qol-open')) { event.preventDefault(); event.stopImmediatePropagation(); closePanel(); }
    }, true);

    const start = () => { if (isEnabled()) buildUI(); console.log('[NPC Calculator] Storage-aware calculator initialized.'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
})();