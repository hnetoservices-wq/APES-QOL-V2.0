(() => {
  'use strict';
  const FEATURE = 'chatWindowStyle', ROOT = '.modalWrapper.igm';
  const active = new Map(), classes = ['qol-chat-window', 'qol-chat-shell-slot', 'qol-chat-outer-track', 'qol-chat-filtered', 'qol-chat-filtered-divider', 'qol-chat-native-hidden'];
  const WATCH = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] };
  const BUBBLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H9l-5 4zM8 8h8M8 12h5"/></svg>';
  let observer = null, queued = false, lastGeometry = null;
  const enabled = () => typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE);
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const fold = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const owned = node => node?.closest?.('[data-qol-chat-owned]');

  function geometry(box = lastGeometry) {
    const maxWidth = Math.max(1, window.innerWidth - 24), maxHeight = Math.max(1, window.innerHeight - 24);
    const width = Math.min(maxWidth, Math.max(Math.min(520, maxWidth), box?.width || 880));
    const height = Math.min(maxHeight, Math.max(Math.min(320, maxHeight), box?.height || 600));
    return { width, height, x: Math.max(12, Math.min(box?.x ?? (window.innerWidth - width) / 2, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(box?.y ?? Math.max(40, (window.innerHeight - height) / 2), window.innerHeight - height - 12)) };
  }
  function place(state, box = state.box) {
    state.box = geometry(box); lastGeometry = { ...state.box };
    for (const [key, value] of Object.entries(state.box)) {
      const property = `--qol-chat-${key}`, text = `${Math.round(value)}px`;
      if (state.root.style.getPropertyValue(property) !== text) state.root.style.setProperty(property, text);
    }
  }
  function decorateShell(state) {
    const system = state.root.querySelector('.igmSystem'); if (!system) return;
    state.system = system;
    // Only the outer sizing wrappers change layout. Angular-owned nodes stay in place.
    let node = system.parentElement;
    while (node && node !== state.root) {
      if (!node.classList.contains('modalContent') && !node.classList.contains('modal')) node.classList.add('qol-chat-shell-slot');
      for (const track of node.children) if (track.classList.contains('scrollTrack')) track.classList.add('qol-chat-outer-track');
      node = node.parentElement;
    }
    const head = state.root.querySelector('.contentHeader');
    if (head && !head.querySelector('[data-qol-chat-brand]')) {
      const brand = document.createElement('span'); brand.dataset.qolChatOwned = '1'; brand.dataset.qolChatBrand = '1';
      brand.className = 'qol-chat-brand'; brand.textContent = 'APES'; brand.setAttribute('aria-hidden', 'true'); head.prepend(brand);
    }
    const sidebar = system.querySelector('.firstHalf');
    if (sidebar && !sidebar.querySelector('[data-qol-chat-search]')) {
      const search = document.createElement('div'); search.dataset.qolChatOwned = '1'; search.className = 'qol-chat-search';
      search.innerHTML = '<label><span class="qol-chat-search-label">Conversations</span><input type="search" data-qol-chat-search placeholder="Search conversations…" aria-label="Search conversations" autocomplete="off"></label><span class="qol-chat-results" data-qol-chat-count></span>';
      const input = search.querySelector('input'); input.value = state.query;
      input.addEventListener('input', () => { state.query = input.value; applySearch(state); });
      for (const type of ['click', 'keydown', 'keyup']) search.addEventListener(type, event => {
        event.stopPropagation(); if (type === 'keydown' && event.key === 'Enter') event.preventDefault();
      });
      const history = sidebar.querySelector('.history'); sidebar.insertBefore(search, history || null);
    }
    const thread = system.querySelector('.threadView');
    if (thread && !thread.querySelector('[data-qol-chat-empty]')) {
      const empty = document.createElement('div'); empty.dataset.qolChatOwned = '1'; empty.dataset.qolChatEmpty = '1'; empty.className = 'qol-chat-empty';
      empty.innerHTML = `${BUBBLE}<strong>Choose a conversation</strong><p>Private messages, kingdom chats and your folders are on the left.</p>`; thread.append(empty);
    }
  }
  function applySearch(state) {
    const system = state.system; if (!system?.isConnected) return;
    const query = fold(state.query), rows = [...system.querySelectorAll('.history .igmConversationEntry')];
    let visible = 0;
    for (const row of rows) {
      const name = row.querySelector('.igmInfos .name')?.textContent || row.querySelector('.name')?.textContent || '';
      const preview = row.querySelector('.linePreview')?.textContent || '';
      const matches = !query || fold(`${name} ${preview}`).includes(query);
      const nativeHidden = row.hidden || row.style.display.toLowerCase() === 'none' || row.classList.contains('ng-hide');
      row.classList.toggle('qol-chat-native-hidden', nativeHidden);
      row.classList.toggle('qol-chat-filtered', !matches);
      if (matches && !nativeHidden) visible++;
    }
    system.querySelectorAll('.history .divider').forEach(node => node.classList.toggle('qol-chat-filtered-divider', Boolean(query)));
    const count = system.querySelector('[data-qol-chat-count]');
    const label = `${visible} conversation${visible === 1 ? '' : 's'}${query ? ' found' : ''}`;
    if (count && count.textContent !== label) count.textContent = label;
    const empty = system.querySelector('[data-qol-chat-empty]');
    if (empty) {
      const thread = system.querySelector('.threadView');
      const composing = [...thread.querySelectorAll('textarea, input:not([type="hidden"]), [contenteditable="true"]')]
        .some(control => !control.closest('.ng-hide,[hidden]') && control.style.display.toLowerCase() !== 'none');
      empty.hidden = !thread.querySelector('.selectConversation') || composing;
    }
  }
  function attachGestures(state) {
    const { root, abort } = state, options = { signal: abort.signal };
    const grip = document.createElement('div'); grip.dataset.qolChatOwned = '1'; grip.className = 'qol-chat-resize';
    grip.setAttribute('role', 'button'); grip.tabIndex = 0; grip.setAttribute('aria-label', 'Resize chat window'); grip.title = 'Drag to resize · arrow keys also work';
    root.append(grip);
    let gesture = null;
    root.addEventListener('pointerdown', event => {
      const resize = grip.contains(event.target), head = event.target.closest?.('.contentHeader');
      if (event.button !== 0 || (!resize && (!head || event.target.closest('a,input,select,textarea,[role="button"]')))) return;
      gesture = { resize, id: event.pointerId, x: event.clientX, y: event.clientY, box: { ...state.box } };
      try { root.setPointerCapture?.(event.pointerId); } catch (_) {}
      event.preventDefault(); event.stopImmediatePropagation();
    }, { ...options, capture: true });
    // Prevent the game's mouse drag from competing with the APES pointer drag.
    root.addEventListener('mousedown', event => {
      if (event.target.closest?.('.contentHeader') && !event.target.closest('a,input,select,textarea,[role="button"]')) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, { ...options, capture: true });
    root.addEventListener('dragstart', event => { if (event.target.closest?.('.contentHeader')) event.preventDefault(); }, options);
    window.addEventListener('pointermove', event => {
      if (!gesture || event.pointerId !== gesture.id || !enabled() || !root.isConnected) return;
      const box = { ...gesture.box }, dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (gesture.resize) { box.width = Math.min(box.width + dx, window.innerWidth - box.x - 12); box.height = Math.min(box.height + dy, window.innerHeight - box.y - 12); }
      else { box.x += dx; box.y += dy; }
      place(state, box); event.preventDefault(); event.stopImmediatePropagation();
    }, { ...options, capture: true });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) window.addEventListener(type, event => {
      if (gesture?.id === event.pointerId) gesture = null;
    }, { ...options, capture: true });
    grip.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); }, options);
    grip.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const box = { ...state.box }, step = event.shiftKey ? 50 : 10;
      if (event.key === 'ArrowLeft') box.width -= step; if (event.key === 'ArrowRight') box.width += step;
      if (event.key === 'ArrowUp') box.height -= step; if (event.key === 'ArrowDown') box.height += step;
      place(state, box); event.preventDefault(); event.stopPropagation();
    }, options);
  }
  function unmount(state) {
    state.abort.abort();
    for (const node of [state.root, ...state.root.querySelectorAll('*')]) {
      for (const name of classes) node.classList.remove(name);
    }
    state.root.querySelectorAll('[data-qol-chat-owned]').forEach(node => node.remove());
    for (const name of ['x', 'y', 'width', 'height']) state.root.style.removeProperty(`--qol-chat-${name}`);
    active.delete(state.root);
  }
  function sync() {
    queued = false;
    observer?.disconnect();
    try {
    for (const state of active.values()) if (!enabled() || !state.root.isConnected || !state.root.querySelector('.igmSystem')) unmount(state);
    if (!enabled()) return;
    for (const root of document.querySelectorAll(ROOT)) {
      if (!root.querySelector('.igmSystem')) continue;
      let state = active.get(root);
      if (!state) {
        state = { root, system: null, box: geometry(), query: '', abort: new AbortController() };
        active.set(root, state); root.classList.add('qol-chat-window'); place(state); attachGestures(state);
      }
      decorateShell(state); applySearch(state);
    }
    } finally { if (document.body) observer?.observe(document.body, WATCH); }
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(sync); } }
  function start() {
    sync();
    observer = new MutationObserver(records => {
      if (records.some(record => {
        if (owned(record.target)) return false;
        if (record.type === 'attributes' || record.type === 'characterData') return record.target.parentElement?.closest(ROOT) || record.target.closest?.(ROOT);
        return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && !owned(node) && (node.matches?.(ROOT) || node.closest?.(ROOT) || node.querySelector?.(ROOT))) || record.target.closest?.(ROOT);
      })) schedule();
    });
    observer.observe(document.body, WATCH);
  }
  window.APES_CHAT_WINDOW_STYLE = Object.freeze({ refresh: sync });
  window.addEventListener('qol_setting_changed', event => { if (event.detail?.key === FEATURE) sync(); });
  window.addEventListener('resize', () => { for (const state of active.values()) place(state); });
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
