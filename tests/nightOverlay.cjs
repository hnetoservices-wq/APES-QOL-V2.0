const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/features/visualTribeSkins.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'js/modules/visualTribeSkins/nightOverlayBridge.js'), 'utf8');
const scenesSource = fs.readFileSync(path.join(root, 'js/modules/visualTribeSkins/nightScenes.js'),'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/nightOverlay.html'), 'utf8');
const KEY = 'apes_visual_tribe_skin_night_v2', CLASS = 'qol-daylight-enabled';
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
  // Ordinary-server structure from the supplied village and fields captures:
  // one-time Angular bindings exist, but native night classes/nodes do not.
  if (options.ordinary) {
    d.querySelectorAll('.nightModeDarkness,.nightModeBuildingLights').forEach(n=>n.remove());
    d.querySelectorAll('.ingameContentContainer, .ingameContentContainer *').forEach(n=>{
      for (const c of [...n.classList]) if (c.startsWith('nightMode')) n.classList.remove(c);
      n.style.removeProperty('filter');
    });
    d.querySelector('.villageBackground').innerHTML='<div class="village viewBackground"><img class="location" src="https://static.kingdoms.com/game/0.120.29/layout/images/building/thumb/g15_g00.png"><button class="buildingStatusButton">10</button></div>';
    d.querySelector('.resourcesBackground .viewBackground').classList.add('viewBackground');
  }
  if (options.saved !== undefined) w.localStorage.setItem(KEY, options.saved);
  if (options.legacy !== undefined) w.localStorage.setItem('apes_visual_tribe_skin_remove_night_v1', options.legacy);
  w.isQolEnabled = () => enabled;
  w.Travian = { Config: Object.freeze({ nightMode: true, specialRules: Object.freeze({ nightPeace: true }) }) };
  const config = w.Travian.Config;
  w.setInterval = callback => { timers.set(++id, callback); return id; }; w.clearInterval = id => timers.delete(id);
  const injector = { has: name => name === 'MapService', get: name => { eq(name, 'MapService'); return { yh: () => current }; } };
  w.angular = { element: () => ({ injector: () => injector }) };
  w.eval(bridge); w.eval(source); w.eval(scenesSource); await flush();
  return { w, d, dom, timers, original, config,
    get map() { return current; }, replace(map) { current = map; },
    poll() { for (const callback of timers.values()) callback(); },
    toggle(value) { enabled = value; w.dispatchEvent(new w.CustomEvent('qol_setting_changed', { detail: { key: 'visualTribeSkins', enabled: value } })); } };
}
(async () => {
  for (const day of [true, false]) {
    const e = await setup({day}), {w,d} = e, api=w.APES_TRIBE_SKINS;
    const control=d.querySelector('[data-night-appearance]');
    const nativeClasses=d.querySelector('.ingameContentContainer').className;
    const canvas=d.querySelector('#canvasMap');
    const style=s=>w.getComputedStyle(d.querySelector(s));
    eq(api.getNightAppearance(),false); eq(e.map.renderer.Gb,0);
    eq(control.getAttribute('aria-checked'),'false');
    eq(style('img.location').filter,'none');
    control.click(); await flush();
    eq(api.getNightAppearance(),true); eq(e.map.renderer.Gb,1);
    eq(w.localStorage.getItem(KEY),'true'); eq(control.getAttribute('aria-checked'),'true');
    eq(control.querySelector('[data-night-status]').textContent,'On');
    eq(style('img.location').filter,'brightness(.55) blur(0)');
    eq(style('.nightModeDarkness').opacity,'0.55'); eq(style('.nightModeBuildingLights').display,'block');
    eq(style('.resourcesBackground').display,'none'); eq(style('#outside-game').filter,'grayscale(1)');
    eq(e.map.Hi(0,'native day'),'render:1'); eq(e.map.calls.at(-1)[1],'native day');
    const calls=e.map.calls.length; e.poll(); eq(e.map.calls.length,calls);
    api.set('teuton'); api.setArtwork('standard'); await flush(); eq(api.getNightAppearance(),true);
    api.setNightAppearance('false'); eq(api.getNightAppearance(),true);
    control.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true})); await flush();
    eq(api.getNightAppearance(),false); eq(e.map.renderer.Gb,0); eq(style('.nightModeDarkness').display,'none');
    eq(style('img.location').filter,'none');
    control.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})); await flush(); eq(e.map.renderer.Gb,1);
    const first=e.map, next=mapRenderer(day?0:1), original=next.Hi;
    e.replace(next); e.poll(); eq(first.Hi,e.original); eq(first.renderer.Gb,0); eq(next.renderer.Gb,1);
    const wrapper=next.Hi; w.eval(bridge); eq(next.Hi,wrapper); eq(e.timers.size,1);
    e.toggle(false); await flush(); eq(next.Hi,original); eq(next.renderer.Gb,day?0:1); eq(e.timers.size,0);
    eq(d.documentElement.classList.contains('qol-night-enabled'),false); eq(d.documentElement.classList.contains(CLASS),false);
    e.toggle(true); await flush(); eq(next.renderer.Gb,1);
    eq(d.querySelector('.ingameContentContainer').className,nativeClasses); eq(d.querySelector('#canvasMap'),canvas);
    eq(w.Travian.Config,e.config); eq(w.Travian.Config.specialRules.nightPeace,true);
    w.localStorage.setItem(KEY,'false'); w.dispatchEvent(new w.StorageEvent('storage',{key:KEY})); await flush();
    eq(api.getNightAppearance(),false); eq(next.renderer.Gb,0);
    e.replace({}); e.poll(); eq(next.Hi,original);
    e.replace(mapRenderer()); e.poll(); eq(e.map.renderer.Gb,0);
    e.dom.window.close();
  }
  const ordinary = await setup({ordinary:true,day:true});
  const {w:ow,d:od}=ordinary;
  const scenes=['.villageBackground > .viewBackground','.resourcesBackground > .viewBackground'];
  const baseline=scenes.map(selector=>ow.getComputedStyle(od.querySelector(selector)).filter);
  ordinary.w.APES_TRIBE_SKINS.setNightAppearance(true); await flush();
  for (const selector of scenes) eq(ow.getComputedStyle(od.querySelector(selector).parentElement).filter,'contrast(1.3) blur(0)');
  eq(ow.getComputedStyle(od.querySelector('.resourcesBackground')).display,'none');
  const bulb=od.querySelector('img[data-qol-night-owned]');
  eq(bulb.src,'https://static.kingdoms.com/game/0.120.29/layout/images/building/night/n15_g00.png');
  eq(ow.getComputedStyle(bulb).display,'none'); bulb.dispatchEvent(new ow.Event('load'));
  eq(bulb.hasAttribute('data-qol-night-loaded'),true);
  eq(ow.getComputedStyle(bulb).filter,'none'); eq(ow.getComputedStyle(bulb).pointerEvents,'none');
  eq(od.querySelectorAll('[data-qol-night-owned="background"]').length,2);
  eq(od.querySelector('.villageBackground > .viewBackground').style.filter,'');
  const art=od.querySelector('.villageBackground img.location');
  art.style.top='236px'; art.style.left='533px'; await flush();
  eq(bulb.style.top,'236px'); eq(bulb.style.left,'533px');
  art.src='https://static.kingdoms.com/game/0.120.29/layout/images/halloween/building/thumb/g15_t00.png'; await flush();
  const changed=od.querySelector('img[data-qol-night-owned]');
  eq(bulb.isConnected,false); eq(changed.src,'https://static.kingdoms.com/game/0.120.29/layout/images/halloween/building/night/n15_t00.png');
  changed.dispatchEvent(new ow.Event('error')); eq(changed.isConnected,false);
  await flush(); eq(od.querySelectorAll('img[data-qol-night-owned]').length,0);


  let clicks=0; od.querySelector('.buildingStatusButton').addEventListener('click',()=>clicks++); od.querySelector('.buildingStatusButton').click(); eq(clicks,1);
  // Route switches and replacement views inherit the CSS without rescanning.
  od.querySelector('.resourcesBackground').classList.remove('ng-hide');
  od.querySelector('.resourcesBackground').innerHTML='<div class="resources viewBackground"><div class="resDistribution"></div></div>';
  eq(ow.getComputedStyle(od.querySelector(scenes[1]).parentElement).filter,'contrast(1.3) blur(0)');
  ordinary.w.APES_TRIBE_SKINS.setNightAppearance(false); await flush();
  scenes.forEach((selector,i)=>eq(ow.getComputedStyle(od.querySelector(selector)).filter,baseline[i]));
  ordinary.w.APES_TRIBE_SKINS.setNightAppearance(true); await flush(); ordinary.toggle(false); await flush();
  scenes.forEach((selector,i)=>eq(ow.getComputedStyle(od.querySelector(selector)).filter,baseline[i]));
  ordinary.dom.window.close();
  for (const saved of ['true','false','invalid']) {
    const e=await setup({saved,day:true}); eq(e.w.APES_TRIBE_SKINS.getNightAppearance(),saved==='true'); eq(e.map.renderer.Gb,saved==='true'?1:0); e.dom.window.close();
  }
  const legacy=await setup({legacy:'true'}); eq(legacy.w.APES_TRIBE_SKINS.getNightAppearance(),false); legacy.dom.window.close();
  const off=await setup({saved:'true',enabled:false,day:true}); eq(off.map.Hi,off.original); eq(off.timers.size,0); off.toggle(true); await flush(); eq(off.map.renderer.Gb,1); off.dom.window.close();
  console.log('Night appearance: '+checks+' checks passed on day and night servers.');
})().catch(error=>{console.error(error);process.exitCode=1;});
