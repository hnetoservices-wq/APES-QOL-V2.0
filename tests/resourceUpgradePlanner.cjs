// Run with: node tests/resourceUpgradePlanner.cjs
// Fixtures exercise the extension's actual scanner, calculator and import paths.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(plain(actual), expected); checks++; };
function element() {
  return { dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, remove() {}, querySelector: () => null, querySelectorAll: () => [] };
}
function wrapper(type, values, slot = 20, shadow = false) {
  const status = { className: `buildingStatusButton type_${type} location_${slot}` };
  const badge = values === null ? null : { childNodes: values.map(value => ({ nodeType: 3, nodeValue: String(value) })) };
  return { className: `buildingLocation${slot}`, querySelector(selector) {
    if (selector === '.buildingLevel') return badge;
    if (shadow && selector.includes('buildingId') && selector.includes(',')) return { className: 'buildingId0' };
    if (selector.includes('buildingStatusButton') || selector.includes('buildingId')) return status;
    return null;
  }};
}
const root = items => ({ querySelectorAll: () => items });
function fields(level, queued = null) {
  const items = [];
  let slot = 1;
  for (const [type, count] of [[1,4], [2,4], [3,4], [4,6]]) {
    for (let i = 0; i < count; i++) items.push(wrapper(type, level === null ? null : queued === null ? [level] : [level, queued], slot++));
  }
  return root(items);
}
function input(level = 10) {
  return { steps: 100, fields: { wood: Array(4).fill(level), clay: Array(4).fill(level), iron: Array(4).fill(level), crop: Array(6).fill(level) }, buildings: {} };
}
function environment() {
  const writes = new Map();
  const listeners = new Map();
  const error = element();
  let now = 0;
  const document = { readyState: 'loading', addEventListener() {}, getElementById: () => null,
    querySelectorAll: () => [], createElement: element, body: { appendChild() {} }, head: { appendChild() {} },
    querySelector(selector) {
      if (selector === '#villageViewRes') return document.resources;
      if (selector.startsWith('.mainContentBackground.villageBackground')) return document.village;
      if (selector.includes('[data-error]')) return error;
      return null;
    }
  };
  const window = { location: { hostname: 'trickandtreat.kingdoms.com', hash: '#/page:village/villId:123' },
    APES: { context: { getVillageName: () => 'Fixture village', getVillageId: () => '123' } },
    addEventListener(name, callback) { listeners.set(name, callback); },
    dispatchEvent() {}, setTimeout(callback, ms) { now += ms; callback(); } };
  const context = { window, document, location: window.location, console, performance: { now: () => now },
    localStorage: { getItem: key => writes.get(key) || null, setItem: (key, value) => writes.set(key, value) },
    setTimeout() {}, CustomEvent: class {}, URL };
  const source = read('js/features/resourceUpgradePlanner.js').replace('const begin = () => {',
    'window.__checks = {readVillageBuildings, readResourceFields, normalizeState, generateCandidates, computeProduction, detectWorldSpeed}; const begin = () => {');
  vm.runInNewContext(source, context);
  return { ...context, writes, listeners, error, api: window.APES_RESOURCE_UPGRADE_PLANNER, private: window.__checks };
}

async function scannerChecks() {
  const env = environment();
  const { document, api } = env;
  const scan = env.private.readVillageBuildings;
  document.village = root([]); equal(scan(), null);
  document.village = root([wrapper(8, null)]); equal(scan(), null);
  document.village = root([wrapper(8, ['2', '3'])]); equal(scan().buildings.mill, 2);
  document.village = root([wrapper(8, ['2']), wrapper(8, ['0'])]); equal(scan().buildings.mill, 2);
  document.village = root([wrapper(8, ['2'], 20, true)]); equal(scan().buildings.mill, 2);
  document.village = root([wrapper(15, ['1'])]); equal(scan().buildings.mill, 0);
  document.village = root([wrapper(0, null)]); equal(scan().buildings.mill, 0);
  document.resources = fields(9, 10);
  equal(env.private.readResourceFields().ready, true);
  equal(env.private.readResourceFields().fields.crop[0], 9);
  document.resources = fields(null); equal(env.private.readResourceFields().ready, false);

  // A failed resources page must not partially replace the previous village state.
  const previous = input(7); previous.buildings.mill = 1;
  await api.setState(previous);
  const before = plain(api.getState());
  document.village = root([wrapper(8, ['2', '3'])]);
  await api.scan();
  equal(api.getState(), before);
  equal(env.error.textContent, 'APES could not read all 18 resource fields.');
  document.resources = fields(9, 10);
  await api.scan();
  equal(api.getState().buildings.mill, 2);
  equal(api.getState().fields.crop, Array(6).fill(9));
  const complete = plain(api.getState());
  document.village = root([wrapper(8, ['4'])]);
  const switched = fields(10);
  document.resources = { querySelectorAll() {
    env.window.location.hash = '#/page:resources/villId:999';
    return switched.querySelectorAll();
  }};
  await api.scan();
  equal(api.getState(), complete);
  equal(env.error.textContent, 'Village changed during the scan.');
}

