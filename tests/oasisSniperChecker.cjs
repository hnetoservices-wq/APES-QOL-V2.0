'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const bridge=fs.readFileSync(path.join(root,'js/modules/oasisSniper/influenceBridge.js'),'utf8');
const math=fs.readFileSync(path.join(root,'js/modules/oasisSniper/math.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'js/features/oasisSniperChecker.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/features/oasisSniperChecker.css'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const menu=fs.readFileSync(path.join(root,'js/ui/menu.js'),'utf8');
for(const src of [bridge,math,ui])assert.doesNotThrow(()=>new Function(src));
const main=manifest.content_scripts.find(x=>x.world==='MAIN');
const isolated=manifest.content_scripts.find(x=>x.world!=='MAIN'&&x.js.includes('js/features/oasisScanner.js'));
assert.ok(main.js.includes('js/modules/oasisSniper/influenceBridge.js'));
assert.ok(isolated.js.indexOf('js/modules/oasisSniper/math.js')<
  isolated.js.indexOf('js/features/oasisSniperChecker.js'));
assert.ok(isolated.css.includes('css/features/oasisSniperChecker.css'));
assert.match(menu,/key: 'oasisSniperChecker'/);
assert.match(css,/\.apes-sniper-confirmed/);

const win={};
new Function('window',math)(win);
const calc=win.APES_OASIS_SNIPER_MATH;
const out=calc.evaluate([
 {playerId:'1',name:'Ruben',villageInfluence:134},
 {playerId:'2',name:'Restos',villageInfluence:240},
 {playerId:'3',name:'req',villageInfluence:660}
]);
assert.deepEqual(out.map(x=>x.proof),[true,true,false]);
assert.equal(out[0].minimumInfluenceFromTroops,526);
assert.equal(out[0].strictOvertake,527);
assert.equal(out[0].witness,'req');
assert.equal(out[1].minimumInfluenceFromTroops,420);
assert.equal(out[1].strictOvertake,421);
assert.equal(out[2].status,'possible');
assert.equal(calc.evaluate([
 {name:'Natural leader',villageInfluence:700},
 {name:'Other',villageInfluence:400}
])[0].proof,false);
assert.equal(calc.evaluate([
 {name:'No data',villageInfluence:null},
 {name:'Other',villageInfluence:400}
])[0].status,'unknown');


const uiWindow={
 APES_OASIS_SNIPER_MATH:calc,
 isQolEnabled:()=>true,
 addEventListener(){},
 setTimeout(){return 1;}
};
const uiDoc={readyState:'loading',addEventListener(){}};
new Function('window','document','location','MutationObserver',ui)(
 uiWindow,uiDoc,{origin:'https://tr2nx3.kingdoms.com'},function(){});
const api=uiWindow.APES_OASIS_SNIPER;
assert.ok(api);
const mkRank=(playerId,name)=>({
 getAttribute:key=>key==='tooltip-data-request'?'requestInfluenceData;'+playerId:null,
 querySelector:key=>key==='a.playerLink[playerid]'?{
   getAttribute:attr=>attr==='playerid'?playerId:null,
   textContent:name
 }:null
});
const originalOasis={
 querySelectorAll:()=>[
  mkRank('203','Ruboon'),mkRank('175','Apequinte'),
  mkRank('1171','Kötü Kız'),mkRank('193','Zlorilla'),mkRank('1308','Basic')
 ]
};
assert.deepEqual(api.ranking(originalOasis).map(x=>x.playerId),
 ['203','175','1171','193','1308'],
 'The exact saved oasis hierarchy is discovered without hovering');
assert.equal(api.ranking(originalOasis)[2].name,'Kötü Kız');
const coordinateWrapper={getAttribute:k=>({x:'38',y:'-21'})[k],
 querySelector:()=>({getAttribute:()=>"$root.openPage('map', 'centerId', '536199206_123');"})};
const selectedOasis={querySelectorAll:()=>[],querySelector:q=>
 q==='.contentBoxBody.oasisDetails'?{closest:()=>({querySelector:()=>coordinateWrapper})}:null};
assert.equal(api.oasisId(selectedOasis),'536199206');

const events={};
const coordinates={getAttribute:key=>({x:'38',y:'-21'})[key],
 querySelector:()=>({getAttribute:()=>"$root.openPage('map', 'centerId', '536199206_123');"})};
const gameOasis={closest:()=>({querySelector:()=>coordinates})};
const doc={
 cookie:'t5SessionKey='+encodeURIComponent(JSON.stringify({key:'test-session-key'})),
 querySelector:()=>gameOasis,
 querySelectorAll:selector=>{assert.match(selector,/requestInfluenceData/);return [
  {getAttribute:()=> 'requestInfluenceData;203'},
  {getAttribute:()=> 'requestInfluenceData;175'},
  {getAttribute:()=> 'requestInfluenceData;1171'}
 ];}
};
const loc={origin:'https://tr2nx3.kingdoms.com'};
const calls=[];
const serverReplies=[
 {response:{villages:[{name:'Silverback',population:486,distance:2.2,influence:221}]}},
 {response:{villages:{a:{influence:140},b:{influence:100}}}},
 {response:{totalInfluence:1000,influenceFromTroops:700}}
];
const gameWindow={
 addEventListener(type,fn){events[type]=fn;},
 postMessage(payload,origin){this.sent={payload,origin};},
 fetch:async(url,options)=>{
  assert.equal(url,loc.origin+'/api/?c=village&a=getVillagesWithInfluenceOnOasisForPlayer');
  assert.equal(options.method,'POST');
  assert.equal(options.credentials,'same-origin');
  const payload=JSON.parse(options.body);
  assert.equal(payload.controller,'village');
  assert.equal(payload.action,'getVillagesWithInfluenceOnOasisForPlayer');
  assert.equal(payload.params.oasisId,536199206);
  assert.equal(payload.session,'test-session-key');
  calls.push(payload);
  return {ok:true,json:async()=>serverReplies.shift()};
 }
};
const timers=new Set();
function timer(fn){const handle={fn};timers.add(handle);return handle;}
function untimer(handle){timers.delete(handle);}
class FakeAbortController {constructor(){this.signal={}}abort(){}}
new Function('window','document','location','setTimeout','clearTimeout','AbortController',bridge)(
 gameWindow,doc,loc,timer,untimer,FakeAbortController);
const b=gameWindow.APES_OASIS_SNIPER_BRIDGE;
assert.equal(b.currentOasisId(),'536199206');
assert.equal(b.influenceFrom({villageInfluence:221}),221);
assert.equal(b.influenceFrom({villages:[{influence:111},{influence:222}]}),333);
assert.equal(b.influenceFrom([{influence:44},{influence:56}]),100);
assert.equal(b.influenceFrom({totalInfluence:777,troops:444}),null);
assert.equal(b.influenceFrom({villages:[{influence:10},{influence:null}]}),null);

(async()=>{
 const good=await b.probe('203','536199206');
 assert.equal(good.status,'ok');assert.equal(good.villageInfluence,221);
 const dict=await b.probe('175','536199206');
 assert.equal(dict.status,'ok');assert.equal(dict.villageInfluence,240);
 const ambiguity=await b.probe('1171','536199206');
 assert.equal(ambiguity.status,'unrecognised-response');
 assert.equal((await b.probe('203','555')).status,'oasis-changed');
 assert.equal((await b.probe('999','536199206')).status,'player-not-in-current-oasis');
 assert.equal(calls.length,3,'Only player/oasis IDs in native DOM trigger API calls');
 serverReplies.push({response:{villages:[{influence:221}]}});
 await events.message({
  source:gameWindow,origin:loc.origin,
  data:{source:'APES_QOL_OASIS_SNIPER_UI',type:'INFLUENCE_REQUEST',
   requestId:'request_001',playerId:'203',oasisId:'536199206'}
 });
 assert.equal(gameWindow.sent.origin,loc.origin);
 assert.equal(gameWindow.sent.payload.source,'APES_QOL_OASIS_SNIPER_BRIDGE');
 assert.equal(gameWindow.sent.payload.villageInfluence,221);
 assert.equal(JSON.stringify(gameWindow.sent).includes('test-session-key'),false);
 assert.doesNotMatch(ui,/dispatchEvent\(\s*new MouseEvent|\.hover\(|mouseenter/);
 console.log('Oasis Sniper: same-origin read-only API, village-only sums, exact oasis identity and no manual hovering passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
