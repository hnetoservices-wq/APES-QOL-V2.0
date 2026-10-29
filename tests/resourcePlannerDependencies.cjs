'use strict';
// Regression: Bakery must not precede Grain Mill 5 in an imported resources roadmap.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const helper = read('js/modules/roadmaps/resourcePlannerDependencies.js');
const editor = read('js/modules/roadmaps/editor.js');
const manifest = JSON.parse(read('manifest.json'));
const isolated = manifest.content_scripts.find(item => item.world !== 'MAIN' && item.js.includes('js/modules/roadmaps/editor.js'));
assert.ok(isolated, 'Editor is registered');
assert.ok(isolated.js.indexOf('js/modules/roadmaps/resourcePlannerDependencies.js') <
  isolated.js.indexOf('js/modules/roadmaps/editor.js'), 'Dependency guard loads before editor');
assert.doesNotThrow(() => new Function('window', helper));
assert.doesNotThrow(() => new Function(editor));

let nextId = 0;
const win = { APES: { roadmapsStableIds: {
  newStepId: () => 'added_mill_' + ++nextId
} } };
new Function('window', helper)(win);
const deps = win.APES.resourcePlannerDependencies;
assert.equal(typeof deps.repair, 'function');

const mill = (level, id) => ({ id: id || 'mill' + level, type:'building', building:'Grain Mill', buildingId:8, level, exact:true });
const bakery = level => ({ id:'bakery' + level, type:'building', building:'Bakery', buildingId:9, level, exact:true });
const instruction = text => ({ id:'other', type:'instruction', text });
const names = road => road.steps.filter(x => x.type==='building').map(x => x.building + ' ' + x.level);

const caseWithLaterMill = {
  description: 'Imported from APES Resource Upgrade Planner for 01. APES.',
  steps:[instruction('Start'),mill(3),bakery(1),bakery(2),bakery(3),mill(4),mill(5),instruction('Done')]
};
const originalMill4 = caseWithLaterMill.steps[5],originalMill5 = caseWithLaterMill.steps[6];
assert.equal(deps.inspect('custom_resources_legacy',caseWithLaterMill).valid,false);
const fixedLater = deps.repair('custom_resources_legacy',caseWithLaterMill);
assert.equal(fixedLater.changed,true);
assert.equal(fixedLater.relocated,2);
assert.deepEqual(fixedLater.inserted,[]);
assert.equal(caseWithLaterMill.steps[2],originalMill4,'Existing Mill 4 moved, not recreated');
assert.equal(caseWithLaterMill.steps[3],originalMill5,'Existing Mill 5 moved, not recreated');
assert.deepEqual(names(caseWithLaterMill),[
  'Grain Mill 3','Grain Mill 4','Grain Mill 5','Bakery 1','Bakery 2','Bakery 3'
]);
assert.equal(deps.inspect('custom_resources_legacy',caseWithLaterMill).valid,true);
assert.equal(deps.repair('custom_resources_legacy',caseWithLaterMill).changed,false,'Repair is idempotent');

const missing = {
  description:'Imported from APES Resource Upgrade Planner',
  steps:[mill(3),bakery(1),bakery(2),bakery(3)]
};
assert.equal(deps.inspect('custom_resources_missing',missing).current,3);
const fixedMissing=deps.repair('custom_resources_missing',missing);
assert.deepEqual(fixedMissing.inserted,[4,5]);
assert.deepEqual(names(missing),[
  'Grain Mill 3','Grain Mill 4','Grain Mill 5','Bakery 1','Bakery 2','Bakery 3'
]);
assert.equal(deps.inspect('custom_resources_missing',missing).valid,true);
assert.equal(deps.repair('custom_resources_missing',missing).changed,false);

// New import can legitimately start with an already finished Level 5 Mill.
const already5={
  resourcePlannerStartBuildings:{ mill:5 },
  steps:[bakery(1)]
};
assert.equal(deps.inspect('custom_resources_mill5',already5).valid,true);
assert.equal(deps.repair('custom_resources_mill5',already5).changed,false);