async function routeChecks() {
  const env = environment();
  const { api } = env;
  const thresholds = { sawmill: ['wood',10], brickyard: ['clay',10], foundry: ['iron',10], mill: ['crop',5], bakery: ['crop',10] };
  const candidates = raw => env.private.generateCandidates(env.private.normalizeState(raw));
  for (const [key, [resource, threshold]] of Object.entries(thresholds)) {
    const raw = input(0);
    if (key === 'bakery') raw.buildings.mill = 5;
    raw.fields[resource][0] = threshold - 1;
    equal(candidates(raw).some(row => row.building === key), false);
    raw.fields[resource][0] = threshold;
    equal(candidates(raw).some(row => row.building === key), true);
    raw.fields[resource].fill(0);
    raw.fields[resource === 'wood' ? 'iron' : 'wood'][0] = 10;
    equal(candidates(raw).some(row => row.building === key), false);
  }
  for (let mill = 0; mill <= 5; mill++) {
    const raw = input(); raw.buildings.mill = mill;
    equal(candidates(raw).some(row => row.building === 'bakery'), mill === 5);
  }
  for (const level of [0, 4, 9, 10]) {
    await api.setState(input(level));
    const plan = api.calculate();
    equal(api.validatePlan(plan), true);
    const current = plain(plan.startState);
    for (const row of plan.results) {
      if (row.kind === 'building') {
        const [resource, threshold] = thresholds[row.building];
        equal(Math.max(...current.fields[resource]) >= threshold, true);
        if (row.building === 'bakery') equal(current.buildings.mill, 5);
        equal(row.fromLevel, current.buildings[row.building]);
        current.buildings[row.building] = row.toLevel;
      } else {
        equal(row.fromLevel, current.fields[row.resource][row.index]);
        current.fields[row.resource][row.index] = row.toLevel;
      }
      equal(row.fieldsAfter, current.fields);
      equal(row.buildingsAfter, current.buildings);
    }
  }
  const raw = input(); raw.buildings.mill = 2;
  await api.setState(raw);
  const plan = api.calculate();
  equal(plan.results.filter(row => row.building === 'mill').map(row => row.toLevel), [3,4,5]);
  const startState = plain(plan.startState);
  const rejects = rows => { assert.throws(() => api.validatePlan({ startState, results: rows })); checks++; };
  rejects([{ kind: 'building', building: 'bakery', fromLevel: 0, toLevel: 1 }]);
  rejects([{ kind: 'building', building: 'mill', fromLevel: 0, toLevel: 1 }]);
  rejects([{ kind: 'building', building: 'mill', fromLevel: 2, toLevel: 4 }]);
  rejects([{ kind: 'field', resource: 'crop', index: 0, fromLevel: 10, toLevel: 11 }]);
  rejects([{ kind: 'field', resource: 'crop', index: 99, fromLevel: 10, toLevel: 11 }]);
  rejects([{ kind: 'unknown' }]);
  const atMax = input(); atMax.buildings.mill = 5;
  assert.throws(() => api.validatePlan({ startState: atMax, results: [{ kind: 'building', building: 'mill', fromLevel: 5, toLevel: 6 }] })); checks++;
}


