'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/modules/royalTributes/liveCountdown.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/features/royalTributeCountdown.css'),'utf8');
const menu=fs.readFileSync(path.join(root,'js/ui/menu.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const math=require('../js/modules/royalTributes/etaCalculator.js');
assert.doesNotThrow(()=>new Function(src));
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
for(const name of ['.qol-royal-tribute-village-count','.qol-royal-tribute-production-total',
 '.qol-royal-tribute-eta-head','.qol-royal-tribute-eta-cell','.qol-royal-tribute-eta[data-tone="ready"]'])
 assert.ok(css.includes(name),'Missing styling: '+name);
// Keep the native Collect button alignment and make both header metrics
// look like unframed text immediately followed by the game's existing icons.
const inlineHeaders=css.slice(
  css.indexOf('/* Plain native-looking inline header metrics'),
  css.indexOf('/* Keep the *original* Travian button')
);
assert.ok(inlineHeaders.length>100);
assert.match(css,/:is\(\.tributeVillages,\.foreignVillages\)\.qol-royal-tributes-active/);
assert.match(inlineHeaders,/\.qol-royal-tribute-village-count,/);
assert.match(inlineHeaders,/\.qol-royal-tribute-production-total\s*\{/);
for(const declaration of [
  'position:static!important;', 'display:inline-block!important;',
  'border:none!important;', 'background:none!important;',
  'background-color:transparent!important;', 'transform:none!important;',
  'margin:0 5px 0 0!important;', 'vertical-align:middle!important;'
]) assert.ok(inlineHeaders.includes(declaration),'Inline header style missing '+declaration);
assert.match(inlineHeaders,/th:first-child\s*>\s*i\.village_village_small_flat_black/);
assert.match(inlineHeaders,/th:nth-child\(2\)\s*>\s*i\.movement_tribute_small_flat_black/);
assert.doesNotMatch(inlineHeaders,/top:18px!important|top:43px!important|left:50%!important/);
assert.match(css,/\.collectTributesContainer\s*\{[\s\S]*?display:grid!important/);
// The game's original button remains the click target. We hide its sprite
// internals and insert a real text span (not a clipped ::after pseudo-label).
assert.match(css,/grid-template-columns:minmax\(0,1fr\) 82px!important/);
assert.match(css,/\.collectTributesContainer\s*>\s*button\s*>\s*:not\(\.qol-royal-collect-label\)/);
assert.match(css,/\.collectTributesContainer\s*>\s*button\s*>\s*\.qol-royal-collect-label/);
assert.match(css,/\.collectTributesContainer\s*>\s*button:disabled/);
assert.doesNotMatch(css,/\.innerText::after|content:"Collect"!important/);
assert.match(src,/button\.appendChild\(label\)/);
assert.doesNotMatch(src,/button\.click\(|dispatchEvent\(|innerText\.textContent\s*=/);
// A dispatched tribute uses a completely different PREMIUM action:
 // it has a Gold cost and must NEVER be relabelled as an ordinary Collect.
assert.match(src,/button\[clickable\^="fetchTribute\("\]/);
assert.match(src,/\.tributeOnTheWay/);
assert.match(css,/\.qol-royal-tribute-transit-panel/);
assert.match(css,/button\[premium-feature="tributeFetchInstantly"\]/);
assert.match(css,/\.price\.gold/);
assert.match(menu,/key: 'royalTributeCountdown'/);
assert.deepEqual(manifest.content_scripts.find(x=>x.world==='MAIN').js.slice(-2),
 ['js/modules/royalTributes/etaCalculator.js','js/modules/royalTributes/liveCountdown.js']);

const all=[];
class Node {
 constructor(tag,cls='') {
  this.tagName=tag;this.className=cls;this.children=[];this.parent=null;
  this.dataset={};this.textContent='';this.title='';this.firstChild=null;
  this.classes=new Set(cls.split(/\s+/).filter(Boolean));
  this.classList={
   add:cls=>{this.classes.add(cls);this.className=[...this.classes].join(' ')},
   remove:cls=>{this.classes.delete(cls);this.className=[...this.classes].join(' ')},
   contains:cls=>(this.className||'').split(/\s+/).includes(cls),
   toggle:(cls,on)=>{if(on===undefined)on=!this.classList.contains(cls);
      if(on)this.classList.add(cls);else this.classList.remove(cls);
      return on;}
  };
  all.push(this);
 }
 appendChild(node){this.children.push(node);node.parent=this;node.parentElement=this;this.firstChild=this.children[0];return node}
 insertBefore(node,before){const idx=this.children.indexOf(before);this.children.splice(idx<0?0:idx,0,node);node.parent=this;node.parentElement=this;this.firstChild=this.children[0];return node}
 remove(){if(!this.parent)return;this.parent.children=this.parent.children.filter(x=>x!==this);this.parent.firstChild=this.parent.children[0]||null;this.parent=null;this.parentElement=null}
 setAttribute(){}
 matches(sel) {
   if(sel===this.tagName)return true;
   if(sel==='button[clickable^="fetchTribute("]')return this.tagName==='button'&&String(this.clickable||'').startsWith('fetchTribute(');
   if(sel==='button[premium-feature]')return this.tagName==='button'&&!!this.premiumFeature;
   if(sel==='button[premium-feature] .qol-royal-collect-label')
     return this.classList.contains('qol-royal-collect-label')&&!!this.closest('button[premium-feature]');
   if(sel.startsWith('.'))return sel.slice(1).split('.').every(cls=>this.classList.contains(cls));
   const m=sel.match(/^(th|td)\.([a-zA-Z0-9_-]+)$/);
   if(m)return this.tagName===m[1]&&this.classList.contains(m[2]);
   return false;
 }
 descendants(){return this.children.flatMap(x=>[x,...x.descendants()])}
 querySelector(sel){return this.querySelectorAll(sel)[0]||null}
 querySelectorAll(sel){const terms=sel.split(',').map(s=>s.trim());return this.descendants().filter(e=>terms.some(s=>e.matches(s)))}
 closest(sel){let x=this;while(x){if(x.matches(sel))return x;x=x.parent}return null}
}
function rowFor(id) {
 const row=new Node('tr');
 const player=new Node('td','playerColumn');row.appendChild(player);
 const a=new Node('a');a.getAttribute=k=>k==='villageid'?id:'';player.appendChild(a);
 const collect=new Node('td','collect');row.appendChild(collect);
 const native=new Node('div','collectTributesContainer');collect.appendChild(native);
 const nativeButton=new Node('button');nativeButton.clickable='fetchTribute(village.data.villageId);';native.appendChild(nativeButton);
 row.querySelector=(sel)=>{
  if(sel==='td.playerColumn [villageid]')return a;
  if(sel==='td.collect')return collect;
  return Node.prototype.querySelector.call(row,sel);
 };
 collect.querySelector=sel=>Node.prototype.querySelector.call(collect,sel);
 return {row,collect,native};
}
const wrapper=new Node('div','tributeVillages'), table=new Node('table','gradient');
wrapper.appendChild(table);
const thead=new Node('thead');table.appendChild(thead);
const headRow=new Node('tr');thead.appendChild(headRow);
const head1=new Node('th'),head2=new Node('th');
headRow.appendChild(head1);headRow.appendChild(head2);
head1.appendChild(new Node('i'));head2.appendChild(new Node('i'));
const tbody=new Node('tbody');table.appendChild(tbody);
const a=rowFor('536592428'),b=rowFor('536559663'),c=rowFor('536526891');
const originalButtonA=a.native.querySelector('button');
const originalButtonB=b.native.querySelector('button');
originalButtonB.disabled=true;
tbody.appendChild(a.row);tbody.appendChild(b.row);tbody.appendChild(c.row);
c.collect.classList.add('notConnected');
const dataReady={allowTributeCollection:1,canFetchTributes:true,tributeProduction:262,
 timeUntilTributeFetch:Date.now()/1000-60};
const dataPending={allowTributeCollection:1,canFetchTributes:false,tributeProduction:193,
 timeUntilTributeFetch:Date.now()/1000+4*3600+59*60};
const cache={
 'Village:536592428':{data:dataReady},'Village:536559663':{data:dataPending},
 'Village:536526891':{data:{tributeProduction:800}},
 'Village:536526892':{data:{
   tributeProduction:128,
   allowTributeCollection:1,
   canFetchTributes:false,
   timeUntilTributeFetch:Date.now()/1000+2*3600+19*60
 }}
};
table.querySelector=sel=>{
 if(sel==='thead tr')return headRow;
 return Node.prototype.querySelector.call(table,sel);
};
table.querySelectorAll=sel=>{
 if(sel.startsWith('tbody tr['))return [a.row,b.row,c.row];
 return Node.prototype.querySelectorAll.call(table,sel);
};
// Foreign governors use a separate controller/table/row binding but the same
// official Cache.c Village model. A protected/connected row is eligible;
 // an unprotected row with no native collection widget must stay unchanged.
const foreignWrapper=new Node('div','foreignVillages');
const foreignTable=new Node('table','gradient');
foreignWrapper.appendChild(foreignTable);
const foreignThead=new Node('thead'); foreignTable.appendChild(foreignThead);
const foreignHeader=new Node('tr'); foreignThead.appendChild(foreignHeader);
const foreignHouse=new Node('th'),foreignTribute=new Node('th');
foreignHeader.appendChild(foreignHouse);foreignHeader.appendChild(foreignTribute);
foreignHouse.appendChild(new Node('i'));foreignTribute.appendChild(new Node('i'));
const foreignBody=new Node('tbody');foreignTable.appendChild(foreignBody);
const foreign=rowFor('536526892'),foreignUnprotected=rowFor('536526893');
foreignBody.appendChild(foreign.row);foreignBody.appendChild(foreignUnprotected.row);
foreignUnprotected.native.remove();
foreignTable.querySelector=sel=>sel==='thead tr'
  ?foreignHeader:Node.prototype.querySelector.call(foreignTable,sel);
foreignTable.querySelectorAll=sel=>sel.startsWith('tbody tr[')
  ?[foreign.row,foreignUnprotected.row]:Node.prototype.querySelectorAll.call(foreignTable,sel);
const foreignNativeButton=foreign.native.querySelector('button');

const document={
 readyState:'loading',
 querySelector:sel=>sel==='.tributeVillages table.gradient'?table:
   sel==='.foreignVillages table.gradient'?foreignTable:null,
 createElement:tag=>new Node(tag),
 addEventListener(){}
};
let runner=null,enabled=true;
const window={
 Cache:{c:cache},
 APES:{royalTributeEtaMath:math},
 localStorage:{getItem:()=>enabled?null:'false'},
 setInterval:fn=>{runner=fn}
};
new Function('window','document',src)(window,document);
assert.equal(typeof runner,'function');
runner();
assert.ok(wrapper.classList.contains('qol-royal-tributes-active'));
assert.ok(foreignWrapper.classList.contains('qol-royal-tributes-active'));
assert.equal(foreignHeader.querySelectorAll('th').length,3,'Foreign governors have ETA header');
assert.equal(foreignHouse.querySelector('.qol-royal-tribute-village-count').textContent,'1','Count foreign villages independently');
assert.equal(foreignTribute.querySelector('.qol-royal-tribute-production-total').textContent,'128 res/h','Foreign hourly production comes from cache');
assert.match(foreign.row.querySelector('.qol-royal-tribute-eta').textContent,/^0[12]h\d{2}m$/,'Foreign ETA uses game timestamp');
assert.equal(foreignNativeButton.querySelector('.qol-royal-collect-label').textContent,'Collect','Foreign native button is compact');
assert.equal(foreignUnprotected.row.querySelector('td.qol-royal-tribute-eta-cell'),null,'Unprotected foreign villages are untouched');
assert.equal(foreignUnprotected.row.children.length,2,'Unprotected foreign row keeps original columns');
assert.equal(a.native.querySelector('button'), originalButtonA, 'Keeps native button node');
assert.equal(b.native.querySelector('button'), originalButtonB, 'Keeps native disabled button node');
assert.equal(originalButtonB.disabled, true, 'Native disabled state remains unchanged');
assert.equal(originalButtonA.querySelector('.qol-royal-collect-label').textContent,'Collect');
assert.equal(originalButtonB.querySelector('.qol-royal-collect-label').textContent,'Collect');
assert.equal(c.native.querySelector('.qol-royal-collect-label'),null,'Disconnected row unmodified');
assert.equal(headRow.querySelectorAll('th').length,3,'Dedicated ETA header');
assert.equal(head1.querySelector('.qol-royal-tribute-village-count').textContent,'2','Connected village count');
assert.equal(head2.querySelector('.qol-royal-tribute-production-total').textContent,'455 res/h','Total from existing tribe cache');
const timerA=a.row.querySelector('td.qol-royal-tribute-eta-cell');
const timerB=b.row.querySelector('td.qol-royal-tribute-eta-cell');
assert.ok(timerA&&timerB);
assert.equal(c.row.querySelector('td.qol-royal-tribute-eta-cell'),null,'Disconnected village excluded');
assert.equal(timerA.querySelector('.qol-royal-tribute-eta').textContent,'Ready');
assert.match(timerB.querySelector('.qol-royal-tribute-eta').textContent,/^0[45]h\d{2}m$/);
assert.doesNotMatch(timerB.querySelector('.qol-royal-tribute-eta').textContent,/until collectible|Ready to collect/);
assert.ok(!a.collect.querySelector('.qol-royal-tribute-eta'),'No ETA under button');
runner();
assert.equal(headRow.querySelectorAll('th').length,3,'No repeated header injection');
assert.equal(foreignHeader.querySelectorAll('th').length,3,'No duplicate Foreign ETA header');
assert.equal(foreign.row.querySelectorAll('td.qol-royal-tribute-eta-cell').length,1,'No duplicate foreign timer cells');
assert.equal(a.row.querySelectorAll('td.qol-royal-tribute-eta-cell').length,1,'No repeated cells');
assert.equal(a.row.children.length,3);
assert.equal(originalButtonA.querySelectorAll('.qol-royal-collect-label').length,1,'No duplicate button labels');
assert.equal(originalButtonB.disabled,true,'Button remains disabled through updates');
assert.ok(a.collect.querySelector('.collectTributesContainer'),'Original collection widget retained');
dataPending.canFetchTributes=true;
runner();
assert.equal(timerB.querySelector('.qol-royal-tribute-eta').textContent,'Ready','Native readiness wins');
dataPending.canFetchTributes=false;
dataPending.tributesOnTheirWay=true;runner();
assert.equal(timerB.querySelector('.qol-royal-tribute-eta').textContent,'On way');
dataPending.tributesOnTheirWay=false;
dataPending.allowTributeCollection=0;runner();
assert.equal(timerB.querySelector('.qol-royal-tribute-eta').textContent,'Denied');
dataPending.allowTributeCollection=1;
dataPending.timeUntilTributeFetch=Date.now()/1000-10;runner();
assert.equal(timerB.querySelector('.qol-royal-tribute-eta').textContent,'Pending');
b.native.querySelector('button').classList.add('disabled');
delete cache['Village:536559663'];runner();
assert.equal(head1.querySelector('.qol-royal-tribute-village-count').textContent,'2');
assert.equal(head2.querySelector('.qol-royal-tribute-production-total').textContent,'≥ 262 res/h','Unknown rate is not silently counted as zero');
assert.equal(timerB.querySelector('.qol-royal-tribute-eta').textContent,'—','Missing data is clearly unavailable');

// Travian switches to the in-transit template after collection. Its
// "Collect now" button is PREMIUM, costs Gold and has a different handler.
originalButtonB.remove();
const transitPanel=new Node('div');
b.native.appendChild(transitPanel);
const transitInfo=new Node('div','tributeOnTheWay');
transitPanel.appendChild(transitInfo);
const premiumButton=new Node('button','animate premium clickable');
premiumButton.premiumFeature='tributeFetchInstantly';
premiumButton.clickable='showCollectNowAnimation()';
transitPanel.appendChild(premiumButton);
const premiumContent=new Node('div','content');
premiumButton.appendChild(premiumContent);
const premiumText=new Node('span','innerText');premiumText.textContent='Collect now';
premiumContent.appendChild(premiumText);
const goldPrice=new Node('span','price gold');goldPrice.textContent='1';
premiumContent.appendChild(goldPrice);
// Simulate the incorrect label inserted by the previous experimental build.
const staleLabel=new Node('span','qol-royal-collect-label');
premiumButton.appendChild(staleLabel);
runner();
assert.ok(b.native.classList.contains('qol-royal-tribute-in-transit'),'Shipment container marked');
assert.ok(transitPanel.classList.contains('qol-royal-tribute-transit-panel'),'Full-width transit panel marked');
assert.equal(premiumButton.querySelector('.qol-royal-collect-label'),null,'Stale false Collect label removed');
assert.equal(premiumButton.querySelector('.price.gold'),goldPrice,'Gold price element untouched');
assert.equal(goldPrice.textContent,'1','Gold price still shown');
assert.equal(premiumText.textContent,'Collect now','Premium wording unchanged');
assert.equal(premiumButton.clickable,'showCollectNowAnimation()','Premium action remains original');
assert.equal(b.native.querySelector('button[clickable^="fetchTribute("]'),null,'No ordinary collect button remains');
assert.equal(premiumButton.classList.contains('premium'),true,'Premium marker retained');
runner();
assert.equal(transitPanel.querySelectorAll('.qol-royal-collect-label').length,0,'No accidental premium relabelling on next tick');
enabled=false;runner();
assert.equal(foreignHeader.querySelectorAll('th').length,2,'Restores foreign native headers');
assert.equal(foreign.row.children.length,2,'Restores foreign native rows');
assert.ok(!foreignWrapper.classList.contains('qol-royal-tributes-active'),'Removes foreign styling');
assert.equal(foreignNativeButton.querySelector('.qol-royal-collect-label'),null,'Restores foreign native button');
assert.equal(headRow.querySelectorAll('th').length,2,'Restores native headers');
assert.equal(a.row.children.length,2,'Restores native row');
assert.ok(!wrapper.classList.contains('qol-royal-tributes-active'));
assert.ok(a.collect.querySelector('.collectTributesContainer'));
assert.ok(!a.collect.querySelector('.qol-royal-tribute-eta'));
assert.equal(originalButtonA.querySelector('.qol-royal-collect-label'),null,'Original button appearance restored on disable');
assert.equal(originalButtonB.querySelector('.qol-royal-collect-label')?.textContent,'Collect','Detached old button is outside live UI and is not mutated');
assert.equal(b.native.classList.contains('qol-royal-tribute-in-transit'),false,'Transit class cleared on disable');
assert.equal(transitPanel.classList.contains('qol-royal-tribute-transit-panel'),false,'Transit panel class cleared on disable');
assert.equal(goldPrice.textContent,'1','Original premium price remains after disabling');
assert.equal(originalButtonB.disabled,true,'Cleanup does not change native disabled state');
enabled=true;runner();
assert.equal(foreignHeader.querySelectorAll('th').length,3,'Foreign table re-enabled');
assert.equal(foreignNativeButton.querySelectorAll('.qol-royal-collect-label').length,1,'Foreign button does not duplicate its label');
assert.equal(headRow.querySelectorAll('th').length,3,'Can re-enable without duplicates');
assert.equal(originalButtonA.querySelectorAll('.qol-royal-collect-label').length,1,'Re-enabled label created once');
delete cache['Village:536592428'];runner();
assert.equal(a.row.querySelector('td.qol-royal-tribute-eta-cell').querySelector('.qol-royal-tribute-eta').textContent,'Ready','Native enabled button confirms readiness when cache is missing');
assert.ok(!src.includes('fetch(') && !src.includes('XMLHttpRequest'));
assert.ok(!src.includes('.click()') && !src.includes('.dispatchEvent('));
console.log('Royal Tributes: normal collection, premium in-transit Gold cost, dedicated layout, no relabelling, ETA and disable/restore passed.');