// Metadata is authoritative when present; never assume Level 5 because
// there are no Mill steps (or accept a future Mill 5 as a prior prerequisite).
const starting2={
  resourcePlannerStartBuildings:{ mill:2 },
  steps:[bakery(1),mill(3),mill(4),mill(5)]
};
const fixedStarting=deps.repair('custom_resources_start2',starting2);
assert.equal(fixedStarting.valid,true);
assert.deepEqual(names(starting2),[
  'Grain Mill 3','Grain Mill 4','Grain Mill 5','Bakery 1'
]);

// For a legacy route with no known starting Mill and no Mill steps,
// don't fabricate levels or falsely claim that prerequisites are satisfied.
const unknown={ steps:[bakery(1)], description:'Imported from APES Resource Upgrade Planner' };
assert.equal(deps.inspect('custom_resources_unknown',unknown).unverifiable,true);
assert.equal(deps.repair('custom_resources_unknown',unknown).changed,false);

// Do not rewrite manually authored or official non-resource routes.
const manual={ steps:[bakery(1),mill(3)] };
assert.equal(deps.repair('manual_route',manual).relevant,false);
assert.deepEqual(names(manual),['Bakery 1','Grain Mill 3']);

// Exercise the editor's real saved-profile load/repair path, which used to
// reset a first exact upgrade of Grain Mill Lv 3 to Lv 1.
const storage = new Map();
const storeKey='qol_roadmap_profiles_v1';
const loaded = {
  custom_resources_saved: {
    name:'01. APES 40 Steps Resources Roadmap',
    description:'Imported from APES Resource Upgrade Planner for 01. APES.',
    steps:[mill(3),bakery(1),bakery(2),bakery(3)]
  }
};
storage.set(storeKey,JSON.stringify(loaded));
const localStorage={
  getItem:key=>storage.has(key)?storage.get(key):null,
  setItem:(key,value)=>storage.set(key,String(value))
};
const start=editor.indexOf('  const CUSTOM_STORAGE_KEY =');
const end=editor.indexOf('  function editorState()',start);
assert.ok(start>=0 && end>start,'Editor setup and repair functions are present');
const exposed=new Function('window','localStorage',editor.slice(start,end)+
  '\nreturn { prepareCustomRoadmaps, repairRoadmapSequences, repairRoadmapWithDependencies };')(win,localStorage);
const output=exposed.prepareCustomRoadmaps();
assert.deepEqual(names(output.custom_resources_saved),[
  'Grain Mill 3','Grain Mill 4','Grain Mill 5','Bakery 1','Bakery 2','Bakery 3'
]);
assert.ok(storage.get(storeKey).includes('added_mill_4'),'Repair saved back to the real Roadmap storage key');
assert.equal(exposed.prepareCustomRoadmaps().custom_resources_saved.steps.length,6,'Second load is idempotent');
// A later editor move that pushes Mill 5 past Bakery must also be repaired.
const reordered = output.custom_resources_saved;
const mill5Index = reordered.steps.findIndex(step=>step.buildingId===8&&step.level===5);
const movedMill5 = reordered.steps.splice(mill5Index,1)[0];
reordered.steps.push(movedMill5);
assert.equal(deps.inspect('custom_resources_saved',reordered).valid,false);
assert.equal(exposed.repairRoadmapWithDependencies('custom_resources_saved',reordered),true);
assert.deepEqual(names(reordered),[
  'Grain Mill 3','Grain Mill 4','Grain Mill 5','Bakery 1','Bakery 2','Bakery 3'
]);
const bare={steps:[mill(3),mill(4),mill(5)]};
exposed.repairRoadmapSequences(bare);
assert.deepEqual(bare.steps.map(step=>step.level),[3,4,5],
  'Exact sequences preserve first upgrade level when existing village started at Level 2');

for(const script of ['js/modules/resourceUpgradePlanner/integration.js','js/modules/roadmaps/resourcePlannerImports.js']) {
  const source=read(script);
  assert.match(source,/resourcePlannerStartBuildings:\s*\{\s*mill:/);
  assert.match(source,/resourcePlannerDependencies\?\.inspect/);
}
console.log('Resource Planner dependencies: legacy Bakery route repaired, Mill 5 enforced, start levels preserved, saved editor profiles repaired and imports guarded.');
