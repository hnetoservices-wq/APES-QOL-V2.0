// Run with: node tests/apesLibraryGoldRefund.cjs
// Gold refund is a published Miscellaneous reference with refund template and evidence.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const src=read('js/features/apesLibrary.js');
const css=read('css/features/apesLibrary.css');
const manifest=JSON.parse(read('manifest.json'));
assert.doesNotThrow(()=>new Function(src),'APES Library must parse');
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'CSS braces must balance');
for(const selector of ['.apes-lib-gold-refund-section','.apes-lib-gold-refund-template','.apes-lib-gold-refund-channel','.apes-lib-gold-refund-evidence'])
  assert.ok(css.includes(selector),'Gold refund CSS selector missing: '+selector);
const resources=manifest.web_accessible_resources.find(e=>e.matches.includes('*://*.kingdoms.com/*')).resources;
for(const asset of ['gold-refund-withdrawal-excerpt.svg','gold-refund-support-reply.svg']){
  const rel='images/guides/'+asset;
  assert.ok(resources.includes(rel),asset+' must be web accessible');
  const xml=read(rel);
  assert.match(xml,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/,'SVG must be standalone');
  assert.match(xml,/<title[^>]+>/,'SVG must have accessible title');
  assert.ok(xml.length>500,'SVG is not a placeholder');
}
const excerpt=src.slice(src.indexOf('  const CATEGORIES ='),src.indexOf('  function notify('));
const win={APES:{roadmaps:{getAllRoadmaps:()=>({
  x3_speedsettle:{name:'x3',steps:[{type:'instruction',text:'Existing speedsettling step'}]}
})}}};
let html='',sidebar='';
const lib=new Function('window','chrome',excerpt+
 '\nreturn {renderSidebar,renderArticle,findGuide,select:id=>selectedId=id,expand:id=>openedCategories.add(id),setPanel:value=>panel=value};'
)(win,{runtime:{getURL:asset=>'chrome-extension://test/'+asset}});
lib.setPanel({querySelector(s){
  if(s==='.apes-lib-article')return {set innerHTML(v){html=v},get innerHTML(){return html}};
  if(s==='.apes-lib-sidebar-content')return {set innerHTML(v){sidebar=v},get innerHTML(){return sidebar}};
  return null;
}});
lib.expand('misc');lib.renderSidebar();
assert.match(sidebar,/data-library-guide="gold_refund"/,'Miscellaneous sidebar has refund guide');
assert.equal(lib.findGuide('gold_refund').referenceId,'gold_refund');
lib.select('gold_refund');lib.renderArticle();
assert.match(html,/apes-lib-pill">Reference<\/span>/,'Gold refund is read-only reference');
assert.doesNotMatch(html,/Guide not published yet|data-library-export/,'Published without Roadmap export');
for(const s of [
 'Refunding Gold','Credit to D-T','14-Day Withdrawal Policy','14 days',
 'purchase channel','not a guarantee','How to Request a Refund',
 'Refund Request Template','Dear Sir/Madam','name of Gold pack',
 'full address','In-game nickname','Server:','Order code:',
 'Purchased through the internet browser',
 'Browser purchases','Apple App Store','Google Play','Report a Problem',
 'GPA','proof of payment','support.kingdoms.com',
 'right-of-withdrawal-en.pdf','gold-refund-withdrawal-excerpt.svg',
 'gold-refund-support-reply.svg'
])assert.ok(html.includes(s),'Refund guide missing '+s);
assert.equal((html.match(/<img /g)||[]).length,2,'Both policy and support excerpts shown');
assert.match(html,/rel="noopener noreferrer"/,'External links should be safe');
assert.match(html,/class="apes-lib-gold-refund-template"/,'Template is selectable text');
assert.match(html,/redacted/,'Remind users to redact unrelated banking details');
lib.select('travel_time');lib.renderArticle();
assert.match(html,/12:42:25/,'Previous travel time guide preserved');
lib.select('tk_tools_account');lib.renderArticle();
assert.match(html,/Europe\/Berlin/,'Previous TK tools guide preserved');
lib.select('robber_hideouts');lib.renderArticle();
assert.match(html,/Hideouts 5–12/,'Previous robber hideouts preserved');
lib.select('robber_camps');lib.renderArticle();
assert.match(html,/Most Efficient Troops — After 2026 Rebalance/,'Previous robber camps preserved');
lib.select('natar_x3');lib.renderArticle();
assert.match(html,/apes-lib-report-grid/,'Previous Natar reports preserved');
lib.select('speed_x3');lib.renderArticle();
assert.match(html,/data-library-export/,'Previous speedsettling export preserved');
console.log('APES Library Gold refund: policy caveat, D-T credit, template, screenshots, purchase channels and existing guides verified.');
