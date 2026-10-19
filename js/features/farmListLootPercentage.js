(() => {
  'use strict';

  // Travian already exposes exact loot values on the report's carry icon:
  // tooltip-data="percent:15,used:11,max:75".
  // Read that local DOM information only; do not request, scan, or store reports.
  const FEATURE_KEY = 'farmListLootPercentage';
  const LOOT_SELECTOR = '.reportBody .resourcesModule span.loot';
  const CARRY_SELECTOR = 'i.carry[tooltip-translate="Report.CarryCapacityTooltip"][tooltip-data]';
  const BADGE_CLASS = 'qol-farm-loot-percentage';
  const STYLE_ID = 'qol-farm-loot-percentage-styles';
  let refreshQueued = false;

  function enabled() {
    return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY);
  }

  function parseLootData(raw) {
    if (typeof raw !== 'string') return null;
    const usedMatch = raw.match(/(?:^|,)\s*used:\s*(\d+)(?=\s*(?:,|$))/);
    const maxMatch = raw.match(/(?:^|,)\s*max:\s*(\d+)(?=\s*(?:,|$))/);
    if (!usedMatch || !maxMatch) return null;

    const used = Number(usedMatch[1]);
    const capacity = Number(maxMatch[1]);
    if (!Number.isSafeInteger(used) || used < 0 ||
        !Number.isSafeInteger(capacity) || capacity <= 0) return null;

    return { used, capacity, percent: Math.round(used / capacity * 100) };
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      ${LOOT_SELECTOR} > .${BADGE_CLASS} {
        display: inline-block !important;
        margin: 0 7px 0 0 !important;
        padding: 0 !important;
        color: #b82420 !important;
        font: 700 12px/1.2 Arial, sans-serif !important;
        vertical-align: middle !important;
        white-space: nowrap !important;
        text-shadow: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function updateLoot(loot) {
    const icon = loot.querySelector(CARRY_SELECTOR);
    const data = icon ? parseLootData(icon.getAttribute('tooltip-data')) : null;
    let badge = loot.querySelector('.' + BADGE_CLASS);

    if (!enabled() || !data) {
      badge?.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      // Put the percentage immediately before the existing carry icon.
      // Do not replace the game's number or its tooltip.
      loot.insertBefore(badge, icon);
    }
    const label = data.percent + '%';
    if (badge.textContent !== label) badge.textContent = label;
    const title = `${data.used.toLocaleString()} / ${data.capacity.toLocaleString()} resources stolen (${label})`;
    if (badge.title !== title) badge.title = title;
    if (badge.getAttribute('aria-label') !== 'Loot: ' + label) {
      badge.setAttribute('aria-label', 'Loot: ' + label);
    }
  }

  function refresh() {
    refreshQueued = false;
    if (enabled()) addStyles();
    document.querySelectorAll(LOOT_SELECTOR).forEach(updateLoot);
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(refresh);
  }

  function relevantMutation(mutation) {
    if (mutation.type === 'attributes') {
      return mutation.target.matches?.(CARRY_SELECTOR) &&
        !!mutation.target.closest?.(LOOT_SELECTOR);
    }

    const changed = [...mutation.addedNodes, ...mutation.removedNodes];
    // Changes made by our own badge should not trigger another refresh.
    if (mutation.target.matches?.(LOOT_SELECTOR) &&
        changed.some(node => node.nodeType !== Node.ELEMENT_NODE ||
          !node.classList.contains(BADGE_CLASS))) return true;
    return [...mutation.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE &&
      (node.matches?.(LOOT_SELECTOR) || node.querySelector?.(LOOT_SELECTOR)));
  }

  function start() {
    if (!document.body) return;
    const observer = new MutationObserver(mutations => {
      if (mutations.some(relevantMutation)) scheduleRefresh();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['tooltip-data']
    });
    window.addEventListener('qol_setting_changed', event => {
      if (event.detail?.key === FEATURE_KEY) scheduleRefresh();
    });
    scheduleRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
