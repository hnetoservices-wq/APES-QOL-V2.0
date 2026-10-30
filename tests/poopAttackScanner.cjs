'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const rootPath = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(rootPath, 'js/features/poopScanner.js'), 'utf8');
const css = fs.readFileSync(path.join(rootPath, 'css/features/poopScanner.css'), 'utf8');
assert.doesNotThrow(() => new Function(source));
assert.match(css, /#apes-poop-scan-lock/);
assert.match(css, /apes-poop-scan-button/);
const now = Date.now();
const early = Math.floor((now + 600000) / 1000);
const later = early + 300;
const villages = [
  {cellId:'11111',x:40,y:-40,owner:'ApeOne',playerId:'126',villageName:'Ape Village',url:'https://tr2nx3.kingdoms.com/#/page:map/cellId:11111/window:mapCellDetails'},
  {cellId:'22222',x:41,y:-40,owner:'ApeTwo',playerId:'127',villageName:'Empty Village',url:'https://tr2nx3.kingdoms.com/#/page:map/cellId:22222/window:mapCellDetails'},
  {cellId:'33333',x:42,y:-40,owner:'ApeThree',playerId:'128',villageName:'Other Village',url:'https://tr2nx3.kingdoms.com/#/page:map/cellId:33333/window:mapCellDetails'}
];
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url:'https://tr2nx3.kingdoms.com/#/page:map',
  runScripts:'outside-only'
});
const {window} = dom;
const doc = window.document;
window.isQolEnabled = () => true;
window.APES = {ui:{closeOtherTools(){}},actions:{register(){}}};
window.localStorage.setItem('apes_poop_villages_v1',JSON.stringify({
  tr2nx3_kingdoms_com:villages
}));
const attacks = id => {
  if (id !== '11111' && id !== '33333') return '';
  const clock = id === '11111' ? early : later;
  const count = id === '11111' ? 2 : 1;
  return '<ul class="attackContainer infoMovements troopMovements">' +
    '<li class="infoMovementType incoming incoming_attacks">' +
    '<i class="movement_attack_small_flat_black"></i>' +
    '<div class="countdown" countdown="'+clock+'">00:10:00</div>' +
    '<div class="count">'+count+'</div></li></ul>';
};
function popupHtml(entry) {
  return '<window class="modalWrapper mapCellDetails">' +
    '<div class="modal mapCellDetails">' +
    '<div class="contentHeader"><h2><span>'+entry.villageName+'</span></h2></div>' +
    '<div class="mapCellDetails"><div class="mapContainer village">'+attacks(entry.cellId)+'</div>' +
    '<div class="villageDetails contentBoxHeader headerColored">' +
    '<span class="coordinateWrapper" x="'+entry.x+'" y="'+entry.y+'">' +
    '<a clickable="$root.openPage(&quot;map&quot;, &quot;centerId&quot;, &quot;'+entry.cellId+'_123&quot;)">Coords</a>' +
    '</span></div>' +
    '<table><tbody><tr><th>Owner</th><td><a class="playerLink" playerid="'+entry.playerId+'">'+entry.owner+'</a></td></tr>' +
    '<tr><th>Population</th><td>100</td></tr></tbody></table></div></div></window>';
}
function renderCurrentCell() {
  doc.querySelectorAll('window.modalWrapper.mapCellDetails').forEach(node => node.remove());
  const cellId = window.location.hash.match(/cellId:(\d+)/)?.[1];
  const entry = villages.find(item => item.cellId === cellId);
  if (entry) doc.body.insertAdjacentHTML('beforeend', popupHtml(entry));
}
window.addEventListener('hashchange',renderCurrentCell);
window.eval(source);
const api = window.APES_POOP_SCANNER;
assert.ok(api);
renderCurrentCell();

(async () => {
  const standalone = doc.createElement('div');
  standalone.innerHTML = popupHtml(villages[0]);
  const ticks = api.attackTimers(standalone, now);
  assert.equal(ticks.total,2);
  assert.equal(ticks.arrivals.length,1);
  assert.equal(ticks.arrivals[0].arrivalAt,early*1000);
  assert.equal(ticks.unreadable,0);
  const cleanSample = doc.createElement('div');
  cleanSample.innerHTML = '<ul class="infoMovements"><li class="outgoing_attacks"><div countdown="'+early+'"></div></li></ul>';
  assert.equal(api.attackTimers(cleanSample,now).arrivals.length,0,'Ignore outgoing attacks');
  const incomplete = doc.createElement('div');
  incomplete.innerHTML = '<ul class="attackContainer infoMovements"><li class="incoming_attacks"><div class="countdown">00:02:00</div></li></ul>';
  assert.equal(api.attackTimers(incomplete,now).unreadable,1,'Do not treat unreadable timer as no attack');
  const initialHash = window.location.hash;
  const result = await api.scan();
  assert.equal(result,true,'Scan should verify all 3 village popups');
  const report = api.getScan();
  assert.equal(report.results.length,3);
  assert.equal(report.complete,true);
  assert.deepEqual(report.results.map(item => item.status),['attacked','clear','attacked']);
  assert.equal(report.results[0].total,2);
  assert.equal(report.results[0].arrivalAt,early*1000);
  assert.equal(report.results[2].arrivalAt,later*1000);
  assert.equal(window.location.hash,initialHash,'Route restored after scan');
  assert.equal(api.getEntries().length,3,'Scan does not mutate village list');
  assert.match(doc.querySelector('[data-poop-results]').textContent,/2 villages under attack/);
  assert.ok(doc.querySelector('[data-poop-results]').textContent.includes('Ape Village'));
  assert.ok(!doc.querySelector('[data-poop-results]').textContent.includes('Empty Village'));
  assert.equal(doc.querySelector('#apes-poop-scan-lock'),null,'Lock removed after scan');
  dom.window.close();
  console.log('POOP attack scanner: countdown parsing, incoming-only filter, 3-village navigation, summary and route restoration passed.');
})().catch(error => {dom.window.close();console.error(error);process.exitCode=1;});
