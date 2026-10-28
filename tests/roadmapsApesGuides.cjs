// Run: node tests/roadmapsApesGuides.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const road=read('js/features/roadmaps.js');
const official=read('js/modules/roadmaps/officialGuides.js');
const css=read('css/features/roadmaps.css');
const menu=read('js/ui/menu.js');
const toolbar=read('js/ui/toolbar.js');
const manifest=JSON.parse(read('manifest.json'));
for(const src of [road,official,menu,toolbar])assert.doesNotThrow(()=>new Function(src));
for(const src of [road,official,menu,toolbar,JSON.stringify(manifest)])
 assert.doesNotMatch(src,/apesLibrary|apes-library|APES Library/,'No remaining APES Library');
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'CSS braces balance');
for(const c of ['.qol-rm-guides-toggle','.qol-rm-guides-caret','.qol-rm-guides-list:empty'])
 assert.ok(css.includes(c),'Missing collapse style '+c);
const keys=['x1_speedsettle','x2_speedsettle','x3_speedsettle','x5_speedsettle'];
for(const key of keys)assert.ok(official.includes(key+': {'),'Official speedsettling guide missing '+key);
assert.doesNotMatch(road+official,/x1_support_500cp|buildX1SupportRoute/,'No fifth official guide');
for(const c of ['data-apes-guides-toggle','aria-expanded="'+'$'+'{apesGuidesExpanded}"',
 'writeJson(GUIDES_OPEN_STORAGE_KEY, apesGuidesExpanded)',
 "event.target.closest('[data-apes-guides-toggle]')",
 "panel.addEventListener('keydown'"])
 assert.ok(road.includes(c),'Missing toggle interaction '+c);
const storage=new Map();
const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))};
const excerpt=road.slice(road.indexOf('  const FEATURE_KEY ='),road.indexOf('  function showToast('));
const app=new Function('localStorage',excerpt+
 '\nreturn {renderSidebar,setPanel:v=>panel=v,expand:v=>apesGuidesExpanded=v,builtins:()=>BUILTIN_ROADMAPS};'
)(localStorage);
let sidebar='';
app.setPanel({querySelector:sel=>sel==='.qol-rm-library'?{set innerHTML(v){sidebar=v},get innerHTML(){return sidebar}}:null});
assert.deepEqual(Object.keys(app.builtins()),keys,'Exactly four built-in guides');
app.renderSidebar();
assert.ok(sidebar.includes('aria-expanded="false"'),'Guides start collapsed');
assert.doesNotMatch(sidebar,/data-roadmap-select="x1_speedsettle"/,'No cards until expansion');
assert.ok(sidebar.includes('My Roadmaps'),'My Roadmaps remains visible');
app.expand(true);app.renderSidebar();
assert.ok(sidebar.includes('aria-expanded="true"'),'Expanded state reflected');
const found=[...sidebar.matchAll(/data-roadmap-select="(x[0-9]_speedsettle)"/g)].map(m=>m[1]);
assert.deepEqual(found,keys,'Alphabetical order x1 x2 x3 x5');
assert.equal((sidebar.match(/class="qol-rm-nav-item/g)||[]).length,4);
assert.ok(manifest.content_scripts.every(c=>!(c.js||[]).includes('js/features/apesLibrary.js')&&!(c.css||[]).includes('css/features/apesLibrary.css')));
assert.ok(manifest.web_accessible_resources.every(r=>(r.resources||[]).every(p=>!p.startsWith('images/guides/'))));
console.log('Roadmaps: only four ordered Speedsettling guides; collapsed/expanded sidebar, My Roadmaps, and Library removal verified.');
