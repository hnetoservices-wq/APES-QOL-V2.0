// Run with: node tests/apesLibraryTravelTime.cjs
// The travel-time reference uses exact tile distances and floors elapsed seconds.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/features/apesLibrary.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/features/apesLibrary.css'),'utf8');
assert.doesNotThrow(()=>new Function(src),'Library JavaScript parses');
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'CSS braces remain balanced');
assert.match(css,/\.apes-lib-travel-reference/,'Travel-time reference is scoped');
assert.match(css,/\.apes-lib-travel-formula/,'Formula blocks are styled');
assert.match(css,/\.apes-lib-travel-result/,'Calculated landing time is highlighted');

const slice=src.slice(src.indexOf('  const CATEGORIES ='),src.indexOf('  function notify('));
const win={APES:{roadmaps:{getAllRoadmaps:()=>({
  x3_speedsettle:{name:'x3',steps:[{type:'instruction',text:'Existing step'}]}
})}}};
const lib=new Function('window','chrome',slice+
  '\nreturn {renderSidebar,renderArticle,findGuide,select:id=>selectedId=id,expand:id=>openedCategories.add(id),setPanel:v=>panel=v};'
)(win,{runtime:{getURL:file=>'chrome-extension://test/'+file}});
let html='',sidebar='';
lib.setPanel({querySelector(selector){
  if(selector==='.apes-lib-article')return {set innerHTML(v){html=v},get innerHTML(){return html}};
  if(selector==='.apes-lib-sidebar-content')return {set innerHTML(v){sidebar=v},get innerHTML(){return sidebar}};
  return null;
}});
lib.expand('misc');lib.renderSidebar();
assert.match(sidebar,/data-library-guide="travel_time"/,'Travel-time guide appears under Miscellaneous');
assert.equal(lib.findGuide('travel_time').referenceId,'travel_time');
lib.select('travel_time');lib.renderArticle();
assert.match(html,/Calculating Troops Travel Time/,'Requested title retained');
assert.match(html,/apes-lib-pill">Reference<\/span>/,'Guide is published and read-only');
assert.doesNotMatch(html,/Guide not published yet|data-library-export/,'No placeholder or Roadmaps export');
assert.match(html,/href="http:\/\/travian\.kirilloid\.ru" target="_blank" rel="noopener noreferrer"/,
  'Kirilloid link is available with safe target attributes');
for(const phrase of [
  'Kirilloid','Manual Calculation','Distance','Travel Time','Full Example','TL;DR',
  'T5','Speed Artifact to 3','1.5 for sieges','2026 troop rebalance',
  '√8','2.828427125','2.83','√18','4.242640687','4.24',
  'rounded DOWN','7.8 seconds','floor((distance','Clubswingers','Teutonic Knights',
  'Equites Imperatoris','12:00:00','12:42:25'
]){
  assert.ok(html.includes(phrase),'Missing travel-time guide detail: '+phrase);
}
assert.match(html,/floor = 2545 seconds = 42:25/,'Flooring occurs only after exact speed calculation');
assert.equal(Math.floor(Math.sqrt(2*2+2*2)/4*3600),2545,'Worked-example return time is 2545 seconds');
assert.equal(Math.floor(12*60+7.8),727,'Fractional time is floored, not rounded');
lib.select('tk_tools_account');lib.renderArticle();
assert.match(html,/Europe\/Berlin/,'Existing TK-Tools guide preserved');
lib.select('robber_camps');lib.renderArticle();
assert.match(html,/Most Efficient Troops — After 2026 Rebalance/,'Robber Camps guide preserved');
lib.select('robber_hideouts');lib.renderArticle();
assert.match(html,/Hideouts 5–12/,'Robber Hideouts guide preserved');
lib.select('natar_x3');lib.renderArticle();
assert.match(html,/apes-lib-report-grid/,'Natar reference images preserved');
lib.select('speed_x3');lib.renderArticle();
assert.match(html,/data-library-export/,'Speedsettling export preserved');
console.log('APES Library travel time: Kirilloid x5 workaround, exact distance, seconds floor, worked return hit and existing guides verified.');
