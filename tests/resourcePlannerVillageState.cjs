// Exercise the real planner, village cache and city detection together.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(plain(actual), expected); checks++; };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 250; i++) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error('Fixture did not settle.');
}
function locationHtml(type, level, slot) {
  return `<building-location class="buildingLocation${slot}"><span class="buildingStatusButton type_${type} location_${slot}"></span><span class="buildingLevel">${level}<b>${level + 1}</b></span></building-location>`;
}
function environment(saved = null, preference = true) {
  const dom = new JSDOM('<div id="game"></div>', {
    url: 'https://trickandtreat.kingdoms.com/#/page:village/villId:123',
    runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  const storage = new Map();
  const villages = new Map([
    ['123', { level: 7, mill: 2, city: true }],
    ['456', { level: 9, mill: 5, city: false }],
    ['789', { level: 0, mill: 0, city: false }]
  ]);
  if (saved) storage.set('villageScanStates', plain(saved));
  const scans = [];
  const actualTimeout = w.setTimeout.bind(w);
  w.setTimeout = (callback, ms, ...args) => actualTimeout(callback, ms / 7, ...args);
  const start = Date.now();
  w.performance.now = () => (Date.now() - start) * 7;
  const id = () => w.location.hash.match(/villId:(\d+)/)?.[1] || '';
  w.APES = {
    context: { getVillageId: id, getVillageName: () => `Village ${id()}` },
    storage: {
      get: async ({ key }, fallback) => plain(storage.get(key) ?? fallback),
      set: async ({ key }, value) => { storage.set(key, plain(value)); }
    }
  };
  function render() {
    const village = villages.get(id());
    const game = w.document.getElementById('game');
    game.innerHTML = '';
    if (!village || village.fail) return;
    if (w.location.hash.includes('page:resources')) {
      let slot = 1;
      game.innerHTML = `<div id="villageViewRes">${[[1,4], [2,4], [3,4], [4,6]].map(([type,count]) =>
        Array.from({ length: count }, () => locationHtml(type, village.level, slot++)).join('')).join('')}</div>`;
    } else if (w.location.hash.includes('tab:Oases')) {
      game.innerHTML = '<div class="contentBox oasisInRange"><table><tbody></tbody></table></div>';
    } else if (village.markup) {
      game.innerHTML = village.markup;
    } else {
      game.innerHTML = `<div ng-controller="villageViewCtrl" class="village viewBackground ${village.city ? 'village-water' : ''}"><div id="villageView">${locationHtml(8, village.mill, 20)}${locationHtml(15, 10, 27)}</div></div>`;
    }
  }
  w.addEventListener('hashchange', render);
  w.addEventListener('apes_resource_upgrade_scan_started', event => scans.push(event.detail.villageId));
  render();
  w.eval(read('js/features/resourceUpgradePlanner.js'));
  if (preference) w.eval(read('js/modules/resourceUpgradePlanner/preference.js'));
  w.eval(read('js/modules/resourceUpgradePlanner/cityDetection.js'));
  const api = w.APES_RESOURCE_UPGRADE_PLANNER;
  const panel = () => w.document.getElementById('qol-resource-upgrade-planner-overlay');
  return { dom, w, api, panel, storage, villages, scans, render };
}
async function lifecycleChecks() {
  const e = environment();
  try {
    assert.throws(() => e.api.calculate(), /Scan this village/); checks++;
    // Opening alone must scan and calculate from completed levels, not defaults.
    const opening = e.api.open();
    await until(() => e.api.isScanning());
    assert.throws(() => e.api.calculate(), /Wait for the village scan/); checks++;
    equal(e.api.hasVillageState(), false);
    equal(e.panel().querySelector('[data-results]').classList.contains('show'), false);
    // A second open while preparing shares the scan rather than starting another.
    await Promise.all([opening, e.api.open()]);
    equal(e.scans, ['123']);
    equal(e.api.getState().fields.wood, [7,7,7,7]);
    equal(e.api.getState().buildings.mill, 2);
    equal(e.api.getState().maxLevel, 12);
    equal(e.api.calculate().startState.fields.crop, Array(6).fill(7));
    equal(e.panel().querySelector('[data-results]').classList.contains('show'), true);
    await until(() => e.storage.get('villageScanStates')?.villages['id:123']);
    equal(e.storage.get('villageScanStates').villages['id:123'].state.buildings.mill, 2);
    equal((await e.w.APES_RESOURCE_UPGRADE_VILLAGE_STATES.get('123')).state.fields.wood, [7,7,7,7]);
    equal(await e.w.APES_RESOURCE_UPGRADE_VILLAGE_STATES.get('999'), null);
    e.api.close(); await e.api.open();
    equal(e.scans, ['123']); // Cached reopen must not navigate again.
    // Manual field edits retain the village binding and are cached.
    const field = e.panel().querySelector('[data-rup-field="wood"]');
    field.value = '8'; field.dispatchEvent(new e.w.Event('change', { bubbles: true }));
    await until(() => e.storage.get('villageScanStates').villages['id:123'].state.fields.wood[0] === 8);
    equal(e.api.calculate().startState.fields.wood, [8,8,8,8]);
    // Switching while open scans an uncached village; the old snapshot cannot export.
    e.w.location.hash = '#/page:village/villId:456';
    assert.throws(() => e.api.calculate(), /Scan this village/); checks++;
    await until(() => !e.api.isScanning() && e.api.hasVillageState() && e.api.getState().fields.wood[0] === 9);
    equal(e.scans, ['123','456']);
    equal(e.api.getState().buildings.mill, 5);
    equal(e.api.getState().maxLevel, 10);
    // Switching back restores the previous village, including edits.
    e.w.location.hash = '#/page:village/villId:123';
    await until(() => e.api.hasVillageState() && e.api.getState().fields.wood[0] === 8);
    equal(e.scans, ['123','456']);
    equal(e.api.getState().buildings.mill, 2);
    // Explicit rescan refreshes cache even though it bypasses automatic preparation.
    e.villages.get('123').level = 10;
    await e.api.scan();
    await until(() => e.storage.get('villageScanStates').villages['id:123'].state.fields.wood[0] === 10);
    equal(e.api.getState().fields.wood, [10,10,10,10]);
    // A failed first scan must not produce a level-zero plan or save a fake scan.
    e.villages.set('999', { fail: true });
    e.w.location.hash = '#/page:village/villId:999';
    await until(() => e.panel().querySelector('[data-scan-status]').dataset.tone === 'error');
    equal(e.api.hasVillageState(), false);
    equal(e.panel().querySelector('[data-results]').classList.contains('show'), false);
    equal(Boolean(e.storage.get('villageScanStates').villages['id:999']), false);
    assert.throws(() => e.api.calculate(), /Scan this village/); checks++;
    const failures = e.scans.length;
    await delay(750);
    equal(e.scans.length, failures); // No background retry loop.
    equal(e.panel().querySelector('[data-scan-status]').dataset.tone, 'error');
    // Calculate retries an unsuccessful first scan after the game starts loading.
    e.villages.set('999', { level: 6, mill: 1, city: false }); e.render();
    e.panel().querySelector('[data-action="calculate"]').click();
    await until(() => !e.api.isScanning() && e.api.hasVillageState());
    equal(e.api.calculate().startState.fields.wood, [6,6,6,6]);
    // A legitimately undeveloped village can still calculate after a complete scan.
    e.w.location.hash = '#/page:village/villId:789';
    await until(() => !e.api.isScanning() && e.api.hasVillageState() && e.api.getState().fields.wood[0] === 0);
    equal(e.api.calculate().startState.fields.wood, [0,0,0,0]);
  } finally { e.dom.window.close(); }
  return e.storage.get('villageScanStates');
}
async function cachedAndFallbackChecks(saved) {
  const cached = environment(saved);
  try {
    await delay(20); // Startup restoration precedes panel creation.
    await cached.api.open();
    equal(cached.scans, []);
    equal(cached.api.calculate().startState.fields.wood, [10,10,10,10]);
    equal(cached.panel().querySelector('[data-results]').classList.contains('show'), true);
  } finally { cached.dom.window.close(); }
  const standalone = environment(null, false);
  try {
    await standalone.api.open();
    equal(standalone.scans, ['123']);
    equal(standalone.api.calculate().startState.fields.wood, [7,7,7,7]);
  } finally { standalone.dom.window.close(); }
}
async function nativeVillageChecks() {
  const e = environment();
  try {
    e.villages.set('123', { level: 9, markup: read('tests/fixtures/resource-planner-village.html') });
    e.render();
    await e.api.open();
    equal(e.api.hasVillageState(), true);
    equal(e.api.getState().buildings, { sawmill: 4, brickyard: 3, foundry: 4, mill: 3, bakery: 0, embassy: 1 });
    equal(e.api.calculate().startState.fields.wood, [9,9,9,9]);
    equal(e.panel().querySelector('[data-scan-status]').dataset.tone, 'success');
    await until(() => e.storage.get('villageScanStates')?.villages['id:123']);
    equal(e.storage.get('villageScanStates').villages['id:123'].state.buildings.mill, 3);
    // Missing data on an occupied production building still represents an
    // incomplete render; accepting free plots must not accept this case.
    const markup = new e.w.DOMParser().parseFromString(e.villages.get('123').markup, 'text/html');
    markup.querySelector('.buildingLocation37 .buildingLevel').remove();
    e.villages.get('123').markup = markup.body.innerHTML;
    const previous = plain(e.api.getState());
    equal(await e.api.scan(), false);
    equal(e.api.getState(), previous);
    equal(e.panel().querySelector('[data-scan-status]').dataset.tone, 'error');
  } finally { e.dom.window.close(); }
}
(async () => {
  await nativeVillageChecks();
  const saved = await lifecycleChecks();
  await cachedAndFallbackChecks(saved);
  console.log(`Passed ${checks} planner village-scan, cache, failure and city-detection checks.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
