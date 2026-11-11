(() => {
  'use strict';

  const key = 'customVillageOrder';
  const panelSelector = '.dropdownBody.villageListDropDown';
  const settingsButton = '[data-qol-edit-village-order]';
  const rowId = row => Array.from(row.classList)
    .find(name => /^dropDownItem\d+$/.test(name))?.slice('dropDownItem'.length);
  const enabled = () => window.isQolEnabled(key);
  const storageKey = () => {
    const context = window.APES.context;
    return context.isPlayerResolved()
      ? `qol_custom_village_order:${context.getServer()}:${context.getPlayerId()}`
      : null;
  };
  const observer = new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes' ||
        record.target.closest?.(panelSelector) ||
        [...record.addedNodes, ...record.removedNodes].some(node =>
          node.matches?.(panelSelector) || node.querySelector?.(panelSelector)))) sync();
  });
  let styledList;
  let dialog;
  let busy = false;
  let replaying = false;

  function savedOrder(account) {
    try {
      const ids = JSON.parse(localStorage.getItem(account));
      return Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && /^\d+$/.test(id)) : [];
    } catch {
      return [];
    }
  }

  function readRows() {
    const list = document.querySelector(`${panelSelector} ul`);
    const rows = Array.from(list?.children ?? []).filter(row => row.matches('li.dropdownOption'));
    const villages = rows.map(row => ({
      id: rowId(row),
      name: row.querySelector('.villageEntry')?.textContent.trim(),
      row
    })).filter(village => village.id && village.name && !village.row.classList.contains('disable'));
    return { list, rows, villages };
  }

  function ordered(villages, ids) {
    const byId = new Map(villages.map(village => [village.id, village]));
    const result = [];
    for (const id of ids) {
      if (byId.has(id)) result.push(byId.get(id));
      byId.delete(id);
    }
    return result.concat(Array.from(byId.values()));
  }

  function clearOrder() {
    if (!styledList) return;
    styledList.removeAttribute('data-qol-custom-village-order');
    for (const row of styledList.children) row.style.removeProperty('--qol-village-order');
    styledList = null;
  }

  function sync() {
    const account = storageKey();
    const ids = enabled() && account ? savedOrder(account) : [];
    const { list, rows, villages } = readRows();
    if (styledList && (styledList !== list || !ids.length)) clearOrder();
    if (!list || !ids.length || !villages.length) return;
    const sorted = ordered(villages, ids);
    // Preserve Angular's row order and bindings. Only change visual placement.
    const villageRows = new Set(villages.map(village => village.row));
    let index = 0;
    const visualRows = rows.map(row => villageRows.has(row) ? sorted[index++].row : row);
    visualRows.forEach((row, position) => row.style.setProperty('--qol-village-order', position));
    list.setAttribute('data-qol-custom-village-order', '');
    styledList = list;
  }

  async function readOwnedVillages() {
    const villages = await window.APES_CP_VILLAGE_NAVIGATOR.getOwnedVillages();
    // Match the native dropdown's case-insensitive name order for unsaved villages.
    return [...villages].sort((first, second) => {
      const a = first.name.toLowerCase();
      const b = second.name.toLowerCase();
      return a < b ? -1 : a > b ? 1 : 0;
    });
  }

  async function navigate(event, arrow) {
    const account = storageKey();
    if (!enabled() || !account || !savedOrder(account).length || replaying) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) return;
    busy = true;
    try {
      const villages = await readOwnedVillages();
      if (!enabled() || storageKey() !== account || !arrow.isConnected) return;
      const ids = savedOrder(account);
      const sorted = ordered(villages, ids);
      const currentId = sorted.find(village => village.isActive)?.id ?? window.APES.context.getVillageId();
      const current = sorted.findIndex(village => village.id === currentId);
      if (!ids.length || current < 0) {
        replayNativeArrow(arrow);
      } else if (sorted.length > 1) {
        const step = arrow.classList.contains('next') ? 1 : -1;
        const target = sorted[(current + step + sorted.length) % sorted.length];
        const page = location.hash.includes('/page:resources') ? 'resources' : 'village';
        location.hash = `#/page:${page}/villId:${target.id}`;
      }
    } catch {
      if (enabled() && storageKey() === account && arrow.isConnected) replayNativeArrow(arrow);
    } finally {
      busy = false;
    }
  }

  function replayNativeArrow(arrow) {
    replaying = true;
    try {
      arrow.click();
    } finally {
      replaying = false;
    }
  }

  async function editOrder(button) {
    if (!enabled() || busy || dialog) return;
    const loadingStatus = button.parentElement.querySelector('[data-qol-village-order-status]');
    const account = storageKey();
    if (!account) {
      loadingStatus.textContent = 'Your Travian account is still loading. Try again in a moment.';
      return;
    }
    busy = true;
    loadingStatus.textContent = 'Loading villages…';
    let villages;
    try {
      villages = await readOwnedVillages();
    } catch {
      if (enabled() && storageKey() === account) loadingStatus.textContent = 'Could not read your villages. Try again in a moment.';
      return;
    } finally {
      busy = false;
    }
    loadingStatus.textContent = '';
    if (!enabled() || storageKey() !== account) return;

    let draft = ordered(villages, savedOrder(account));
    let useDefault = false;
    let draggedId;
    const editor = document.createElement('dialog');
    editor.className = 'qol-village-order-editor';
    editor.setAttribute('aria-label', 'Reorder villages');
    editor.innerHTML = `
      <h2>Reorder villages</h2>
      <p>Drag villages or use the arrow buttons to move them.</p>
      <ol></ol>
      <p role="status"></p>
      <div class="qol-village-order-actions">
        <div class="qol-wl-action-btn secondary" role="button" tabindex="0" data-action="reset">Reset to default</div>
        <div class="qol-wl-action-btn secondary" role="button" tabindex="0" data-action="cancel">Cancel</div>
        <div class="qol-wl-action-btn primary" role="button" tabindex="0" data-action="save">Save order</div>
      </div>`;
    const list = editor.querySelector('ol');
    const status = editor.querySelector('[role="status"]');

    function render() {
      list.replaceChildren();
      draft.forEach((village, index) => {
        const row = document.createElement('li');
        row.draggable = true;
        row.dataset.villageId = village.id;
        const label = document.createElement('span');
        label.textContent = village.name;
        row.append(label);
        for (const [step, symbol, direction] of [[-1, '↑', 'up'], [1, '↓', 'down']]) {
          const button = document.createElement('div');
          button.className = 'qol-wl-action-btn secondary';
          button.setAttribute('role', 'button');
          button.textContent = symbol;
          button.dataset.step = step;
          button.setAttribute('aria-label', `Move ${village.name} ${direction}`);
          const disabled = !draft[index + step];
          button.setAttribute('aria-disabled', String(disabled));
          button.tabIndex = disabled ? -1 : 0;
          row.append(button);
        }
        list.append(row);
      });
    }

    function move(from, to, focusStep) {
      if (from < 0 || !draft[to] || from === to) return;
      const [village] = draft.splice(from, 1);
      draft.splice(to, 0, village);
      useDefault = false;
      render();
      if (focusStep) {
        const row = list.children[to];
        (row.querySelector(`[data-step="${focusStep}"][tabindex="0"]`) || row.querySelector('[data-step][tabindex="0"]'))?.focus();
      }
    }

    list.addEventListener('dragstart', event => {
      draggedId = event.target.closest('li')?.dataset.villageId;
      if (draggedId) event.dataTransfer.setData('text/plain', draggedId);
    });
    list.addEventListener('dragend', () => { draggedId = undefined; });
    list.addEventListener('dragover', event => {
      if (draggedId && event.target.closest('li')) event.preventDefault();
    });
    list.addEventListener('drop', event => {
      const targetId = event.target.closest('li')?.dataset.villageId;
      if (!draggedId || !targetId) return;
      event.preventDefault();
      move(draft.findIndex(village => village.id === draggedId),
        draft.findIndex(village => village.id === targetId));
      draggedId = undefined;
    });
    editor.addEventListener('click', event => {
      const button = event.target.closest('[role="button"]');
      if (!button || button.getAttribute('aria-disabled') === 'true') return;
      if (button.dataset.step) {
        const from = draft.findIndex(village => village.id === button.closest('li').dataset.villageId);
        move(from, from + Number(button.dataset.step), button.dataset.step);
      }
      if (button.dataset.action === 'reset') {
        draft = [...villages];
        useDefault = true;
        render();
      }
      if (button.dataset.action === 'cancel') editor.close();
      if (button.dataset.action === 'save') {
        if (!enabled() || storageKey() !== account) {
          editor.close();
          return;
        }
        try {
          if (useDefault) localStorage.removeItem(account);
          else localStorage.setItem(account, JSON.stringify(draft.map(village => village.id)));
        } catch {
          status.textContent = 'Could not save the village order.';
          return;
        }
        sync();
        editor.close();
      }
    });
    editor.addEventListener('close', () => {
      editor.remove();
      dialog = null;
    });
    render();
    document.body.append(editor);
    dialog = editor;
    editor.showModal();
  }

  function onClick(event) {
    if (!(event.target instanceof Element)) return;
    const arrow = event.target.closest('#villageList .navigation.previous, #villageList .navigation.next');
    if (arrow) void navigate(event, arrow);
    const button = event.target.closest(settingsButton);
    if (button) void editOrder(button);
  }

  function onKeydown(event) {
    const control = event.target.closest?.(settingsButton + ', .qol-village-order-editor [role="button"]');
    if (!control || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat && control.getAttribute('aria-disabled') !== 'true') control.click();
  }

  function applySetting() {
    observer.disconnect();
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeydown, true);
    if (enabled()) {
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKeydown, true);
      observer.observe(document.body, { childList: true, subtree: true });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-apes-player-id'] });
      sync();
    } else {
      dialog?.close();
      clearOrder();
    }
  }

  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key === key) applySetting();
  });
  window.addEventListener('storage', event => {
    if (event.key === `qol_${key}` || event.key === storageKey() || event.key === null) applySetting();
  });
  applySetting();
})();
