'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/modules/villageDashboard/accountOverview.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js/modules/villageDashboard/accountOverview.js'), 'utf8');

const rule = css.match(/#apes-v2-village-overlay \.apes-ao-resource-legend em\s*\{([^}]*)\}/);
assert.ok(rule, 'Production legend values must have an explicit scoped rule');
assert.match(rule[1], /margin-left:\s*0\s*!important/, 'Values sit directly beside the resource names');
assert.doesNotMatch(rule[1], /margin-left:\s*auto/, 'No spacer between name and value');
assert.match(css, /\.apes-ao-resource-stack \.apes-ao-resource-legend\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(110px,1fr\)\)/, 'Five-series legend wraps gracefully');
assert.match(js, /<b>\$\{safe\(item\.label\)\}<\/b>\s*\n\s*<em>\$\{current>0\?'\+':''\}/, 'Legend keeps each label adjacent to its value');


// Render the graph's real function with two complete snapshots and one
// partial snapshot. Total must be derived individually for each data point,
// take part in axis scaling and show its sum in the tooltip and legend.
const start=js.indexOf('  const RESOURCE_TYPES=[');
const end=js.indexOf('  const TRIBES=',start);
const graphStart=js.indexOf('  function resourceDevelopmentHtml(');
const graphEnd=js.indexOf('  function resourceHtml(summary){',graphStart);
assert.ok(start>=0 && end>start && graphStart>0 && graphEnd>graphStart);
const makeGraph=new Function(
  "const apesHtml_accountOverview = (s,...v) => String.raw({raw:s},...v);\n" + js.slice(start,end)+
  'const num=v=>v==null||v===""?null:Number.isFinite(Number(v))?Number(v):null;\n'+
  'const safe=v=>String(v??"");\n'+
  'const fmt=v=>Math.round(Number(v)||0).toLocaleString("en-US");\n'+
  'const compact=v=>Math.abs(v)>=1000?(v/1000).toFixed(1)+"k":String(v);\n'+
  js.match(/^  const day=.+$/m)[0]+'\n'+
  js.slice(graphStart,graphEnd)+
  'return resourceDevelopmentHtml;'
)();
const history=[
 {timestamp:1000000000000,captured:2,villages:2,complete:true,
  totals:{wood:100,clay:200,iron:300,crop:400}},
 {timestamp:1000000100000,captured:1,villages:2,complete:false,
  totals:{wood:99999,clay:99999,iron:99999,crop:99999}},
 {timestamp:1000000200000,captured:2,villages:2,complete:true,
  totals:{wood:150,clay:250,iron:350,crop:450}}
];
const html=makeGraph(history);
assert.match(html,/2 complete scans/);
assert.match(html,/Latest scan partial|<b>Total<\/b>/);
assert.match(html,/<b>Total<\/b>\s*<em>\+1,200\/h<\/em>/,
 'Total 150 + 250 + 350 + 450 = 1200 per hour');
assert.match(html,/<title>Total: 1,000\/h/,'Old point includes sum of all four resources');
assert.match(html,/<title>Total: 1,200\/h/,'New point includes correct total');
assert.equal((html.match(/<polyline /g)||[]).length,5,'Four resources plus one Total line');
assert.match(html,/stroke-width="3.5"/,'Total line is heavier');
assert.doesNotMatch(html,/99,999/,'Partial readings excluded rather than added');
assert.match(html,/wood, clay, iron, crop and total production per hour/);

// The account panel is expensive to regenerate. While Scan Now visits each
// village, keep the prior chart visible instead of repainting on every cache
// message; the full scan-complete event triggers a final redraw.
assert.match(js, /if\(window\.APES\?\.villageDashboardCombinedScan\?\.isRunning\?\.\(\)\)return;/,
  'Account Overview defers expensive chart rendering while Scan Now is active');
assert.match(js, /window\.addEventListener\('apes_vd_dashboard_scan_complete',\(\)=>\{lastRender='';render\(\);\}\)/,
  'Chart is repainted after all village, Smithy and Troop passes finish');

console.log('Account Overview production graph has five wrapped legend entries and a correct Total series.');

const { runInNewContext } = require('node:vm');
const storeKey = 'apes_qol_account_resource_production_history_v1:history.kingdoms.com:7';
const storedHistory = Array.from({ length: 180 }, (_, index) => ({
  ...history[0],
  timestamp: history[0].timestamp + index * 60_000,
  totals: { wood: index + 1, clay: 200, iron: 300, crop: 400 }
}));
const store = new Map([[storeKey, JSON.stringify(storedHistory)]]);
const window = {
  location: { hostname: 'history.kingdoms.com' },
  APES_VILLAGE_PALETTE: { getVillages: () => [{ playerId: 7 }] },
  addEventListener() {}, dispatchEvent() {}, setInterval() {}, setTimeout() {}, clearTimeout() {}
};
runInNewContext(fs.readFileSync(path.join(root, 'js/modules/villageDashboard/resourceProduction.js'), 'utf8'), {
  window,
  localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
  CustomEvent: class {}
});
const production = window.APES.villageResourceProduction;
assert.equal(production.recordScan(['10'], { '10': { villageId: '10', production: history[2].totals } }), true);
const fullHistory = production.scanHistory();
assert.equal(fullHistory.length, 181, 'Saving a new scan retains older history beyond the former storage limit');
assert.equal(fullHistory[0].timestamp, storedHistory[0].timestamp);
const fullGraph = makeGraph(fullHistory);
assert.match(fullGraph, /181 complete scans/);
assert.match(fullGraph, /<title>Wood: 1\/h/, 'The oldest saved production point appears on the chart');

const datedHistory = [
  [8, 23, 81], [9, 0, 91], [9, 12, 92], [10, 9, 101], [10, 23, 102], [11, 0, 111]
].map(([date, hour, wood]) => ({
  ...history[0],
  timestamp: new Date(2026, 10, date, hour, 59).getTime(),
  totals: { ...history[0].totals, wood }
}));
const rangeGraph = makeGraph(datedHistory, {start: '2026-11-09', end: '2026-11-10'});
assert.match(rangeGraph, /4 complete scans/);
assert.deepEqual([...rangeGraph.matchAll(/<title>Wood: (\d+)\/h/g)].map(match => Number(match[1])), [91, 92, 101, 102]);
assert.match(makeGraph(datedHistory, {start: '2026-11-09', end: '2026-11-09'}), /2 complete scans/);
assert.match(makeGraph(datedHistory, {start: '2026-11-12'}), /No complete scans in this date range/);
assert.match(makeGraph(datedHistory, {start: '2026-11-10', end: '2026-11-09'}), /Start date must be on or before end date/);
