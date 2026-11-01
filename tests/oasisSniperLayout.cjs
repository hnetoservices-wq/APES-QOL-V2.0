'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..');
const math=fs.readFileSync(path.join(base,'js/modules/oasisSniper/math.js'),'utf8');
const ui=fs.readFileSync(path.join(base,'js/features/oasisSniperChecker.js'),'utf8');
const css=fs.readFileSync(path.join(base,'css/features/oasisSniperChecker.css'),'utf8');
assert.doesNotThrow(()=>new Function(ui));
assert.match(css,/\.apes-sniper-view-select/);
assert.match(css,/\.apes-sniper-view-active[\s\S]*?\.contentBoxBody\.oasisProduction/);
assert.match(css,/\.apes-sniper-view-active[\s\S]*?\.apes-oasis-sniper/);
const contentFragment=[
'<window class="modalWrapper mapCellDetails">',
'<div class="contentBox leftBox"><div class="contentBoxBody oasisDetails occupied">',
'<div tooltip-data-request="requestInfluenceData;203"><a class="playerLink" playerid="203">Ruboon</a></div>',
'<div tooltip-data-request="requestInfluenceData;175"><a class="playerLink" playerid="175">Apequinte</a></div>',
'</div></div>',
'<div class="contentBox rightBox"><div ng-include="">',
'<div class="villageDetails contentBoxHeader headerColored">',
'<h6><span translate><span>Production</span></span></h6></div>',
'<div class="contentBoxBody oasisProduction" ng-class="{assigned: isInTop5}">',
'<span class="original-native-production">281/h</span></div>',
'</div></div></window>'
].join('');
(async()=>{
 const dom=new JSDOM('<!doctype html><html><body>'+contentFragment+'</body></html>',{
  url:'https://tr2nx3.kingdoms.com/#/page:map',runScripts:'outside-only'
 });
 const {window}=dom;
 window.isQolEnabled=()=>true;
 window.eval(math);
 window.eval(ui);
 // JSDOM may still be in "loading" state after eval.
 window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
 const api=window.APES_OASIS_SNIPER;
 const right=window.document.querySelector('.contentBox.rightBox');
 const select=right.querySelector('.apes-sniper-view-select');
 const sniper=right.querySelector('.apes-oasis-sniper');
 assert.ok(select&&sniper,'Selector and scanner inserted in native right panel');
 assert.equal(right.parentElement.querySelector('.leftBox .apes-oasis-sniper'),null,
  'Oasis rank list remains untouched');
 assert.equal(select.value,'production','Production is the original default');
 assert.equal(right.classList.contains('apes-sniper-view-active'),false);
 assert.ok(right.querySelector('.original-native-production'),'Native Production data not removed');
 assert.equal(right.querySelectorAll('.apes-oasis-sniper').length,1);
 select.value='sniper';
 select.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(window.localStorage.getItem('apes_oasis_sniper_view_v1'),'sniper');
 assert.equal(right.classList.contains('apes-sniper-view-active'),true);
 assert.equal(api.getView(),'sniper');
 select.value='production';
 select.dispatchEvent(new window.Event('change',{bubbles:true}));
 assert.equal(api.getView(),'production');
 assert.equal(right.classList.contains('apes-sniper-view-active'),false);
 select.value='sniper';
 select.dispatchEvent(new window.Event('change',{bubbles:true}));
 window.document.querySelector('window.modalWrapper.mapCellDetails').remove();
 const replacement=window.document.createElement('div');
 replacement.innerHTML=contentFragment;
 window.document.body.appendChild(replacement);
 await new Promise(resolve=>setTimeout(resolve,250));
 const fresh=window.document.querySelector('window.modalWrapper.mapCellDetails .contentBox.rightBox');
 assert.ok(fresh.querySelector('.apes-sniper-view-select'));
 assert.equal(fresh.querySelector('.apes-sniper-view-select').value,'sniper');
 assert.ok(fresh.classList.contains('apes-sniper-view-active'));
 assert.equal(fresh.querySelectorAll('.apes-oasis-sniper').length,1);
 assert.ok(fresh.querySelector('.original-native-production'));

 const a=ui.indexOf('  function resultsTable(rows){');
 const b=ui.indexOf('  function render(box,rows){',a);
 assert.ok(a>=0 && b>a);
 const findings=new Function('math','html',
   ui.slice(a,b)+'return resultsTable;')(
   window.APES_OASIS_SNIPER_MATH,v=>v
 );
 const table=findings([
  {playerId:'1',name:'Ruben',villageInfluence:134.2},
  {playerId:'2',name:'Restos',villageInfluence:240},
  {playerId:'3',name:'req',villageInfluence:660}
 ]);
 assert.match(table,/>135<\/td>/,'Influence 134.2 rounds up to 135');
 assert.match(table,/526 units minimum/,'Minimum uses raw influence');
 assert.match(table,/421 units minimum/);
 assert.match(table,/Unproven/);
 assert.doesNotMatch(table,/Troops required|Unknown|Not proven|Rank \d+ above/);
 dom.window.close();
 console.log('Oasis Sniper: native Production dropdown, persistence across oasis popups, and compact rounded findings passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
