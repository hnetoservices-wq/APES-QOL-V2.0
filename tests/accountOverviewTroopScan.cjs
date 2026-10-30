'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const intel = fs.readFileSync(path.join(root,'js/modules/villageDashboard/expandedVillageIntel.js'),'utf8');
const integration = fs.readFileSync(path.join(root,'js/modules/villageDashboard/dashboardScanIntegration.js'),'utf8');
const overview = fs.readFileSync(path.join(root,'js/modules/villageDashboard/accountOverview.js'),'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const isolated = manifest.content_scripts.find(group =>
  group.world !== 'MAIN' && group.js?.includes('js/modules/villageDashboard/accountOverview.js'));
assert.ok(isolated, 'Account Overview must load as an isolated-world module');
const integrationPath = 'js/modules/villageDashboard/dashboardScanIntegration.js';
assert.ok(isolated.js.includes(integrationPath),
  'Combined Scan Now integration must actually load from the extension manifest');
assert.ok(isolated.js.indexOf(integrationPath) > isolated.js.indexOf('js/modules/villageDashboard/expandedVillageIntel.js'),
  'Combined Scan Now must load after the troop scanner');
assert.ok(isolated.js.indexOf(integrationPath) > isolated.js.indexOf('js/ui/villagePalette.js'),
  'Combined Scan Now must load after the village dashboard UI');

// The native Own troops view supplies per-village troop columns, including a
// separate hero. Reproduce the supplied screenshot: 204 + 9 Clubswingers.
const start = intel.indexOf('  function villageIdFromOverviewRow(');
const end = intel.indexOf('  function absoluteUnitId(', start);
assert.ok(start >= 0 && end > start, 'Troop parser and validation must exist');
const snapshot = {
  villages: [{ villageId:'101', name:'01. APES' },{ villageId:'102', name:'02. Bonobo' }]
};
const norm = value => String(value||'').trim().toLowerCase();
const methods = new Function('snapshot','norm',intel.slice(start,end)+
  '\nreturn { parseOwnTroopsTable, validateOwnTroopsTable };')(snapshot,norm);
const ids = ['11','12','13','14','15','16','17','18','19','20','hero'];
const values = [
  [204,0,0,5,0,0,0,0,0,0,1],
  [9,7,0,0,0,0,0,0,0,0,0]
];
const total = [213,7,0,5,0,0,0,0,0,0,1];
const headerIcons = ids.map(id=>({getAttribute:key=>key==='data'?id:null}));
const makeRow = (name, counts) => ({
  querySelectorAll: selector => {
    if(selector === ':scope > td')return [
      {querySelector:()=>({textContent:name,getAttribute:()=>null})},
      ...counts.map(n=>({textContent:String(n)}))
    ];
    return [];
  }
});
const rows = [makeRow('01. APES',values[0]),makeRow('02. Bonobo',values[1])];
const footer = [ {textContent:'Total'},...total.map(value=>({textContent:String(value)})) ];
const table = {
  querySelectorAll(selector){
    if(selector === 'thead.troopsIconRow th i[unit-icon][data]')return headerIcons;
    if(selector === 'tbody tr')return rows;
    if(selector === 'tfoot tr td')return footer;
    return [];
  }
};
const parsed = methods.parseOwnTroopsTable(table);
assert.equal(parsed.length,2);
assert.equal(parsed[0].units['11'],204);
assert.equal(parsed[1].units['11'],9);
assert.equal(parsed.reduce((sum,row)=>sum+row.units['11'],0),213);
assert.equal(parsed.reduce((sum,row)=>sum+row.units['12'],0),7);
assert.equal(parsed.reduce((sum,row)=>sum+row.units['14'],0),5);
assert.equal(parsed.reduce((sum,row)=>sum+row.units.hero,0),1);
assert.doesNotThrow(()=>methods.validateOwnTroopsTable(table,parsed));
assert.equal(total.slice(0,10).reduce((a,b)=>a+b,0),225,'Hero is excluded from Unit Counter');
footer[1] = {textContent:'26'};
assert.throws(()=>methods.validateOwnTroopsTable(table,parsed),/totals mismatch/);
footer[1] = {textContent:'213'};
const removedFooter = footer.pop();
assert.throws(()=>methods.validateOwnTroopsTable(table,parsed),/totals have not finished rendering/);
footer.push(removedFooter);
rows.pop();
const incomplete = methods.parseOwnTroopsTable(table);
assert.throws(()=>methods.validateOwnTroopsTable(table,incomplete),/Missing own village/);
rows.push(makeRow('02. Bonobo',values[1]));
assert.match(intel,/\.tabOwnTroops\.activeTab\.currentTab \.ownTroops table\.villagesTable/);
assert.match(intel,/validateOwnTroopsTable\(table, parsed\)/);
assert.match(overview,/window\.addEventListener\('apes_vd_army_history_updated',\(\)=>\{lastRender='';render\(\);\}\)/);

