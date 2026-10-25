// Run with: node tests/apesLibrarySpeedsettlingX1.cjs
// The x1 guide must use the same exact building-level and manual checkpoint
// format as x3, both in the Library and when exported to My Roadmaps.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const road = read('js/features/roadmaps.js');
const official = read('js/modules/roadmaps/officialGuides.js');
const library = read('js/features/apesLibrary.js');
for (const script of [road, official, library]) assert.doesNotThrow(() => new Function(script));

const roadPart = road.slice(road.indexOf('  const instruction ='), road.indexOf('  let panel = null;'));
assert.ok(roadPart.startsWith('  const instruction ='), 'Builtin Roadmaps definitions located');
const builtins = new Function(roadPart + '\nreturn BUILTIN_ROADMAPS;')();

const officialPart = official.slice(official.indexOf('  const clean ='), official.indexOf('  function selectedId()'));
const game = { APES: { roadmaps: { getAllRoadmaps: () => ({ ...builtins }) } } };
const catalog = new Function('window', 'scheduleDecorate',
  "const OFFICIAL_IDS = new Set(['x1_speedsettle','x3_speedsettle','x1_support_500cp']);\n" +
  'let installed = false;\n' + officialPart + '\nreturn { applyCatalog };'
)(game, () => {});
assert.equal(catalog.applyCatalog(), true, 'Official Roadmaps install successfully');

const guide = builtins.x1_speedsettle;
const steps = guide.steps;
assert.equal(steps.length, 75, '36 authored guide items expanded into 75 roadmap steps');
assert.equal(new Set(steps.map(item => item.id)).size, 75, 'Step IDs must be stable and distinct');
assert.equal(steps.filter(item => item.type === 'building').length, 48, '48 individually detectable building levels');
assert.equal(steps.filter(item => item.type === 'instruction').length, 27, '27 manual and checkpoint steps');
assert.ok(steps.filter(item => item.type === 'building').every(item => item.exact === true),
  'Every building step is marked exact for level-based tracking');

const levels = name => steps.filter(item => item.type === 'building' && item.building === name)
  .map(item => item.level);
const sequence = n => Array.from({ length: n }, (_, i) => i + 1);
assert.deepEqual(levels('Warehouse'), sequence(7), 'Warehouse levels 1–7 in authored order');
assert.deepEqual(levels('Granary'), sequence(8), 'Granary levels 1–8 in authored order');
assert.deepEqual(levels('Residence'), sequence(5), 'Residence levels 1–5');
assert.deepEqual(levels('Main Building'), sequence(10), 'Main Building levels 1–10');
assert.deepEqual(levels('Barracks'), sequence(3), 'Barracks levels 1–3');
assert.deepEqual(levels('Academy'), sequence(10), 'Academy levels 1–10');
for (const [name, id] of [['Embassy',18],['Marketplace',17],['Town Hall',24],['Workshop',21]]) {
  const entries = steps.filter(item => item.type === 'building' && item.building === name);
  assert.equal(entries.length, 1, name + ' has exactly one level-1 step');
  assert.equal(entries[0].level, 1);
  assert.equal(entries[0].buildingId, id);
}
const cranny = steps.find(item => item.building === 'Cranny');
assert.equal(cranny.level, 1);
assert.equal(cranny.instance, 1);
assert.equal(cranny.buildingId, 23);

