'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/modules/royalTributes/liveCountdown.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/features/royalTributeCountdown.css'), 'utf8');
const menu = fs.readFileSync(path.join(root, 'js/ui/menu.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const calculator = require('../js/modules/royalTributes/etaCalculator.js');
assert.doesNotThrow(() => new Function(src));
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
assert.ok(css.includes('.qol-royal-tribute-eta[data-tone="ready"]'));
assert.ok(css.includes('.qol-royal-tribute-eta[data-tone="countdown"]'));
assert.match(menu, /key: 'royalTributeCountdown'/);
const main = manifest.content_scripts.find(s => s.world === 'MAIN');
assert.ok(main);
assert.deepEqual(main.js.slice(-2),[
  'js/modules/royalTributes/etaCalculator.js',
  'js/modules/royalTributes/liveCountdown.js'
]);
assert.ok(manifest.content_scripts.some(s => (s.css || []).includes('css/features/royalTributeCountdown.css')));
const village = {
  allowTributeCollection: 1,
  canFetchTributes: false,
  tributesOnTheirWay: false,
  timeUntilTributeFetch: Date.now()/1000 + 3600
};
let label = null;
let enabled = true;
let runner = null;
const idNode = { getAttribute: k => k === 'villageid' ? '536592428' : '' };
const host = {
  classList: { contains: () => false },
  querySelector: k => k === '.qol-royal-tribute-eta' ? label : k === '.collectTributesContainer' ? {} : null,
  appendChild: item => { label = item; }
};
const row = {
  querySelector: k => k === 'td.playerColumn [villageid]' ? idNode : k === 'td.collect' ? host : null
};
const document = {
  readyState: 'loading',
  querySelectorAll: k => k.includes('tributeVillages') ? [row] : [],
  createElement: tag => {
    assert.equal(tag, 'div');
    return {
      className:'',textContent:'',dataset:{},title:'',
      setAttribute(){},remove(){label=null;}
    };
  },
  addEventListener(){}
};
const window = {
  Cache: { c: { 'Village:536592428': { data: village } } },
  APES: { royalTributeEtaMath: calculator },
  localStorage: { getItem: () => enabled ? null : 'false' },
  setInterval: fn => { runner = fn; return 1; }
};
new Function('window','document',src)(window,document);
assert.equal(typeof runner,'function');
runner();
assert.ok(label);
assert.equal(label.dataset.tone,'countdown');
assert.match(label.textContent,/until collectible$/);
assert.match(label.title,/Travian Kingdoms/);
village.canFetchTributes = true;
runner();
assert.equal(label.textContent,'Ready to collect');
assert.equal(label.dataset.tone,'ready');
village.canFetchTributes = false;
village.tributesOnTheirWay = true;
runner();
assert.equal(label.textContent,'Collection underway');
village.tributesOnTheirWay = false;
village.allowTributeCollection = 0;
runner();
assert.equal(label.textContent,'Collection unavailable');
village.allowTributeCollection = 1;
village.timeUntilTributeFetch = Date.now()/1000 - 20;
runner();
assert.equal(label.textContent,'Awaiting game update');
enabled=false;
runner();
assert.equal(label,null,'Disabling setting removes feature label');
enabled=true;
delete window.Cache.c['Village:536592428'];
runner();
assert.equal(label,null,'Missing cache does not fabricate an ETA');
assert.ok(!src.includes('fetch('));
assert.ok(!src.includes('XMLHttpRequest'));
assert.ok(!src.includes('click()'));
console.log('Royal Tribute Countdown: cache lookup, row render, game ETA, readiness, underway, denied, stale, disable and missing data tested.');
