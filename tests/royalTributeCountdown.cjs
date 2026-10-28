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
  css.indexOf('/* A fixed two-track layout')
);
assert.ok(inlineHeaders.length>100);
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
assert.match(css,/\.collectTributesContainer\s*>\s*button\s*>\s*\.content\s*\{[\s\S]*?justify-content:center!important/);
assert.match(css,/\.collectTributesContainer\s*>\s*button\s*\.innerText\s*\{[\s\S]*?text-align:center!important/);
// Native button retains its original events and enabled/disabled state.
// Only the rendered caption becomes "Collect" while the APES feature is on.
assert.match(css,/grid-template-columns:minmax\(0,1fr\) 82px!important/);
assert.match(css,/\.collectTributesContainer\s*>\s*button\s*\.innerText::after\s*\{/);
assert.match(css,/content:"Collect"!important/);
assert.match(css,/\.collectTributesContainer\s*>\s*button\s*\.innerText span\s*\{/);
assert.doesNotMatch(src,/innerText\.textContent\s*=|\.click\(\)/);
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
   contains:cls=>(this.className||'').split(/\s+/).includes(cls)
  };
  all.push(this);
 }
 appendChild(node){this.children.push(node);node.parent=this;this.firstChild=this.children[0];return node}
 insertBefore(node,before){const idx=this.children.indexOf(before);this.children.splice(idx<0?0:idx,0,node);node.parent=this;this.firstChild=this.children[0];return node}
 remove(){if(!this.parent)return;this.parent.children=this.parent.children.filter(x=>x!==this);this.parent.firstChild=this.parent.children[0]||null;this.parent=null}
 setAttribute(){}
 matches(sel) {
   if(sel===this.tagName)return true;
   if(sel.startsWith('.'))return this.classList.contains(sel.slice(1));
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
 const nativeButton=new Node('button');native.appendChild(nativeButton);
 row.querySelector=(sel)=>{
  if(sel==='td.playerColumn [villageid]')return a;
  if(sel==='td.collect')return collect;
  return Node.prototype.querySelector.call(row,sel);
 };
 collect.querySelector=sel=>sel==='.collectTributesContainer'?native:Node.prototype.querySelector.call(collect,sel);
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
tbody.appendChild(a.row);tbody.appendChild(b.row);tbody.appendChild(c.row);
c.collect.classList.add('notConnected');
const dataReady={allowTributeCollection:1,canFetchTributes:true,tributeProduction:262,
 timeUntilTributeFetch:Date.now()/1000-60};
const dataPending={allowTributeCollection:1,canFetchTributes:false,tributeProduction:193,
 timeUntilTributeFetch:Date.now()/1000+4*3600+59*60};
const cache={
 'Village:536592428':{data:dataReady},'Village:536559663':{data:dataPending},
 'Village:536526891':{data:{tributeProduction:800}}
};
table.querySelector=sel=>{
 if(sel==='thead tr')return headRow;
 return Node.prototype.querySelector.call(table,sel);
};
table.querySelectorAll=sel=>{
 if(sel.startsWith('tbody tr['))return [a.row,b.row,c.row];
 return Node.prototype.querySelectorAll.call(table,sel);
};
const document={
 readyState:'loading',
 querySelector:sel=>sel==='.tributeVillages table.gradient'?table:null,
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
assert.equal(a.row.querySelectorAll('td.qol-royal-tribute-eta-cell').length,1,'No repeated cells');
assert.equal(a.row.children.length,3);
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
enabled=false;runner();
assert.equal(headRow.querySelectorAll('th').length,2,'Restores native headers');
assert.equal(a.row.children.length,2,'Restores native row');
assert.ok(!wrapper.classList.contains('qol-royal-tributes-active'));
assert.ok(a.collect.querySelector('.collectTributesContainer'));
assert.ok(!a.collect.querySelector('.qol-royal-tribute-eta'));
enabled=true;runner();
assert.equal(headRow.querySelectorAll('th').length,3,'Can re-enable without duplicates');
delete cache['Village:536592428'];runner();
assert.equal(a.row.querySelector('td.qol-royal-tribute-eta-cell').querySelector('.qol-royal-tribute-eta').textContent,'Ready','Native enabled button confirms readiness when cache is missing');
assert.ok(!src.includes('fetch(') && !src.includes('XMLHttpRequest'));
assert.ok(!src.includes('.click()') && !src.includes('.dispatchEvent('));
console.log('Royal Tributes: connected village count, summed hourly tribute production, third-column concise ETA, ready state, no duplicates, disable/restore passed.');
