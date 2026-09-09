(() => {
  'use strict';

  const FEATURE_KEY = 'igmEnhanced';
  const ROOT_CLASS = 'qol-message-center-active';
  const TABS_ID = 'qol-message-center-tabs';
  const ACTIONS_ID = 'qol-message-center-actions';
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

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getCustomFolders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CUSTOM_FOLDERS_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      const seen = new Set();
      return parsed
        .map(clean)
        .filter(Boolean)
        .filter(name => {
          const key = name.toLocaleLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return !BASE_BEFORE_CUSTOM.concat(BASE_AFTER_CUSTOM).some(base => base.toLocaleLowerCase() === key);
        })
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    } catch (_) {
      return [];
    }
  }

  function findWindow() {
    const windows = Array.from(document.querySelectorAll('window.modalWrapper.igm, .modalWrapper.igm'));
    return windows.find(node => node.querySelector('.igmSystem')) || null;
  }

  function activeFilter() {
    const text = clean(document.querySelector(`#${FILTER_BUTTON_ID} .qol-igm-filter-label`)?.textContent);
    return text === 'All Conversations' || !text ? 'All' : text;
  }

  function chooseFilter(value) {
    const button = document.getElementById(FILTER_BUTTON_ID);
    if (!button) return false;
    if (activeFilter() === value) {
      syncActiveTab();
      return true;
    }

    button.click();
    const option = Array.from(document.querySelectorAll('#qol-igm-menu .qol-igm-menu-option'))
      .find(node => node.dataset.value === value);
    if (!option) return false;
    option.click();
    window.setTimeout(syncActiveTab, 0);
    return true;
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
      remove.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        chooseFilter(value);
        window.setTimeout(() => document.getElementById(DELETE_BUTTON_ID)?.click(), 0);
      });
      tab.appendChild(remove);
    }

    function activate(event) {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      chooseFilter(value);
    }

    tab.addEventListener('click', activate);
    tab.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });
    return tab;
  }

  function buildTabs(system) {
    const custom = getCustomFolders();
    const signature = custom.join('\u0001');
    let tabs = system.querySelector(`#${TABS_ID}`);

    if (tabs && signature === lastFolderSignature) {
      syncActiveTab();
      return tabs;
    }

    tabs?.remove();
    tabs = document.createElement('div');
    tabs.id = TABS_ID;
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Message folders');

    BASE_BEFORE_CUSTOM.forEach(name => tabs.appendChild(makeTab(name)));
    custom.forEach(name => tabs.appendChild(makeTab(name, true)));

    const create = document.createElement('div');
    create.className = 'qol-message-tab create';
    create.setAttribute('role', 'button');
    create.tabIndex = 0;
    create.innerHTML = '<span class="qol-message-tab-plus">+</span><span>Create Tab</span>';
    const createAction = event => {
      event.preventDefault();
      event.stopPropagation();
      document.getElementById(CREATE_BUTTON_ID)?.click();
    };
    create.addEventListener('click', createAction);
    create.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') createAction(event);
    });
    tabs.appendChild(create);

    BASE_AFTER_CUSTOM.forEach(name => tabs.appendChild(makeTab(name)));

    system.insertBefore(tabs, system.firstChild);
    lastFolderSignature = signature;
    syncActiveTab();
    return tabs;
  }

  function buildHeaderActions(windowNode) {
    let actions = windowNode.querySelector(`#${ACTIONS_ID}`);
    if (!actions) {
      const header = windowNode.querySelector('.contentHeader');
      if (!header) return;
      actions = document.createElement('div');
      actions.id = ACTIONS_ID;
      actions.innerHTML = `
        <div class="qol-message-header-button" data-qol-message-new role="button" tabindex="0">+ New Conversation</div>
      `;
      header.appendChild(actions);
      const button = actions.querySelector('[data-qol-message-new]');
      const openNew = event => {
        event.preventDefault();
        event.stopPropagation();
        windowNode.querySelector('.newThreadContainer .clickableContainer')?.click();
      };
      button.addEventListener('click', openNew);
      button.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') openNew(event);
      });
    }
  }

  function renameHeader(windowNode) {
    const title = windowNode.querySelector('.contentHeader h2 span span') || windowNode.querySelector('.contentHeader h2 span');
    if (title && clean(title.textContent) !== 'APES Message Center') title.textContent = 'APES Message Center';
  }

  function addConversationMeta(windowNode) {
    windowNode.querySelectorAll('li.igmConversationEntry.qol-igm-enhanced-row').forEach(row => {
      const name = row.querySelector('.igmInfos .name') || row.querySelector('.igmInfos [ng-if*="group"]');
      if (name) name.classList.add('qol-message-conversation-name');
      const preview = row.querySelector('.linePreview');
      if (preview) preview.classList.add('qol-message-conversation-preview');
    });
  }

  function enhanceNewConversation(windowNode) {
    const popup = windowNode.querySelector('#igmSystemNewConversation .inWindowPopup');
    if (!popup) return;
    popup.classList.add('qol-message-new-popup');
    const title = popup.querySelector('.inWindowPopupHeader h4 span, .inWindowPopupHeader h4');
    if (title) title.textContent = 'New Conversation';
  }

  function enhance(windowNode) {
    if (!enabled() || !windowNode) return;
    windowNode.classList.add(ROOT_CLASS);
    renameHeader(windowNode);
    buildHeaderActions(windowNode);
    const system = windowNode.querySelector('.igmSystem');
    if (system) buildTabs(system);
    addConversationMeta(windowNode);
    enhanceNewConversation(windowNode);
    syncActiveTab();
  }

  function cleanup() {
    document.querySelectorAll(`.${ROOT_CLASS}`).forEach(node => node.classList.remove(ROOT_CLASS));
    document.getElementById(TABS_ID)?.remove();
    document.getElementById(ACTIONS_ID)?.remove();
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
          if (element.id === TABS_ID || element.id === ACTIONS_ID) return false;
          return element.matches?.('.modalWrapper.igm, .igmSystem, .threadView, .windowOverlay, .igmConversationEntry, .qol-igm-modal-overlay')
            || element.querySelector?.('.modalWrapper.igm, .igmSystem, .threadView, .windowOverlay, .igmConversationEntry, .qol-igm-modal-overlay');
        });
      });
      if (relevant) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('click', event => {
    if (event.target.closest(`#${FILTER_BUTTON_ID}, #qol-igm-menu .qol-igm-menu-option`)) {
      window.setTimeout(syncActiveTab, 0);
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
      if (signature !== lastFolderSignature || (enabled() && findWindow() && !document.getElementById(TABS_ID))) schedule();
      else syncActiveTab();
    }, 1000);

    window.APES = window.APES || {};
    window.APES.messageCenter = Object.freeze({
      refresh,
      selectFolder: chooseFilter,
      getSelectedFolder: activeFilter,
      getCustomFolders
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
