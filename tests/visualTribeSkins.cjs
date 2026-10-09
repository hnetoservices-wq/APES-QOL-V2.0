// Run with: node tests/visualTribeSkins.cjs
// Simulate actual displayed-image load/error events, game redraws and UI clicks.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../js/features/visualTribeSkins.js'), 'utf8');
const base = 'https://static.kingdoms.com/game/0.121.4/layout/images/';
const samples = ['building/thumb/g15_r10.png', 'building/thumb/g19_r00.png', 'building/thumb/g20_r20.png',
  'building/thumb/g16_r00.png', 'building/thumb/g31_01_normal_top.png', 'building/thumb/g31_01_normal_bottom.png',
  'building/thumb/g23.png', 'building/thumb/g11_00_e.png', 'building/thumb/g10_00_e.png',
  'building/thumb/g17_00.png', 'building/thumb/g21.png'];
let checks = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); checks++; };
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup(paths = samples, options = {}) {
  const storage = new Map(Object.entries(options.saved || {}));
  const ids = new Map();
  const events = {};
  const documentEvents = {};
  const observers = [];
  const frames = [];
  const requests = [];
  const pending = [];
  let active = true;
  const emit = (type, target) => (documentEvents[type] || []).forEach(handler => handler({ target }));
  const changed = (target, attributeName = 'src') => queueMicrotask(() => observers.forEach(observer => observer([
    { type: 'attributes', target, attributeName }
  ])));
  class Element {
    constructor() {
      this.dataset = {}; this.events = {}; this.classes = new Set();
      this.style = { removeProperty() {}, setProperty() {} };
      this.classList = { contains: name => this.classes.has(name),
        add: name => this.classes.add(name), remove: name => this.classes.delete(name),
        toggle: (name, force) => (force ?? !this.classes.has(name)) ? this.classes.add(name) : this.classes.delete(name) };
    }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(key, callback) { (this.events[key] ||= []).push(callback); }
    click() { (this.events.click || []).forEach(callback => callback({ preventDefault() {}, stopPropagation() {} })); }
    querySelector(selector) { return selector === '[data-close]' ? this.close : selector === '.qol-tribe-skins-current' ? this.current : null; }
    querySelectorAll(selector) { return selector === '[data-skin]' ? this.tribes || [] : selector === '[data-artwork]' ? this.artworks || [] : []; }
    set innerHTML(value) {
      this.tribes = ['roman','gaul','teuton'].map(skin => Object.assign(new Element(), { dataset: { skin } }));
      this.artworks = ['server','standard','halloween'].map(artwork => Object.assign(new Element(), { dataset: { artwork } }));
      this.current = new Element(); this.close = new Element();
    }
  }
  class Building extends Element {
    constructor(file, i) {
      super(); this._src = base + file; this.currentSrc = this._src;
      this.nodeType = 1;
      this.id = `buildingImage${i + 20}`; this.isConnected = true;
      this.complete = true; this.naturalWidth = 100; this.revision = 0;
      this.gameSource = options.native === false ? '' : this._src;
    }
    get src() { return this._src; }
    set src(url) {
      this._src = url; this.complete = false;
      const revision = ++this.revision;
      requests.push(url); changed(this);
      const finish = () => {
        if (this.revision !== revision) return;
        const available = options.available ? options.available(url) : !/halloween\/building\/thumb\/g(?:16_|31_)/.test(url);
        this.complete = true; this.naturalWidth = available ? 100 : 0; this.currentSrc = url;
        emit(available ? 'load' : 'error', this);
      };
      if (options.deferred) pending.push(finish); else queueMicrotask(finish);
    }
    getAttribute(key) {
      if (key === 'ng-src') return this.gameSource;
      if (key === 'data-level') return this.level || '';
      return '';
    }
    closest() { return null; }
    matches(selector) { return selector === 'img.location'; }
  }
  const images = paths.map((file, i) => new Building(file, i));
  const document = {
    readyState: 'loading', documentElement: {},
    addEventListener(name, callback) { (documentEvents[name] ||= []).push(callback); },
    getElementById: id => ids.get(id) || null,
    createElement: () => new Element(),
    head: { appendChild: node => ids.set(node.id, node) },
    body: { appendChild: node => ids.set(node.id, node) },
    querySelectorAll(selector) {
      if (selector.includes('data-qol-tribe-skin-original')) return images.filter(image => image.dataset.qolTribeSkinOriginal);
      if (selector.includes('img.location')) return images.filter(image => image.src.includes('/building/thumb/'));
      return [];
    }
  };
  const window = { isQolEnabled: () => active, addEventListener: (name, callback) => { events[name] = callback; } };
  class Observer {
    constructor(callback) { observers.push(callback); }
    observe() {}
  }
  vm.runInNewContext(source, { window, document, URL, location: { href: 'https://normal.kingdoms.com/' },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    HTMLImageElement: Building, MutationObserver: Observer, Node: { ELEMENT_NODE: 1 },
    requestAnimationFrame: callback => frames.push(callback), console: { info() {} },
    // A separate preload must not gate a change to the actual village image.
    Image: class { constructor() { throw new Error('Unexpected separate preload'); } }
  });
  (documentEvents.DOMContentLoaded || []).forEach(callback => callback());
  const panel = ids.get('qol-tribe-skins-panel');
  return { api: window.APES_TRIBE_SKINS, images, requests, storage, pending,
    tribe: key => panel.tribes.find(control => control.dataset.skin === key).click(),
    artwork: key => panel.artworks.find(control => control.dataset.artwork === key).click(),
    native: (i, url) => { images[i].gameSource = url; changed(images[i], 'ng-src'); },
    add(file) {
      const image = new Building(file, images.length); images.push(image);
      observers.forEach(observer => observer([{ type: 'childList', addedNodes: [image] }]));
      return image;
    },
    async flush() { for (let i = 0; i < 5; i++) { await tick(); frames.splice(0).forEach(callback => callback()); } await tick(); },
    error(i = 0) { images[i].complete = true; images[i].naturalWidth = 0; emit('error', images[i]); },
    staleError(i = 0) { emit('error', images[i]); },
    disable() { active = false; events.qol_setting_changed({ detail: { key: 'visualTribeSkins', enabled: false } }); }
  };
}