// Simulate clicking "Scan Now" with existing village and Smithy passes.
const events = [];
const listeners = {};
const button = {
  classList:{add(){},remove(){},toggle(){}},
  setAttribute(){},textContent:'Scan Now'
};
const overlay = {classList:{contains:key=>key==='open'},contains:()=>true};
const document = {
  getElementById:id=>id==='apes-v2-village-overlay'?overlay:null,
  querySelector:selector=>selector.endsWith('.apes-vd-scan-btn')?button:null
};
const window = {
  addEventListener:(name,fn)=>{listeners[name]=fn},
  dispatchEvent:()=>{},
  APES:{
    villageSmithyLevels:{scan:async()=>{events.push('smithy')}},
    villageDashboardIntel:{refreshTroops:async()=>{events.push('troops');return true}}
  },
  APES_VILLAGE_PALETTE:{scan:async()=>{events.push('villages');return true},refresh:()=>events.push('refresh')}
};
new Function('window','document','CustomEvent','console',integration)(
  window,document,function(type){this.type=type},console
);
assert.equal(typeof window.APES.villageDashboardCombinedScan.run,'function');

(async()=>{
  await window.APES.villageDashboardCombinedScan.run();
  assert.deepEqual(events,['villages','smithy','troops','refresh']);
  events.length=0;
  window.APES.villageSmithyLevels.scan=async()=>{events.push('smithy');throw Error('Smithy temporarily unavailable')};
  await window.APES.villageDashboardCombinedScan.run();
  assert.deepEqual(events,['villages','smithy','troops','refresh'],'Troops still refresh if Smithy fails');
  assert.equal(button.textContent,'Scan Now','Scan button restored on successful scan');
  events.length=0;
  window.APES.villageSmithyLevels.scan=async()=>events.push('smithy');
  window.APES.villageDashboardIntel.refreshTroops=async()=>{
    events.push('troops'); return false;
  };
  await window.APES.villageDashboardCombinedScan.run();
  assert.deepEqual(events,['villages','smithy','troops','refresh']);
  assert.match(button.textContent,/Troop scan failed/,'Failure is shown rather than silently claiming success');

  // First click with no village snapshot must remain a visible failure. It
  // must not run the Smithy and Troops passes on stale history.
  events.length=0;
  window.APES_VILLAGE_PALETTE.scan=async()=>{events.push('villages');return false};
  await window.APES.villageDashboardCombinedScan.run();
  assert.deepEqual(events,['villages','refresh'],'A failed village pass stops subsequent scans');
  assert.match(button.textContent,/Villages unavailable — Retry/,'Show failed start on the button');

  // A subsequent successful first click must start the entire chain once.
  events.length=0;
  window.APES_VILLAGE_PALETTE.scan=async()=>{events.push('villages');return true};
  window.APES.villageDashboardIntel.refreshTroops=async()=>{events.push('troops');return true};
  const clickEvent={
    target:{closest:selector=>selector==='.apes-vd-scan-btn'?button:null},
    preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}
  };
  listeners.click(clickEvent);
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events,['villages','smithy','troops','refresh'],'Single click triggers full scan');
  assert.equal(button.textContent,'Scan Now','Single-click success restores label');
  console.log('Dashboard Scan Now is loaded in manifest; scans Troops overview; 213 Clubswingers / 225 non-hero troops; partial totals and failed scans detected.');
})().catch(error=>{console.error(error);process.exitCode=1;});
