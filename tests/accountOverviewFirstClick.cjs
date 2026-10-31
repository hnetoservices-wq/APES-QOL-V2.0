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


  // Exercise the actual scanAllVillages function, not just its wait helper.
  const scanEnd=palette.indexOf('    function switchDashboardMode(',start);
  assert.ok(scanEnd>end);
  const scanChunk=palette.slice(start,scanEnd);
  const makeScan=new Function('snapshot','requestSnapshot','sleep','Date',
    'currentVillageIdFromUrl','window','updateScanButton',
    'captureCurrentVillageScan','waitForVillageNavigation',
    'SCAN_SETTLE_MS','SCAN_REFRESH_MS','SCAN_CAPTURE_TIMEOUT_MS','isOpen','renderDashboard','console',
    'let scanInProgress=false,scanProgress={current:0,total:0,returning:false};\n'+
    scanChunk+'\nreturn {scanAllVillages,getBusy:()=>scanInProgress};');
  let currentMs=1000, captureCount=0, historyCount=0, refreshCount=0;
  const pendingSnapshot={villages:[],activeVillageId:'101'};
  const gameWindow={location:{hash:'#/page:village/villId:101'},
    APES:{villageResourceProduction:{
      captureForScan:()=>({wood:25}),
      recordScan:()=>{historyCount++;}
    }}};
  const actual=makeScan(pendingSnapshot,()=>{refreshCount++;},
    async ms=>{currentMs+=ms;if(currentMs>=1100)pendingSnapshot.villages=[{villageId:'101'}];},
    {now:()=>currentMs},()=> '101',gameWindow,()=>{},
    ()=>{captureCount++;},async()=>true,0,0,800,()=>false,()=>{},console);
  const firstClick=actual.scanAllVillages();
  assert.equal(actual.getBusy(),true,'First click acquires the busy guard immediately');
  assert.equal(await actual.scanAllVillages(),false,'Repeated click while loading cannot start a second scan');
  assert.equal(await firstClick,true,'First click completes once village data arrives');
  assert.equal(captureCount,1,'Exactly one village captured from one click');
  assert.equal(historyCount,1,'One resource history snapshot saved');
  assert.equal(actual.getBusy(),false,'Busy guard released on completion');

  let timeoutNow=1000, timeoutWarning=0;
  const noVillages=makeScan({villages:[]},()=>{},
    async ms=>{timeoutNow+=ms;},{now:()=>timeoutNow},
    ()=>'',{location:{hash:''},APES:{}},()=>{},
    ()=>{},async()=>true,0,0,800,()=>false,()=>{},
    {warn:()=>{timeoutWarning++;}});
  assert.equal(await noVillages.scanAllVillages(),false,'Unavailable snapshot does not masquerade as success');
  assert.equal(noVillages.getBusy(),false,'Unavailable snapshot does not lock future clicks');
  assert.equal(timeoutWarning,1,'First-click missing-village problem is reported');


  // Regression: when Scan Now starts on village #2's RESOURCE FIELDS page,
  // matching villId alone does not mean its production bar is readable.
  // The scan must visit /page:village first, retry delayed data within the
  // same click, save a complete three-village pass, and restore the page.
  let secondMs=0, retryCount=0, secondRecords=null;
  const resourceHash='#/page:resources/villId:102';
  const secondWindow={
    location:{hash:resourceHash},
    APES:{villageResourceProduction:{
      captureForScan:id=>{
        assert.match(secondWindow.location.hash,/^#\/page:village\/villId:/);
        if(id==='103' && retryCount++ < 2)return null;
        return {villageId:id,production:{wood:10,clay:20,iron:30,crop:40}};
      },
      recordScan:(expected,captures)=>{
        secondRecords={expected:[...expected],captured:Object.keys(captures).sort()};
      }
    }}
  };
  const secondSnapshot={
    villages:[{villageId:'101'},{villageId:'102'},{villageId:'103'}],
    activeVillageId:'102'
  };
  const second=makeScan(secondSnapshot,()=>{},
    async ms=>{secondMs+=ms;},
    {now:()=>secondMs},
    ()=>secondWindow.location.hash.match(/villId:(\d+)/)?.[1]||'',
    secondWindow,()=>{},()=>{},async()=>true,450,0,900,
    ()=>false,()=>{},{warn:()=>{}});
  assert.equal(await second.scanAllVillages(),true);
  assert.deepEqual(secondRecords.expected,['102','101','103'],
    'Scan starts from selected second village');
  assert.deepEqual(secondRecords.captured,['101','102','103'],
    'All three production values captured with an in-pass retry');
  assert.ok(retryCount>=3,'Delayed third village retried rather than marked partial');
  assert.equal(secondWindow.location.hash,resourceHash,
    'Original resource-fields page restored after scan');

  assert.match(palette,/scanInProgress = true;\s*scanProgress = \{ current: 0, total: 0, returning: false \};\s*updateScanButton\(\);\s*const ids = await waitForScanVillages\(\)/,
    'Busy guard is acquired before waiting, preventing repeated-click races');
  assert.match(palette,/if \(!ids\.length\) \{\s*scanInProgress = false;/,
    'Unavailable snapshots release the busy guard');
  assert.match(palette,/return true;\s*\}\s*function switchDashboardMode/,
    'Completed pass returns an explicit success result');
  assert.match(palette,/button\.textContent = scanProgress\.total === 0\s*\?\s*'Scanning · Loading villages…'/,
    'User sees immediate loading state');
  assert.match(combined,/if \(villagesScanned === false\)/,
    'Combined scanner stops if village pass could not start');
  assert.match(combined,/Villages unavailable — Retry/,
    'Failed initial scan displays retry affordance');
  console.log('Account Overview: first-click delayed snapshot, loading guard and failed-start feedback passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
