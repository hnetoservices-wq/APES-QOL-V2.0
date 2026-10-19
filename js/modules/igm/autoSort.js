(() => {
  'use strict';

  const FEATURE_KEY = 'igmEnhanced';
  const TAGS_KEY = 'qol_conversation_tags_v3';
  const CUSTOM_FOLDERS_KEY = 'qol_custom_chat_tags';
  // v3 deliberately does not inherit v2's type/name-wide manual overrides.
  // Old entries may have affected multiple unrelated conversations.
  const OVERRIDES_KEY = 'qol_conversation_tag_overrides_v3';
  const SECRET_SOCIETY = 'Secret Society';

  let observer = null;
  let queued = false;

  function enabled() {
    return typeof window.isQolEnabled === 'function'
      ? window.isQolEnabled(FEATURE_KEY) === true
      : true;
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function ensureSecretSocietyCategory() {
    const folders = readJson(CUSTOM_FOLDERS_KEY, []);
    const list = Array.isArray(folders) ? folders.map(value => String(value || '').trim()).filter(Boolean) : [];
    if (!list.some(name => name.toLowerCase() === SECRET_SOCIETY.toLowerCase())) {
      list.push(SECRET_SOCIETY);
      writeJson(CUSTOM_FOLDERS_KEY, list);
    }
  }

  function inferCategory(row) {
    // Automatic sorting is intentionally limited to these three destinations.
    // Spam and Trash are NEVER inferred; only the user may place a chat there.
    if (
      row.querySelector('[class*="conversation_secretSociety_"]') ||
      row.querySelector('.igmInfos .name.roomType7')
    ) return SECRET_SOCIETY;

    if (
      row.querySelector('[class*="conversation_kingdom_"]') ||
      row.querySelector('.igmInfos .name.roomType5')
    ) return 'Kingdom';

    return 'Private';
  }

  function uniqueConversationIds(rows) {
    const ids = new Map();
    const counts = new Map();
    rows.forEach(row => {
      const id = window.qolIgmConversationIdentity?.(row) || null;
      ids.set(row, id);
      if (id) counts.set(id, (counts.get(id) || 0) + 1);
    });
    ids.forEach((id, row) => {
      if (id && counts.get(id) !== 1) ids.set(row, null);
    });
    return ids;
  }

  function allCategories() {
    const custom = readJson(CUSTOM_FOLDERS_KEY, []);
    return new Set([
      'Unsorted', 'Kingdom', SECRET_SOCIETY, 'Private', 'Spam', 'Trash',
      ...(Array.isArray(custom) ? custom : [])
    ]);
  }

  function currentFilter() {
    const value = String(document.querySelector('#qol-igm-filter-button .qol-igm-filter-label')?.textContent || '').trim();
    return !value || value === 'All Conversations' ? 'All' : value;
  }

  function updateDividerVisibility() {
    document.querySelectorAll('li.divider').forEach(divider => {
      let next = divider.nextElementSibling;
      let visible = false;
      while (next && !next.classList.contains('divider')) {
        if (next.classList.contains('igmConversationEntry') && next.style.display !== 'none') {
          visible = true;
          break;
        }
        next = next.nextElementSibling;
      }
      divider.style.display = visible ? '' : 'none';
    });
  }

  function normalizeSecretSocietyTab() {
    const tabs = document.getElementById('qol-message-center-tabs');
    if (!tabs) return;

    const secretTab = Array.from(tabs.querySelectorAll('[data-qol-message-filter]'))
      .find(tab => tab.dataset.qolMessageFilter === SECRET_SOCIETY);
    if (!secretTab) return;

    secretTab.classList.remove('custom');
    secretTab.querySelector('.qol-message-tab-remove')?.remove();

    const privateTab = Array.from(tabs.querySelectorAll('[data-qol-message-filter]'))
      .find(tab => tab.dataset.qolMessageFilter === 'Private');
    if (privateTab && secretTab.nextElementSibling !== privateTab) {
      tabs.insertBefore(secretTab, privateTab);
    }
  }

  function hideLegacyToolbar() {
    const toolbar = document.getElementById('qol-igm-toolbar');
    if (toolbar) toolbar.style.setProperty('display', 'none', 'important');
  }

  function applyAutoSort() {
    queued = false;
    if (!enabled()) return;

    ensureSecretSocietyCategory();
    hideLegacyToolbar();
    normalizeSecretSocietyTab();

    const rows = Array.from(document.querySelectorAll('li.igmConversationEntry'));
    if (!rows.length) return;
    const identities = uniqueConversationIds(rows);

    const tags = readJson(TAGS_KEY, {});
    const safeTags = tags && typeof tags === 'object' && !Array.isArray(tags) ? tags : {};
    const overrides = readJson(OVERRIDES_KEY, {});
    const safeOverrides = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
    const valid = allCategories();
    const filter = currentFilter();
    let tagsChanged = false;

    rows.forEach(row => {
      const id = identities.get(row);
      if (!id) return;

      const desired = valid.has(safeOverrides[id]) ? safeOverrides[id] : inferCategory(row);

      if (safeTags[id] !== desired) {
        safeTags[id] = desired;
        tagsChanged = true;
      }

      const badge = row.querySelector('.qol-igm-row-folder');
      if (badge) {
        badge.textContent = desired;
        badge.title = `Current folder: ${desired}`;
        badge.dataset.currentTag = desired;
        badge.classList.toggle('spam', desired === 'Spam');
        badge.classList.toggle('trash', desired === 'Trash');
      }

      const shouldShow = filter === 'All' ? !['Spam', 'Trash'].includes(desired) : desired === filter;
      row.style.display = shouldShow ? '' : 'none';
    });

    if (tagsChanged) writeJson(TAGS_KEY, safeTags);
    updateDividerVisibility();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(applyAutoSort);
  }

  // A selection made from a row's existing folder dropdown becomes an explicit
  // manual override. This is the ONLY path that can assign Spam or Trash.
  document.addEventListener('click', event => {
    const option = event.target.closest('#qol-igm-menu .qol-igm-menu-option');
    if (!option) return;

    const badge = document.querySelector('.qol-igm-row-folder[aria-expanded="true"]');
    const row = badge?.closest('li.igmConversationEntry');
    const category = option.dataset.value;
    if (!row || !category) return;

    const overrides = readJson(OVERRIDES_KEY, {});
    const safeOverrides = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
    const id = uniqueConversationIds(
      Array.from(document.querySelectorAll('li.igmConversationEntry'))
    ).get(row);
    if (!id) return;
    safeOverrides[id] = category;
    writeJson(OVERRIDES_KEY, safeOverrides);
    window.setTimeout(schedule, 0);
  }, true);

  function init() {
    ensureSecretSocietyCategory();
    applyAutoSort();

    observer = new MutationObserver(mutations => {
      if (mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(node =>
        node.nodeType === Node.ELEMENT_NODE && (
          node.matches?.('li.igmConversationEntry, #qol-igm-toolbar, #qol-message-center-tabs') ||
          node.querySelector?.('li.igmConversationEntry, #qol-igm-toolbar, #qol-message-center-tabs')
        )
      ))) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.setInterval(() => {
      hideLegacyToolbar();
      normalizeSecretSocietyTab();
      schedule();
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
