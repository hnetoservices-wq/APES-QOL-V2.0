(() => {
  'use strict';

  // Read-only enhancement: uses only loot/carry values already exposed by the game.
  const FEATURE_KEY = 'farmListLootPercentage';
  const BADGE_CLASS = 'apes-farm-loot-percentage';
  const STYLE_ID = 'apes-farm-loot-percentage-style';
  const FARM_SELECTOR = '[class*="farmList" i], [id*="farmList" i], [class*="farm-list" i], [id*="farm-list" i]';
  const ROW_SELECTOR = 'tr, [class*="farmListEntry" i], [class*="farmListRow" i], [class*="farm-list-entry" i], [class*="farm-list-row" i]';
  const LOOT_SELECTOR = '[class*="loot" i], [class*="bounty" i], [class*="plunder" i], [class*="stolen" i], [class*="haul" i], [class*="resource" i], [data-loot], [data-stolen], [data-bounty]';
  const CARRY_SELECTOR = '[class*="capacity" i], [class*="carry" i], [data-capacity], [data-max-capacity], [data-carry-capacity]';
  let scheduled = false;

  function enabled() {
    return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY) === true;
  }

  function numberFrom(value) {
    const text = String(value ?? '').trim();
    // Resources and carrying capacity are integer amounts; avoid guessing from mixed text.
    if (!text || !/^[0-9][0-9.,\s\u00a0\u202f]*$/.test(text)) return null;
    const number = Number(text.replace(/[.,\s\u00a0\u202f]/g, ''));
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
  }

  function pairFrom(value) {
    const text = String(value ?? '').replace(/[\u00a0\u202f]/g, ' ').trim();
    // Examples: 15 / 100, 15 of 100, "Loot: 15 / 100".
    const match = text.match(/(?:^|\b(?:loot|bounty|haul|stolen|plunder|resources?)\s*:?\s*)([0-9][0-9., ]*)\s*(?:\/|\bof\b)\s*([0-9][0-9., ]*)\s*(?:resources?|capacity)?\s*$/i);
    if (!match) return null;
    const looted = numberFrom(match[1]);
    const capacity = numberFrom(match[2]);
    return looted !== null && capacity > 0 ? { looted, capacity } : null;
  }

  function attributeNumber(node, names) {
    for (const name of names) {
      const value = node.getAttribute(name);
      if (value === null) continue;
      const number = numberFrom(value);
      if (number !== null) return number;
    }
    return null;
  }

  function sourceText(node) {
    if (!node.querySelector?.('.' + BADGE_CLASS)) return node.textContent;
    const copy = node.cloneNode(true);
    copy.querySelectorAll('.' + BADGE_CLASS).forEach(badge => badge.remove());
    return copy.textContent;
  }

  function scalarFrom(node) {
    if (!node) return null;
    for (const text of [sourceText(node), node.getAttribute('title'), node.getAttribute('aria-label')]) {
      const value = numberFrom(text);
      if (value !== null) return value;
      const labelled = String(text || '').trim().match(/^(?:loot|bounty|haul|stolen(?: resources)?|resources? stolen|carrying capacity|capacity|carry)\s*:\s*([0-9][0-9.,\s]*)$/i);
      if (labelled) {
        const amount = numberFrom(labelled[1]);
        if (amount !== null) return amount;
      }
    }
    return null;
  }

  function getPairAndAnchor(row) {
    // Some versions expose both metrics as data attributes on the entry.
    const nodes = [row, ...row.querySelectorAll('[data-loot], [data-stolen], [data-bounty], [data-capacity], [data-max-capacity], [data-carry-capacity]')];
    for (const node of nodes) {
      const looted = attributeNumber(node, ['data-loot', 'data-stolen', 'data-bounty', 'data-looted', 'data-loot-amount']);
      const capacity = attributeNumber(node, ['data-max-capacity', 'data-carry-capacity', 'data-capacity', 'data-max-loot']);
      if (looted !== null && capacity > 0) return { looted, capacity, anchor: node };
    }

    const lootNodes = row.matches(LOOT_SELECTOR) ? [row] : [...row.querySelectorAll(LOOT_SELECTOR)];
    for (const lootNode of lootNodes) {
      // Prefer a game-supplied ratio (including in its tooltip).
      for (const value of [sourceText(lootNode), lootNode.getAttribute('title'), lootNode.getAttribute('aria-label'), lootNode.getAttribute('data-original-title')]) {
        const pair = pairFrom(value);
        if (pair) return { ...pair, anchor: lootNode };
      }
    }

    // Otherwise the row must explicitly identify the separate loot and capacity fields.
    const carryNodes = row.matches(CARRY_SELECTOR) ? [row] : [...row.querySelectorAll(CARRY_SELECTOR)];
    for (const lootNode of lootNodes) {
      const looted = attributeNumber(lootNode, ['data-loot', 'data-stolen', 'data-bounty', 'data-looted']) ?? scalarFrom(lootNode);
      if (looted === null) continue;
      for (const carryNode of carryNodes) {
        if (carryNode === lootNode) continue;
        const capacity = attributeNumber(carryNode, ['data-max-capacity', 'data-carry-capacity', 'data-capacity']) ?? scalarFrom(carryNode);
        if (capacity > 0) return { looted, capacity, anchor: lootNode };
      }
    }
    return null;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${BADGE_CLASS} {
        display: inline-block !important;
        margin-left: 5px !important;
        padding: 1px 4px !important;
        border: 1px solid rgba(99, 124, 65, .45) !important;
        border-radius: 3px !important;
        background: rgba(104, 139, 61, .13) !important;
        color: #48702a !important;
        font: 700 11px/1.3 Arial, sans-serif !important;
        white-space: nowrap !important;
        vertical-align: middle !important;
        text-shadow: none !important;
        pointer-events: auto !important;
      }`;
    document.head.appendChild(style);
  }

  function removeBadges(root = document) {
    root.querySelectorAll('.' + BADGE_CLASS).forEach(badge => badge.remove());
  }

  function formatPercent(looted, capacity) {
    const percent = Math.round(looted / capacity * 1000) / 10;
    return (Number.isInteger(percent) ? String(percent) : percent.toFixed(1)) + '%';
  }

  function applyToRow(row) {
    const result = getPairAndAnchor(row);
    const badges = [...row.querySelectorAll('.' + BADGE_CLASS)];
    if (!result) {
      badges.forEach(badge => badge.remove());
      return;
    }
    const { looted, capacity, anchor } = result;
    if (!anchor || !anchor.isConnected) return;
    const label = formatPercent(looted, capacity);
    const tooltip = `${looted.toLocaleString()} / ${capacity.toLocaleString()} resources stolen (${label} of troop carrying capacity)`;
    let badge = badges.find(node => node.parentElement === anchor);
    if (!badge) {
      badges.forEach(node => node.remove());
      badge = document.createElement('span');
      badge.className = BADGE_CLASS;
      badge.setAttribute('aria-label', 'Loot percentage');
      anchor.appendChild(badge);
    } else {
      badges.filter(node => node !== badge).forEach(node => node.remove());
    }
    if (badge.textContent !== label) badge.textContent = label;
    if (badge.title !== tooltip) badge.title = tooltip;
  }

  function render() {
    scheduled = false;
    if (!enabled()) {
      removeBadges();
      return;
    }
    const farmRoots = document.querySelectorAll(FARM_SELECTOR);
    if (!farmRoots.length) {
      removeBadges();
      return;
    }
    const rows = new Set();
    for (const root of farmRoots) {
      if (root.matches(ROW_SELECTOR)) rows.add(root);
      const containingRow = root.closest(ROW_SELECTOR);
      if (containingRow) rows.add(containingRow);
      root.querySelectorAll(ROW_SELECTOR).forEach(row => rows.add(row));
    }
    if (!rows.size) return;
    ensureStyle();
    for (const row of rows) applyToRow(row);
  }

  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  function start() {
    if (!document.body) return;
    const observer = new MutationObserver(mutations => {
      // Ignore our own badge edits; the game can redraw entries at any time.
      if (mutations.every(mutation => {
        if (mutation.type === 'attributes') {
          return Boolean(mutation.target.closest?.('.' + BADGE_CLASS));
        }
        if (mutation.type === 'characterData') {
          return Boolean(mutation.target.parentElement?.closest('.' + BADGE_CLASS));
        }
        const changed = [...mutation.addedNodes, ...mutation.removedNodes];
        return changed.length > 0 && changed.every(node =>
          node.nodeType === Node.ELEMENT_NODE && node.classList.contains(BADGE_CLASS)
        );
      })) return;
      scheduleRender();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-loot', 'data-stolen', 'data-bounty', 'data-capacity', 'data-max-capacity', 'data-carry-capacity', 'title', 'aria-label']
    });
    window.addEventListener('hashchange', scheduleRender);
    window.addEventListener('qol_setting_changed', event => {
      if (event.detail?.key === FEATURE_KEY) scheduleRender();
    });
    scheduleRender();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
