// Run with: node tests/apesLibrarySpeedsettlingX1.cjs
// The published 36-step x1 guide is shared by the Library and Roadmaps.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const road = read('js/features/roadmaps.js');
const official = read('js/modules/roadmaps/officialGuides.js');
const library = read('js/features/apesLibrary.js');

for (const script of [road, official, library]) assert.doesNotThrow(() => new Function(script));

const roadPart = road.slice(
  road.indexOf('  const instruction ='),
  road.indexOf('  let panel = null;')
);
assert.ok(roadPart.startsWith('  const instruction ='), 'Built-in Roadmaps definitions found');
const builtins = new Function(roadPart + '\nreturn BUILTIN_ROADMAPS;')();
assert.ok(builtins.x1_speedsettle, 'x1 speedsettling registered as an official built-in');

const officialPart = official.slice(
  official.indexOf('  const clean ='),
  official.indexOf('  function selectedId()')
);
const window = { APES: { roadmaps: { getAllRoadmaps: () => ({ ...builtins }) } } };
const catalog = new Function('window', 'scheduleDecorate',
  "const OFFICIAL_IDS = new Set(['x1_speedsettle','x3_speedsettle','x1_support_500cp']);\n" +
  'let installed = false;\n' + officialPart +
  '\nreturn { applyCatalog };'
)(window, () => {});
assert.equal(catalog.applyCatalog(), true, 'Official guides install successfully');

const guide = builtins.x1_speedsettle;
assert.equal(guide.steps.length, 36, 'x1 guide retains all 36 authored steps');
assert.equal(new Set(guide.steps.map(step => step.id)).size, 36, 'Every step has a stable unique ID');
assert.ok(guide.steps.every(step => step.type === 'instruction' && step.text.trim()),
  'Manual guide instructions remain exportable');
assert.equal(guide.meta.official, true);
assert.equal(guide.meta.speed, 'x1');
assert.ok(window.APES.roadmapsOfficialGuides.ids.includes('x1_speedsettle'));
assert.equal(window.APES.roadmapsOfficialGuides.getDefinition('x1_speedsettle').steps.length, 36);

const expected = {
  1: 'Finish tutorial',
  3: 'Switch to the second hideout',
  9: 'All crop fields to level 1',
  10: 'do not do this if you plan on demolishing',
  13: 'Warehouse and Granary to level 5',
  19: '2 hours after clearing',
  22: 'collect the Settler quest reward',
  24: '4h20min',
  25: '4–5 hours',
  33: 'Demolish Workshop and Academy',
  34: 'Small Party',
  36: 'Send Settlers'
};
for (const [number, snippet] of Object.entries(expected)) {
  assert.ok(guide.steps[Number(number) - 1].text.includes(snippet),
    'Guide step ' + number + ' changed unexpectedly');
}

assert.ok(builtins.x3_speedsettle.steps.length > 35, 'Existing x3 route preserved');
assert.ok(builtins.x1_support_500cp.steps.length > 35, 'Existing support route preserved');

const libraryPart = library.slice(
  library.indexOf('  const CATEGORIES ='),
  library.indexOf('  function notify(')
);
const api = new Function('window', libraryPart +
  '\nreturn { findGuide, guideData, renderArticle, setPanel: value => panel = value, select: id => selectedId = id };'
)(window);
const entry = api.findGuide('speed_x1');
assert.equal(entry.roadmapId, 'x1_speedsettle');
assert.equal(api.guideData(entry).steps.length, 36);

let html = '';
api.setPanel({ querySelector(selector) {
  return selector === '.apes-lib-article' ? {
    set innerHTML(value) { html = value; },
    get innerHTML() { return html; }
  } : null;
}});
api.select('speed_x1');
api.renderArticle();
assert.equal((html.match(/class="apes-lib-step-type"/g) || []).length, 36,
  'APES Library displays all 36 x1 steps');
assert.ok(html.includes('data-library-export'), 'Export to Roadmaps action is available');
assert.ok(!html.includes('Guide not published yet'), 'Published guide has no coming-soon placeholder');

console.log('APES Library x1 Speedsettling: 36 published steps, full Library view, export and legacy guides verified.');
