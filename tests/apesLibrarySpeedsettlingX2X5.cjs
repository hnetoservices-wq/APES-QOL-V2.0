// Run with: node tests/apesLibrarySpeedsettlingX2X5.cjs
// x2/x5 Roadmap recipes must track real building levels, preserve exact timing
// instructions, and be published in the APES Library without Mayhem.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const road = read('js/features/roadmaps.js');
const official = read('js/modules/roadmaps/officialGuides.js');
const library = read('js/features/apesLibrary.js');
for (const source of [road, official, library]) {
  assert.doesNotThrow(() => new Function(source), 'JavaScript must parse');
}

const roadPart = road.slice(road.indexOf('  const instruction ='), road.indexOf('  let panel = null;'));
const builtins = new Function(roadPart + '\nreturn BUILTIN_ROADMAPS;')();
const game = {APES:{roadmaps:{getAllRoadmaps:()=>({...builtins})}}};
const officialPart = official.slice(official.indexOf('  const clean ='), official.indexOf('  function selectedId()'));
const catalog = new Function('window', 'scheduleDecorate',
  "const OFFICIAL_IDS=new Set(['x1_speedsettle','x2_speedsettle','x3_speedsettle','x5_speedsettle','x1_support_500cp']);" +
  'let installed=false;\n' + officialPart + '\nreturn {applyCatalog};'
)(game, () => {});
assert.equal(catalog.applyCatalog(), true);

const counts = {
  x2_speedsettle: {total:69, buildings:45, instructions:24},
  x5_speedsettle: {total:68, buildings:43, instructions:25}
};
function getGuide(speed) {
  const id = speed + '_speedsettle';
  const item = builtins[id];
  const expected = counts[id];
  assert.ok(item, id + ' should be a built-in Roadmap');
  assert.equal(item.meta.official, true);
  assert.equal(item.meta.speed, speed);
  assert.equal(item.steps.length, expected.total, id + ' total steps');
  assert.equal(new Set(item.steps.map(s => s.id)).size, expected.total, id + ' unique stable step IDs');
  const builds = item.steps.filter(s => s.type === 'building');
  assert.equal(builds.length, expected.buildings);
  assert.equal(item.steps.filter(s => s.type === 'instruction').length, expected.instructions);
  assert.ok(builds.every(s => s.exact === true && Number.isInteger(s.level) && s.level >= 1));
  assert.ok(game.APES.roadmapsOfficialGuides.ids.includes(id));
  assert.equal(game.APES.roadmapsOfficialGuides.getDefinition(id).steps.length, expected.total);
  return item;
}
function levels(steps, building) {
  return steps.filter(s => s.type === 'building' && s.building === building).map(s => s.level);
}
function expectedLevels(n) { return Array.from({length:n}, (_,i)=>i+1); }
function order(steps, speed, before, after) {
  const a = steps.findIndex(s => s.id === speed + '-speedsettle-' + before);
  const b = steps.findIndex(s => s.id === speed + '-speedsettle-' + after);
  assert.ok(a >= 0 && b >= 0, 'Missing ordered steps ' + before + ' and ' + after);
  assert.ok(a < b, speed + ': ' + before + ' should precede ' + after);
}
function contains(steps, id, content) {
  const step = steps.find(s => s.id === id);
  assert.ok(step && step.text?.includes(content), id + ': expected "' + content + '"');
}

const x2 = getGuide('x2').steps;
const x5 = getGuide('x5').steps;
for (const [speed, steps, granaryMax] of [['x2',x2,7],['x5',x5,5]]) {
  for (const [building, max] of [
    ['Warehouse',5],['Granary',granaryMax],['Main Building',10],
    ['Residence',5],['Barracks',3],['Academy',10]
  ]) assert.deepEqual(levels(steps, building), expectedLevels(max),
    speed + ': ' + building + ' every level in ascending order');
  for (const [name,id] of [['Embassy',18],['Marketplace',17],['Town Hall',24],['Workshop',21]]) {
    const matches = steps.filter(s => s.type === 'building' && s.building === name);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].buildingId,id);
    assert.equal(matches[0].level,1);
  }
  const cranny=steps.find(s=>s.building==='Cranny');
  assert.equal(cranny.buildingId,23);
  assert.equal(cranny.instance,1);
  const crops=steps.filter(s=>s.text?.startsWith('All Crop Fields → Level '));
  assert.deepEqual(crops.map(s=>s.text.slice(-1)),['1','2','3']);
  assert.ok(steps.some(s=>s.id===speed+'-speedsettle-optional-resource-fields' &&
    s.text.includes('Skip this checkpoint')));
  order(steps,speed,'tutorial','queue-five-units');
  order(steps,speed,'first-hideouts','warehouse-lv1');
  order(steps,speed,'warehouse-lv3','granary-lv1');
  order(steps,speed,'granary-lv3','embassy-lv1');
  order(steps,speed,'embassy-lv1','annex-oasis');
  order(steps,speed,'annex-oasis','marketplace-lv1');
  order(steps,speed,'marketplace-lv1','cranny-lv1');
  order(steps,speed,'cranny-lv1','crop-lv1');
  order(steps,speed,'crop-lv3','optional-resource-fields');
  order(steps,speed,'main-building-lv1','residence-lv1');
  order(steps,speed,'residence-lv1','gold-bonuses');
  order(steps,speed,'residence-lv5','free-quests');
  order(steps,speed,'card-games','residence-five-reward');
  order(steps,speed,'residence-five-reward','settler-one');
  order(steps,speed,'settler-two','catch-animals');
  order(steps,speed,'wait-hideouts-three-four','clear-hideouts-three-four');
  order(steps,speed,'clear-hideouts-three-four','settler-three');
  order(steps,speed,'main-building-lv10','demolish-residence');
  order(steps,speed,'demolish-residence','barracks-lv1');
  order(steps,speed,'barracks-lv3','academy-lv1');
  order(steps,speed,'academy-lv10','town-hall-lv1');
  order(steps,speed,'town-hall-lv1','workshop-lv1');
  order(steps,speed,'granary-lv'+granaryMax,'remaining-chests');
  order(steps,speed,'remaining-chests','demolish-workshop');
  order(steps,speed,'demolish-workshop','small-party');
  order(steps,speed,'small-party','relocate');
  order(steps,speed,'relocate','send-settlers');
  contains(steps,speed+'-speedsettle-clear-hideouts-three-four','does not die');
  contains(steps,speed+'-speedsettle-settler-three','resource or crop chest');
  contains(steps,speed+'-speedsettle-gold-bonuses','Travian Plus');
}
contains(x2,'x2-speedsettle-wait-hideouts-three-four','1h40m');
contains(x2,'x2-speedsettle-demolish-residence','2h10min');
contains(x2,'x2-speedsettle-free-quests','auction bid');
order(x2,'x2','main-building-lv7','residence-lv1');
order(x2,'x2','gold-bonuses','warehouse-lv4');
order(x2,'x2','warehouse-lv5','granary-lv4');
order(x2,'x2','granary-lv5','residence-lv2');
order(x2,'x2','settler-three','main-building-lv8');
order(x2,'x2','workshop-lv1','granary-lv6');

