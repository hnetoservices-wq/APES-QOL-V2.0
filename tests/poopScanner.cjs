'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/features/poopScanner.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/features/poopScanner.css'),'utf8');
const menu=fs.readFileSync(path.join(root,'js/ui/menu.js'),'utf8');
const toolbar=fs.readFileSync(path.join(root,'js/ui/toolbar.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.doesNotThrow(()=>new Function(src));
const isolated=manifest.content_scripts.find(x=>x.world!=='MAIN'&&x.js.includes('js/features/secretSocietyScanner.js'));
assert.ok(isolated);
assert.ok(isolated.js.indexOf('js/features/poopScanner.js')>isolated.js.indexOf('js/features/secretSocietyScanner.js'));
assert.ok(isolated.css.includes('css/features/poopScanner.css'));
assert.match(menu,/key: 'poopScanner'/);
assert.match(toolbar,/id: 'apes-poop-launcher'[\s\S]*?key: 'poopScanner'/);
assert.match(css,/window\.mapCellDetails tr\.apes-poop-add-row/);
const html=[
  '<!doctype html><html><body><window class="modalWrapper mapCellDetails">',
  '<div class="contentHeader"><h2><span>AHH APES</span></h2></div>',
  '<div class="mapCellDetails"><div class="contentBox">',
  '<div class="villageDetails contentBoxHeader headerColored"><h6>Village details',
  '<span class="coordinateWrapper" x="40" y="-40">',
  '<a clickable="$root.openPage('+"'map', 'centerId', '535576616_1793362003'"+');">(40|-40)</a>',
  '</span></h6></div><table class="transparent contentBoxBody"><tbody>',
  '<tr><th>Owner</th><td><a class="playerLink" playerid="126" playername="tjabanZEE">tjabanZEE</a></td></tr>',
  '<tr><th>Kingdom</th><td>APE</td></tr>',
  '<tr><th>Tribe</th><td>Gauls</td></tr>',
  '<tr><th>Population</th><td>259</td></tr>',
  '</tbody></table></div></div></window></body></html>'
].join('');
const dom=new JSDOM(html,{url:'https://tr2nx3.kingdoms.com/#/page:map/cellId:535576616/window:mapCellDetails',runScripts:'outside-only'});
const {window}=dom;
window.isQolEnabled=()=>true;
window.APES={ui:{closeOtherTools(){}},actions:{register(){}}};
const server='tr2nx3_kingdoms_com';
const scans=[
 {id:'1',name:'Unrelated',members:[{playerId:'999',name:'tjabanZEE'}]},
 {id:'2',name:'APES Friends',members:[{playerId:'126',name:'tjabanZEE'}]}
];
window.localStorage.setItem('apes_secret_society_scans_v1',JSON.stringify({[server]:scans}));
window.eval(src);
const api=window.APES_POOP_SCANNER;
assert.ok(api);
assert.equal(api.hasMember('126','tjabanZEE').societyName,'APES Friends');
assert.equal(api.hasMember('777','tjabanZEE'),null);
assert.equal(api.hasMember('123','unknown'),null);
const modal=window.document.querySelector('window.modalWrapper');
const info=api.getVillageInfo(modal);
assert.equal(info.owner,'tjabanZEE');
assert.equal(info.playerId,'126');
assert.equal(info.villageName,'AHH APES');
assert.equal(info.x,40);
assert.equal(info.y,-40);
assert.equal(info.cellId,'535576616');
assert.equal(info.societyName,'APES Friends');
api.refresh();
const popRow=Array.from(modal.querySelectorAll('tr')).find(tr=>tr.querySelector('th')?.textContent.trim()==='Population');
let row=modal.querySelector('.apes-poop-add-row');
assert.ok(row,'Eligible village has the POOP action');
assert.equal(popRow.nextElementSibling,row,'Action immediately below Population');
assert.match(row.textContent,/Add Player to POOP/);
api.refresh();
assert.equal(modal.querySelectorAll('.apes-poop-add-row').length,1);
row.querySelector('[role="button"]').click();
assert.equal(api.getEntries().length,1);
const saved=api.getEntries()[0];
assert.equal(saved.owner,'tjabanZEE');
assert.equal(saved.villageName,'AHH APES');
assert.equal(saved.playerId,'126');
assert.equal(saved.x,40);
assert.equal(saved.y,-40);
assert.equal(saved.url,'https://tr2nx3.kingdoms.com/#/page:map/cellId:535576616/window:mapCellDetails');
assert.match(row.textContent,/Saved to POOP/);
assert.equal(api.addVillage(info),true);
assert.equal(api.getEntries().length,1,'CellId deduplicates saved villages');
api.open();
assert.ok(window.document.getElementById('apes-poop-panel').classList.contains('is-open'));
assert.match(window.document.querySelector('[data-poop-count]').textContent,/1 village saved/);
window.isQolEnabled=key=>key!=='poopScanner';
api.refresh();
assert.equal(modal.querySelector('.apes-poop-add-row'),null);
window.isQolEnabled=()=>true;
api.refresh();
assert.ok(modal.querySelector('.apes-poop-add-row'));
window.localStorage.setItem('apes_secret_society_scans_v1',JSON.stringify({[server]:[scans[0]]}));
api.refresh();
assert.equal(modal.querySelector('.apes-poop-add-row'),null,'Owner not in saved SS does not get action');
assert.equal(api.getEntries().length,1,'Saved entries persist independently');
assert.equal(api.removeVillage('535576616'),true);
assert.equal(api.getEntries().length,0);
assert.equal(api.removeVillage('535576616'),false);
assert.match(window.document.querySelector('.apes-poop-empty').textContent,/No villages saved/);
window.localStorage.removeItem('apes_secret_society_scans_v1');
api.refresh();
assert.equal(modal.querySelector('.apes-poop-add-row'),null);
dom.window.close();
console.log('POOP: SS ID matching, conditional map action, capture, dedupe, UI, removal and toggling passed.');
