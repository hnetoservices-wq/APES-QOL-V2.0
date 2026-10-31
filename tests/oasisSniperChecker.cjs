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

const events={};
const fakeRows=['203','175'].map(id=>({
  getAttribute:key=>key==='tooltip-data-request'?'requestInfluenceData;'+id:null
}));
const fakeScope={
 requestInfluenceData(playerId){
  return playerId===203
    ? Promise.resolve({villages:[
      {name:'Silverback',population:486,distance:2.2,influence:221}
    ]})
    : Promise.resolve({totalInfluence:999,influenceFromTroops:101});
 }
};
const gameWindow={
 angular:{element:()=>({scope:()=>({$parent:fakeScope})})},
 addEventListener(type,fn){events[type]=fn;},
 postMessage(payload){this.sent=payload;},
};
const doc={querySelectorAll:selector=>{
  assert.match(selector,/requestInfluenceData/);
  return fakeRows;
}};
const location={origin:'https://tr2nx3.kingdoms.com'};
new Function('window','document','location','setTimeout',bridge)(
  gameWindow,doc,location,(callback)=>{callback();return 0;});
const b=gameWindow.APES_OASIS_SNIPER_BRIDGE;
assert.equal(b.influenceFrom({villageInfluence:221}),221);
assert.equal(b.influenceFrom({influenceFromVillages:350}),350);
assert.equal(b.influenceFrom({villages:[{influence:111},{influence:222}]}),333);
assert.equal(b.influenceFrom({totalInfluence:777,troops:444}),null,
  'Never treat total influence with hidden troops as natural influence');
assert.equal(b.influenceFrom({villages:[{influence:10},{influence:null}]}),null,
  'Incomplete village lists must not manufacture a sum');

(async()=>{
 const good=await b.probe('203');
 assert.equal(good.status,'ok');
 assert.equal(good.villageInfluence,221);
 const bad=await b.probe('175');
 assert.equal(bad.status,'unrecognised-response');
 const missing=await b.probe('1234');
 assert.equal(missing.status,'player-not-in-current-oasis');
 await events.message({
  source:gameWindow,origin:location.origin,
  data:{source:'APES_QOL_OASIS_SNIPER_UI',type:'INFLUENCE_REQUEST',
    requestId:'request_001',playerId:'203'}
 });
 assert.equal(gameWindow.sent.source,'APES_QOL_OASIS_SNIPER_BRIDGE');
 assert.equal(gameWindow.sent.requestId,'request_001');
 assert.equal(gameWindow.sent.villageInfluence,221);
 assert.doesNotMatch(ui,/dispatchEvent\(\s*new MouseEvent|\.hover\(|mouseenter/,
  'Hover-free request does not fake pointer movement');
 console.log('Oasis Sniper: verified natural influence, conservative troop proof, failed-closed unknowns and hoverless bridge.');
})().catch(error=>{console.error(error);process.exitCode=1;});
