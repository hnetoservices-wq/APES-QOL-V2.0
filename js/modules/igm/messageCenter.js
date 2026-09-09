(() => {
  'use strict';

  const FEATURE_KEY = 'igmEnhanced';
  const ROOT_CLASS = 'qol-message-center-active';
  const TABS_ID = 'qol-message-center-tabs';
  const EMPTY_ID = 'qol-message-center-empty';
  const HEADER_FOLDER_ID = 'qol-message-center-folder';
  const CUSTOM_FOLDERS_KEY = 'qol_custom_chat_tags';
  const FILTER_BUTTON_ID = 'qol-igm-filter-button';
  const CREATE_BUTTON_ID = 'qol-igm-create-folder';
  const DELETE_BUTTON_ID = 'qol-igm-delete-folder';
  const BASE_BEFORE_CUSTOM = ['All', 'Unsorted', 'Kingdom', 'Private'];
  const BASE_AFTER_CUSTOM = ['Spam', 'Trash'];

  let observer = null;
  let refreshQueued = false;
  let lastFolderSignature = '';

  function enabled() {
    return typeof window.isQolEnabled === 'function'
      ? window.isQolEnabled(FEATURE_KEY) === true
      : true;
  }

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function getCustomFolders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CUSTOM_FOLDERS_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      const seen = new Set();
      const reserved = BASE_BEFORE_CUSTOM.concat(BASE_AFTER_CUSTOM).map(value => value.toLocaleLowerCase());
      return parsed
        .map(clean)
        .filter(Boolean)
        .filter(name => {
          const key = name.toLocaleLowerCase();
          if (seen.has(key) || reserved.includes(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    } catch (_) {
      return [];
    }
  }

  function findWindow() {
    return Array.from(document.querySelectorAll('window.modalWrapper.igm, .modalWrapper.igm'))
      .find(node => node.querySelector('.igmSystem')) || null;
  }

  function activeFilter() {
    const label = clean(document.querySelector(`#${FILTER_BUTTON_ID} .qol-igm-filter-label`)?.textContent);
    return !label || label === 'All Conversations' ? 'All' : label;
  }

  function syncActiveTab() {
    const current = activeFilter();
    document.querySelectorAll(`#${TABS_ID} [data-qol-message-filter]`).forEach(tab => {
      const active = tab.dataset.qolMessageFilter === current;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });
  }

  function activateOnKeyboard(node, callback) {
    node.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      callback(event);
    });
  }

  function clickNativeFilterOption(value, attempt = 0) {
    const option = Array.from(document.querySelectorAll('#qol-igm-menu .qol-igm-menu-option'))
      .find(node => node.dataset.value === value);

    if (option) {
      option.click();
      window.setTimeout(() => {
        syncActiveTab();
        schedule();
      }, 0);
      return true;
    }

    if (attempt < 3) {
      window.setTimeout(() => clickNativeFilterOption(value, attempt + 1), 0);
    }
    return false;
  }

  function chooseFilter(value) {
    const button = document.getElementById(FILTER_BUTTON_ID);
    if (!button) return false;

    if (activeFilter() === value) {
      syncActiveTab();
      return true;
    }

    button.click();
    clickNativeFilterOption(value);
    return true;
  }

  function makeTab(value, custom = false) {
    const tab = document.createElement('div');
    tab.className = `qol-message-tab${custom ? ' custom' : ''}`;
    tab.dataset.qolMessageFilter = value;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.tabIndex = -1;

    const label = document.createElement('span');
    label.className = 'qol-message-tab-label';
    label.textContent = value;
    tab.appendChild(label);

    if (custom) {
      const remove = document.createElement('span');
      remove.className = 'qol-message-tab-remove';
      remove.setAttribute('role', 'button');
      remove.setAttribute('aria-label', `Delete ${value} tab`);
      remove.title = `Delete ${value}`;
      remove.textContent = '×';
      const removeTab = event => {
        event.preventDefault();
        event.stopPropagation();
        chooseFilter(value);
        window.setTimeout(() => document.getElementById(DELETE_BUTTON_ID)?.click(), 20);
      };
      remove.addEventListener('click', removeTab);
      activateOnKeyboard(remove, removeTab);
      tab.appendChild(remove);
    }

    const select = event => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      chooseFilter(value);
    };
    tab.addEventListener('click', select);
    activateOnKeyboard(tab, select);
    return tab;
  }

  function findTabHost(system) {
    const toolbar = system.querySelector('#qol-igm-toolbar');
    if (toolbar?.parentElement) return toolbar.parentElement;
    return system.querySelector('.history > .scrollContentOuterWrapper > .scrollContent') || null;
  }

  function buildTabs(system) {
    const host = findTabHost(system);
    if (!host) return;

    const custom = getCustomFolders();
    const signature = custom.join('\u0001');
    let tabs = system.querySelector(`#${TABS_ID}`);

    if (tabs && tabs.parentElement === host && signature === lastFolderSignature) {
      syncActiveTab();
      return;
    }

    tabs?.remove();
    tabs = document.createElement('div');
    tabs.id = TABS_ID;
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Message folders');

    BASE_BEFORE_CUSTOM.forEach(name => tabs.appendChild(makeTab(name)));
    custom.forEach(name => tabs.appendChild(makeTab(name, true)));
    BASE_AFTER_CUSTOM.forEach(name => tabs.appendChild(makeTab(name)));

    const create = document.createElement('div');
    create.className = 'qol-message-tab create';
    create.setAttribute('role', 'button');
    create.tabIndex = 0;
    create.title = 'Create a custom message tab';
    create.innerHTML = '<span class="qol-message-tab-plus">+</span><span>Tab</span>';
    const createTab = event => {
      event.preventDefault();
      event.stopPropagation();
      document.getElementById(CREATE_BUTTON_ID)?.click();
    };
    create.addEventListener('click', createTab);
    activateOnKeyboard(create, createTab);
    tabs.appendChild(create);

    const toolbar = host.querySelector(':scope > #qol-igm-toolbar');
    if (toolbar) toolbar.insertAdjacentElement('afterend', tabs);
    else host.insertBefore(tabs, host.firstChild);

    lastFolderSignature = signature;
    syncActiveTab();
  }

  function renameHeader(windowNode) {
    const title = windowNode.querySelector('.contentHeader h2 span span')
      || windowNode.querySelector('.contentHeader h2 span');
    if (title && clean(title.textContent) !== 'APES Message Center') {
      title.textContent = 'APES Message Center';
    }
  }

  function selectedConversationRow(windowNode) {
    return windowNode.querySelector('.history li.igmConversationEntry.selected');
  }

  function syncConversationFolder(windowNode) {
    const header = windowNode.querySelector('.conversationHeaderInner');
    const selected = selectedConversationRow(windowNode);
    let chip = windowNode.querySelector(`#${HEADER_FOLDER_ID}`);

    if (!header || !selected) {
      chip?.remove();
      return;
    }

    const badge = selected.querySelector('.qol-igm-row-folder');
    const folder = clean(badge?.dataset.currentTag || badge?.textContent) || 'Unsorted';

    if (!chip) {
      chip = document.createElement('div');
      chip.id = HEADER_FOLDER_ID;
      chip.setAttribute('role', 'button');
      chip.tabIndex = 0;
      chip.title = 'Move this conversation to another tab';
      const openFolder = event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        selectedConversationRow(windowNode)?.querySelector('.qol-igm-row-folder')?.click();
      };
      chip.addEventListener('click', openFolder);
      activateOnKeyboard(chip, openFolder);
      const menu = header.querySelector('.menu');
      if (menu) header.insertBefore(chip, menu);
      else header.appendChild(chip);
    }

    chip.dataset.folder = folder;
    chip.innerHTML = `<span class="qol-message-folder-label">${folder}</span><span class="qol-message-folder-arrow">▾</span>`;
  }

  function syncEmptyState(windowNode) {
    const thread = windowNode.querySelector('.threadView');
    if (!thread) return;
    const hasConversation = thread.classList.contains('filled') || !!thread.querySelector('.chatRoomBody');
    let empty = thread.querySelector(`#${EMPTY_ID}`);

    if (hasConversation) {
      empty?.remove();
      return;
    }

    if (!empty) {
      empty = document.createElement('div');
      empty.id = EMPTY_ID;
      empty.innerHTML = `
        <div class="qol-message-empty-mark">✉</div>
        <div class="qol-message-empty-title">APES Message Center</div>
        <div class="qol-message-empty-copy">Select a conversation on the left, or start a new one.</div>
      `;
      thread.appendChild(empty);
    }
  }

  function markNativeParts(windowNode) {
    windowNode.querySelectorAll('li.igmConversationEntry').forEach(row => {
      row.classList.add('qol-message-center-row');
    });

    const nativeNew = windowNode.querySelector('.newThreadContainer .clickableContainer');
    if (nativeNew) nativeNew.classList.add('qol-message-center-new');

    const popup = windowNode.querySelector('#igmSystemNewConversation .inWindowPopup');
    if (popup) popup.classList.add('qol-message-center-new-popup');

    // v2.0.0.108 experimented with custom thread layout/send controls.
    // Remove those artifacts and leave the live chat DOM entirely to Travian.
    windowNode.querySelector('#qol-message-center-send')?.remove();
    windowNode.querySelectorAll('.qol-message-center-line').forEach(line => {
      line.classList.remove('qol-message-center-line');
    });
  }

  function enhance(windowNode) {
    if (!enabled() || !windowNode) return;
    windowNode.classList.add(ROOT_CLASS);
    renameHeader(windowNode);
    const system = windowNode.querySelector('.igmSystem');
    if (system) buildTabs(system);
    markNativeParts(windowNode);
    syncConversationFolder(windowNode);
    syncEmptyState(windowNode);
    syncActiveTab();
  }

  function cleanup() {
    document.querySelectorAll(`.${ROOT_CLASS}`).forEach(node => node.classList.remove(ROOT_CLASS));
    document.getElementById(TABS_ID)?.remove();
    document.getElementById(EMPTY_ID)?.remove();
    document.getElementById(HEADER_FOLDER_ID)?.remove();
    document.getElementById('qol-message-center-send')?.remove();
    document.getElementById('qol-message-center-actions')?.remove();
    document.querySelectorAll('.qol-message-center-row, .qol-message-center-new, .qol-message-center-new-popup, .qol-message-center-line')
      .forEach(node => node.classList.remove('qol-message-center-row', 'qol-message-center-new', 'qol-message-center-new-popup', 'qol-message-center-line'));
  }

  function refresh() {
    refreshQueued = false;
    if (!enabled()) {
      cleanup();
      return;
    }
    const windowNode = findWindow();
    if (windowNode) enhance(windowNode);
  }

  function schedule() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(refresh);
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation => {
        if (mutation.type !== 'childList') return false;
        return [...mutation.addedNodes, ...mutation.removedNodes].some(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return false;
          const element = node;
          if ([TABS_ID, EMPTY_ID, HEADER_FOLDER_ID].includes(element.id)) return false;
          return element.matches?.('.modalWrapper.igm, .igmSystem, .threadView, .conversationHeaderInner, .windowOverlay, .igmConversationEntry, .chatRoomBody, .chatBody, .line')
            || element.querySelector?.('.modalWrapper.igm, .igmSystem, .threadView, .conversationHeaderInner, .windowOverlay, .igmConversationEntry, .chatRoomBody, .chatBody, .line');
        });
      });
      if (relevant) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('click', event => {
    if (event.target.closest(`#${FILTER_BUTTON_ID}, #qol-igm-menu .qol-igm-menu-option, .igmConversationEntry`)) {
      window.setTimeout(schedule, 0);
    }
  }, true);

  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key !== FEATURE_KEY) return;
    if (event.detail.enabled) schedule();
    else cleanup();
  });

  window.addEventListener('storage', event => {
    if (event.key === CUSTOM_FOLDERS_KEY) schedule();
  });

  function init() {
    startObserver();
    schedule();
    window.setInterval(() => {
      const signature = getCustomFolders().join('\u0001');
      const windowNode = findWindow();
      if (signature !== lastFolderSignature || (enabled() && windowNode && !document.getElementById(TABS_ID))) {
        schedule();
      } else if (windowNode) {
        markNativeParts(windowNode);
        syncConversationFolder(windowNode);
        syncEmptyState(windowNode);
        syncActiveTab();
      }
    }, 750);

    window.APES = window.APES || {};
    window.APES.messageCenter = Object.freeze({
      refresh,
      selectFolder: chooseFilter,
      getSelectedFolder: activeFilter,
      getCustomFolders
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
