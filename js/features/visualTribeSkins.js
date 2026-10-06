(() => {
  'use strict';

  const FEATURE_KEY = 'visualTribeSkins';
  const TOOLBAR_BUTTON_ID = 'qol-tribe-skins-toggle-btn';
  const PANEL_ID = 'qol-tribe-skins-panel';
  const SELECTION_KEY = 'apes_visual_tribe_skin_selection_v1';
  const ARTWORK_KEY = 'apes_visual_tribe_skin_artwork_v1';
  const ARTWORK = Object.freeze({
    server: { name: 'Server default', mark: '↺' },
    standard: { name: 'Standard', mark: '☀' },
    halloween: { name: 'Halloween', mark: '🎃' }
  });
  const SKINS = Object.freeze({
    roman: {
      name: 'Roman',
      prefix: 'r',
      mark: 'R'
    },
    teuton: {
      name: 'Teuton',
      prefix: 't',
      mark: 'T'
    },
    gaul: {
      name: 'Gaul',
      prefix: 'g',
      mark: 'G'
    }
  });
  let observer = null;
  let scheduled = false;
  let sessionSelection = readSelection();
  let sessionArtwork = readArtwork();
  const artworkLoads = new Map();
  const imageRequests = new WeakMap();
  function enabled() {
    return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY);
  }
  function readSelection() {
    try {
      const saved = localStorage.getItem(SELECTION_KEY);
      return Object.hasOwn(SKINS, saved) ? saved : '';
    } catch (_) {
      return '';
    }
  }
  function getSelection() {
    return sessionSelection;
  }
  function readArtwork() {
    try {
      const saved = localStorage.getItem(ARTWORK_KEY);
      return Object.hasOwn(ARTWORK, saved) ? saved : 'server';
    } catch (_) {
      return 'server';
    }
  }
  function saveArtwork(choice) {
    if (!Object.hasOwn(ARTWORK, choice)) return;
    sessionArtwork = choice;
    try {
      localStorage.setItem(ARTWORK_KEY, choice);
    } catch (_) {}
    applySelectedSkin();
    refreshUi();
  }
  function saveSelection(choice) {
    if (!Object.hasOwn(SKINS, choice)) return;
    sessionSelection = choice;
    try {
      localStorage.setItem(SELECTION_KEY, choice);
    } catch (_) {}
    applySelectedSkin();
    refreshUi();
  }
  function cleanUrl(value) {
    try {
      const url = new URL(value, location.href);
      url.search = '';
      url.hash = '';
      return url.href;
    } catch (_) {
      return String(value || '').split(/[?#]/)[0];
    }
  }
  function buildingPath(value) {
    try {
      return new URL(value, location.href).pathname.match(/\/g(\d+)_([rgt])(\d+)\.png$/i);
    } catch (_) {
      return null;
    }
  }
  function findBuildingLevel(image) {
    const slotMatch = String(image.id || '').match(/buildingImage(\d+)/i);
    const slotId = slotMatch?.[1];
    const nearby = [image, image.parentElement, image.closest('[id*="location" i],[class*="location" i]'), slotId ? document.getElementById('buildingLevel' + slotId) : null, slotId ? document.getElementById('level' + slotId) : null].filter(Boolean);
    const values = [];
    nearby.forEach(element => {
      values.push(element.getAttribute?.('data-level'), element.getAttribute?.('data-building-level'), element.getAttribute?.('aria-label'), element.getAttribute?.('title'));
      element.querySelectorAll?.('[data-level],[data-building-level],[class*="level" i],[id*="level" i]').forEach(child => {
        values.push(child.getAttribute('data-level'), child.getAttribute('data-building-level'), child.textContent);
      });
    });
    for (const value of values) {
      const match = String(value || '').match(/\b(?:level\s*)?([0-9]{1,2})\b/i);
      if (match) return Number(match[1]);
    }
    return null;
  }
  function originalFor(image) {
    const current = image.src || image.currentSrc;
    const original = image.dataset.qolTribeSkinOriginal || '';
    const applied = image.dataset.qolTribeSkinApplied || '';
    if (!original || cleanUrl(current) !== cleanUrl(original) && cleanUrl(current) !== cleanUrl(applied)) {
      image.dataset.qolTribeSkinOriginal = current;
      delete image.dataset.qolTribeSkinApplied;
      delete image.dataset.qolTribeSkinFailed;
      return current;
    }
    return original;
  }
  function targetsFor(image, choice) {
    const skin = SKINS[choice];
    const original = originalFor(image);
    const target = new URL(original, location.href);
    const path = target.pathname.match(/^(.*\/layout\/images\/)(halloween\/)?building\/thumb\/(g\d+[^/]*\.png)$/i);
    if (!path) return [];
    const match = buildingPath(original);
    let filename = path[3];
    if (match && skin) {
      const measuredLevel = findBuildingLevel(image);
      const sourceTier = Number(match[3] || 0);
      const level = Number.isInteger(measuredLevel) ? measuredLevel : sourceTier;
      const tier = Math.max(0, Math.min(20, Math.floor(level / 10) * 10));
      filename = filename.replace(/_([rgt])\d+(\.png)$/i, '_' + skin.prefix + String(tier).padStart(2, '0') + '$2');
    }
    const halloween = sessionArtwork === 'halloween' || sessionArtwork === 'server' && Boolean(path[2]);
    target.search = '';
    target.hash = '';
    target.pathname = path[1] + (halloween ? 'halloween/' : '') + 'building/thumb/' + filename;
    const candidates = [target.href];
    // Seasonal sets are partial: keep the requested tribe's regular artwork
    // when that building has no Halloween variant, then retain the native image.
    if (halloween) {
      target.pathname = path[1] + 'building/thumb/' + filename;
      candidates.push(target.href);
    }
    candidates.push(original);
    return [...new Set(candidates)];
  }
  function artworkAvailable(url) {
    if (!artworkLoads.has(url)) {
      artworkLoads.set(url, new Promise(resolve => {
        const probe = new Image();
        const finish = success => {
          probe.onload = null;
          probe.onerror = null;
          resolve(success);
        };
        probe.onload = () => finish(probe.naturalWidth > 0);
        probe.onerror = () => finish(false);
        probe.src = url;
      }));
    }
    return artworkLoads.get(url);
  }
  function restoreImage(image) {
    imageRequests.delete(image);
    const original = image.dataset.qolTribeSkinOriginal;
    if (!original) return;
    delete image.dataset.qolTribeSkinApplied;
    delete image.dataset.qolTribeSkinFailed;
    if (cleanUrl(image.src) !== cleanUrl(original)) image.src = original;
  }
  function restoreOriginalSkins() {
    document.querySelectorAll('img[data-qol-tribe-skin-original]').forEach(restoreImage);
  }
  function applyToImage(image, choice) {
    const candidates = targetsFor(image, choice);
    if (!candidates.length) return;
    const original = image.dataset.qolTribeSkinOriginal;
    const key = candidates.join('\n');
    const previous = imageRequests.get(image);
    if (previous?.key === key && previous.original === original &&
        (!previous.target || cleanUrl(image.src) === cleanUrl(previous.target))) return;
    const request = { key, original };
    imageRequests.set(image, request);
    const currentRequest = () => imageRequests.get(image) === request && enabled() && image.isConnected &&
      (cleanUrl(image.src) === cleanUrl(original) || cleanUrl(image.src) === cleanUrl(image.dataset.qolTribeSkinApplied));
    const apply = async () => {
      for (const target of candidates) {
        if (!currentRequest()) return;
        // The native image is already known and is the final safe fallback.
        if (cleanUrl(target) !== cleanUrl(original) && !await artworkAvailable(target)) continue;
        if (!currentRequest()) return;
        request.target = target;
        image.dataset.qolTribeSkinApplied = target;
        delete image.dataset.qolTribeSkinFailed;
        if (cleanUrl(image.src) !== cleanUrl(target)) image.src = target;
        return;
      }
    };
    void apply();
  }
  function applySelectedSkin() {
    if (!enabled()) {
      restoreOriginalSkins();
      return;
    }
    const choice = getSelection();
    if (!choice && sessionArtwork === 'server') {
      restoreOriginalSkins();
      return;
    }
    document.querySelectorAll('img.location[src*="/building/thumb/"]').forEach(image => {
      applyToImage(image, choice);
    });
  }
  function refreshUi() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const selected = getSelection();
    panel.querySelectorAll('[data-skin]').forEach(control => {
      const active = control.dataset.skin === selected;
      control.classList.toggle('qol-active', active);
      control.setAttribute('aria-pressed', String(active));
    });
    panel.querySelectorAll('[data-artwork]').forEach(control => {
      const active = control.dataset.artwork === sessionArtwork;
      control.classList.toggle('qol-active', active);
      control.setAttribute('aria-pressed', String(active));
    });
    const current = panel.querySelector('.qol-tribe-skins-current');
    if (!current) return;
    const tribe = selected ? SKINS[selected].name : 'Your tribe';
    current.textContent = tribe + ' · ' + ARTWORK[sessionArtwork].name + ' artwork. Buildings without a Halloween variant use regular artwork.';
  }
  function injectStyles() {
    if (document.getElementById('qol-tribe-skins-styles')) return;
    const style = document.createElement('style');
    style.id = 'qol-tribe-skins-styles';
    style.textContent = `
            #${TOOLBAR_BUTTON_ID}{position:fixed!important;display:none!important;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;margin:0!important;padding:0!important;border:2px solid var(--qol-accent)!important;border-radius:50%!important;background:var(--qol-accent-soft)!important;color:var(--qol-accent-ink)!important;box-shadow:0 2px 4px rgba(0,0,0,.22)!important;cursor:pointer!important;user-select:none!important;box-sizing:border-box!important;z-index:9999!important;font:700 17px Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${TOOLBAR_BUTTON_ID}:hover{transform:scale(1.08)!important;background:#f7f5f0!important}
            #${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${PANEL_ID}{position:fixed!important;right:24px!important;top:74px!important;z-index:1000001!important;display:none!important;flex-direction:column!important;width:min(390px,calc(100vw - 32px))!important;max-height:calc(100vh - 96px)!important;border:3px solid var(--qol-border)!important;border-radius:5px!important;background:#f7f5f0!important;box-shadow:0 10px 30px rgba(0,0,0,.5)!important;overflow:hidden!important;color:#332719!important}
            #${PANEL_ID}.qol-tribe-skins-open{display:flex!important}
            #${PANEL_ID} .qol-tribe-skins-header{display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 auto!important;padding:9px 11px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-dark))!important;color:#f7f5f0!important;font-size:13px!important;font-weight:700!important}
            #${PANEL_ID} .qol-tribe-skins-close{display:flex!important;align-items:center!important;justify-content:center!important;width:22px!important;height:22px!important;border-radius:3px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;font-size:20px!important;font-weight:700!important;line-height:1!important;cursor:pointer!important}
            #${PANEL_ID} .qol-tribe-skins-close:hover{background:rgba(255,255,255,.15)!important}
            #${PANEL_ID} .qol-tribe-skins-body{display:flex!important;flex-direction:column!important;gap:11px!important;min-height:0!important;padding:13px!important;overflow:auto!important;background:#f7f5f0!important;color:#332719!important;font-size:10px!important;line-height:1.45!important}
            #${PANEL_ID} .qol-tribe-skins-copy{margin:0!important;color:#5f513f!important}
            #${PANEL_ID} .qol-tribe-skins-choice-label{margin:1px 0 -5px!important;color:#5f513f!important;font-size:10px!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.4px!important}
            #${PANEL_ID} .qol-tribe-skins-choices{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important}
            #${PANEL_ID} .qol-tribe-skins-choice{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:6px!important;min-width:0!important;min-height:82px!important;padding:9px 5px!important;border:1px solid #9c8668!important;border-radius:4px!important;background:linear-gradient(to bottom,#fff,#f0e7da)!important;color:var(--qol-text-accent)!important;cursor:pointer!important;user-select:none!important;font-size:10px!important;font-weight:700!important;text-align:center!important;box-shadow:0 1px 2px rgba(0,0,0,.12)!important}
            #${PANEL_ID} .qol-tribe-skins-choice:hover{border-color:#6e5435!important;background:#fff6e5!important;transform:translateY(-1px)!important}
            #${PANEL_ID} .qol-tribe-skins-choice:focus-visible{outline:2px solid #b9872d!important;outline-offset:2px!important}
            #${PANEL_ID} .qol-tribe-skins-mark{display:flex!important;align-items:center!important;justify-content:center!important;width:37px!important;height:37px!important;border:2px solid var(--qol-accent-hover)!important;border-radius:50%!important;background:#f8f1e5!important;color:var(--qol-accent-ink)!important;font:700 17px Georgia,serif!important}
            #${PANEL_ID} .qol-tribe-skins-choice.qol-active{border-color:#487315!important;background:linear-gradient(to bottom,#7db830,#5f941f)!important;color:#fff!important;box-shadow:0 0 0 1px rgba(72,115,21,.3),0 2px 5px rgba(0,0,0,.2)!important}
            #${PANEL_ID} .qol-tribe-skins-choice.qol-active .qol-tribe-skins-mark{border-color:#fff!important;background:#487315!important;color:#fff!important}
            #${PANEL_ID} .qol-tribe-skins-current{margin:0!important;padding:8px 9px!important;border:1px solid #d6cab8!important;border-radius:3px!important;background:#fff!important;color:#5f513f!important;font-size:9px!important;text-align:center!important}
            #${PANEL_ID} .qol-tribe-skins-note{margin:0!important;color:#89765d!important;font-size:8px!important;text-align:center!important}
            @media(max-width:430px){#${PANEL_ID} .qol-tribe-skins-choices{grid-template-columns:1fr!important}#${PANEL_ID} .qol-tribe-skins-choice{min-height:55px!important;flex-direction:row!important}}
        `;
    document.head.appendChild(style);
  }
  function activate(element, handler) {
    if (!element) return;
    element.addEventListener('click', handler);
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      handler(event);
    });
  }
  function injectUi() {
    if (!enabled()) return;
    injectStyles();
    let button = document.getElementById(TOOLBAR_BUTTON_ID);
    if (!button) {
      button = document.createElement('div');
      button.id = TOOLBAR_BUTTON_ID;
      button.title = 'Visual Tribe Skin';
      button.setAttribute('role', 'button');
      button.setAttribute('tabindex', '0');
      button.setAttribute('aria-label', 'Open Visual Tribe Skin');
      button.textContent = '◈';
      activate(button, event => {
        event.preventDefault();
        event.stopPropagation();
        document.getElementById(PANEL_ID)?.classList.toggle('qol-tribe-skins-open');
      });
      document.body.appendChild(button);
    }
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.innerHTML = `
                <div class="qol-tribe-skins-header">
                    <span>Visual Tribe Skin</span>
                    <div class="qol-tribe-skins-close" data-close role="button" tabindex="0" aria-label="Close">×</div>
                </div>
                <div class="qol-tribe-skins-body">
                    <p class="qol-tribe-skins-copy">Choose your tribe and building artwork for Village View.</p>
                    <div class="qol-tribe-skins-choice-label">Tribe</div>
                    <div class="qol-tribe-skins-choices">
                        ${Object.entries(SKINS).map(([key, skin]) => `
                            <div class="qol-tribe-skins-choice" data-skin="${key}" role="button" tabindex="0" aria-pressed="false">
                                <span class="qol-tribe-skins-mark">${skin.mark}</span>
                                <span>${skin.name}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="qol-tribe-skins-choice-label">Artwork</div>
                    <div class="qol-tribe-skins-choices">
                        ${Object.entries(ARTWORK).map(([key, artwork]) => `
                            <div class="qol-tribe-skins-choice" data-artwork="${key}" role="button" tabindex="0" aria-pressed="false">
                                <span class="qol-tribe-skins-mark">${artwork.mark}</span>
                                <span>${artwork.name}</span>
                            </div>
                        `).join('')}
                    </div>
                    <p class="qol-tribe-skins-current"></p>
                    <p class="qol-tribe-skins-note">Your choice is saved in this browser and applies automatically. No village scan is needed.</p>
                </div>
            `;
      activate(panel.querySelector('[data-close]'), () => panel.classList.remove('qol-tribe-skins-open'));
      panel.querySelectorAll('[data-skin]').forEach(control => {
        activate(control, () => saveSelection(control.dataset.skin));
      });
      panel.querySelectorAll('[data-artwork]').forEach(control => {
        activate(control, () => saveArtwork(control.dataset.artwork));
      });
      document.body.appendChild(panel);
    }
    panel.style.removeProperty('display');
    refreshUi();
    applySelectedSkin();
    window.qolRepositionAllButtons?.();
  }
  function start() {
    if (!enabled()) return;
    injectUi();
    applySelectedSkin();
    if (observer) return;
    observer = new MutationObserver(mutations => {
      if (!enabled()) return;
      const affectsBuildings = mutations.some(mutation => {
        if (mutation.type === 'attributes') return mutation.target instanceof HTMLImageElement;
        return [...mutation.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE && (node.matches?.('img.location') || node.querySelector?.('img.location')));
      });
      if (!affectsBuildings || scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        applySelectedSkin();
      });
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    document.getElementById(PANEL_ID)?.classList.remove('qol-tribe-skins-open');
  });
  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key !== FEATURE_KEY) return;
    if (event.detail.enabled) {
      start();
    } else {
      document.getElementById(PANEL_ID)?.classList.remove('qol-tribe-skins-open');
      document.getElementById(PANEL_ID)?.style.setProperty('display', 'none', 'important');
      restoreOriginalSkins();
    }
  });
  window.APES_TRIBE_SKINS = Object.freeze({
    get: getSelection,
    set: saveSelection,
    getArtwork: () => sessionArtwork,
    setArtwork: saveArtwork,
    apply: applySelectedSkin,
    restore: restoreOriginalSkins
  });
  const begin = () => {
    start();
    console.info('[APES Visual Tribe Skin] Ready. No village scan required.');
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', begin, {
      once: true
    });
  } else {
    begin();
  }
})();
