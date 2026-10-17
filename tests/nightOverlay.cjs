const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/features/visualTribeSkins.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'js/modules/visualTribeSkins/nightOverlayBridge.js'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/nightOverlay.html'), 'utf8');
const KEY = 'apes_visual_tribe_skin_remove_night_v1', CLASS = 'qol-daylight-enabled';
let checks = 0;
function eq(a, b) { assert.deepEqual(a, b); checks++; }
const flush = () => new Promise(resolve => setTimeout(resolve, 35));
function mapRenderer(intensity = 1) {
  return { renderer: { Gb: intensity }, calls: [], Hi(value, extra) {
    this.calls.push([value, extra]); this.renderer.Gb = value; return `render:${value}`;
  } };
}
async function setup(options = {}) {
  const dom = new JSDOM(fixture, { url: 'https://trickandtreat.kingdoms.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document, timers = new Map(); let id = 0, enabled = options.enabled !== false, current = mapRenderer(options.day ? 0 : 1);
  const original = current.Hi;
  if (options.day) d.querySelector('.ingameContentContainer').classList.remove('nightMode');
  if (options.saved !== undefined) w.localStorage.setItem(KEY, options.saved);
  w.isQolEnabled = () => enabled;
  w.Travian = { Config: Object.freeze({ nightMode: true, specialRules: Object.freeze({ nightPeace: true }) }) };
  const config = w.Travian.Config;
  w.setInterval = callback => { timers.set(++id, callback); return id; }; w.clearInterval = id => timers.delete(id);
  const injector = { has: name => name === 'MapService', get: name => { eq(name, 'MapService'); return { yh: () => current }; } };
  w.angular = { element: () => ({ injector: () => injector }) };
  w.eval(bridge); w.eval(source); await flush();
  return { w, d, dom, timers, original, config,
    get map() { return current; }, replace(map) { current = map; },
    poll() { for (const callback of timers.values()) callback(); },
    toggle(value) { enabled = value; w.dispatchEvent(new w.CustomEvent('qol_setting_changed', { detail: { key: 'visualTribeSkins', enabled: value } })); } };
}
(async () => {
  const e = await setup(), { w, d } = e, api = w.APES_TRIBE_SKINS;
  const control = d.querySelector('[data-remove-night]'), canvas = d.querySelector('#canvasMap'), building = d.querySelector('img.location');
  const nativeClasses = d.querySelector('.ingameContentContainer').className, nativeStyle = building.getAttribute('style'), nativeSrc = building.src;
  const style = selector => w.getComputedStyle(d.querySelector(selector));
  eq(api.getNightOverlayRemoved(), false); eq(e.map.Hi, e.original); eq(e.map.calls.length, 0); eq(e.timers.size, 0);
  eq(control.tagName, 'DIV'); eq(control.getAttribute('role'), 'switch'); eq(control.getAttribute('aria-checked'), 'false');
  eq(control.classList.contains('clickable'), false); eq(control.classList.contains('button'), false);
  eq(style('img.location').filter, 'brightness(.55) blur(0)'); eq(style('#map .nightModeContrast').filter, 'contrast(1.3) blur(0)');
  let nativeClicks = 0; const nativeButton = d.querySelector('.buildingStatusButton'); nativeButton.addEventListener('click', () => nativeClicks++);
  control.click(); await flush();
  eq(api.getNightOverlayRemoved(), true); eq(w.localStorage.getItem(KEY), 'true'); eq(control.getAttribute('aria-checked'), 'true'); eq(control.querySelector('[data-night-status]').textContent, 'On');
  for (const selector of ['.nightModeDarkness', '.nightModeBuildingLights', '#map .mapRobberCampNight']) eq(style(selector).display, 'none');
  for (const selector of ['.villageBackground', 'img.location', '.buildingStatusButton', '.resDistribution', '#map .nightModeContrast']) eq(style(selector).filter, 'none');
  eq(style('.resourcesBackground').display, 'none'); eq(style('#outside-game').filter, 'grayscale(1)');
  eq(e.map.renderer.Gb, 0); eq(e.timers.size, 1); eq(e.map.Hi(1, 'native night update'), 'render:0'); eq(e.map.calls.at(-1)[1], 'native night update');
  eq(e.map.renderer.Gb, 0); eq(d.querySelector('#canvasMap'), canvas); eq(canvas.width, 640); eq(canvas.height, 480);
  eq(d.querySelector('.ingameContentContainer').className, nativeClasses); eq(building.getAttribute('style'), nativeStyle); eq(building.src, nativeSrc);
  eq(w.Travian.Config, e.config); eq(w.Travian.Config.specialRules.nightPeace, true); nativeButton.click(); eq(nativeClicks, 1);
  const stableCalls = e.map.calls.length; e.poll(); eq(e.map.calls.length, stableCalls);
  api.set('teuton'); api.setArtwork('standard'); await flush(); eq(api.getNightOverlayRemoved(), true); eq(building.src.endsWith('/building/thumb/g15_t00.png'), true);
  api.setNightOverlayRemoved('false'); eq(api.getNightOverlayRemoved(), true);
  control.dispatchEvent(new w.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })); await flush();
  eq(api.getNightOverlayRemoved(), false); eq(e.map.Hi, e.original); eq(e.map.renderer.Gb, 1); eq(e.timers.size, 0);
  eq(style('img.location').filter, 'brightness(.55) blur(0)'); eq(style('.nightModeDarkness').display, 'block'); eq(control.getAttribute('aria-checked'), 'false');
  eq(api.get(), 'teuton'); eq(api.getArtwork(), 'standard');
  api.setNightOverlayRemoved(true); await flush(); e.map.Hi(0); api.setNightOverlayRemoved(false); await flush(); eq(e.map.renderer.Gb, 0);
  e.map.Hi(1); api.setNightOverlayRemoved(true); await flush();
  const first = e.map, firstOriginal = e.original, next = mapRenderer(), nextOriginal = next.Hi;
  e.replace(next); e.poll(); eq(first.Hi, firstOriginal); eq(first.renderer.Gb, 1); eq(next.renderer.Gb, 0);
  const wrapper = next.Hi; w.eval(bridge); eq(next.Hi, wrapper); eq(e.timers.size, 1);
  e.toggle(false); await flush(); eq(d.documentElement.classList.contains(CLASS), false); eq(next.Hi, nextOriginal); eq(next.renderer.Gb, 1); eq(e.timers.size, 0);
  eq(building.src, nativeSrc); eq(api.getNightOverlayRemoved(), true); e.toggle(true); await flush(); eq(next.renderer.Gb, 0);
  eq(control.getAttribute('aria-checked'), 'true');
  // Unknown map implementations leave CSS working and can attach once ready.
  e.replace({}); e.poll(); eq(next.Hi, nextOriginal); eq(e.timers.size, 1);
  e.w.angular = undefined; e.poll(); e.w.angular = { element: () => ({ injector: () => injectorNotReady() }) }; e.poll();
  function injectorNotReady() { throw new Error('not bootstrapped'); }
  // Cross-tab updates use the persisted preference and restore the native view.
  w.localStorage.setItem(KEY, 'false'); w.dispatchEvent(new w.StorageEvent('storage', { key: KEY })); await flush();
  eq(api.getNightOverlayRemoved(), false); eq(d.documentElement.classList.contains(CLASS), false); eq(e.timers.size, 0);
  e.dom.window.close();
  for (const saved of ['false', 'invalid', '1']) {
    const env = await setup({ saved }); eq(env.w.APES_TRIBE_SKINS.getNightOverlayRemoved(), false); eq(env.map.Hi, env.original); env.dom.window.close();
  }
  const persisted = await setup({ saved: 'true' }); eq(persisted.map.renderer.Gb, 0); eq(persisted.d.querySelector('[data-remove-night]').getAttribute('aria-checked'), 'true'); persisted.dom.window.close();
  const off = await setup({ saved: 'true', enabled: false }); eq(off.map.Hi, off.original); eq(off.timers.size, 0); eq(off.d.querySelector('[data-remove-night]'), null); off.toggle(true); await flush(); eq(off.map.renderer.Gb, 0); off.dom.window.close();
  const day = await setup({ saved: 'true', day: true }); eq(day.map.renderer.Gb, 0); day.w.APES_TRIBE_SKINS.setNightOverlayRemoved(false); await flush(); eq(day.map.renderer.Gb, 0); day.dom.window.close();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  eq(manifest.content_scripts.filter(s => s.world === 'MAIN').some(s => s.js.includes('js/modules/visualTribeSkins/nightOverlayBridge.js')), true);
  eq(manifest.permissions.join(','), 'storage,unlimitedStorage');
  const storageSource = fs.readFileSync(path.join(root, 'js/ui/storageManager.js'), 'utf8');
  const categoryStart = storageSource.indexOf('const CATEGORIES = '), categoryEnd = storageSource.indexOf('  let inventory =', categoryStart);
  const categories = new Function(storageSource.slice(categoryStart, categoryEnd) + '; return CATEGORIES;')();
  for (const key of [KEY, 'apes_visual_tribe_skin_artwork_v1', 'apes_visual_tribe_skin_selection_v1']) {
    const category = categories.find(item => item.match(key)); eq(category.id, 'preferences'); eq(category.protectedData, true);
  }
  eq(categories.find(item => item.match('apes_visual_tribe_skin_assets_v1')).id, 'visual');
  console.log(`Night overlay: ${checks} CSS, canvas bridge, preference and restoration checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