async function main() {
  for (const seasonal of [false, true]) for (const nativePrefix of ['r','g','t']) {
    for (const [tribe, prefix] of [['roman','r'], ['gaul','g'], ['teuton','t']]) for (const artwork of ['server','standard','halloween']) {
      const originals = samples.map(file => (seasonal && !/g(?:16_|31_)/.test(file) ? 'halloween/' : '') + file.replace(/_r(\d+\.png)$/, `_${nativePrefix}$1`));
      const env = setup(originals);
      env.tribe(tribe); env.artwork(artwork); await env.flush();
      originals.forEach((file, i) => {
        let expected = file.replace(/_[rgt](\d+\.png)$/, `_${prefix}$1`);
        if (artwork === 'standard') expected = expected.replace('halloween/', '');
        if (artwork === 'halloween' && !/g(?:16_|31_)/.test(expected)) expected = 'halloween/' + expected.replace('halloween/', '');
        equal(env.images[i].src, base + expected);
        equal(env.images[i].dataset.qolTribeSkinOriginal, base + file);
        equal(env.images[i].naturalWidth > 0, true);
      });
    }
  }
  const tier = setup(['building/thumb/g19_r00.png']); tier.images[0].level = '20';
  tier.tribe('gaul'); await tier.flush(); equal(tier.images[0].src, base + 'building/thumb/g19_g00.png');
  const immediate = setup(['building/thumb/g19_r00.png'], { deferred: true });
  immediate.tribe('gaul'); equal(immediate.images[0].src, base + 'building/thumb/g19_g00.png');
  immediate.tribe('teuton'); immediate.staleError(); equal(immediate.images[0].src, base + 'building/thumb/g19_t00.png');
  immediate.pending.splice(0).forEach(finish => finish()); await immediate.flush();
  equal(immediate.images[0].src, base + 'building/thumb/g19_t00.png');
  immediate.disable(); equal(immediate.images[0].src, base + 'building/thumb/g19_r00.png');

  for (const order of ['ng-src-first','src-first']) {
    const env = setup(['building/thumb/g19_r00.png']); env.tribe('gaul'); await env.flush();
    const upgraded = base + 'building/thumb/g19_r10.png';
    if (order === 'ng-src-first') { env.native(0, upgraded); await env.flush(); env.images[0].src = upgraded; }
    else { env.images[0].src = upgraded; await env.flush(); env.native(0, upgraded); }
    await env.flush(); equal(env.images[0].src, base + 'building/thumb/g19_g10.png');
    equal(env.images[0].dataset.qolTribeSkinOriginal, upgraded);
    env.api.restore(); equal(env.images[0].src, upgraded);
  }
  const redraw = setup(['building/thumb/g19_r00.png']); redraw.tribe('gaul'); await redraw.flush();
  redraw.images[0].src = redraw.images[0].gameSource; await redraw.flush();
  equal(redraw.images[0].src, base + 'building/thumb/g19_g00.png');
  const newVillage = redraw.add('building/thumb/g20_t10.png'); await redraw.flush();
  equal(newVillage.src, base + 'building/thumb/g20_g10.png');
  const noNative = setup(['building/thumb/g19_r00.png'], { native: false });
  noNative.tribe('gaul'); await noNative.flush(); noNative.images[0].src = base + 'building/thumb/g19_r10.png'; await noNative.flush();
  equal(noNative.images[0].src, base + 'building/thumb/g19_g10.png');

  let failures = true;
  const fallback = setup(['halloween/building/thumb/g19_r00.png'], { available: url => !failures || url.endsWith('_r00.png') });
  fallback.tribe('gaul'); await fallback.flush();
  equal(fallback.images[0].src, base + 'halloween/building/thumb/g19_r00.png');
  equal(fallback.requests.includes(base + 'building/thumb/g19_g00.png'), true);
  const count = fallback.requests.length;
  for (let i = 0; i < 5; i++) fallback.api.apply(); await fallback.flush();
  equal(fallback.requests.length, count);
  failures = false; fallback.tribe('gaul'); await fallback.flush();
  equal(fallback.images[0].src, base + 'halloween/building/thumb/g19_g00.png');
  const partial = setup(['halloween/building/thumb/g19_r00.png'], { available: url => !url.includes('/halloween/') || url.endsWith('_r00.png') });
  partial.tribe('gaul'); await partial.flush(); equal(partial.images[0].src, base + 'building/thumb/g19_g00.png');
  partial.error(); await partial.flush(); equal(partial.images[0].src, base + 'halloween/building/thumb/g19_r00.png');

  const saved = setup(['building/thumb/g19_r00.png'], { saved: { apes_visual_tribe_skin_selection_v1: 'teuton', apes_visual_tribe_skin_artwork_v1: 'standard' } });
  await saved.flush(); equal(saved.images[0].src, base + 'building/thumb/g19_t00.png');
  saved.tribe('gaul'); saved.artwork('halloween'); await saved.flush();
  equal(saved.storage.get('apes_visual_tribe_skin_selection_v1'), 'gaul');
  equal(saved.storage.get('apes_visual_tribe_skin_artwork_v1'), 'halloween');
  console.log(`Passed ${checks} tribe/artwork, UI selection, displayed-image fallback and redraw checks.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
