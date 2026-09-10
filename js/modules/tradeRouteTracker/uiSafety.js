(() => {
  'use strict';

  const PANEL_ID = 'qol-trade-route-tracker';
  const LAUNCHER_ID = 'qol-trade-route-tracker-toggle-btn';
  const STYLE_ID = 'qol-trade-route-ui-safety-styles';

  let scheduled = false;

  function copyElement(source, tagName = 'div') {
    const replacement = document.createElement(tagName);
    for (const attribute of Array.from(source.attributes || [])) {
      if (attribute.name === 'type') continue;
      replacement.setAttribute(attribute.name, attribute.value);
    }
    replacement.innerHTML = source.innerHTML;
    replacement.setAttribute('role', 'button');
    replacement.tabIndex = 0;
    return replacement;
  }

  function bindKeyboard(element) {
    if (!element || element.dataset.qolKeyboardBound === '1') return;
    element.dataset.qolKeyboardBound = '1';
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      element.click();
    });
  }

  function bindLauncher(element) {
    if (!element || element.dataset.qolTrackerLauncherBound === '1') return;
    element.dataset.qolTrackerLauncherBound = '1';
    bindKeyboard(element);
    element.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const api = window.APES_TRADE_ROUTE_TRACKER;
      if (!api) return;
      const panel = document.getElementById(PANEL_ID);
      if (panel?.classList.contains('open')) api.close?.();
      else api.open?.();
    });
  }

  function sanitizeLauncher() {
    let launcher = document.getElementById(LAUNCHER_ID);
    if (!launcher) return;

    if (launcher.tagName === 'BUTTON') {
      const replacement = copyElement(launcher);
      launcher.replaceWith(replacement);
      launcher = replacement;
    }

    launcher.classList.add('qol-tracker-apes-control');
    launcher.setAttribute('aria-label', 'Trade Route Tracker');
    bindLauncher(launcher);
  }

  function sanitizePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    panel.querySelectorAll('button').forEach(button => {
      const replacement = copyElement(button);
      replacement.classList.add('qol-tracker-apes-control');
      button.replaceWith(replacement);
      bindKeyboard(replacement);
    });

    panel.querySelectorAll('[data-action], .qol-tr-tab').forEach(bindKeyboard);
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${LAUNCHER_ID},
      #${PANEL_ID} .qol-tracker-apes-control,
      #${PANEL_ID} [data-action],
      #${PANEL_ID} .qol-tr-tab {
        -webkit-appearance:none!important;
        appearance:none!important;
        text-shadow:none!important;
      }

      #${LAUNCHER_ID}::before,
      #${LAUNCHER_ID}::after,
      #${PANEL_ID} .qol-tracker-apes-control::before,
      #${PANEL_ID} .qol-tracker-apes-control::after {
        content:none!important;
        display:none!important;
        background:none!important;
      }

      #${LAUNCHER_ID} {
        box-sizing:border-box!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        width:30px!important;
        min-width:30px!important;
        max-width:30px!important;
        height:30px!important;
        min-height:30px!important;
        max-height:30px!important;
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
        user-select:none!important;
      }

      #${LAUNCHER_ID}:hover,
      #${LAUNCHER_ID}:focus-visible {
        background:#f7f5f0!important;
        box-shadow:0 2px 5px rgba(0,0,0,.28),0 0 0 2px color-mix(in srgb,var(--qol-accent) 20%,transparent)!important;
      }

      #${PANEL_ID} .qol-tr-btn,
      #${PANEL_ID} .qol-tr-tab,
      #${PANEL_ID} .qol-tr-close {
        font-family:Arial,Helvetica,sans-serif!important;
        text-shadow:none!important;
        box-shadow:none!important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function sanitize() {
    scheduled = false;
    ensureStyles();
    sanitizeLauncher();
    sanitizePanel();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(sanitize);
  }

  function init() {
    sanitize();

    const observer = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation =>
        Array.from(mutation.addedNodes || []).some(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return false;
          return node.id === LAUNCHER_ID ||
            node.id === PANEL_ID ||
            node.matches?.(`#${PANEL_ID} button`) ||
            node.querySelector?.(`#${LAUNCHER_ID}, #${PANEL_ID}, #${PANEL_ID} button`);
        })
      );
      if (relevant) schedule();
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(sanitize, 0);
    window.setTimeout(sanitize, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
