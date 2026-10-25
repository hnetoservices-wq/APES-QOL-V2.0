// npm install --prefix tests, then node tests/npcCalculator.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../js/features/npcCalculator.js'), 'utf8');
const keys = ['wood', 'clay', 'iron', 'crop'];
const stock = { wood: 2533, clay: 20910, iron: 25520, crop: 18072 };
const pass = {
  target: { wood: 15000, clay: 20907, iron: 25517, crop: 5601 },
  required: { wood: 15000, clay: 10000, iron: 20000, crop: 0 }
};
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const failure = async (promise, regex) => { await assert.rejects(promise, regex); checks++; };

function setup(options = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://trickandtreat.kingdoms.com/#/page:village/villId:123', runScripts: 'outside-only'
  });
  const { window } = dom;
  const { document } = window;
  // Keep every meaningful selector/lock attribute from the supplied NPC HTML.
  document.body.innerHTML = `<img id="buildingImage20" class="location buildingId17">
    <div id="qol-calc-container" class="qol-open"><span id="qol-npc-market-fill" tabindex="0"></span>
    <div class="qol-npc-status"></div><div class="qol-npc-status-detail"></div></div>
    <div class="loadedTab tabNpcTrade currentTab"><div class="marketContent npcTrader contentBox" ng-controller="npcMerchantCtrl">
    <table class="resourcesTable"><tbody class="sliderTable">${keys.map((key, i) => `
      <tr ng-repeat="(resourceType, resName) in resNames"><td class="resCol" tooltip-translate="Resource_${i + 1}">
      <i class="unit_${key}_medium_illu"></i><span class="resourceAmount ${key}Amount">${stock[key]}</span></td>
      <td class="sliderCol"><slider class="resSlider" slider-lock="resourceData[resourceType]['locked']">
      <div class="sliderContainer"><div class="inputContainer"><input class="value" number="" ng-model="value" type="tel"></div></div></slider>
      <div class="lockButtonContainer clickable open" ng-class="{open: !resourceData[resourceType]['locked'], disabled: !resourceData[resourceType]['locked'] &amp;&amp; lockedResources &gt; availableResTypes - 3}" clickable="toggleResourceLock(${i + 1})"></div></td>
      <td class="diffCol"><span>0</span></td></tr>`).join('')}</tbody></table>
      <div class="merchantBtn"><button class="disabled" premium-feature="NPCTrader">Convert</button></div>
    </div></div>`;
  window.isQolEnabled = () => options.enabled !== false;
  vm.runInContext(source.replace('  const start = () => {', `
    window.testNpc = { fillNpcTrader, openNpcMarketAndFill, showNpcFillLock,
      assertNpcFillActive, npcTargetForCurrentStock, destroyUI, findNpcTraderInputs,
      configure(pass, resources) {
        panel = document.getElementById(PANEL_ID);
        latestCalculation = { execution: { passes: [pass] }, resources };
      }, active() { return npcFillOperation; } };
    return;
    const start = () => {`), dom.getInternalVMContext());
  const api = window.testNpc;
  const guards = new Map();
  const addListener = window.addEventListener.bind(window);
  const removeListener = window.removeEventListener.bind(window);
  window.addEventListener = (type, listener, options) => {
    // jsdom also installs focus/selector helpers; track only the fill guard.
    if (options?.capture && listener.name === 'guard') guards.set(type, listener);
    addListener(type, listener, options);
  };
  window.removeEventListener = (type, listener, options) => {
    if (guards.get(type) === listener) guards.delete(type);
    removeListener(type, listener, options);
  };
  const root = document.querySelector('.npcTrader');
  const rows = Object.fromEntries(keys.map(key => [key, root.querySelector(`.unit_${key}_medium_illu`).closest('tr')]));
  const values = { ...stock };
  const locked = new Set(options.locked || []);
  const log = [];
  const timers = [];
  const resources = Object.fromEntries(keys.map(key => [key, { current: stock[key], capacity: 55000 }]));
  const convert = root.querySelector('[premium-feature="NPCTrader"]');
  let conversions = 0;
  let enabledConversion = false;
  convert.addEventListener('click', () => { conversions++; });
  const redraw = () => {
    for (const key of keys) {
      const row = rows[key];
      row.querySelector('input').value = String(values[key]);
      row.querySelector('.diffCol span').textContent = String(values[key] - stock[key]);
      row.querySelector('.lockButtonContainer').classList.toggle('open', !locked.has(key));
      row.querySelector('.lockButtonContainer').classList.toggle('disabled', !locked.has(key) && locked.size > 1);
      row.querySelector('.sliderContainer').classList.toggle('locked', locked.has(key));
    }
    const valid = keys.reduce((sum, key) => sum + values[key], 0) === 67035;
    const different = keys.some(key => values[key] !== stock[key]);
    enabledConversion = valid && different && !options.convertUnavailable;
    convert.classList.toggle('disabled', !enabledConversion);
  };
  const schedule = callback => timers.push(window.setTimeout(callback, options.lag ?? 15));
  for (const key of keys) {
    rows[key].querySelector('input').addEventListener(options.commitOn || 'blur', event => {
      if (options.ignoreInput === key) return;
      const amount = Number(event.target.value);
      log.push(`fill:${key}:${amount}`);
      schedule(() => {
        values[key] = amount;
        // The game's sliders can redistribute unlocked values after an edit.
        if (options.rebalance) {
          const delta = 67035 - keys.reduce((sum, name) => sum + values[name], 0);
          const other = [...keys].reverse().find(name => name !== key && !locked.has(name));
          if (other) values[other] += delta;
        }
        redraw();
        options.afterCommit?.(key, window, api);
      });
    });
    rows[key].querySelector('.lockButtonContainer').addEventListener('click', event => {
      const control = event.currentTarget;
      if (control.classList.contains('disabled')) {
        log.push(`disabled-lock:${key}`);
        return;
      }
      log.push(`${locked.has(key) ? 'unlock' : 'lock'}:${key}`);
      if (options.ignoreLock === key) return;
      schedule(() => {
        if (locked.has(key)) locked.delete(key); else locked.add(key);
        redraw();
      });
    });
  }
  redraw();
  api.configure(pass, resources);
  return { window, document, api, root, rows, values, locked, log, resources, guards,
    operation: { villageId: '123', resources, cancelled: false },
    conversions: () => conversions, ready: () => enabledConversion,
    close() { timers.forEach(t => window.clearTimeout(t)); dom.window.close(); } };
}

