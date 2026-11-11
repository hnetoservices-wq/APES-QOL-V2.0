(() => {
  'use strict';

  const key = 'customVillageOrder';
  const headerSelector = '#villageList .currentVillageName .dropdownHead';
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

  async function openNativeList() {
    const header = document.querySelector(headerSelector);
    const openedHere = Boolean(header && !header.classList.contains('opened'));
    const close = () => {
      if (openedHere && header.isConnected && header.classList.contains('opened')) header.click();
    };
    if (openedHere) header.click();
    try {
      for (let attempt = 0; attempt < 12; attempt++) {
        const { villages } = readRows();
        if (villages.length && header?.classList.contains('opened')) return { villages, close };
        if (!enabled() || !header?.isConnected) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return { villages: [], close };
    } catch (error) {
      close();
      throw error;
    }
  }

  async function navigate(event, arrow) {
    const account = storageKey();
    const ids = account ? savedOrder(account) : [];
    if (!enabled() || !ids.length || replaying) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) return;
    busy = true;
    try {
      const { villages, close } = await openNativeList();
      if (!enabled() || storageKey() !== account || !arrow.isConnected) {
        close();
        return;
      }
      const sorted = ordered(villages, savedOrder(account));
      const current = sorted.findIndex(village => village.row.classList.contains('selected'));
      if (current >= 0 && sorted.length > 1) {
        const step = arrow.classList.contains('next') ? 1 : -1;
        sorted[(current + step + sorted.length) % sorted.length].row.click();
        close();
      } else {
        close();
        if (sorted.length !== 1 || current < 0) {
          replaying = true;
          arrow.click();
        }
      }
    } finally {
      replaying = false;
      busy = false;
    }
  }

  async function editOrder() {
    if (!enabled() || busy || dialog) return;
    const account = storageKey();
    if (!account) {
      window.alert('Your Travian account is still loading. Try again in a moment.');
      return;
    }
    busy = true;
    let villages;
    try {
      const native = await openNativeList();
      villages = native.villages;
      native.close();
    } finally {
      busy = false;
    }
    if (!enabled() || storageKey() !== account) return;
    if (!villages.length) {
      window.alert('Could not read the village list. Try again from your village view.');
      return;
    }

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
        <button type="button" data-action="reset">Reset to default</button>
        <button type="button" data-action="cancel">Cancel</button>
        <button type="button" data-action="save">Save order</button>
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
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = symbol;
          button.dataset.step = step;
          button.setAttribute('aria-label', `Move ${village.name} ${direction}`);
          button.disabled = !draft[index + step];
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
        (row.querySelector(`[data-step="${focusStep}"]:enabled`) || row.querySelector('button:enabled'))?.focus();
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
      const button = event.target.closest('button');
      if (!button) return;
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
    if (event.target.closest(settingsButton)) void editOrder();
  }

  function applySetting() {
    observer.disconnect();
    document.removeEventListener('click', onClick, true);
    if (enabled()) {
      document.addEventListener('click', onClick, true);
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
