// Run with: node tests/apesLibraryNatarX3X5.cjs
// x3 and x5 Natar references use all six real, user-supplied screenshots.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const library = read('js/features/apesLibrary.js');
const manifest = JSON.parse(read('manifest.json'));
assert.doesNotThrow(() => new Function(library));
assert.doesNotMatch(library, /<\/?button\b/i, 'Do not use native Travian buttons');

const imageSets = {
  x3: [
    ['Anti-Infantry Natar Village','anti-infantry',800,245],
    ['Anti-Cavalry Natar Village','anti-cavalry',796,246],
    ['Wonder of the World','wonder-of-the-world',968,329]
  ],
  x5: [
    ['Anti-Infantry Natar Village','anti-infantry',866,291],
    ['Anti-Cavalry Natar Village','anti-cavalry',948,340],
    ['Wonder of the World','wonder-of-the-world',777,264]
  ]
};
const resources = manifest.web_accessible_resources
  .find(item => item.matches.includes('*://*.kingdoms.com/*'))?.resources || [];
for (const [speed, reports] of Object.entries(imageSets)) {
  for (const [,suffix,width,height] of reports) {
    const asset = 'images/guides/natar-' + speed + '-' + suffix + '.png';
    assert.ok(resources.includes(asset), asset + ' must be web-accessible');
    const img = fs.readFileSync(path.join(root, asset));
    assert.equal(img.subarray(0,8).toString('hex'), '89504e470d0a1a0a', asset+' PNG signature');
    assert.equal(img.readUInt32BE(16), width, asset+' width');
    assert.equal(img.readUInt32BE(20), height, asset+' height');
    assert.ok(img.byteLength > 30000, asset+' must contain real screenshot pixels');
  }
}

const fragment = library.slice(library.indexOf('  const CATEGORIES ='), library.indexOf('  function notify('));
const mockWindow = {APES:{roadmaps:{getAllRoadmaps:()=>({
  x3_speedsettle:{steps:[{type:'instruction',text:'Existing Roadmap guide'}]}
})}}};
const chrome = {runtime:{getURL:p=>'chrome-extension://test/'+p}};
const api = new Function('window','chrome',fragment +
  '\nreturn {findGuide,referenceData,renderArticle,renderSidebar,setPanel:v=>panel=v,select:id=>selectedId=id,expand:id=>openedCategories.add(id)};'
)(mockWindow, chrome);
let html = '', sidebar = '';
api.setPanel({querySelector(selector) {
  if (selector === '.apes-lib-article') return {
    set innerHTML(value) {html=value;}, get innerHTML(){return html;}
  };
  if (selector === '.apes-lib-sidebar-content') return {
    set innerHTML(value) {sidebar=value;}, get innerHTML(){return sidebar;}
  };
  return null;
}});
api.expand('natar');api.renderSidebar();
for (const speed of ['x3','x5']) {
  const id='natar_'+speed;
  assert.ok(sidebar.includes('data-library-guide="'+id+'"'), speed+' Library navigation');
  assert.equal(api.findGuide(id).referenceId, id, speed+' linked to reference');
  api.select(id);api.renderArticle();
  assert.match(html, /apes-lib-pill">Reference<\/span>/, speed+' reference badge');
  assert.doesNotMatch(html, /data-library-export/, speed+' must not export reference material');
  assert.equal((html.match(/<img /g)||[]).length, 3, speed+' has three screenshots');
  assert.ok(html.includes('anti-infantry and anti-cavalry'));
  assert.ok(html.includes('Level 10 wall') && html.includes('Level 20 Residence'));
  assert.ok(html.includes('Level 20 wall and no Residence'));
  assert.ok(html.includes('catapults are not needed'));
  assert.ok(html.includes('Combat Simulator') && html.includes('slightly higher or lower'));
  const reports=imageSets[speed];
  let previous=-1;
  for (const [title,suffix,width,height] of reports) {
    const label=speed+' '+title;
    const caption=html.indexOf('>'+label+'</figcaption>');
    const image=html.indexOf('chrome-extension://test/images/guides/natar-'+speed+'-'+suffix+'.png');
    assert.ok(caption>previous, speed+' report order: '+label);
    assert.ok(image>caption, speed+' caption precedes image: '+label);
    assert.ok(html.includes('width="'+width+'" height="'+height+'"'), label+' dimensions');
    previous=image;
  }
  if (speed==='x3') {
    assert.ok(html.includes('On x1, approximately 50 scouts'), 'Retain x1 scout estimate as provided in x3 text');
    assert.ok(html.includes('not a verified x3 scout requirement'));
  } else {
    assert.ok(html.includes('On x5, approximately 150 scouts'));
  }
}
for (const speed of ['x1','x2']) {
  api.select('natar_'+speed);api.renderArticle();
  assert.equal((html.match(/<img /g)||[]).length,3,speed+' reference unchanged');
}
api.select('speed_x3');api.renderArticle();
assert.ok(html.includes('data-library-export'), 'Roadmap export still supported');
assert.equal(manifest.version, '2.0.0.180');
console.log('APES Library Natar x3/x5: 6 real images, reference notes, scouting warnings, no exports, existing guides preserved.');
