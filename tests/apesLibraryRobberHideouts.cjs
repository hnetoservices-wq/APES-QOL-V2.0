// Run with: node tests/apesLibraryRobberHideouts.cjs
// Regression guard: Robber Hideouts is a published, read-only APES Library article.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/features/apesLibrary.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/features/apesLibrary.css'),'utf8');
assert.doesNotThrow(()=>new Function(source),'Library JavaScript must parse');
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'Scoped CSS must be balanced');
assert.match(css,/\.apes-lib-robber-section/,'Robber guide uses APES section styling');
assert.match(css,/\.apes-lib-robber-table/,'Spawn tables have APES table styling');
assert.match(css,/\.apes-lib-robber-priority/,'Stolen-goods warning is highlighted');

const excerpt=source.slice(source.indexOf('  const CATEGORIES ='),source.indexOf('  function notify('));
let sidebar='',article='';
const fakeWindow={APES:{roadmaps:{getAllRoadmaps:()=>({
  x3_speedsettle:{name:'x3 Speedsettling',steps:[{type:'instruction',text:'Existing published guide'}]}
})}}};
const lib=new Function('window','chrome',excerpt+
  '\nreturn {renderSidebar,renderArticle,findGuide,select:id=>selectedId=id,expand:id=>openedCategories.add(id),setPanel:value=>panel=value};'
)(fakeWindow,{runtime:{getURL:file=>'chrome-extension://test/'+file}});
lib.setPanel({querySelector(selector){
  if(selector==='.apes-lib-sidebar-content')return {set innerHTML(value){sidebar=value;},get innerHTML(){return sidebar;}};
  if(selector==='.apes-lib-article')return {set innerHTML(value){article=value;},get innerHTML(){return article;}};
  return null;
}});
lib.expand('robber');
lib.renderSidebar();
assert.match(sidebar,/data-library-guide="robber_hideouts"/,'Hideouts nav item must exist');
assert.equal(lib.findGuide('robber_hideouts').referenceId,'robber_hideouts');
lib.select('robber_hideouts');
lib.renderArticle();
assert.match(article,/apes-lib-pill">Reference<\/span>/,'Published guide is a read-only Reference');
assert.doesNotMatch(article,/Guide not published yet|data-library-export|<img /,'No placeholder, Roadmap export or unrequested images');
for(const heading of ['Mechanism','Guidelines','Spawn Rate','Hideout Strength &amp; Rewards']){
  assert.ok(article.includes(heading),'Missing section: '+heading);
}
for(const phrase of [
  'two hideouts','spawn timer','stolen goods','hero','fealty','XP boots',
  'Do not hoard stolen goods','combat simulator','ram','Natar Horn','Book of Wisdom',
  'bandages','2h','1h 40m','1h 27m','1h 15m',
  '4–15h','3.2–12.2h','2.9–10.8h','2.5–9.3h',
  'Days 1–14','Days 15–49','Day 50 onward','3.3/day','2.1/day','1.4/day',
  '2.4, 1.5, and 1.0','population','crop production','wood, clay, and iron',
  'exact strength and reward formulas are unknown'
]){
  assert.ok(article.toLowerCase().includes(phrase.toLowerCase()),'Missing content: '+phrase);
}
assert.equal((article.match(/<table /g)||[]).length,3,'Render all three spawn reference tables');
assert.match(article,/<th scope="col">/,'Accessible table headings are present');
assert.match(article,/class="apes-lib-robber-priority"/,'Kingdom stolen-goods advice is prominent');
lib.select('robber_camps');lib.renderArticle();
assert.match(article,/Guide not published yet/,'Robber Camps remains unpublished');
lib.select('speed_x3');lib.renderArticle();
assert.match(article,/data-library-export/,'Speedsettling Roadmap export remains functional');
lib.select('natar_x3');lib.renderArticle();
assert.match(article,/apes-lib-report-grid/,'Natar defense articles remain available');

console.log('APES Library Robber Hideouts: sections, spawn tables, guidance, estimates, navigation, and unrelated guides preserved.');