const byId = id => steps.findIndex(step => step.id === 'x1-speedsettle-' + id);
const before = (a,b) => {
  assert.ok(byId(a) !== -1 && byId(b) !== -1, a + ' / ' + b + ' missing');
  assert.ok(byId(a) < byId(b), a + ' must precede ' + b);
};
before('tutorial','queue-five-units');
before('first-hideouts','warehouse-lv1');
before('warehouse-lv3','granary-lv1');
before('embassy-lv1','oasis');
before('oasis','marketplace-lv1');
before('cranny-lv1','crop-lv1');
before('crop-lv3','optional-resource-fields');
before('optional-resource-fields','residence-lv1');
before('gold-bonuses','warehouse-lv4');
before('warehouse-lv5','granary-lv4');
before('granary-lv5','residence-lv2');
before('residence-lv5','free-quests');
before('card-games','residence-five-reward');
before('residence-five-reward','settler-one');
before('settler-three','warehouse-lv6');
before('warehouse-lv6','settler-reward');
before('settler-reward','main-building-lv1');
before('main-building-lv10','demolish-residence');
before('hideouts-five-six','warehouse-lv7');
before('warehouse-lv7','barracks-lv1');
before('academy-lv10','town-hall-lv1');
before('workshop-lv1','granary-lv6');
before('granary-lv8','remaining-chests');
before('remaining-chests','demolish-workshop-academy');
before('small-party','relocate');
before('relocate','send-settlers');

const textOf = id => steps[byId(id)].text;
assert.ok(textOf('optional-resource-fields').includes('Do not do this if you plan on demolishing'));
assert.ok(textOf('wait-hideouts-three-four').includes('2 hours'));
assert.ok(textOf('demolish-residence').includes('4h20min'));
assert.ok(textOf('hideouts-five-six').includes('4–5 hours'));
assert.ok(textOf('settler-hideout-help').includes('survives'));
assert.ok(textOf('small-party').includes('Small Party'));
assert.ok(textOf('send-settlers').includes('Settlers'));
assert.equal(guide.meta.speed, 'x1');
assert.equal(guide.meta.official, true);
assert.ok(game.APES.roadmapsOfficialGuides.ids.includes('x1_speedsettle'));
assert.equal(game.APES.roadmapsOfficialGuides.getDefinition('x1_speedsettle').steps.length, 75);
assert.ok(builtins.x3_speedsettle.steps.length > 35, 'x3 official guide retained');
assert.ok(builtins.x1_support_500cp.steps.length > 35, 'x1 Support guide retained');

// The Library renders the actual guide, rather than duplicate content.
const libraryPart = library.slice(library.indexOf('  const CATEGORIES ='), library.indexOf('  function notify('));
const api = new Function('window', libraryPart +
  '\nreturn { findGuide, guideData, renderArticle, setPanel: value => panel = value, select: id => selectedId = id };'
)(game);
const entry = api.findGuide('speed_x1');
assert.equal(entry.roadmapId, 'x1_speedsettle');
assert.equal(api.guideData(entry).steps.length, 75);
let html = '';
api.setPanel({querySelector(selector) {
  return selector === '.apes-lib-article' ? {
    set innerHTML(value) { html = value; },
    get innerHTML() { return html; }
  } : null;
}});
api.select('speed_x1');
api.renderArticle();
assert.equal((html.match(/class="apes-lib-step-type"/g) || []).length, 75);
assert.ok(html.includes('data-library-export'), 'The x1 guide is exportable to Roadmaps');
assert.ok(html.includes('Warehouse → Level 1') && html.includes('Warehouse → Level 7'));
assert.ok(html.includes('All Crop Fields → Level 3'));
assert.ok(!html.includes('Guide not published yet'));

// Exact-level detection must survive the Library -> My Roadmaps copy.
const normalizePart = road.slice(road.indexOf('  function normalizeStep('),
  road.indexOf('  function normalizeRoadmap('));
const normalizeStep = new Function('cleanText', normalizePart + '\nreturn normalizeStep;')(
  value => String(value ?? '').replace(/\s+/g,' ').trim()
);
const exportedBuilding = normalizeStep(steps.find(item => item.building === 'Cranny'));
assert.equal(exportedBuilding.type,'building');
assert.equal(exportedBuilding.exact,true);
assert.equal(exportedBuilding.buildingId,23);
assert.equal(exportedBuilding.instance,1);
assert.equal(exportedBuilding.level,1);

console.log('APES Library x1 Speedsettling: 75 ordered steps, 48 exact building levels, 27 manual entries, Library display and export verified.');
