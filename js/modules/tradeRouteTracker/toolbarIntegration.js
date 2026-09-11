(() => {
  'use strict';

  const FEATURE_KEY = 'tradeRouteTracker';
  const SOURCE_ID = 'qol-trade-route-tracker-toggle-btn';
  const HOST_ID = 'qol-responsive-toolbar';
  const DEPOT_ID = 'qol-toolbar-source-depot';
  const MENU_ID = 'qol-responsive-toolbar-menu';
  const PROXY_ID = 'qol-trade-route-tracker-toolbar-proxy';
  const MENU_ITEM_ID = 'qol-trade-route-tracker-toolbar-menu-item';
  const STYLE_ID = 'qol-trade-route-tracker-toolbar-integration-styles';

  let queued = false;

  function enabled() {
    if (typeof window.isQolEnabled === 'function') return window.isQolEnabled(FEATURE_KEY) === true;
    try {
      const value = localStorage.getItem(`qol_${FEATURE_KEY}`);
      return value === null ? true : value !== 'false';
    } catch (_) {
      return true;
    }
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${HOST_ID} #${PROXY_ID}{
        position:relative!important;
        inset:auto!important;
        left:auto!important;
        right:auto!important;
        top:auto!important;
        bottom:auto!important;
        flex:0 0 var(--qol-toolbar-size,30px)!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        width:var(--qol-toolbar-size,30px)!important;
        min-width:var(--qol-toolbar-size,30px)!important;
        max-width:var(--qol-toolbar-size,30px)!important;
        height:var(--qol-toolbar-size,30px)!important;
        min-height:var(--qol-toolbar-size,30px)!important;
        max-height:var(--qol-toolbar-size,30px)!important;
        margin:0!important;
        padding:0!important;
        border:2px solid var(--qol-accent)!important;
        border-radius:50%!important;
        outline:0!important;
        background:var(--qol-accent-soft)!important;
        color:var(--qol-accent-ink)!important;
        box-shadow:0 2px 4px rgba(0,0,0,.22)!important;
        font:800 9px/1 Arial,Helvetica,sans-serif!important;
        cursor:pointer!important;
        opacity:1!important;
        visibility:visible!important;
        transform:none!important;
        transition:transform .10s ease,background-color .10s ease,box-shadow .10s ease!important;
        user-select:none!important;
      }
      #${HOST_ID} #${PROXY_ID}:hover,
      #${HOST_ID} #${PROXY_ID}:focus-visible{
        background:#f7f5f0!important;
        box-shadow:0 2px 5px rgba(0,0,0,.28),0 0 0 2px color-mix(in srgb,var(--qol-accent) 20%,transparent)!important;
        transform:scale(1.07)!important;
      }
      #${HOST_ID}.qol-toolbar-collapsed-host #${PROXY_ID}{display:none!important}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function triggerSource() {
    const source = document.getElementById(SOURCE_ID);
    if (!source) return;
    source.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0
    }));
  }

  function parkSource() {
    const source = document.getElementById(SOURCE_ID);
    const depot = document.getElementById(DEPOT_ID);
    if (!source || !depot || source.parentElement === depot) return;
    if (source.closest(`#${HOST_ID},#${MENU_ID}`)) return;
    depot.appendChild(source);
  }

  function ensureProxy() {
    const host = document.getElementById(HOST_ID);
    const source = document.getElementById(SOURCE_ID);
    if (!host || !source || !enabled()) {
      document.getElementById(PROXY_ID)?.remove();
      return;
    }

    let proxy = document.getElementById(PROXY_ID);
    if (!proxy) {
      proxy = document.createElement('div');
      proxy.id = PROXY_ID;
      proxy.className = 'qol-toolbar-feature-proxy';
      proxy.setAttribute('role', 'button');
      proxy.setAttribute('tabindex', '0');
      proxy.textContent = 'TR';
      proxy.title = 'Trade Route Tracker';
      proxy.setAttribute('aria-label', 'Trade Route Tracker');
      const activate = event => {
        event.preventDefault();
        event.stopPropagation();
        triggerSource();
      };
      proxy.addEventListener('click', activate);
      proxy.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') activate(event);
      });
      host.appendChild(proxy);
    } else if (proxy.parentElement !== host) {
      host.appendChild(proxy);
    }
  }

  function ensureOverflowItem() {
    const menu = document.getElementById(MENU_ID);
    const host = document.getElementById(HOST_ID);
    if (!menu || !host?.classList.contains('qol-toolbar-collapsed-host') || !enabled()) {
      document.getElementById(MENU_ITEM_ID)?.remove();
      return;
    }

    let item = document.getElementById(MENU_ITEM_ID);
    if (item && item.parentElement === menu) return;
    item?.remove();

    item = document.createElement('div');
    item.id = MENU_ITEM_ID;
    item.className = 'qol-responsive-toolbar-item';
    item.setAttribute('role', 'menuitem');
    item.setAttribute('tabindex', '0');
    item.innerHTML = '<span>Trade Route Tracker</span><span class="qol-responsive-toolbar-arrow">›</span>';
    const activate = event => {
      event.preventDefault();
      event.stopPropagation();
      menu.classList.remove('qol-open');
      triggerSource();
    };
    item.addEventListener('click', activate);
    item.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });

    const settings = menu.querySelector('[data-qol-settings="true"]');
    menu.insertBefore(item, settings || null);
  }

  function sync() {
    queued = false;
    ensureStyles();
    parkSource();
    ensureProxy();
    ensureOverflowItem();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  }

  function init() {
    ensureStyles();
    schedule();

    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    window.addEventListener('qol_setting_changed', event => {
      if (event.detail?.key === FEATURE_KEY) schedule();
    });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('qol_theme_changed', schedule);

    setTimeout(schedule, 100);
    setTimeout(schedule, 500);
    setTimeout(schedule, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
