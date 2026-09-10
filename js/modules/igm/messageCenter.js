(() => {
  'use strict';

  const FEATURE_KEY = 'igmEnhanced';
  const TABS_ID = 'qol-message-center-tabs';
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

  function findSystem() {
    return Array.from(document.querySelectorAll('window.modalWrapper.igm .igmSystem, .modalWrapper.igm .igmSystem'))[0] || null;
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
      window.setTimeout(syncActiveTab, 0);
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

  function cleanup() {
    document.getElementById(TABS_ID)?.remove();
  }

  function refresh() {
    refreshQueued = false;
    if (!enabled()) {
      cleanup();
      return;
    }
    const system = findSystem();
    if (system) buildTabs(system);
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
          if (element.id === TABS_ID) return false;
          return element.matches?.('.modalWrapper.igm, .igmSystem, #qol-igm-toolbar')
            || element.querySelector?.('.modalWrapper.igm, .igmSystem, #qol-igm-toolbar');
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
      const system = findSystem();
      if (signature !== lastFolderSignature || (enabled() && system && !document.getElementById(TABS_ID))) {
        schedule();
      } else {
        syncActiveTab();
      }
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
