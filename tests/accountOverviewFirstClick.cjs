'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const palette=fs.readFileSync(path.join(root,'js/ui/villagePalette.js'),'utf8');
const combined=fs.readFileSync(path.join(root,'js/modules/villageDashboard/dashboardScanIntegration.js'),'utf8');

const start=palette.indexOf('    function scanVillageIds() {');
const end=palette.indexOf('    async function scanAllVillages()',start);
assert.ok(start>=0&&end>start,'Village snapshot wait function exists');
const makeWait=new Function('snapshot','requestSnapshot','sleep','Date',
  palette.slice(start,end)+'\nreturn {scanVillageIds,waitForScanVillages};');

(async()=>{
  let now=1000,requests=0;
  const snapshot={villages:[]};
  const clock={now:()=>now};
  const wait=makeWait(snapshot,()=>{requests++;},async ms=>{
    now+=ms;
    if(now>=1300)snapshot.villages=[{villageId:'101'},{villageId:'102'}];
  },clock);
  assert.deepEqual(await wait.waitForScanVillages(),['101','102'],
    'First click waits for delayed village list without requiring another click');
  assert.ok(requests>=1,'First attempt requests a new bridge snapshot');
  requests=0;
  assert.deepEqual(await wait.waitForScanVillages(),['101','102']);
  assert.equal(requests,0,'Loaded snapshot starts immediately');

  let failedRequests=0,deadClock=1000;
  const empty=makeWait({villages:[]},()=>{failedRequests++;},
    async ms=>{deadClock+=ms;},{now:()=>deadClock});
  assert.deepEqual(await empty.waitForScanVillages(350),[],
    'Never invent owned villages when bridge is unavailable');
  assert.ok(failedRequests>=1);

  assert.match(palette,/scanInProgress = true;\s*scanProgress = \{ current: 0, total: 0, returning: false \};\s*updateScanButton\(\);\s*const ids = await waitForScanVillages\(\)/,
    'Busy guard is acquired before waiting, preventing repeated-click races');
  assert.match(palette,/if \(!ids\.length\) \{\s*scanInProgress = false;/,
    'Unavailable snapshots release the busy guard');
  assert.match(palette,/return true;\s*\}\s*function switchDashboardMode/,
    'Completed pass returns an explicit success result');
  assert.match(palette,/button\.textContent = scanProgress\.total === 0\s*\?\s*'Loading villages…'/,
    'User sees immediate loading state');
  assert.match(combined,/if \(villagesScanned === false\)/,
    'Combined scanner stops if village pass could not start');
  assert.match(combined,/Villages unavailable — Retry/,
    'Failed initial scan displays retry affordance');
  console.log('Account Overview: first-click delayed snapshot, loading guard and failed-start feedback passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
