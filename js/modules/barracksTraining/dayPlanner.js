/* APES QoL — Barracks & Stable 24-hour training cost summary.
 * Read-only: uses Travian's displayed per-unit duration and unit costs.
 * Does not train, queue, purchase, or transmit anything.
 */
(() => {
  'use strict';
  const FLAG = '__APES_QOL_BARRACKS_DAY_PLANNER__';
  const STORAGE_KEY = 'qol_barracks24hPlanner';
  const BUILDING_SELECTOR = '.building.buildingType19 .buildingDetails.trainTroops .contentBox.unitList, ' +
    '.building.buildingType20 .buildingDetails.trainTroops .contentBox.unitList';
  const ORIGINAL_CLASS = 'qol-training24-original';
  const PLAN_CLASS = 'qol-training24-plan';
  if (window[FLAG]) return;
  window[FLAG] = true;

  function enabled() {
    try { return window.localStorage?.getItem(STORAGE_KEY) !== 'false'; }
    catch (_) { return true; }
  }

  function displayedSeconds(text) {
    const match = String(text || '').match(/(\d{1,3}):([0-5]\d):([0-5]\d)/);
    if (!match) return null;
    const duration = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    return duration > 0 ? duration : null;
  }

  function durationFor(footer) {
    // Trust the game's visible effective training duration, not troopConfig.time:
    // building level, server speed and bonuses alter the actual training time.
    const display = footer.querySelector('.timeValue');
    const shown = displayedSeconds(display?.textContent);
    if (shown !== null) return shown;
    const modelTime = Number(footer.getAttribute('time'));
    return Number.isFinite(modelTime) && modelTime > 0 ? modelTime : null;
  }

  function resourceNumber(value) {
    if (typeof value === 'number')
      return Number.isSafeInteger(value) && value >= 0 ? value : null;
    const cleaned = String(value || '').replace(/[^\d]/g, '');
    if (!cleaned) return null;
    const number = Number(cleaned);
    return Number.isSafeInteger(number) ? number : null;
  }

  function unitCosts(info, footer) {
    const unitId = info.querySelector('.unitHeader .unitIcon[data]')?.getAttribute('data');
    if (!unitId || !/^\d+$/.test(unitId)) return null;
    const gameUnit = window.Travian?.Config?.troopConfig?.[unitId];
    const readDom = (cls) => resourceNumber(
      footer.querySelector('.' + cls + ' .resourceValue')?.textContent
    );
    const cost = (key, cls) => {
      // The rendered game cost wins over the static troop configuration:
      // live worlds can apply revised or special costs.
      const visible = readDom(cls);
      return visible === null
        ? resourceNumber(gameUnit?.costs?.[key])
        : visible;
    };
    const wood = cost('1', 'woodValue');
    const clay = cost('2', 'clayValue');
    const iron = cost('3', 'ironValue');
    if ([wood, clay, iron].some(value => value === null)) return null;
    return { unitId, wood, clay, iron };
  }

  // Travian's costs footer displays the cost and duration for the entire
  // quantity entered in the training form, not always a single troop.
  function selectedQuantity(info, footer) {
    const parse = value => {
      const text = String(value ?? '').trim();
      if (!/^\d+$/.test(text)) return null;
      const count = Number(text);
      return Number.isSafeInteger(count) && count > 0 ? count : null;
    };
    for (const attr of ['amount', 'quantity', 'count', 'units']) {
      const count = parse(footer.getAttribute(attr));
      if (count !== null) return count;
    }
    // Only look in the selected unit's details, not other troop cards.
    const seen = new Set(), inputs = [];
    for (const scope of [info, footer.parentElement].filter(Boolean)) {
      for (const input of scope.querySelectorAll?.('input') || []) {
        if (seen.has(input) || input.disabled || input.type === 'hidden') continue;
        seen.add(input);
        const count = parse(input.value);
        if (count === null) continue;
        const hint = [
          input.name, input.id, input.getAttribute?.('ng-model'),
          input.getAttribute?.('data-ng-model'), input.getAttribute?.('aria-label')
        ].join(' ');
        inputs.push({ count, hint });
      }
    }
    const identified = inputs.filter(input => /amount|quantity|count|units|troops/i.test(input.hint));
    if (identified.length === 1) return identified[0].count;
    return inputs.length === 1 ? inputs[0].count : null;
  }

  function commonDivisor(a, b) {
    while (b) [a, b] = [b, a % b];
    return a;
  }

  function quantityFromUnitConfig(costs) {
    const config = window.Travian?.Config?.troopConfig?.[costs.unitId]?.costs;
    if (!config) return null;
    const entries = [['wood', '1'], ['clay', '2'], ['iron', '3']]
      .map(([key, id]) => ({ amount: costs[key], base: resourceNumber(config[id]) }))
      .filter(item => item.base > 0 && item.amount > 0);
    if (entries.length < 2) return null;
    const gcd = entries.reduce((value, item) => commonDivisor(value, item.amount), 0);
    if (gcd <= 0) return null;

    // The batch's resource costs share the quantity as a factor. Compare
    // eligible factors against static unit costs to identify the quantity,
    // allowing slight live-world cost variation without overwriting it.
    let best = null;
    const consider = count => {
      if (count < 1 || !entries.every(item => item.amount % count === 0)) return;
      const errors = entries.map(item => Math.abs(item.amount / count - item.base) / item.base);
      const worst = Math.max(...errors);
      const average = errors.reduce((sum, item) => sum + item, 0) / errors.length;
      if (worst > 0.2 || average > 0.12) return;
      if (!best || average < best.error) best = { count, error: average };
    };
    for (let divisor = 1; divisor * divisor <= gcd; divisor += 1) {
      if (gcd % divisor !== 0) continue;
      consider(divisor);
      if (divisor * divisor !== gcd) consider(gcd / divisor);
    }
    return best?.count || null;
  }

  function unitFigures(info, footer) {
    const batchSeconds = durationFor(footer);
    const batchCosts = unitCosts(info, footer);
    if (!batchSeconds || !batchCosts) return null;

    const fromInput = selectedQuantity(info, footer);
    const fromConfig = quantityFromUnitConfig(batchCosts);
    const count = fromConfig || fromInput || 1;
    const costs = { unitId: batchCosts.unitId };
    for (const resource of ['wood', 'clay', 'iron']) {
      if (batchCosts[resource] % count !== 0) return null;
      costs[resource] = batchCosts[resource] / count;
    }
    const seconds = batchSeconds / count;
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return { seconds, costs };
  }

  function format(number) { return number.toLocaleString('en-US'); }

  function element(tag, cls, content) {
    const node = document.createElement(tag);
    node.className = cls;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function resourceChip(type, number) {
    const chip = element('span', 'qol-training24-resource');
    chip.title = type.charAt(0).toUpperCase() + type.slice(1) + ' required for 24h';
    chip.appendChild(element('i', 'unit_' + type + '_small_illu resType' +
      ({ wood: 1, clay: 2, iron: 3 })[type]));
    chip.appendChild(element('strong', '', format(number)));
    return chip;
  }

  function makePlan(seconds, costs, buildingName) {
    const completed = Math.floor(86400 / seconds);
    const partial = 86400 % seconds !== 0;
    const plan = element('div', PLAN_CLASS);
    plan.setAttribute('role', 'note');
    plan.appendChild(element('div', 'qol-training24-heading', '24h ' + buildingName + ' run'));

    const output = element('div', 'qol-training24-units');
    output.appendChild(element('strong', '', format(completed)));
    output.appendChild(element('span', '', ' units / 24h'));
    const timing = element('span', 'qol-training24-time', ' · ' +
      String(Math.floor(Math.round(seconds) / 3600)).padStart(2, '0') + ':' +
      String(Math.floor(Math.round(seconds) / 60) % 60).padStart(2, '0') + ':' +
      String(Math.round(seconds) % 60).padStart(2, '0') + ' each');
    output.appendChild(timing);
    plan.appendChild(output);

    const resources = element('div', 'qol-training24-resources');
    resources.appendChild(resourceChip('wood', completed * costs.wood));
    resources.appendChild(resourceChip('clay', completed * costs.clay));
    resources.appendChild(resourceChip('iron', completed * costs.iron));
    plan.appendChild(resources);

    const totalResources = completed * (costs.wood + costs.clay + costs.iron);
    const total = element('div', 'qol-training24-total');
    total.appendChild(element('span', '', 'Total: ' + format(totalResources) + ' Resources'));
    total.appendChild(element('em', 'qol-training24-hourly',
      ' | ' + (totalResources / 24).toLocaleString('en-US', { maximumFractionDigits: 2 }) +
      ' Resources/hour'));
    plan.appendChild(total);
    if (partial) plan.appendChild(element('div', 'qol-training24-note',
      'Full units completed; queue one extra to cover the remaining time.'));
    return plan;
  }

  function restore(root) {
    root.querySelectorAll('.' + PLAN_CLASS).forEach(node => node.remove());
    root.querySelectorAll('.' + ORIGINAL_CLASS).forEach(node =>
      node.classList.remove(ORIGINAL_CLASS));
  }

  function tick() {
    const on = enabled();
    for (const root of document.querySelectorAll(BUILDING_SELECTOR)) {
      if (!on) { restore(root); continue; }
      const info = root.querySelector('table.unitInfo');
      const description = info?.querySelector('.description');
      const footer = root.querySelector('display-resources.costsFooter');
      if (!description || !footer) { restore(root); continue; }
      const figures = unitFigures(info, footer);
      if (!figures) { restore(root); continue; }
      const { seconds, costs } = figures;
      const buildingName = root.closest('.building.buildingType20') ? 'Stable' : 'Barracks';
      const key = [buildingName, costs.unitId, seconds, costs.wood, costs.clay, costs.iron].join('|');
      let plan = description.parentElement?.querySelector('.' + PLAN_CLASS);
      // Handle Angular replacing the selected unit's info panel without leaking
      // a previous plan or displaying the prior unit's resource requirements.
      if (!plan || plan.previousElementSibling !== description || plan.dataset.source !== key) {
        plan?.remove();
        plan = makePlan(seconds, costs, buildingName);
        plan.dataset.source = key;
        description.insertAdjacentElement('afterend', plan);
      }
      description.classList.add(ORIGINAL_CLASS);
    }
  }

  window.setInterval(tick, 700);
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', tick, { once: true });
  else tick();
})();