(async () => {
  for (const commitOn of ['input', 'keyup', 'blur']) {
    const env = setup({ commitOn, rebalance: true });
    try {
      const result = await env.api.fillNpcTrader(pass, env.operation);
      equal(JSON.parse(JSON.stringify(result.target)), { ...pass.target, crop: 5611 });
      equal(result.adjustment, 10);
      equal(env.log, ['fill:wood:15000', 'lock:wood', 'fill:clay:20907', 'lock:clay', 'fill:iron:25517', 'fill:crop:5611']);
      equal([...env.locked], ['wood', 'clay']);
      equal(env.ready(), true);
      equal(env.conversions(), 0);
      equal(JSON.parse(JSON.stringify(pass.target)), { wood: 15000, clay: 20907, iron: 25517, crop: 5601 });
    } finally { env.close(); }
  }
  const previous = setup({ locked: ['iron', 'crop'], lag: 75 });
  try {
    await previous.api.fillNpcTrader(pass, previous.operation);
    equal(previous.log.slice(0, 2), ['unlock:iron', 'unlock:crop']);
    equal([...previous.locked], ['wood', 'clay']);
    equal(previous.ready(), true);
  } finally { previous.close(); }
  const unchanged = setup();
  try {
    const result = await unchanged.api.fillNpcTrader({ ...pass, target: stock }, unchanged.operation);
    equal(result.noConversionNeeded, true);
    equal(unchanged.log.length, 0);
    equal(unchanged.conversions(), 0);
  } finally { unchanged.close(); }
  const exact = setup();
  try {
    const result = await exact.api.fillNpcTrader({ ...pass, target: { ...pass.target, crop: 5611 } }, exact.operation);
    equal(result.adjustment, 0);
    equal(result.target.crop, 5611);
    equal(exact.ready(), true);
  } finally { exact.close(); }

  for (const options of [{ ignoreInput: 'wood' }, { ignoreLock: 'wood' }, { convertUnavailable: true }]) {
    const env = setup(options);
    try {
      await failure(env.api.fillNpcTrader(pass, env.operation), /did not register|did not lock|not ready to convert/);
      equal(env.conversions(), 0);
    } finally { env.close(); }
  }
  const badTotal = setup();
  try {
    badTotal.resources.crop.capacity = 5605;
    await failure(badTotal.api.fillNpcTrader(pass, badTotal.operation), /balance changed/);
    equal(badTotal.log.length, 0);
    const tooLittle = { ...pass, target: { ...pass.target, crop: 20000 }, required: { ...pass.required, crop: 6000 } };
    badTotal.resources.crop.capacity = 55000;
    await failure(badTotal.api.fillNpcTrader(tooLittle, badTotal.operation), /balance changed/);
  } finally { badTotal.close(); }

  for (const interrupt of ['cancel', 'village', 'window']) {
    const env = setup({ afterCommit(key, window, api) {
      if (key !== 'wood') return;
      if (interrupt === 'cancel') api.active().cancelled = true;
      if (interrupt === 'village') window.location.hash = '#/page:village/villId:999';
      if (interrupt === 'window') window.document.querySelector('.npcTrader').remove();
    } });
    try {
      await env.api.openNpcMarketAndFill();
      equal(env.document.querySelector('#qol-npc-fill-lock'), null);
      equal(env.api.active(), null);
      equal(env.log.some(entry => entry.startsWith('fill:clay')), false);
      equal(env.document.querySelector('.qol-npc-status').dataset.tone, 'warning');
    } finally { env.close(); }
  }

  const screen = setup({ lag: 35 });
  try {
    const button = screen.document.querySelector('#qol-npc-market-fill');
    button.focus();
    const work = screen.api.openNpcMarketAndFill();
    equal(Boolean(screen.document.querySelector('#qol-npc-fill-lock')), true);
    equal(button.classList.contains('disabled'), true);
    await screen.api.openNpcMarketAndFill(); // Repeated activation must not start another fill.
    await work;
    equal(screen.document.querySelector('#qol-npc-fill-lock'), null);
    equal(button.classList.contains('disabled'), false);
    equal(screen.document.activeElement === button, true);
    equal(screen.document.querySelector('.qol-npc-status').dataset.tone, 'success');
    equal(screen.document.querySelector('.qol-npc-status-detail').textContent.includes('+10'), true);
    equal(screen.log.filter(entry => entry.startsWith('fill:wood')).length, 1);
    equal(screen.conversions(), 0);
    equal([...screen.guards.keys()], []);
  } finally { screen.close(); }

  const cancelled = setup({ ignoreInput: 'wood' });
  try {
    const work = cancelled.api.openNpcMarketAndFill();
    cancelled.document.querySelector('.qol-npc-fill-cancel').click();
    await work;
    equal(cancelled.document.querySelector('#qol-npc-fill-lock'), null);
    equal(cancelled.document.querySelector('.qol-npc-status').textContent, 'NPC fill cancelled.');
  } finally { cancelled.close(); }

  const escape = setup({ ignoreInput: 'wood' });
  try {
    const work = escape.api.openNpcMarketAndFill();
    let prevented = false;
    let stopped = false;
    const event = { isTrusted: true, type: 'click', target: escape.root,
      preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } };
    escape.guards.get('click')(event);
    equal(prevented && stopped, true);
    prevented = stopped = false;
    escape.guards.get('click')({ ...event, isTrusted: false });
    equal(prevented || stopped, false);
    escape.guards.get('keydown')({ ...event, type: 'keydown', key: 'Escape' });
    await work;
    equal(escape.document.querySelector('.qol-npc-status').textContent, 'NPC fill cancelled.');
    equal(escape.guards.size, 0);
  } finally { escape.close(); }

  const disabled = setup({ ignoreInput: 'wood' });
  try {
    const work = disabled.api.openNpcMarketAndFill();
    await delay(5);
    disabled.api.destroyUI();
    equal(disabled.document.querySelector('#qol-npc-fill-lock'), null);
    await work;
    equal(disabled.api.active(), null);
  } finally { disabled.close(); }
  console.log(`NPC Calculator: ${checks} checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
