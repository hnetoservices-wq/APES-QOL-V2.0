// Run with: node tests/apesLibraryNatarX1.cjs
// Natar defenses are a read-only Library reference with bundled report images.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/features/apesLibrary.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/features/apesLibrary.css'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
assert.doesNotThrow(()=>new Function(src),'Library JavaScript must parse');
assert.doesNotMatch(src,/<\/?button\b/i,'No native Travian buttons');

const files=[
  {label:'Anti-Infantry Natar Village',name:'anti-infantry',width:547,height:186},
  {label:'Anti-Cavalry Natar Village',name:'anti-cavalry',width:580,height:182},
  {label:'Wonder of the World',name:'wonder-of-the-world',width:582,height:198}
];
const resources=manifest.web_accessible_resources
  .find(entry=>entry.matches.includes('*://*.kingdoms.com/*'))?.resources||[];
for(const report of files){
  const imagePath='images/guides/natar-x1-'+report.name+'.png';
  const image=fs.readFileSync(path.join(root,imagePath));
  assert.ok(resources.includes(imagePath),imagePath+' must be web-accessible');
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a',imagePath+' must be a PNG');
  assert.equal(image.readUInt32BE(16),report.width,imagePath+' has the original width');
  assert.equal(image.readUInt32BE(20),report.height,imagePath+' has the original height');
  assert.ok(image.byteLength>5000,imagePath+' includes real report pixels');
}
assert.ok(css.includes('.apes-lib-report-image-scroll'),'Reference images have their own overflow styling');
assert.ok(css.includes('.apes-lib-reference-warning'),'The combat simulator warning must be visible');
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length,'CSS stays balanced');

const slice=src.slice(src.indexOf('  const CATEGORIES ='),src.indexOf('  function notify('));
let content='',sidebar='';
const fakeWindow={APES:{roadmaps:{getAllRoadmaps:()=>({
  x3_speedsettle:{name:'x3',steps:[{type:'instruction',text:'Published x3 checkpoint'}]}
})}}};
const fakeChrome={runtime:{getURL:asset=>'chrome-extension://test/'+asset}};
const lib=new Function('window','chrome',slice+
 '\nreturn {renderSidebar,renderArticle,guideData,findGuide,select:id=>selectedId=id,expand:id=>openedCategories.add(id),setPanel:v=>panel=v};'
)(fakeWindow,fakeChrome);
lib.setPanel({querySelector(selector){
 if(selector==='.apes-lib-article')return {set innerHTML(value){content=value;},get innerHTML(){return content;}};
 if(selector==='.apes-lib-sidebar-content')return {set innerHTML(value){sidebar=value;},get innerHTML(){return sidebar;}};
 return null;
}});
lib.expand('natar');
lib.renderSidebar();
assert.ok(sidebar.includes('data-library-guide="natar_x1"'),'x1 Natar item exists');
assert.ok(sidebar.includes('data-library-guide="natar_x2"'),'x2 Natar placeholder preserved');
assert.ok(lib.findGuide('natar_x1').referenceId==='natar_x1');
lib.select('natar_x1');
lib.renderArticle();
assert.ok(content.includes('apes-lib-pill">Reference</span>'),'Published Natar guide is Reference');
assert.ok(!content.includes('data-library-export'),'Reference articles are not exported to Roadmaps');
for(const value of [
 'anti-infantry and anti-cavalry',
 'approximately 50 scouts',
 'Level 10 wall',
 'Level 20 Residence',
 'Level 20 wall and no Residence',
 'catapults are not needed',
 'slightly higher or lower',
 'combat simulator'
])assert.ok(content.includes(value),'Natar article missing '+value);
assert.equal((content.match(/<img /g)||[]).length,3,'All three example reports appear');
let previous=-1;
for(const report of files){
 const caption=content.indexOf('>'+report.label+'</figcaption>');
 const image=content.indexOf('chrome-extension://test/images/guides/natar-x1-'+report.name+'.png');
 assert.ok(caption>previous,'Reports retain user order: '+report.label);
 assert.ok(image>caption,'Image follows its caption: '+report.label);
 previous=image;
}
lib.select('natar_x2');lib.renderArticle();
assert.ok(content.includes('Guide not published yet'),'x2 remains unpublished');
assert.ok(!content.includes('<img ')&&!content.includes('data-library-export'));
lib.select('speed_x3');lib.renderArticle();
assert.ok(content.includes('data-library-export'),'Existing Speedsettling exports preserved');

console.log('APES Library Natar x1: reference notes, warning, 3 packaged images, no Roadmap export, and existing guides verified.');
