// Run with: node tests/apesLibraryNatarX2.cjs
// Natar x2 guide includes all three real user-provided report screenshots,
// including the WW reference with its attribution note.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/features/apesLibrary.js'),'utf8');
const style=fs.readFileSync(path.join(root,'css/features/apesLibrary.css'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.doesNotThrow(()=>new Function(source));
assert.doesNotMatch(source,/<\/?button\b/i);
const images=[
  {path:'images/guides/natar-x2-anti-infantry.png',width:732,height:233},
  {path:'images/guides/natar-x2-anti-cavalry.png',width:1000,height:312},
  {path:'images/guides/natar-x2-wonder-of-the-world.png',width:1344,height:298}
];
const assets=manifest.web_accessible_resources.find(r=>r.matches.includes('*://*.kingdoms.com/*'))?.resources||[];
for(const item of images){
  assert.ok(assets.includes(item.path),item.path+' must be exposed');
  const image=fs.readFileSync(path.join(root,item.path));
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16),item.width);
  assert.equal(image.readUInt32BE(20),item.height);
  assert.ok(image.length>10000);
}
let body='',sidebar='';
const part=source.slice(source.indexOf('  const CATEGORIES ='),source.indexOf('  function notify('));
const mockWindow={APES:{roadmaps:{getAllRoadmaps:()=>({
  x1_speedsettle:{steps:[{type:'instruction',text:'x1'}]},
  x3_speedsettle:{steps:[{type:'instruction',text:'x3'}]}
})}}};
const mockChrome={runtime:{getURL:p=>'chrome-extension://test/'+p}};
const lib=new Function('window','chrome',part+
  '\nreturn {renderSidebar,renderArticle,findGuide,referenceData,setPanel:p=>panel=p,select:id=>selectedId=id,expand:id=>openedCategories.add(id)};'
)(mockWindow,mockChrome);
lib.setPanel({querySelector(selector){
  if(selector==='.apes-lib-article')return {set innerHTML(v){body=v;},get innerHTML(){return body;}};
  if(selector==='.apes-lib-sidebar-content')return {set innerHTML(v){sidebar=v;},get innerHTML(){return sidebar;}};
  return null;
}});
lib.expand('natar');lib.renderSidebar();
assert.match(sidebar,/data-library-guide="natar_x2"/);
assert.equal(lib.findGuide('natar_x2').referenceId,'natar_x2');
lib.select('natar_x2');lib.renderArticle();
assert.match(body,/apes-lib-pill">Reference<\/span>/);
assert.doesNotMatch(body,/data-library-export/);
assert.ok(body.includes('anti-infantry and anti-cavalry'));
assert.ok(body.includes('approximately 50 scouts')||body.includes('Approximately 50 scouts'));
assert.ok(body.includes('Level 10 wall')&&body.includes('Level 20 Residence'));
assert.ok(body.includes('Level 20 wall and no Residence'));
assert.ok(body.includes('catapults are not needed'));
assert.ok(body.includes('Combat Simulator')&&body.includes('slightly higher or lower'));
assert.equal((body.match(/<img /g)||[]).length,3,'All three user-provided images must appear');
for(const item of images)assert.ok(body.includes('chrome-extension://test/'+item.path));
assert.ok(body.indexOf('Anti-Infantry Natar Village')<body.indexOf('Anti-Cavalry Natar Village'));
assert.ok(body.indexOf('Anti-Cavalry Natar Village')<body.indexOf('Wonder of the World'));
assert.ok(!body.includes('Wonder of the World reference image pending attachment'));
assert.ok(body.includes('chrome-extension://test/images/guides/natar-x2-wonder-of-the-world.png'));
assert.ok(body.includes('Ruben couldn&#039;t find an actual report from an x2 server'));
assert.ok(body.includes('Klopp 🤮')&&body.includes('dirty ass name'));
assert.match(style,/\.apes-lib-report-note\{/);
assert.match(style,/\.apes-lib-report-image-pending\{/);
lib.select('natar_x1');lib.renderArticle();
assert.equal((body.match(/<img /g)||[]).length,3,'Existing x1 references remain intact');
lib.select('speed_x3');lib.renderArticle();
assert.ok(body.includes('data-library-export'),'Existing Roadmap exports still work');
assert.equal(manifest.version,'2.0.0.180');
console.log('Natar x2: three packaged reports including WW, attribution note, no Roadmap export, x1 preserved.');
