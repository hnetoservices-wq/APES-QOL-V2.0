'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const math=fs.readFileSync(path.join(root,'js/modules/oasisSniper/math.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'js/features/oasisSniperChecker.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/features/oasisSniperChecker.css'),'utf8');

assert.match(css,/border-radius:5px!important;background:linear-gradient/,
 'The visible selector arrow has a contrasting rounded square');
assert.doesNotMatch(ui,/Check influence|Checked ['"]?\+|proven troop-presence cases|apes-sniper-trigger|apes-sniper-status/);
assert.doesNotMatch(ui,/<strong>Oasis Sniper<\/strong>/,
 'Native selected view is the only Oasis Sniper heading');

function oasis(oasisCell,players){
 const ranks=players.map(([id,name])=>
  '<div tooltip-data-request="requestInfluenceData;'+id+'">'+
  '<a class="playerLink" playerid="'+id+'">'+name+'</a></div>').join('');
 return [
  '<window class="modalWrapper mapCellDetails">',
   '<div class="contentBox leftBox">',
    '<div class="coordinateWrapper" x="38" y="-21">',
     '<span clickable="$root.openPage('+"'map', 'centerId', '"+oasisCell+"_123'"+')"></span>',
    '</div>',
    '<div class="contentBoxBody oasisDetails">'+ranks+'</div>',
   '</div>',
   '<div class="contentBox rightBox">',
    '<div class="villageDetails contentBoxHeader"><h6><span translate>Production</span></h6></div>',
    '<div class="contentBoxBody oasisProduction"><strong>Native production remains</strong></div>',
   '</div>',
  '</window>'
 ].join('');
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,description){
 for(let i=0;i<100;i++){if(check())return;await delay(20);}
 throw Error('Timed out: '+description);
}
(async()=>{
 const initial=oasis('536199206',[['203','Ruboon'],['175','Apequinte']]);
 const dom=new JSDOM('<!doctype html><html><body>'+initial+'</body></html>',{
  url:'https://tr2nx3.kingdoms.com/#/page:map',runScripts:'outside-only'
 });
 const w=dom.window;
 const calls=[];
 w.isQolEnabled=()=>true;
 w.addEventListener('message',event=>{
  if(event.data?.source!=='APES_QOL_OASIS_SNIPER_UI'||
     event.data?.type!=='INFLUENCE_REQUEST')return;
  calls.push({playerId:event.data.playerId,oasisId:event.data.oasisId});
  const amounts={'203':221.3,'175':180,'999':150,'888':50};
  w.dispatchEvent(new w.MessageEvent('message',{
    source:w,origin:w.location.origin,data:{
      source:'APES_QOL_OASIS_SNIPER_BRIDGE',type:'INFLUENCE_RESULT',
      requestId:event.data.requestId,playerId:event.data.playerId,oasisId:event.data.oasisId,
      status:'ok',villageInfluence:amounts[event.data.playerId]
    }
  }));
 });
 w.eval(math);w.eval(ui);
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const api=w.APES_OASIS_SNIPER;
 await until(()=>calls.length===2&&api.getLastResults()?.length===2,
  'first oasis auto scan (default Production selection)');
 assert.deepEqual(calls.map(x=>x.playerId),['203','175']);
 assert.equal(api.getView(),'production','Default still uses Production');
 let right=w.document.querySelector('.contentBox.rightBox');
 assert.equal(right.querySelector('.apes-sniper-head'),null);
 assert.equal(right.querySelector('.apes-sniper-trigger'),null);
 assert.equal(right.querySelector('.apes-sniper-status'),null);
 assert.equal(right.querySelector('.apes-sniper-summary'),null);
 assert.equal(right.querySelectorAll('.apes-oasis-sniper').length,1);
 assert.ok(right.querySelector('.contentBoxBody.oasisProduction'));
 const select=right.querySelector('select.apes-sniper-view-select');
 select.value='sniper';select.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(api.getView(),'sniper');
 assert.equal(right.querySelector('select').value,'sniper');
 assert.equal(w.localStorage.getItem('apes_oasis_sniper_view_v1'),'sniper');
 assert.equal(right.classList.contains('apes-sniper-view-active'),true);
 assert.match(right.querySelector('.apes-sniper-results').textContent,/222/,
  'Influence 221.3 is displayed rounded upwards');
 assert.doesNotMatch(right.querySelector('.apes-sniper-results').textContent,/Checked|proven troop/);
 await delay(380);
 assert.equal(calls.length,2,'Repeated MutationObserver passes must not retrigger scans');

 // Open another oasis. Its details can replace the old modal.
 w.document.querySelector('window.modalWrapper.mapCellDetails').remove();
 w.document.body.insertAdjacentHTML('beforeend',
  oasis('536199207',[['999','Other Player'],['888','Second Player']]));
 await until(()=>calls.length===4&&
  api.getLastResults()?.[0]?.playerId==='999','second oasis auto scan');
 right=w.document.querySelector('.contentBox.rightBox');
 assert.equal(right.querySelector('select').value,'sniper',
  'Last view is automatically selected in a new oasis');
 assert.ok(right.classList.contains('apes-sniper-view-active'));
 assert.deepEqual(calls.slice(2).map(x=>x.playerId),['999','888']);
 assert.equal(right.querySelectorAll('.apes-oasis-sniper').length,1);
 await delay(350);
 assert.equal(calls.length,4,'No duplicate API requests on repeated UI mutations');

 // Rapid switch back to Production is presentation-only, no additional scan.
 select.value='production';
 api.setView('production');
 await delay(200);
 assert.equal(api.getView(),'production');
 assert.equal(calls.length,4);
 dom.window.close();
 console.log('Oasis Sniper: automatic scan once per oasis, remembered view, clean panel, and no duplicate requests passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