async function worldSpeedChecks() {
  // The world speed is surfaced by the MAIN-world bridge, not inferred from
  // the hostname 'trickandtreat' (which would incorrectly default to x1).
  const env = environment();
  const raw = input(6);
  raw.buildings.mill = 1; // Crop 6 -> 7: 20 base * 1.05 mill bonus = +21/h at x1.
  await env.api.setState(raw);
  equal(env.api.getState().speed, 1);
  const beforeX1 = env.private.computeProduction(env.api.getState());
  const improvedX1 = env.api.getState();
  improvedX1.fields.crop[0] = 7;
  const gainX1 = env.private.computeProduction(improvedX1)[3] - beforeX1[3];
  equal(gainX1, 21);

  // A loaded game may publish TG_SPEED=5 after the initial panel opens.
  env.document.documentElement = {
    getAttribute: key => key === 'data-apes-world-speed' ? '5' : null
  };
  equal(env.private.detectWorldSpeed().speed, 5);
  env.listeners.get('apes_qol_world_speed_detected')();
  equal(env.api.getState().speed, 5);
  const beforeX5 = env.private.computeProduction(env.api.getState());
  const improvedX5 = env.api.getState();
  improvedX5.fields.crop[0] = 7;
  const gainX5 = env.private.computeProduction(improvedX5)[3] - beforeX5[3];
  equal(gainX5, 105);
  assert.ok(Math.abs(5420 / gainX1 / 5 - 5420 / gainX5) < 1e-9); checks++;
  const x5Plan = env.api.calculate();
  equal(x5Plan.startState.speed, 5);
  const orderAtX5 = x5Plan.results.map(row => [row.kind, row.resource || row.building, row.index, row.toLevel]);
  env.document.documentElement = { getAttribute: () => null };
  await env.api.setState({ ...raw, speed: 1 });
  const x1Plan = env.api.calculate();
  const orderAtX1 = x1Plan.results.map(row => [row.kind, row.resource || row.building, row.index, row.toLevel]);
  equal(orderAtX5, orderAtX1); // Ranking logic is unchanged by speed.

  // MAIN-world script publishes the game's authoritative TG_SPEED value
  // without requiring permissions or a network request.
  const attrs = {};
  let emitted = 0;
  const game = { Travian: { Config: { TG_SPEED: 5 } },
    dispatchEvent: () => { emitted++; },
    setInterval() { throw Error('Already loaded game config should not poll'); }
  };
  const document = { documentElement: {
    getAttribute: key => attrs[key] ?? null,
    setAttribute: (key, value) => { attrs[key] = value; }
  }};
  vm.runInNewContext(read('js/modules/resourceUpgradePlanner/worldSpeedBridge.js'), {
    window: game, document, CustomEvent: class { constructor(type) { this.type = type; } }
  });
  equal(attrs['data-apes-world-speed'], '5');
  equal(emitted, 1);
}

async function importChecks() {
  for (const [file, marker, method] of [
    ['js/modules/roadmaps/resourcePlannerImports.js', "if (document.readyState === 'loading')", 'importCountBasedRoadmap'],
    ['js/modules/resourceUpgradePlanner/integration.js', 'registerRadialAction();', 'importCurrentPlan']
  ]) {
    const env = environment();
    const raw = input(); raw.buildings.mill = 2;
    await env.api.setState(raw);
    const plan = plain(env.api.calculate());
    let selectedPlan = { startState: plan.startState, results: [{ kind: 'building', building: 'bakery', fromLevel: 0, toLevel: 1 }] };
    env.window.APES_RESOURCE_UPGRADE_PLANNER = { calculate: () => selectedPlan, validatePlan: env.api.validatePlan,
      // Deliberately differs from the calculated starting state; field counts
      // must use plan.startState, rather than this subsequent UI snapshot.
      getState: () => input(0) };
    vm.runInNewContext(read(file).replace(marker, `window.__import = ${method}; ${marker}`), env);
    await env.window.__import();
    equal(env.writes.has('qol_roadmap_profiles_v1'), false);
    selectedPlan = plan;
    await env.window.__import();
    const profiles = JSON.parse(env.writes.get('qol_roadmap_profiles_v1'));
    const imported = Object.values(profiles)[0].steps.slice(1);
    equal(imported.filter(row => row.buildingId === 8).map(row => row.level), [3,4,5]);
    const mill5 = imported.findIndex(row => row.buildingId === 8 && row.level === 5);
    const bakery1 = imported.findIndex(row => row.buildingId === 9 && row.level === 1);
    equal(bakery1 > mill5, true);
    if (method === 'importCountBasedRoadmap') {
      const mixed = input(); mixed.fields.crop[0] = 9;
      await env.api.setState(mixed);
      selectedPlan = plain(env.api.calculate());
      await env.window.__import();
      const updated = Object.values(JSON.parse(env.writes.get('qol_roadmap_profiles_v1'))).at(-1);
      const fieldRow = selectedPlan.results.find(row => row.kind === 'field');
      const resourceNames = { wood: 'Wood', clay: 'Clay', iron: 'Iron', crop: 'Crop' };
      const expectedCount = fieldRow.fieldsAfter[fieldRow.resource].filter(level => level >= fieldRow.toLevel).length;
      equal(updated.steps.find(row => row.type === 'instruction' && row.text.includes('Fields:')).text,
        `${resourceNames[fieldRow.resource]} Fields: ${expectedCount}/${fieldRow.fieldsAfter[fieldRow.resource].length} → Level ${fieldRow.toLevel}`);
    }
  }
}

(async () => {
  await scannerChecks();
  await routeChecks();
  await worldSpeedChecks();
  await importChecks();
  console.log(`Passed ${checks} scanner, prerequisite, sequential-upgrade and roadmap-import checks.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
