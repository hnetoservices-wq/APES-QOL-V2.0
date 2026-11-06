const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
(async()=>{
 const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://test.kingdoms.com/'}),w=dom.window;
 w.APES={};w.isQolEnabled=()=>true;w.chrome={runtime:{},storage:{local:{get:(k,cb)=>cb({}),set:(v,cb)=>cb()},onChanged:{addListener(){}}}};
 const load=file=>w.eval(fs.readFileSync(path.join(root,file),'utf8'));
 load('js/locales/catalogs.js');load('js/core/i18n.js');const i=w.APES.i18n;await i.ready;
 load('js/features/watchlist.js');w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await new Promise(r=>w.setTimeout(r,0));
 const update=w.document.querySelector('#qol-wl-update-btn');assert.ok(update,'Actual watchlist update button exists');
 const status=w.document.createElement('div');w.document.body.append(status);
 const name='Update current watchlist <A&B>';const player=w.document.createElement('div');player.textContent=name;w.document.body.append(player);
 for(const {code} of i.languages){
  await i.setLanguage(code);i.apply();assert.equal(update.textContent,i.t('Update current watchlist'));
  i.setText(status,'{v0} CP remaining',{v0:1234});assert.equal(status.textContent,i.t('{v0} CP remaining',{v0:1234}));
  const node=status.firstChild;i.setText(status,'{v0} CP remaining',{v0:1234});assert.equal(status.firstChild,node,'Repeated writes must not create mutation loops');
  i.setText(status,'Snapshot saved · 30 kingdoms · 5 statistics pages.');assert.equal(status.textContent,i.t('Snapshot saved · {v0} kingdoms · {v1} statistics pages.',{v0:'30',v1:'5'}));
  assert.equal(player.textContent,name);
 }
 await i.setLanguage('pt-PT');update.click();await new Promise(r=>w.setTimeout(r,0));assert.ok(w.document.body.textContent.includes(i.t('No players in the current tab to update.')),'Watchlist empty-update message is translated');
 load('js/modules/kingdomManagement/statistics.js');
 let snapshots=[];
 w.APES_KINGDOM_HISTORY={load:async()=>snapshots,loadFilters:async()=>({tags:[],kingdomTags:{}}),compare:()=>[]};
 load('js/features/kingdomManagement.js');
 w.APES_KINGDOM_MANAGEMENT.open();await new Promise(r=>w.setTimeout(r,0));
 assert.equal(w.document.querySelector('[data-km-scan]').textContent,i.t('Scan Kingdoms'),'Kingdom Management is translated before scanning');
 snapshots=[{id:'test-scan',complete:true,server:w.location.hostname,scannedAt:Date.now(),kingdoms:[{id:'1',name:'Update current watchlist',king:'Open map',kingId:'1',rank:1,villages:2,population:100,area:3,players:1,averageAttack:10,totalAttack:10,averageDefense:20,totalDefense:20,treasures:5,victoryPoints:10}]}];
 w.APES_KINGDOM_MANAGEMENT.open();await new Promise(r=>w.setTimeout(r,0));
 for(const {code} of i.languages){
  await i.setLanguage(code);i.apply();
  assert.equal(w.document.querySelector('[data-km-tab="results"]').textContent,i.t('Results & snapshots'));
  assert.equal(w.document.querySelector('[data-km-tab="comparison"]').textContent,i.t('Comparison'));
  assert.equal(w.document.querySelector('[data-km-sort="averageAttack"]').textContent,i.t('Avg. attack'));
  assert.equal(w.document.querySelector('tbody .qol-km-name-column').textContent,'Update current watchlist');
  assert.equal(w.document.querySelector('tbody .qol-km-king-column').textContent,'Open map');
 }
 for(const [locale,catalog] of Object.entries(w.APES.localeCatalogs))for(const [key,value] of Object.entries(catalog)){
  const placeholders=text=>[...text.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();assert.deepEqual(placeholders(key),placeholders(value),locale+': '+key);
 }
 dom.window.close();console.log('All locales: actual Watchlists update control, live status writes, post-scan summary, player-data isolation, stable bindings and catalog placeholders passed.');
})().catch(error=>{console.error(error);process.exit(1);});
