// Run: node tests/apesLibraryRobberCamps.cjs
// Read-only Robber Camps guide: navigation, lifecycle, rewards, and both troop tables.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('js/features/apesLibrary.js');
const css=read('css/features/apesLibrary.css');
const manifest=JSON.parse(read('manifest.json'));
const lifecycle=read('images/guides/robber-camps-cycle.svg');

assert.doesNotThrow(()=>new Function(source),'APES Library script parses');
assert.ok(lifecycle.includes('<svg') && lifecycle.includes('Camp spawned'),'Lifecycle SVG has meaningful content');
const resources=manifest.web_accessible_resources.find(e=>e.matches.includes('*://*.kingdoms.com/*')).resources;
assert.ok(resources.includes('images/guides/robber-camps-cycle.svg'),'Lifecycle SVG is accessible from the game tab');
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'CSS braces balanced');
assert.match(css,/\.apes-lib-camp-reference table\.apes-lib-robber-table/,'Camp tables use scoped APES styles');
assert.match(css,/table\.apes-lib-robber-table tbody td/,'Table cells override Travian global background styles');

const slice=source.slice(source.indexOf('  const CATEGORIES ='),source.indexOf('  function notify('));
const sandbox={APES:{roadmaps:{getAllRoadmaps:()=>({
  x3_speedsettle:{name:'x3 speed',steps:[{type:'instruction',text:'Existing guide'}]}
})}}};
let html='',sidebar='';
const lib=new Function('window','chrome',slice+
  '\nreturn {renderSidebar,renderArticle,findGuide,select:id=>selectedId=id,expand:id=>openedCategories.add(id),setPanel:v=>panel=v};'
)(sandbox,{runtime:{getURL:p=>'chrome-extension://example/'+p}});
lib.setPanel({querySelector(selector){
  if(selector==='.apes-lib-article')return {set innerHTML(v){html=v},get innerHTML(){return html}};
  if(selector==='.apes-lib-sidebar-content')return {set innerHTML(v){sidebar=v},get innerHTML(){return sidebar}};
  return null;
}});
lib.expand('robber');lib.renderSidebar();
assert.match(sidebar,/data-library-guide="robber_camps"/,'Robber Camps appears in navigation');
assert.equal(lib.findGuide('robber_camps').referenceId,'robber_camps');
lib.select('robber_camps');lib.renderArticle();
assert.match(html,/apes-lib-pill">Reference<\/span>/,'Guide is a read-only reference');
assert.doesNotMatch(html,/Guide not published yet|data-library-export/,'Guide has no placeholder or Roadmap export');
for(const heading of ['Mechanism','Guidelines','Spawn Rate','Camp Strengths &amp; Rewards',
    'Most Efficient Troops — Before 2026 Rebalance','Most Efficient Troops — After 2026 Rebalance'])
  assert.ok(html.includes(heading),'Missing section: '+heading);
for(const phrase of ['five participants','20%','200%','40 minutes','Last Chance Mode',
  '48–96 hours','34–69 hours','ShinyPink','Brewery','Natar Horn',
  'Horse Drinking Trough','Equites Imperatoris','No'])
  if(phrase!=='No')assert.ok(html.includes(phrase),'Missing guide content: '+phrase);
assert.match(html,/robber-camps-cycle\.svg/,'Map lifecycle is embedded');
assert.equal((html.match(/<table class="apes-lib-robber-table"/g)||[]).length,7,
  'One level table and three camp tables for each of two versions');
for(const rate of ['~20k','~208k','80 SG','170 SG','Unknown–12,628','Unknown–25,256',
  '150','165','180','120','52.5','57.5']){
  assert.ok(html.includes(rate),'Missing reward or efficiency value: '+rate);
}
assert.equal((html.match(/apes-lib-robber-priority/g)||[]).length,1,'Only the stolen goods guideline is highlighted');
lib.select('robber_hideouts');lib.renderArticle();
assert.match(html,/Hideouts 5–12/,'Existing hideouts are preserved');
lib.select('natar_x3');lib.renderArticle();
assert.match(html,/apes-lib-report-grid/,'Natar defense reports are preserved');
lib.select('speed_x3');lib.renderArticle();
assert.match(html,/data-library-export/,'Speedsettling export remains available');
console.log('APES Library Robber Camps: content, lifecycle illustration, level + troop tables, existing guides verified.');
