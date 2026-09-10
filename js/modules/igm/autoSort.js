(() => {
  'use strict';

  const FEATURE_KEY = 'igmEnhanced';
  const TAGS_KEY = 'qol_conversation_tags';
  const CUSTOM_FOLDERS_KEY = 'qol_custom_chat_tags';
  const OVERRIDES_KEY = 'qol_conversation_tag_overrides_v1';
  const SECRET_SOCIETY = 'Secret Society';
  const SYSTEM_CATEGORIES = new Set(['Unsorted', 'Kingdom', SECRET_SOCIETY, 'Private']);

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
    // Only inspect elements Angular actually rendered. The original template keeps
    // inactive room-type expressions in HTML comments, so matching innerHTML would
    // falsely classify every group conversation as both types.
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

  function conversationId(row) {
    const badgeId = row.querySelector('.qol-igm-row-folder')?.dataset?.conversationId;
    if (badgeId) return badgeId;

    const timestamp = row.querySelector('span[i18ndt]')?.getAttribute('i18ndt');
    if (timestamp) return `conv_ts_${timestamp}`;

    return null;
  }

  function stableConversationKey(row) {
    const category = inferCategory(row);
    const name = String(row.querySelector('.igmInfos .name')?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (category === 'Kingdom') return 'kingdom';
    if (category === SECRET_SOCIETY) return `secret-society:${name || 'unknown'}`;

    const playerId = row.querySelector('avatar-image[player-id]')?.getAttribute('player-id');
    return `private:${playerId || name || 'unknown'}`;
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

    const tags = readJson(TAGS_KEY, {});
    const safeTags = tags && typeof tags === 'object' && !Array.isArray(tags) ? tags : {};
    const overrides = readJson(OVERRIDES_KEY, {});
    const safeOverrides = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
    const valid = allCategories();
    const filter = currentFilter();
    let tagsChanged = false;
    let overridesChanged = false;

    rows.forEach(row => {
      const id = conversationId(row);
      if (!id) return;

      const stableKey = stableConversationKey(row);
      let desired = valid.has(safeOverrides[stableKey]) ? safeOverrides[stableKey] : null;
      const existing = safeTags[id];

      // Preserve deliberate special/custom assignments that already existed before
      // automatic sorting was introduced, and make them stable across new messages.
      if (!desired && existing && !SYSTEM_CATEGORIES.has(existing) && valid.has(existing)) {
        desired = existing;
        safeOverrides[stableKey] = existing;
        overridesChanged = true;
      }

      if (!desired) desired = inferCategory(row);

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
    if (overridesChanged) writeJson(OVERRIDES_KEY, safeOverrides);
    updateDividerVisibility();
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(applyAutoSort);
  }

  // A selection made from a row's existing folder dropdown becomes a manual
  // override. It is keyed to the actual conversation rather than the latest-message
  // timestamp, so it survives when that conversation receives another message.
  document.addEventListener('click', event => {
    const option = event.target.closest('#qol-igm-menu .qol-igm-menu-option');
    if (!option) return;

    const badge = document.querySelector('.qol-igm-row-folder[aria-expanded="true"]');
    const row = badge?.closest('li.igmConversationEntry');
    const category = option.dataset.value;
    if (!row || !category) return;

    const overrides = readJson(OVERRIDES_KEY, {});
    const safeOverrides = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
    safeOverrides[stableConversationKey(row)] = category;
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
