// Run with: node tests/apesLibraryTkToolsAccount.cjs
// TK-Tools account linking instructions are a published read-only Miscellaneous guide.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/features/apesLibrary.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/features/apesLibrary.css'),'utf8');

assert.doesNotThrow(()=>new Function(source),'Library JavaScript parses');
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'Library CSS braces balance');
assert.match(css,/\.apes-lib-tk-tools-article li\.apes-lib-tk-tools-step/,'Scoped step styling is present');
assert.match(css,/\.apes-lib-tk-tools-number/,'Step numbers use APES styling');
assert.match(css,/\.apes-lib-tk-tools-note/,'Security reminder is styled');

const slice=source.slice(source.indexOf('  const CATEGORIES ='),source.indexOf('  function notify('));
const win={APES:{roadmaps:{getAllRoadmaps:()=>({
  x3_speedsettle:{name:'x3',steps:[{type:'instruction',text:'Existing step'}]}
})}}};
const lib=new Function('window','chrome',slice+
 '\nreturn {renderSidebar,renderArticle,findGuide,select:id=>selectedId=id,expand:id=>openedCategories.add(id),setPanel:v=>panel=v};'
)(win,{runtime:{getURL:filename=>'chrome-extension://mock/'+filename}});
let html='',sidebar='';
lib.setPanel({querySelector(selector){
  if(selector==='.apes-lib-article')return {set innerHTML(v){html=v},get innerHTML(){return html}};
  if(selector==='.apes-lib-sidebar-content')return {set innerHTML(v){sidebar=v},get innerHTML(){return sidebar}};
  return null;
}});
lib.expand('misc');lib.renderSidebar();
assert.match(sidebar,/data-library-guide="tk_tools_account"/,'Miscellaneous navigation has TK-Tools guide');
assert.equal(lib.findGuide('tk_tools_account').referenceId,'tk_tools_account');
lib.select('tk_tools_account');lib.renderArticle();
assert.match(html,/apes-lib-pill">Reference<\/span>/,'Published as a read-only reference');
assert.doesNotMatch(html,/Guide not published yet|data-library-export/,'No placeholder or Roadmap export');
assert.match(html,/Associating your TK-Tools account with your TK account/,'Full guide title appears');
assert.match(html,/href="https:\/\/tk-tools\.fr\/" target="_blank" rel="noopener noreferrer"/,'Safe external site link');
assert.match(html,/<ol class="apes-lib-tk-tools-steps" start="0">/,'Steps start at 0');
assert.equal((html.match(/class="apes-lib-tk-tools-step"/g)||[]).length,8,'Exactly eight account linking steps');
assert.deepEqual([...html.matchAll(/class="apes-lib-tk-tools-number" aria-hidden="true">(\d)<\/span>/g)].map(x=>Number(x[1])),
  [0,1,2,3,4,5,6,7],'All step labels appear once, in order');
for(const required of [
  'bottom left','current Travian Kingdoms game world','Step 3','External Access',
  'Step 4','Link my account','My Join Requests','My account','Europe/Berlin',
  'linking key and generated access link private'
]){
  assert.ok(html.includes(required),'Required TK-Tools instruction missing: '+required);
}
lib.select('robber_camps');lib.renderArticle();
assert.match(html,/Most Efficient Troops — After 2026 Rebalance/,'Robber Camps preserved');
lib.select('robber_hideouts');lib.renderArticle();
assert.match(html,/Hideouts 5–12/,'Robber Hideouts preserved');
lib.select('natar_x3');lib.renderArticle();
assert.match(html,/apes-lib-report-grid/,'Natar Defenses preserved');
lib.select('speed_x3');lib.renderArticle();
assert.match(html,/data-library-export/,'Speedsettling export preserved');
console.log('APES Library TK-Tools guide: eight ordered steps, external link, security note, navigation, other guides verified.');
