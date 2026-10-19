(() => {
  'use strict';
  // Reproduce the native 0.121.7 night layers without changing game config.
  const owned = 'data-qol-night-owned';
  const records = new Map();
  let queued = false;
  const active = () => document.documentElement.classList.contains('qol-night-enabled');
  const style = document.createElement('style');
  style.textContent = `
    html.qol-night-enabled .qol-night-scene{filter:contrast(1.3) blur(0)!important}
    html.qol-night-enabled .qol-night-building,html.qol-night-enabled .qol-night-fields{filter:brightness(.55) blur(0)!important}
    html.qol-night-enabled .qol-night-status{filter:contrast(.7) blur(0)!important}
    html.qol-night-enabled .ingameContentContainer .nightModeDarkness{position:absolute;width:100%;height:100%;z-index:1;pointer-events:none;opacity:.55!important}
    html.qol-night-enabled .villageBackground .nightModeDarkness{background:radial-gradient(at calc(50% - -25px) calc(50% - 20px),rgba(80,60,20,.55),rgba(0,0,10,.55) 30%,rgba(0,0,140,.55) 60%)}
    html.qol-night-enabled .resourcesBackground .nightModeDarkness{background:radial-gradient(at calc(50% - -25px) calc(50% - 20px),rgba(150,120,50,.55),rgba(0,0,10,.55) 9%,rgba(0,0,140,.55) 50%)}
    html.qol-night-enabled .ingameContentContainer .nightModeDarkness[data-qol-night-seasonal]{opacity:1!important;background-image:var(--qol-night-background)!important}
    html.qol-night-enabled .ingameContentContainer img[data-qol-night-owned]{position:absolute!important;pointer-events:none!important;filter:none!important}
    html.qol-night-enabled .ingameContentContainer img[data-qol-night-owned]:not([data-qol-night-loaded]){display:none!important}
    html.qol-night-enabled .ingameContentContainer img[data-qol-night-superseded]{display:none!important}
  `;
  document.head.append(style);
  function release(image, record) {
    record.light.remove();
    record.native?.removeAttribute('data-qol-night-superseded');
    records.delete(image);
  }
  function cleanup() {
    for (const [image, record] of records) release(image, record);
    document.querySelectorAll(`[${owned}]`).forEach(n => n.remove());
    document.querySelectorAll('[data-qol-night-seasonal]').forEach(n => {
      n.removeAttribute('data-qol-night-seasonal');
      n.style.removeProperty('--qol-night-background');
    });
    for (const cls of ['qol-night-scene','qol-night-building','qol-night-fields','qol-night-status'])
      document.querySelectorAll('.' + cls).forEach(n => n.classList.remove(cls));
  }
  function sync() {
    queued = false;
    if (!active()) { cleanup(); return; }
    for (const [image, record] of records) if (!image.isConnected || image.src !== record.src) release(image, record);
    document.querySelectorAll('.ingameContentContainer .villageBackground,.ingameContentContainer .resourcesBackground').forEach(scene => {
      const view = scene.querySelector(':scope > .viewBackground');
      if (!view) return;
      scene.classList.add('qol-night-scene');
      scene.querySelectorAll('.buildingStatusButton').forEach(n => n.classList.add('qol-night-status'));
      scene.querySelectorAll('.resDistribution,.wwMist').forEach(n => n.classList.add('qol-night-fields'));
      let darkness = view.querySelector(':scope > .nightModeDarkness');
      if (!darkness) {
        darkness = document.createElement('div');
        darkness.className = 'nightModeDarkness';
        darkness.setAttribute(owned, 'background');
        view.prepend(darkness);
      }
      const images = [...scene.querySelectorAll('img.location[src*="/building/thumb/"]')];
      const sample = images.map(n => n.src).find(src => /^https:\/\/static\.kingdoms\.com\/game\/[^/]+\/layout\/images\//.test(src));
      const artwork = window.APES_TRIBE_SKINS?.getArtwork();
      const seasonal = artwork === 'halloween' || artwork === 'server' && document.body.classList.contains('halloweenTheme');
      if (seasonal && sample) {
        const root = sample.slice(0, sample.indexOf('/layout/images/') + 15);
        const name = scene.classList.contains('resourcesBackground') ? 'resources_view' : view.classList.contains('village-water') ? 'village_view_water' : 'village_view';
        const value = `url("${root}halloween/illustration/villageView/${name}.jpg")`;
        if (darkness.style.getPropertyValue('--qol-night-background') !== value) darkness.style.setProperty('--qol-night-background', value);
        if (!darkness.hasAttribute('data-qol-night-seasonal')) darkness.setAttribute('data-qol-night-seasonal','');
      } else if (darkness.hasAttribute('data-qol-night-seasonal')) {
        darkness.removeAttribute('data-qol-night-seasonal');
        darkness.style.removeProperty('--qol-night-background');
      }
      for (const image of images) {
        image.classList.add('qol-night-building');
        let record = records.get(image);
        if (record) {
          const geometry = (image.getAttribute('style') || '') + (record.light.hasAttribute('data-qol-night-loaded') ? '' : ';display:none!important');
          if (record.light.getAttribute('style') !== geometry) record.light.setAttribute('style',geometry);
          continue;
        }
        const url = new URL(image.src);
        if (url.origin !== 'https://static.kingdoms.com') continue;
        const match = url.pathname.match(/^(.*\/layout\/images\/)(halloween\/)?building\/thumb\/g(\d+)([^/]*\.png)$/);
        if (!match) continue;
        const native = [...image.parentElement.children].find(n => n.classList.contains('nightModeBuildingLights') && !n.hasAttribute(owned) && ['top','left','zIndex'].every(key => n.style[key] === image.style[key])) || null;
        // Existing native lights already match when the displayed art is native.
        if (native && image.src === image.getAttribute('ng-src')) continue;
        const wall = ['31','32','33'].includes(match[3]);
        // Native Halloween wall lights use h, ordinary building lights use n.
        const prefix = wall && seasonal ? 'h' : 'n';
        const folder = wall && seasonal ? 'halloween/' : match[2] || '';
        const light = document.createElement('img');
        light.className = 'nightModeBuildingLights';
        light.alt = '';
        light.setAttribute('aria-hidden','true');
        light.setAttribute(owned,'light');
        light.setAttribute('style', (image.getAttribute('style') || '') + ';display:none!important');
        record = {src:image.src, light, native};
        records.set(image,record);
        light.onload = () => {
          if (records.get(image) !== record || !active() || image.src !== record.src) return;
          light.setAttribute('data-qol-night-loaded','');
          light.style.removeProperty('display');
          native?.setAttribute('data-qol-night-superseded','');
        };
        light.onerror = () => { light.remove(); };
        // Missing assets stay absent: no broken-image icon or invented lighting.
        light.src = url.origin + match[1] + folder + 'building/night/' + prefix + match[3] + match[4];
        image.after(light);
      }
    });
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  }
  new MutationObserver(mutations => {
    if (mutations.some(m => m.target === document.documentElement ||
      m.type === 'attributes' && !m.target.hasAttribute?.(owned) && (m.attributeName === 'src' || m.attributeName === 'style') ||
      m.type === 'childList' && [...m.addedNodes,...m.removedNodes].some(n => n.nodeType === 1 && !n.hasAttribute(owned)))) schedule();
  }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','src','style']});
  window.addEventListener('qol_setting_changed',schedule);
  sync();
})();
