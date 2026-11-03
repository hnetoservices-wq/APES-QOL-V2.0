'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const src = read('js/features/distanceCalculator.js');
const manifest = JSON.parse(read('manifest.json'));
const menu = read('js/ui/menu.js');
const toolbar = read('js/ui/toolbar.js');
const radial = read('js/features/commandPalette.js');

assert.doesNotThrow(() => new Function(src));
const isolated = manifest.content_scripts.find(script =>
  script.world !== 'MAIN' && script.js?.includes('js/ui/menu.js'));
assert.ok(isolated?.js.includes('js/features/distanceCalculator.js'),
  'Distance Calculator is loaded after APES settings');
assert.match(menu, /qol-chk-distance-calculator/);
assert.match(toolbar, /qol-distance-calc-toggle-btn/);
assert.match(radial, /distance\.open/);
assert.match(src, /data-field="customSpeed"/);
assert.match(src, /data-field="worldSpeedOverride"/);
assert.match(src, /APES_DISTANCE_CALCULATOR/);

const first = src.indexOf('  function detectWorldSpeed()');
const last = src.indexOf('  function escapeHtml(value)');
assert.ok(first >= 0 && last > first, 'Calculation functions remain testable');
const speeds = {
  1: {label:'x1 world',movement:1},
  2: {label:'x2 world',movement:1.5},
  3: {label:'x3 world',movement:2},
  5: {label:'x5 world',movement:3}
};
const state = {
  originX:'0',originY:'0',targetX:'2',targetY:'2',
  movementKey:'legionnaire',worldSpeedOverride:'1',customSpeed:'4',
  tournamentLevel:0,bootsBonus:0,siegeMode:false,desiredArrival:'13:00:00'
};
const doc = {
  title:'tr2nx5',
  documentElement:{getAttribute:()=> '5'},
  querySelector:()=>({textContent:'12:00:00'})
};
const win = { location:{hostname:'tr2nx5.kingdoms.com',hash:''} };
const units = new Map([['legionnaire',{
  key:'legionnaire',label:'Legionnaire',type:'troop',speed:6
}]]);
const calculator = new Function(
  'window','document','state','WORLD_SPEEDS','MOVEMENT_MAP',
  'LOCATION_ID_SIZE','LOCATION_ID_OFFSET',
  src.slice(first,last) +
  '\nreturn {calculate,calculateSendPlan,parseCoordinate,formatDuration};'
)(win,doc,state,speeds,units,32768,16384);

let result = calculator.calculate();
assert.equal(result.valid,true);
assert.equal(result.distance.toFixed(2),'2.83');
assert.equal(result.durationSeconds,2545,'2 by 2 at 4 fields/hour must floor to 42:25');
assert.equal(calculator.formatDuration(result.durationSeconds),'00:42:25');
const plan = calculator.calculateSendPlan(result.durationSeconds);
assert.equal(plan.valid,true);
assert.equal(plan.sendLabel,'12:17:35 · today');
assert.equal(plan.arrivalLabel,'13:00:00 · today');

state.targetY='';
assert.equal(calculator.calculate().valid,false,'blank coordinate cannot become zero');
assert.equal(calculator.parseCoordinate(''),null);
state.targetY='2';
state.worldSpeedOverride='auto';
result = calculator.calculate();
assert.equal(result.worldSpeed,5,'official published world speed overrides hostname inference');
assert.equal(result.durationSeconds,848,'x5 world applies movement x3');
state.worldSpeedOverride='1';
state.targetX='30';state.targetY='0';state.tournamentLevel=10;
result = calculator.calculate();
assert.equal(result.durationSeconds,22500,
  'Tournament Square changes only the segment beyond 20 fields');
state.targetX='2';state.targetY='2';state.tournamentLevel=0;
state.siegeMode=true;
assert.equal(calculator.calculate().durationSeconds,5091,'apply siege multiplier before final floor');
state.siegeMode=false;
state.customSpeed='';
assert.equal(calculator.calculate().baseSpeed,6,'preset speed works without override');
state.customSpeed='4';
doc.querySelector=()=>null;
result = calculator.calculate();
assert.equal(result.valid,true,'distance and duration remain available without server clock');
assert.equal(result.arrival,'—','do not mistake local computer time for server time');
assert.equal(calculator.calculateSendPlan(result.durationSeconds).clockMissing,true);
console.log('Distance & Arrival Calculator: restored UI wiring, world speed, manual speed, exact distance, 20-field modifier, siege timing, blank coordinates and server-clock safety passed.');