contains(x5,'x5-speedsettle-wait-hideouts-three-four','1h15m');
contains(x5,'x5-speedsettle-demolish-residence','51 minutes');
contains(x5,'x5-speedsettle-warehouse-quest-reward','Level 4');
contains(x5,'x5-speedsettle-warehouse-quest-reward','Level 5');
order(x5,'x5','main-building-lv5','residence-lv1');
order(x5,'x5','settler-three','main-building-lv6');
order(x5,'x5','demolish-residence','warehouse-lv4');
order(x5,'x5','warehouse-lv5','warehouse-quest-reward');
order(x5,'x5','warehouse-quest-reward','barracks-lv1');
order(x5,'x5','workshop-lv1','granary-lv4');
assert.ok(!x5.some(s=>s.text?.includes('2h10min')||s.text?.includes('1h40m')));
assert.ok(!x2.some(s=>s.text?.includes('51 minutes')||s.text?.includes('1h15m')));

// Verify the Library is four active speeds with no x3 Mayhem entry.
const libraryPart = library.slice(library.indexOf('  const CATEGORIES ='),library.indexOf('  function notify('));
const api=new Function('window',libraryPart+
  '\nreturn {findGuide,guideData,renderArticle,setPanel:p=>panel=p,select:id=>selectedId=id,categories:CATEGORIES};'
)(game);
const speedCategory=api.categories.find(c=>c.id==='speedsettling');
assert.deepEqual(speedCategory.guides.map(g=>g.id),['speed_x1','speed_x2','speed_x3','speed_x5']);
assert.ok(!library.includes('speed_x3_mayhem') && !library.includes('x3 Mayhem Guide'));
let html='';
api.setPanel({querySelector(s){return s==='.apes-lib-article'?{set innerHTML(v){html=v},get innerHTML(){return html}}:null;}});
for(const speed of ['x2','x5']){
  const guideId='speed_'+speed;
  const selected=api.findGuide(guideId);
  assert.equal(selected.roadmapId,speed+'_speedsettle');
  assert.equal(api.guideData(selected).steps.length,counts[speed+'_speedsettle'].total);
  api.select(guideId);
  api.renderArticle();
  assert.equal((html.match(/class="apes-lib-step-type"/g)||[]).length,counts[speed+'_speedsettle'].total);
  assert.ok(html.includes('data-library-export'));
  assert.ok(html.includes('Main Building → Level 10'));
  assert.ok(!html.includes('Guide not published yet'));
}

// Confirm building IDs and exact levels survive copying selected guide steps.
const normalizePart=road.slice(road.indexOf('  function normalizeStep('),road.indexOf('  function normalizeRoadmap('));
const normalize=new Function('cleanText',normalizePart+'\nreturn normalizeStep;')(
  s=>String(s??'').replace(/\s+/g,' ').trim()
);
for(const item of [x2.find(s=>s.building==='Cranny'),x5.find(s=>s.building==='Warehouse'&&s.level===5)]) {
  const exported=normalize(item);
  assert.equal(exported.type,'building');
  assert.equal(exported.exact,true);
  assert.equal(exported.level,item.level);
  assert.equal(exported.buildingId,item.buildingId);
  if(item.instance)assert.equal(exported.instance,item.instance);
}
assert.ok(builtins.x1_speedsettle.steps.length>70, 'x1 preserved');
assert.ok(builtins.x3_speedsettle.steps.length>50, 'x3 preserved');
assert.ok(builtins.x1_support_500cp.steps.length>50, 'Support Village preserved');

console.log('APES Library x2/x5 Speedsettling: ordered level-specific official guides, unique speed timings, Mayhem removal and export verified.');
