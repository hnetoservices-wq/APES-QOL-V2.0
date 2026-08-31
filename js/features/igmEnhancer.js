function initIgmEnhancer() {
  'use strict';

  const FEATURE_KEY = 'igmEnhanced';
  const CONV_STORAGE_KEY = 'qol_conversation_tags';
  const CUSTOM_FOLDERS_STORAGE_KEY = 'qol_custom_chat_tags';
  const TOOLBAR_ID = 'qol-igm-toolbar';
  const FILTER_BUTTON_ID = 'qol-igm-filter-button';
  const COUNT_ID = 'qol-igm-visible-count';
  const DELETE_BUTTON_ID = 'qol-igm-delete-folder';
  const EMPTY_STATE_ID = 'qol-igm-empty-state';
  const MENU_ID = 'qol-igm-menu';
  const STYLE_ID = 'qol-igm-enhancer-styles';
  const BASE_CATEGORIES = ['Unsorted', 'Kingdom', 'Private', 'Spam', 'Trash'];
  let currentFilter = 'All';
  let observer = null;
  let fallbackInterval = null;
  let refreshTimer = null;
  let isRefreshing = false;
  let activeMenuAnchor = null;
  function isEnabled() {
    return typeof window.isQolEnabled === 'function' ? window.isQolEnabled(FEATURE_KEY) === true : true;
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function normaliseFolderName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  }
  function getStoredTags() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CONV_STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      console.error('[IgmEnhancer] Failed to read conversation tags.', error);
      return {};
    }
  }
  function saveStoredTags(tags) {
    try {
      localStorage.setItem(CONV_STORAGE_KEY, JSON.stringify(tags));
    } catch (error) {
      console.error('[IgmEnhancer] Failed to save conversation tags.', error);
    }
  }
  function getCustomFolders() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CUSTOM_FOLDERS_STORAGE_KEY) || '[]');
      if (!Array.isArray(parsed)) {
        return [];
      }
      const unique = [];
      parsed.map(normaliseFolderName).filter(Boolean).forEach(folder => {
        const exists = unique.some(existing => {
          return existing.localeCompare(folder, undefined, {
            sensitivity: 'base'
          }) === 0;
        });
        if (!exists) {
          unique.push(folder);
        }
      });
      return unique.sort((first, second) => {
        return first.localeCompare(second, undefined, {
          sensitivity: 'base'
        });
      });
    } catch (error) {
      console.error('[IgmEnhancer] Failed to read custom folders.', error);
      return [];
    }
  }
  function saveCustomFolders(folders) {
    try {
      localStorage.setItem(CUSTOM_FOLDERS_STORAGE_KEY, JSON.stringify(folders));
    } catch (error) {
      console.error('[IgmEnhancer] Failed to save custom folders.', error);
    }
  }
  function getAllCategories() {
    const custom = getCustomFolders().filter(folder => {
      return !BASE_CATEGORIES.some(base => {
        return base.localeCompare(folder, undefined, {
          sensitivity: 'base'
        }) === 0;
      });
    });
    return BASE_CATEGORIES.concat(custom);
  }
  function getConversationRows() {
    return Array.from(document.querySelectorAll('li.igmConversationEntry'));
  }
  function getConversationId(row) {
    const timestamp = row.querySelector('span[i18ndt]')?.getAttribute('i18ndt');
    if (timestamp) {
      return `conv_ts_${timestamp}`;
    }
    const referenceElement = row.querySelector('a[href], ' + '[conversationid], ' + '[conversation-id], ' + '[data-conversation-id]');
    const reference = referenceElement?.getAttribute('conversationid') || referenceElement?.getAttribute('conversation-id') || referenceElement?.getAttribute('data-conversation-id') || referenceElement?.getAttribute('href');
    if (reference) {
      return `conv_ref_` + String(reference).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_:#/.-]/g, '').slice(0, 90);
    }
    const clone = row.cloneNode(true);
    clone.querySelectorAll('.qol-igm-row-folder, ' + '.qol-row-category-select').forEach(element => {
      element.remove();
    });
    const cleanText = (clone.innerText || clone.textContent || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    return cleanText ? `conv_txt_${cleanText.substring(0, 70)}` : null;
  }
  function getConversationTag(row, tags = getStoredTags()) {
    const conversationId = getConversationId(row);
    const storedTag = conversationId ? tags[conversationId] : null;
    return getAllCategories().includes(storedTag) ? storedTag : 'Unsorted';
  }
  function setConversationTag(conversationId, category) {
    if (!conversationId) {
      return;
    }
    const tags = getStoredTags();
    if (category === 'Unsorted') {
      delete tags[conversationId];
    } else {
      tags[conversationId] = category;
    }
    saveStoredTags(tags);
    closeMenu();
    refreshNow();
  }
  function findConversationListContext() {
    const sampleRow = document.querySelector('li.igmConversationEntry');
    if (!sampleRow) {
      return null;
    }
    const list = sampleRow.parentElement;
    const wrapper = sampleRow.closest('.scrollContentInnerWrapper') || sampleRow.closest('.scrollPane') || list;
    if (!list || !wrapper || !wrapper.parentNode) {
      return null;
    }
    return {
      list,
      wrapper,
      toolbarParent: wrapper.parentNode
    };
  }
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
            #${TOOLBAR_ID} {
                position: relative !important;
                display: block !important;
                width: 100% !important;
                min-width: 0 !important;
                max-width: 100% !important;
                height: auto !important;
                margin: 0 0 8px 0 !important;
                padding: 0 !important;
                border: 2px solid var(--qol-border) !important;
                border-radius: 4px !important;
                background: #f7f5f0 !important;
                box-shadow:
                    0 3px 10px
                    rgba(0, 0, 0, 0.22)
                    !important;
                color: #333333 !important;
                font-family:
                    Arial,
                    sans-serif
                    !important;
                font-size: 11px !important;
                line-height: normal !important;
                overflow: hidden !important;
                box-sizing: border-box !important;
            }

            #${TOOLBAR_ID} *,
            #${MENU_ID} *,
            .qol-igm-modal-overlay * {
                box-sizing: border-box !important;
                font-family:
                    Arial,
                    sans-serif
                    !important;
                text-shadow: none !important;
            }

            .qol-igm-toolbar-header {
                display: flex !important;
                align-items: center !important;
                justify-content:
                    space-between
                    !important;
                gap: 8px !important;
                width: 100% !important;
                min-height: 30px !important;
                margin: 0 !important;
                padding: 6px 10px !important;
                border: 0 !important;
                border-radius: 0 !important;
                background:
                    linear-gradient(
                        to bottom,
                        var(--qol-accent-mid),
                        var(--qol-accent-dark)
                    )
                    !important;
                color: #f7f5f0 !important;
                font-size: 13px !important;
                font-weight: bold !important;
                line-height: 18px !important;
            }

            #${COUNT_ID} {
                color: #eadfc9 !important;
                font-size: 10px !important;
                font-weight: normal !important;
                line-height: 14px !important;
                white-space: nowrap !important;
            }

            .qol-igm-toolbar-body {
                display: flex !important;
                flex-direction:
                    column
                    !important;
                align-items:
                    stretch
                    !important;
                gap: 6px !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 8px !important;
                border: 0 !important;
                background:
                    #f7f5f0
                    !important;
            }

            .qol-igm-toolbar-actions {
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
            }

            #${FILTER_BUTTON_ID},
            .qol-igm-action-button,
            .qol-igm-row-folder,
            .qol-igm-menu-option,
            .qol-igm-modal-button {
                all: unset !important;
                box-sizing:
                    border-box
                    !important;
                font-family:
                    Arial,
                    sans-serif
                    !important;
                text-shadow: none !important;
                -webkit-appearance:
                    none
                    !important;
                appearance: none !important;
            }

            #${FILTER_BUTTON_ID} {
                position: relative !important;
                display: flex !important;
                align-items: center !important;
                justify-content:
                    space-between
                    !important;
                width: 100% !important;
                min-width: 0 !important;
                height: 30px !important;
                margin: 0 !important;
                padding: 5px 9px !important;
                border:
                    1px solid #9c8565
                    !important;
                border-radius: 3px !important;
                background: #ffffff !important;
                color: #332719 !important;
                font-size: 11px !important;
                font-weight: normal !important;
                line-height: 18px !important;
                cursor: pointer !important;
                user-select: none !important;
                overflow: hidden !important;
            }

            #${FILTER_BUTTON_ID}:hover {
                background: #fffaf0 !important;
                border-color:
                    var(--qol-accent)
                    !important;
            }

            .qol-igm-filter-label {
                display: block !important;
                min-width: 0 !important;
                overflow: hidden !important;
                text-overflow:
                    ellipsis
                    !important;
                white-space: nowrap !important;
            }

            .qol-igm-control-arrow {
                display: block !important;
                flex: 0 0 auto !important;
                margin-left: 8px !important;
                color: var(--qol-accent) !important;
                font-size: 10px !important;
                line-height: 1 !important;
            }

            .qol-igm-action-button {
                display: inline-flex !important;
                align-items: center !important;
                justify-content:
                    center
                    !important;
                flex: 1 1 0 !important;
                min-width: 0 !important;
                height: 29px !important;
                margin: 0 !important;
                padding: 5px 9px !important;
                border:
                    1px solid var(--qol-action-border)
                    !important;
                border-radius: 3px !important;
                background:
                    linear-gradient(
                        to bottom,
                        var(--qol-accent),
                        var(--qol-accent-dark)
                    )
                    !important;
                color: #ffffff !important;
                font-size: 11px !important;
                font-weight: bold !important;
                line-height: 17px !important;
                text-align: center !important;
                white-space: nowrap !important;
                cursor: pointer !important;
                user-select: none !important;
                box-shadow: none !important;
            }

            .qol-igm-action-button:hover {
                filter:
                    brightness(1.08)
                    !important;
            }

            .qol-igm-action-button.danger {
                background:
                    linear-gradient(
                        to bottom,
                        #d9534f,
                        #b52b27
                    )
                    !important;
                border-color:
                    #8f211e
                    !important;
            }

            li.igmConversationEntry.qol-igm-enhanced-row {
                position: relative !important;
                box-sizing:
                    border-box
                    !important;
                padding-right:
                    76px
                    !important;
            }

            .qol-igm-row-folder {
                position: absolute !important;
                right: 4px !important;
                bottom: 3px !important;
                z-index: 4 !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content:
                    center
                    !important;
                max-width: 68px !important;
                height: 18px !important;
                margin: 0 !important;
                padding: 2px 5px !important;
                border:
                    1px solid var(--qol-action-border)
                    !important;
                border-radius: 2px !important;
                background:
                    linear-gradient(
                        to bottom,
                        #fffdf8,
                        #e8dfd1
                    )
                    !important;
                color: #493720 !important;
                font-size: 9px !important;
                font-weight: normal !important;
                line-height: 12px !important;
                text-align: center !important;
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow:
                    ellipsis
                    !important;
                cursor: pointer !important;
                user-select: none !important;
                box-shadow: none !important;
            }

            .qol-igm-row-folder:hover {
                background: #fffaf0 !important;
                border-color: #6e5332 !important;
            }

            .qol-igm-row-folder.trash,
            .qol-igm-row-folder.spam {
                background:
                    linear-gradient(
                        to bottom,
                        #f8e1df,
                        #e8c2bf
                    )
                    !important;
                border-color:
                    #a9625d
                    !important;
                color: #7d2924 !important;
            }

            .qol-igm-row-folder::after {
                content: '▾' !important;
                display: inline-block !important;
                margin-left: 5px !important;
                color: #725735 !important;
                font-size: 8px !important;
                line-height: 1 !important;
            }

            #${MENU_ID} {
                position: fixed !important;
                z-index: 1000002 !important;
                display: block !important;
                min-width: 170px !important;
                max-width: 230px !important;
                max-height: 280px !important;
                margin: 0 !important;
                padding: 4px !important;
                border:
                    2px solid var(--qol-border)
                    !important;
                border-radius: 4px !important;
                background:
                    #f7f5f0
                    !important;
                box-shadow:
                    0 8px 22px
                    rgba(0, 0, 0, 0.36)
                    !important;
                overflow-y: auto !important;
                overflow-x: hidden !important;
            }

            .qol-igm-menu-option {
                display: flex !important;
                align-items: center !important;
                justify-content:
                    space-between
                    !important;
                width: 100% !important;
                min-height: 28px !important;
                margin: 0 !important;
                padding: 5px 8px !important;
                border: 0 !important;
                border-radius: 3px !important;
                background:
                    transparent
                    !important;
                color: #3f3020 !important;
                font-size: 11px !important;
                font-weight: normal !important;
                line-height: 18px !important;
                text-align: left !important;
                cursor: pointer !important;
                user-select: none !important;
                white-space: nowrap !important;
            }

            .qol-igm-menu-option:hover,
            .qol-igm-menu-option.active {
                background:
                    #e9dfcc
                    !important;
            }

            .qol-igm-menu-option.active::after {
                content: '✓' !important;
                color: #58782d !important;
                font-weight: bold !important;
            }

            #${EMPTY_STATE_ID} {
                display: block !important;
                margin: 8px !important;
                padding: 22px 12px !important;
                border:
                    1px solid #d4c2a5
                    !important;
                border-radius: 4px !important;
                background:
                    #fff6e5
                    !important;
                color: #6a573d !important;
                font-family:
                    Arial,
                    sans-serif
                    !important;
                font-size: 12px !important;
                line-height: 17px !important;
                text-align: center !important;
                list-style: none !important;
                box-sizing:
                    border-box
                    !important;
            }

            .qol-igm-modal-overlay {
                position: fixed !important;
                inset: 0 !important;
                z-index: 1000003 !important;
                display: flex !important;
                align-items: center !important;
                justify-content:
                    center
                    !important;
                margin: 0 !important;
                padding: 20px !important;
                background:
                    rgba(0, 0, 0, 0.52)
                    !important;
            }

            .qol-igm-modal {
                display: block !important;
                width: 370px !important;
                max-width: 94vw !important;
                margin: 0 !important;
                padding: 0 !important;
                border:
                    3px solid var(--qol-border)
                    !important;
                border-radius: 4px !important;
                background:
                    #f7f5f0
                    !important;
                box-shadow:
                    0 12px 32px
                    rgba(0, 0, 0, 0.52)
                    !important;
                color: #333333 !important;
                overflow: hidden !important;
            }

            .qol-igm-modal-header {
                display: flex !important;
                align-items: center !important;
                min-height: 34px !important;
                margin: 0 !important;
                padding: 7px 10px !important;
                border: 0 !important;
                background:
                    linear-gradient(
                        to bottom,
                        var(--qol-accent-mid),
                        var(--qol-accent-dark)
                    )
                    !important;
                color: #f7f5f0 !important;
                font-size: 14px !important;
                font-weight: bold !important;
                line-height: 18px !important;
            }

            .qol-igm-modal-body {
                display: block !important;
                margin: 0 !important;
                padding: 14px !important;
                color: #4b3b28 !important;
                font-size: 12px !important;
                line-height: 18px !important;
            }

            .qol-igm-modal-input {
                display: block !important;
                width: 100% !important;
                height: 32px !important;
                margin: 9px 0 0 0 !important;
                padding: 5px 8px !important;
                border:
                    1px solid #9c8565
                    !important;
                border-radius: 3px !important;
                background: #ffffff !important;
                color: #332719 !important;
                font-family:
                    Arial,
                    sans-serif
                    !important;
                font-size: 12px !important;
                line-height: 20px !important;
                box-shadow: none !important;
                -webkit-appearance:
                    none
                    !important;
                appearance: none !important;
            }

            .qol-igm-modal-error {
                display: block !important;
                min-height: 17px !important;
                margin-top: 6px !important;
                color: #a52a2a !important;
                font-size: 11px !important;
                line-height: 16px !important;
            }

            .qol-igm-modal-footer {
                display: flex !important;
                align-items: center !important;
                justify-content:
                    flex-end
                    !important;
                gap: 7px !important;
                margin: 0 !important;
                padding:
                    9px 12px 12px
                    !important;
            }

            .qol-igm-modal-button {
                display: inline-flex !important;
                align-items: center !important;
                justify-content:
                    center
                    !important;
                min-width: 76px !important;
                height: 29px !important;
                margin: 0 !important;
                padding: 5px 11px !important;
                border:
                    1px solid var(--qol-action-border)
                    !important;
                border-radius: 3px !important;
                background:
                    linear-gradient(
                        to bottom,
                        var(--qol-accent),
                        var(--qol-accent-dark)
                    )
                    !important;
                color: #ffffff !important;
                font-size: 11px !important;
                font-weight: bold !important;
                line-height: 17px !important;
                text-align: center !important;
                cursor: pointer !important;
                user-select: none !important;
            }

            .qol-igm-modal-button:hover {
                filter:
                    brightness(1.08)
                    !important;
            }

            .qol-igm-modal-button.secondary {
                background:
                    linear-gradient(
                        to bottom,
                        #fdfbf7,
                        #e7dcc8
                    )
                    !important;
                color: #5b4328 !important;
                border-color:
                    #8c7250
                    !important;
            }

            .qol-igm-modal-button.danger {
                background:
                    linear-gradient(
                        to bottom,
                        #d9534f,
                        #b52b27
                    )
                    !important;
                border-color:
                    #8f211e
                    !important;
            }
        `;
    document.head.appendChild(style);
  }
  function closeMenu() {
    document.getElementById(MENU_ID)?.remove();
    if (activeMenuAnchor) {
      activeMenuAnchor.setAttribute('aria-expanded', 'false');
    }
    activeMenuAnchor = null;
  }
  function positionMenu(menu, anchor) {
    const anchorRectangle = anchor.getBoundingClientRect();
    const menuRectangle = menu.getBoundingClientRect();
    const gap = 4;
    let left = anchorRectangle.left;
    let top = anchorRectangle.bottom + gap;
    left = Math.max(8, Math.min(left, window.innerWidth - menuRectangle.width - 8));
    if (top + menuRectangle.height > window.innerHeight - 8) {
      top = anchorRectangle.top - menuRectangle.height - gap;
    }
    menu.style.setProperty('left', `${Math.round(left)}px`, 'important');
    menu.style.setProperty('top', `${Math.max(8, Math.round(top))}px`, 'important');
  }
  function openMenu(anchor, items, selectedValue, onSelect) {
    closeMenu();
    const menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.setAttribute('role', 'menu');
    items.forEach(item => {
      const option = document.createElement('div');
      option.className = 'qol-igm-menu-option';
      option.setAttribute('role', 'menuitem');
      option.tabIndex = 0;
      option.textContent = item.label;
      option.dataset.value = item.value;
      if (item.value === selectedValue) {
        option.classList.add('active');
      }
      function choose(event) {
        event.preventDefault();
        event.stopPropagation();
        onSelect(item.value);
      }
      option.addEventListener('click', choose);
      option.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          choose(event);
        }
      });
      menu.appendChild(option);
    });
    document.body.appendChild(menu);
    activeMenuAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    positionMenu(menu, anchor);
  }
  function updateFilterButton() {
    const button = document.getElementById(FILTER_BUTTON_ID);
    if (!button) {
      return;
    }
    const label = button.querySelector('.qol-igm-filter-label');
    if (label) {
      label.textContent = currentFilter === 'All' ? 'All Conversations' : currentFilter;
    }
    updateDeleteButtonState();
  }
  function updateDeleteButtonState() {
    const deleteButton = document.getElementById(DELETE_BUTTON_ID);
    if (!deleteButton) {
      return;
    }
    deleteButton.style.setProperty('display', getCustomFolders().includes(currentFilter) ? 'inline-flex' : 'none', 'important');
  }
  function openFilterMenu(anchor) {
    const items = [{
      value: 'All',
      label: 'All Conversations'
    }, ...getAllCategories().map(category => ({
      value: category,
      label: category
    }))];
    openMenu(anchor, items, currentFilter, value => {
      currentFilter = value;
      closeMenu();
      updateFilterButton();
      applyFilter();
    });
  }
  function createRowBadge(row, conversationId, currentTag) {
    const badge = document.createElement('div');
    badge.className = 'qol-igm-row-folder';
    badge.setAttribute('role', 'button');
    badge.setAttribute('aria-haspopup', 'menu');
    badge.setAttribute('aria-expanded', 'false');
    badge.tabIndex = 0;
    function open(event) {
      event.preventDefault();
      event.stopPropagation();
      if (activeMenuAnchor === badge) {
        closeMenu();
        return;
      }
      openMenu(badge, getAllCategories().map(category => ({
        value: category,
        label: category
      })), badge.dataset.currentTag, value => {
        setConversationTag(badge.dataset.conversationId, value);
      });
    }
    ['pointerdown', 'mousedown', 'mouseup'].forEach(eventName => {
      badge.addEventListener(eventName, event => {
        event.stopPropagation();
      });
    });
    badge.addEventListener('click', open);
    badge.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        open(event);
      }
    });
    updateRowBadge(badge, conversationId, currentTag);
    return badge;
  }
  function updateRowBadge(badge, conversationId, currentTag) {
    badge.textContent = currentTag;
    badge.title = `Current folder: ${currentTag}`;
    badge.dataset.conversationId = conversationId;
    badge.dataset.currentTag = currentTag;
    badge.classList.toggle('trash', currentTag === 'Trash');
    badge.classList.toggle('spam', currentTag === 'Spam');
  }
  function injectRowBadges() {
    const tags = getStoredTags();
    getConversationRows().forEach(row => {
      const conversationId = getConversationId(row);
      if (!conversationId) {
        return;
      }
      const currentTag = getConversationTag(row, tags);
      let badge = row.querySelector('.qol-igm-row-folder');
      row.classList.add('qol-igm-enhanced-row');
      row.querySelector('.qol-row-category-select')?.remove();
      if (!badge) {
        badge = createRowBadge(row, conversationId, currentTag);
        row.appendChild(badge);
      } else {
        updateRowBadge(badge, conversationId, currentTag);
      }
    });
  }
  function injectToolbar() {
    const context = findConversationListContext();
    if (!context) {
      return;
    }
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar && toolbar.parentNode !== context.toolbarParent) {
      toolbar.remove();
      toolbar = null;
    }
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = TOOLBAR_ID;
      toolbar.innerHTML = `
                <div class="qol-igm-toolbar-header">
                    <span>
                        Conversation Folders
                    </span>

                    <span id="${COUNT_ID}">
                        0 visible
                    </span>
                </div>

                <div class="qol-igm-toolbar-body">
                    <div
                        id="${FILTER_BUTTON_ID}"
                        role="button"
                        tabindex="0"
                        aria-haspopup="menu"
                        aria-expanded="false"
                    >
                        <span class="qol-igm-filter-label">
                            All Conversations
                        </span>

                        <span class="qol-igm-control-arrow">
                            ▼
                        </span>
                    </div>

                    <div class="qol-igm-toolbar-actions">
                        <div
                            id="qol-igm-create-folder"
                            class="qol-igm-action-button"
                            role="button"
                            tabindex="0"
                        >
                            New Folder
                        </div>

                        <div
                            id="${DELETE_BUTTON_ID}"
                            class="
                                qol-igm-action-button
                                danger
                            "
                            role="button"
                            tabindex="0"
                            style="
                                display:
                                    none
                                    !important;
                            "
                        >
                            Delete Folder
                        </div>
                    </div>
                </div>
            `;
      context.toolbarParent.insertBefore(toolbar, context.wrapper);
      const filterButton = toolbar.querySelector(`#${FILTER_BUTTON_ID}`);
      const createButton = toolbar.querySelector('#qol-igm-create-folder');
      const deleteButton = toolbar.querySelector(`#${DELETE_BUTTON_ID}`);
      function bindActivation(element, callback) {
        element.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          callback();
        });
        element.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            callback();
          }
        });
      }
      bindActivation(filterButton, () => {
        if (activeMenuAnchor === filterButton) {
          closeMenu();
        } else {
          openFilterMenu(filterButton);
        }
      });
      bindActivation(createButton, showCreateFolderModal);
      bindActivation(deleteButton, () => {
        showDeleteFolderModal(currentFilter);
      });
    }
    const conversationWidth = Math.round(context.list.getBoundingClientRect().width || context.wrapper.getBoundingClientRect().width || 0);
    if (conversationWidth > 0) {
      toolbar.style.setProperty('width', `${conversationWidth}px`, 'important');
      toolbar.style.setProperty('max-width', `${conversationWidth}px`, 'important');
    }
    updateFilterButton();
  }
  function updateVisibleCount(visibleCount, totalCount) {
    const count = document.getElementById(COUNT_ID);
    if (count) {
      count.textContent = `${visibleCount} visible · ` + `${totalCount} total`;
    }
  }
  function removeEmptyState() {
    document.getElementById(EMPTY_STATE_ID)?.remove();
  }
  function updateEmptyState(visibleCount) {
    const context = findConversationListContext();
    if (!context || visibleCount > 0) {
      removeEmptyState();
      return;
    }
    let emptyState = document.getElementById(EMPTY_STATE_ID);
    if (!emptyState || emptyState.parentNode !== context.list) {
      emptyState?.remove();
      emptyState = document.createElement(['UL', 'OL'].includes(context.list.tagName) ? 'li' : 'div');
      emptyState.id = EMPTY_STATE_ID;
      context.list.appendChild(emptyState);
    }
    emptyState.textContent = currentFilter === 'All' ? 'No conversations are currently available.' : `No conversations are assigned to “${currentFilter}”.`;
  }
  function updateDividers() {
    document.querySelectorAll('li.divider').forEach(divider => {
      let nextElement = divider.nextElementSibling;
      let hasVisibleConversation = false;
      while (nextElement && !nextElement.classList.contains('divider')) {
        if (nextElement.classList.contains('igmConversationEntry') && nextElement.style.display !== 'none') {
          hasVisibleConversation = true;
          break;
        }
        nextElement = nextElement.nextElementSibling;
      }
      divider.style.display = hasVisibleConversation ? '' : 'none';
    });
  }
  function applyFilter() {
    const tags = getStoredTags();
    const rows = getConversationRows();
    let visibleCount = 0;
    rows.forEach(row => {
      const tag = getConversationTag(row, tags);
      const shouldShow = currentFilter === 'All' ? !['Spam', 'Trash'].includes(tag) : tag === currentFilter;
      row.style.display = shouldShow ? '' : 'none';
      if (shouldShow) {
        visibleCount += 1;
      }
    });
    updateDividers();
    updateVisibleCount(visibleCount, rows.length);
    updateEmptyState(visibleCount);
  }
  function createModal({
    title,
    message,
    inputPlaceholder = '',
    confirmText,
    confirmClass = '',
    withInput = false,
    onConfirm
  }) {
    document.querySelector('.qol-igm-modal-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'qol-igm-modal-overlay';
    overlay.tabIndex = -1;
    overlay.innerHTML = `
            <div
                class="qol-igm-modal"
                role="dialog"
                aria-modal="true"
            >
                <div class="qol-igm-modal-header">
                    ${escapeHtml(title)}
                </div>

                <div class="qol-igm-modal-body">
                    <div>
                        ${escapeHtml(message)}
                    </div>

                    ${withInput ? `
                                <input
                                    type="text"
                                    class="qol-igm-modal-input"
                                    maxlength="20"
                                    placeholder="${escapeHtml(inputPlaceholder)}"
                                    autocomplete="off"
                                >

                                <div class="qol-igm-modal-error"></div>
                            ` : ''}
                </div>

                <div class="qol-igm-modal-footer">
                    <div
                        class="
                            qol-igm-modal-button
                            secondary
                            qol-igm-modal-cancel
                        "
                        role="button"
                        tabindex="0"
                    >
                        Cancel
                    </div>

                    <div
                        class="
                            qol-igm-modal-button
                            ${confirmClass}
                            qol-igm-modal-confirm
                        "
                        role="button"
                        tabindex="0"
                    >
                        ${escapeHtml(confirmText)}
                    </div>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('.qol-igm-modal-input');
    const errorElement = overlay.querySelector('.qol-igm-modal-error');
    const cancelButton = overlay.querySelector('.qol-igm-modal-cancel');
    const confirmButton = overlay.querySelector('.qol-igm-modal-confirm');
    function close() {
      overlay.remove();
    }
    function confirm() {
      const value = input ? normaliseFolderName(input.value) : true;
      const result = onConfirm?.(value, errorElement);
      if (result !== false) {
        close();
      }
    }
    function bindActivation(element, callback) {
      element.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        callback();
      });
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          callback();
        }
      });
    }
    bindActivation(cancelButton, close);
    bindActivation(confirmButton, confirm);
    overlay.addEventListener('pointerdown', event => {
      if (event.target === overlay) {
        close();
      }
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
      if (event.key === 'Enter' && input) {
        event.preventDefault();
        confirm();
      }
    });
    window.setTimeout(() => {
      if (input) {
        input.focus();
      } else {
        confirmButton.focus();
      }
    }, 0);
  }
  function showCreateFolderModal() {
    createModal({
      title: 'Create Folder',
      message: 'Choose a short name for the new conversation folder.',
      inputPlaceholder: 'e.g. Defense, Trade...',
      confirmText: 'Create',
      withInput: true,
      onConfirm: (folderName, errorElement) => {
        if (!folderName) {
          errorElement.textContent = 'Enter a folder name.';
          return false;
        }
        const duplicate = getAllCategories().some(category => {
          return category.localeCompare(folderName, undefined, {
            sensitivity: 'base'
          }) === 0;
        });
        if (duplicate) {
          errorElement.textContent = 'A folder with that name already exists.';
          return false;
        }
        const folders = getCustomFolders();
        folders.push(folderName);
        saveCustomFolders(folders);
        currentFilter = folderName;
        closeMenu();
        refreshNow();
        return true;
      }
    });
  }
  function showDeleteFolderModal(folderName) {
    if (!getCustomFolders().includes(folderName)) {
      return;
    }
    createModal({
      title: 'Delete Folder',
      message: `Delete “${folderName}”? ` + 'Conversations inside it will be moved to Unsorted.',
      confirmText: 'Delete',
      confirmClass: 'danger',
      onConfirm: () => {
        saveCustomFolders(getCustomFolders().filter(folder => {
          return folder !== folderName;
        }));
        const tags = getStoredTags();
        Object.keys(tags).forEach(conversationId => {
          if (tags[conversationId] === folderName) {
            delete tags[conversationId];
          }
        });
        saveStoredTags(tags);
        currentFilter = 'All';
        closeMenu();
        refreshNow();
        return true;
      }
    });
  }
  function cleanUp() {
    closeMenu();
    document.querySelector('.qol-igm-modal-overlay')?.remove();
    document.getElementById(TOOLBAR_ID)?.remove();
    removeEmptyState();
    document.querySelectorAll('.qol-igm-row-folder, ' + '.qol-row-category-select').forEach(element => {
      element.remove();
    });
    document.querySelectorAll('li.igmConversationEntry').forEach(row => {
      row.classList.remove('qol-igm-enhanced-row');
      row.style.display = '';
    });
    document.querySelectorAll('li.divider').forEach(divider => {
      divider.style.display = '';
    });
  }
  function refreshNow() {
    if (isRefreshing || !document.body) {
      return;
    }
    isRefreshing = true;
    try {
      if (!isEnabled()) {
        cleanUp();
        return;
      }
      injectStyles();
      injectToolbar();
      injectRowBadges();
      updateFilterButton();
      applyFilter();
    } finally {
      isRefreshing = false;
    }
  }
  function scheduleRefresh(delay = 60) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshNow, delay);
  }
  function startObserver() {
    if (observer || !document.body) {
      return;
    }
    observer = new MutationObserver(mutations => {
      const relevantChange = mutations.some(mutation => {
        if (mutation.type !== 'childList') {
          return false;
        }
        return [...mutation.addedNodes, ...mutation.removedNodes].some(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return false;
          }
          const element = node;
          if (element.id === TOOLBAR_ID || element.id === MENU_ID || element.id === EMPTY_STATE_ID || element.classList?.contains('qol-igm-modal-overlay') || element.classList?.contains('qol-igm-row-folder')) {
            return false;
          }
          return element.matches?.('li.igmConversationEntry, ' + 'li.divider, ' + '.scrollContentInnerWrapper, ' + '.scrollPane') || element.querySelector?.('li.igmConversationEntry, ' + 'li.divider, ' + '.scrollContentInnerWrapper, ' + '.scrollPane');
        });
      });
      if (relevantChange) {
        scheduleRefresh();
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  function startFallback() {
    if (fallbackInterval !== null) {
      return;
    }
    fallbackInterval = window.setInterval(() => {
      if (!isEnabled()) {
        cleanUp();
        return;
      }
      const rows = getConversationRows();
      const toolbar = document.getElementById(TOOLBAR_ID);
      const badgeCount = document.querySelectorAll('.qol-igm-row-folder').length;
      if (rows.length > 0 && !toolbar || badgeCount !== rows.length) {
        scheduleRefresh(0);
      }
    }, 2000);
  }
  document.addEventListener('click', event => {
    if (!event.target.closest(`#${MENU_ID}`) && !event.target.closest('.qol-igm-row-folder') && !event.target.closest(`#${FILTER_BUTTON_ID}`)) {
      closeMenu();
    }
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeMenu();
    }
  }, true);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);
  window.addEventListener('qol_setting_changed', event => {
    if (!event.detail || event.detail.key !== FEATURE_KEY) {
      return;
    }
    if (event.detail.enabled) {
      scheduleRefresh(0);
    } else {
      cleanUp();
    }
  });
  function initialise() {
    injectStyles();
    startObserver();
    startFallback();
    refreshNow();
    console.log('[IgmEnhancer] APES conversation folder interface initialized.');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialise, {
      once: true
    });
  } else {
    initialise();
  }
}
initIgmEnhancer();
