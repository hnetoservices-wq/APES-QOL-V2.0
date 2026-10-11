(() => {
  'use strict';
  const S = window.APES_REMINDER_SCHEDULE;
  if (!S || window.APES_DAILY_REMINDERS) return;
  const FEATURE = 'dailyReminders', BOX = 'qol-daily-reminders-status', PANEL = 'qol-daily-reminders-panel';
  const OPTIONS = { feature: FEATURE, key: 'reminders', scope: 'player' };
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const enabled = () => typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE);
  const action = (label, attrs = '', disabled = false) => `<div class="qol-rem-action" role="button" tabindex="${disabled ? -1 : 0}" aria-disabled="${disabled}" ${attrs}>${label}</div>`;
  const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0112 0c0 7 3 7 3 8H3c0-1 3-1 3-8M9 21h6"></path></svg>';
  let items = [], loaded = false, loading = null, queue = Promise.resolve(), busy = false;
  let editor = null, deleting = '', message = '', activeKeys = new Set(), signature = '', audio = null;
  const lastDings = new Map(), DING_INTERVAL = 120000;
  let resumingAudio = null;
  function accountKey() {
    try { return window.APES?.storage?.key(OPTIONS) || ''; } catch (_) { return ''; }
  }
  async function read() {
    if (!window.APES?.storage) throw Error('APES storage is not ready.');
    const raw = await window.APES.storage.get(OPTIONS, { version: 1, items: [] });
    if (raw?.version !== 1 || !Array.isArray(raw.items)) throw Error('Saved reminder data could not be read.');
    const seen = new Set();
    return raw.items.map(S.normalize).filter(item => item && !seen.has(item.id) && seen.add(item.id));
  }
  async function load() {
    if (loading) return loading;
    loading = (async () => {
      try { items = await read(); loaded = true; message = ''; }
      catch (error) { loaded = false; message = `Reminders could not be loaded: ${error.message}`; }
      finally { loading = null; signature = ''; refresh(); renderPanel(); }
    })();
    return loading;
  }
  function mutate(update) {
    const pending = queue.then(async () => {
      busy = true; syncDisabled();
      try {
        const current = await read(), next = update(current);
        await window.APES.storage.set(OPTIONS, { version: 1, items: next });
        items = next; loaded = true; message = ''; return true;
      } catch (error) { message = `Reminder could not be saved: ${error.message}`; return false; }
      finally { busy = false; signature = ''; refresh(); syncDisabled(); showMessage(); }
    });
    queue = pending.then(() => undefined, () => undefined);
    return pending;
  }
  function describe(item) {
    const repeat = item.repeat === 'once' ? 'Once' : item.repeat === 'daily' ? 'Every day' : item.repeat === 'interval' ? `Every ${item.interval} days` : item.days.map(day => DAYS[day]).join(', ');
    return `${repeat} at ${item.time} · ${item.startDate}${item.endDate ? ` → ${item.endDate}` : ''} · local time`;
  }
  function dueItems(now = Date.now()) {
    return loaded ? items.flatMap(item => { const occurrence = S.due(item, now); return occurrence ? [{ item, ...occurrence }] : []; }).sort((a, b) => a.at - b.at) : [];
  }
  function primeAudio() {
    if (!enabled()) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio ||= new Audio();
      if (audio.state === 'running') { playDueSounds(); return; }
      if (!resumingAudio) {
        resumingAudio = Promise.resolve(audio.resume()).then(() => { playDueSounds(); }, () => {}).finally(() => { resumingAudio = null; });
      }
    } catch (_) {}
  }
  function ding() {
    if (!audio || audio.state !== 'running') return false;
    try {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(660, now); gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35); oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(now); oscillator.stop(now + 0.35);
      return true;
    } catch (_) { return false; }
  }
  function playDueSounds() {
    if (!enabled()) { lastDings.clear(); return; }
    const now = Date.now(), due = dueItems(now), keys = new Set(due.map(row => `${row.item.id}:${row.key}`));
    for (const key of lastDings.keys()) if (!keys.has(key)) lastDings.delete(key);
    const pending = [...keys].filter(key => !lastDings.has(key) || now - lastDings.get(key) >= DING_INTERVAL);
    // Simultaneous alarms share one ding; each occurrence retains its own repeat deadline.
    if (pending.length && ding()) for (const key of pending) lastDings.set(key, now);
  }
  function countdown(milliseconds) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(value => String(value).padStart(2, '0')).join(':');
  }
  function updateCountdowns(now = Date.now()) {
    const panel = document.getElementById(PANEL); if (!panel || panel.hidden) return;
    const byId = new Map(items.map(item => [item.id, item]));
    for (const node of panel.querySelectorAll('[data-rem-countdown]')) {
      const item = byId.get(node.closest('[data-rem-id]').dataset.remId);
      if (!item) continue;
      const next = S.next(item, now), latest = S.latest(item, now);
      const outstanding = latest && (!item.handledKey || item.handledKey < latest.key);
      const snoozed = outstanding && item.snooze?.key === latest.key && item.snooze.until > now;
      const at = snoozed ? Math.min(item.snooze.until, next?.at ?? Infinity) : next?.at;
      node.textContent = !item.enabled ? 'Paused' : S.due(item, now) ? `Due now${next ? ` · Next scheduled in ${countdown(next.at - now)}` : ''}`
        : at ? `${snoozed ? 'Snoozed · ' : ''}Will go off in ${countdown(at - now)}` : 'No further occurrences';
    }
  }
  function position() {
    const box = document.getElementById(BOX);
    if (!box) return;
    const finish = document.getElementById('qol-building-alarm-status');
    const finishRect = finish?.getBoundingClientRect();
    const hero = document.querySelector('#heroQuickInfo .heroStats'), heroRect = hero?.getBoundingClientRect();
    const useFinish = finishRect?.width > 0 && window.getComputedStyle(finish).display !== 'none';
    if (!useFinish && !(heroRect?.width || heroRect?.height)) { box.style.setProperty('display', 'none', 'important'); return; }
    const anchor = useFinish ? finishRect : { left: Math.max(8, heroRect.left - 184), top: heroRect.top, height: 28 };
    let left = anchor.left - 184, top = anchor.top;
    if (!useFinish) left = anchor.left;
    if (left < 8) { left = Math.max(8, anchor.left); top += 34; }
    left = Math.min(left, Math.max(8, window.innerWidth - 184));
    box.style.setProperty('display', 'block', 'important');
    box.style.setProperty('left', `${Math.round(left)}px`, 'important'); box.style.setProperty('top', `${Math.max(8, Math.round(top))}px`, 'important');
    const popover = box.querySelector('.qol-rem-popover');
    const width = Math.min(420, window.innerWidth - 16);
    popover.style.setProperty('left', `${Math.min(0, window.innerWidth - 8 - left - width)}px`, 'important');
  }
  function mountBox() {
    let box = document.getElementById(BOX);
    if (box) return box;
    box = document.createElement('section'); box.id = BOX;
    box.innerHTML = `<div class="qol-rem-main" role="button" tabindex="0" aria-expanded="false" aria-controls="qol-rem-popover" data-rem-open>${BELL}<span class="qol-rem-label" role="status" aria-live="polite">Reminders</span></div><div id="qol-rem-popover" class="qol-rem-popover"><header><strong>Daily Reminders</strong>${action('Manage', 'data-rem-manage')}</header><div data-rem-alerts></div></div>`;
    wire(box); document.body.append(box); return box;
  }
  function refresh() {
    if (!document.body) return;
    if (!enabled()) { document.getElementById(BOX)?.remove(); close(); activeKeys.clear(); lastDings.clear(); signature = ''; return; }
    const now = Date.now(), box = mountBox(), main = box.querySelector('.qol-rem-main'), due = dueItems(now);
    const keys = new Set(due.map(row => `${row.item.id}:${row.key}`));
    const arrived = due.filter(row => !activeKeys.has(`${row.item.id}:${row.key}`));
    if (arrived.length) {
      box.classList.add('qol-rem-open'); main.setAttribute('aria-expanded', 'true');
      primeAudio();
    }
    // Snoozing suppresses sound temporarily, but an unfinished alarm still wiggles.
    const outstanding = loaded && items.some(item => { const row = S.latest(item); return row && (!item.handledKey || item.handledKey < row.key); });
    main.classList.toggle('qol-rem-wiggle', outstanding);
    activeKeys = keys; box.classList.toggle('qol-rem-due', due.length > 0);
    const soon = !due.length && loaded && items.some(item => {
      if (!item.enabled) return false;
      let at = S.next(item, now)?.at ?? Infinity;
      const latest = S.latest(item, now);
      if (latest && (!item.handledKey || item.handledKey < latest.key) && item.snooze?.key === latest.key && item.snooze.until > now) at = Math.min(at, item.snooze.until);
      return at > now && at - now <= 3600000;
    });
    box.classList.toggle('qol-rem-soon', soon);
    const label = !loaded ? 'Reminders · click to set up' : due.length === 1 ? due[0].item.text : due.length ? `${due.length} reminders due!` : items.length ? 'No reminders due' : 'Add a reminder';
    const nextSignature = JSON.stringify([label, due.map(row => [row.item.id, row.key, row.item.text]), message, busy]);
    if (signature !== nextSignature) {
      box.querySelector('.qol-rem-label').textContent = label; main.title = label;
      box.querySelector('[data-rem-alerts]').innerHTML = due.length ? due.map(row => `<div class="qol-rem-alert" data-rem-id="${esc(row.item.id)}" data-rem-key="${row.key}"><strong>${esc(row.item.text)}</strong><small>Due ${row.key} at ${row.item.time} · local time</small><div class="qol-rem-actions">${action('Done', 'data-rem-done', busy)}<select data-rem-snooze-minutes aria-label="Snooze duration"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option></select>${action('Snooze', 'data-rem-snooze', busy)}</div></div>`).join('') : `<p class="qol-rem-empty">${esc(message || (items.length ? 'Nothing due right now. Manage your schedules below.' : 'Create your first reminder, such as “Scan Kingdoms!” at 22:00.'))}</p>`;
      signature = nextSignature; syncDisabled();
    }
    playDueSounds(); updateCountdowns(); position();
  }
  function syncDisabled() {
    for (const root of [document.getElementById(BOX), document.getElementById(PANEL)]) {
      if (!root) continue;
      for (const control of root.querySelectorAll('input, select')) control.disabled = busy;
      for (const control of root.querySelectorAll('.qol-rem-action')) {
        const disabled = busy || !loaded && !control.hasAttribute('data-rem-retry') && !control.hasAttribute('data-rem-close') && !control.hasAttribute('data-rem-manage');
        control.setAttribute('aria-disabled', String(disabled)); control.tabIndex = disabled ? -1 : 0;
      }
    }
  }
  function showMessage() {
    const status = document.querySelector(`#${PANEL} [data-rem-message]`); if (status) status.textContent = message;
  }
  function newEditor() {
    const now = new Date(); now.setMinutes(now.getMinutes() + 5);
    return { id: '', text: '', time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, startDate: S.dateKey(now), endDate: '', repeat: 'daily', days: [1, 2, 3, 4, 5], interval: 1, enabled: true, sound: true };
  }
  function editorHTML() {
    if (!editor) return '';
    return `<section class="qol-rem-editor"><strong>${editor.id ? 'Edit reminder' : 'New reminder'}</strong><label>Reminder<input data-rem-field="text" maxlength="160" value="${esc(editor.text)}" placeholder="Scan Kingdoms!"></label><div class="qol-rem-fields"><label>Time<input data-rem-field="time" type="time" value="${editor.time}"></label><label>Repeat<select data-rem-field="repeat">${[['once', 'Once'], ['daily', 'Every day'], ['weekdays', 'Selected weekdays'], ['interval', 'Every X days']].map(([value, label]) => `<option value="${value}"${editor.repeat === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label>Start date<input data-rem-field="startDate" type="date" value="${editor.startDate}"></label><label>End date · optional<input data-rem-field="endDate" type="date" value="${editor.endDate}"></label></div><div data-rem-weekdays${editor.repeat === 'weekdays' ? '' : ' hidden'}>${DAYS.map((day, index) => `<label><input type="checkbox" data-rem-day="${index}"${editor.days.includes(index) ? ' checked' : ''}>${day}</label>`).join('')}</div><label data-rem-interval${editor.repeat === 'interval' ? '' : ' hidden'}>Repeat every<input data-rem-field="interval" type="number" min="1" max="365" value="${editor.interval}">days</label><div class="qol-rem-actions">${action('Save reminder', 'data-rem-save', busy)}${action('Cancel', 'data-rem-cancel', busy)}</div></section>`;
  }
  function renderPanel() {
    const panel = document.getElementById(PANEL); if (!panel) return;
    const body = panel.querySelector('.qol-rem-panel-body'), scrollTop = body.scrollTop;
    body.innerHTML = `<p class="qol-rem-intro">Times use this device’s local time. Reminders ding every two minutes until Done; Snooze pauses the sound. The latest missed occurrence appears when you return to the game.</p><p data-rem-message role="status">${esc(message)}</p>${!loaded ? action('Retry loading', 'data-rem-retry') : `${action('New reminder', 'data-rem-new')}${editorHTML()}<div class="qol-rem-saved">${items.map(item => `<section class="qol-rem-saved-row" data-rem-id="${esc(item.id)}"><strong>${esc(item.text)}</strong><small>${esc(describe(item))}</small><small class="qol-rem-countdown" data-rem-countdown></small><div class="qol-rem-actions">${action(item.enabled ? 'Pause' : 'Resume', 'data-rem-toggle')}${action('Edit', 'data-rem-edit')}${action(deleting === item.id ? 'Confirm delete' : 'Delete', 'data-rem-delete')}${deleting === item.id ? action('Cancel', 'data-rem-delete-cancel') : ''}</div></section>`).join('') || '<p class="qol-rem-empty">No reminders yet.</p>'}</div>`}`;
    body.scrollTop = scrollTop; syncDisabled(); updateCountdowns();
  }
  function captureEditor() {
    if (!editor) return;
    const panel = document.getElementById(PANEL);
    for (const field of panel.querySelectorAll('[data-rem-field]')) editor[field.dataset.remField] = field.type === 'checkbox' ? field.checked : field.value;
    editor.days = [...panel.querySelectorAll('[data-rem-day]:checked')].map(field => Number(field.dataset.remDay));
  }
  function panelBounds(panel) {
    const box = panel.getBoundingClientRect();
    const width = box.width || parseFloat(panel.style.width) || Math.min(480, window.innerWidth - 24);
    const height = box.height || parseFloat(panel.style.height) || Math.min(530, window.innerHeight - 110);
    return { width, height, left: box.width ? box.left : parseFloat(panel.style.left) || window.innerWidth - width - 24,
      top: box.height ? box.top : parseFloat(panel.style.top) || 84 };
  }
  function fitPanel(panel, box = panelBounds(panel)) {
    const availableWidth = Math.max(1, window.innerWidth - 16), availableHeight = Math.max(1, window.innerHeight - 16);
    const width = Math.max(Math.min(320, availableWidth), Math.min(box.width, availableWidth));
    const height = Math.max(Math.min(240, availableHeight), Math.min(box.height, availableHeight));
    const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(box.top, window.innerHeight - height - 8));
    for (const [key, value] of Object.entries({ width, height, left, top })) panel.style.setProperty(key, `${value}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important'); panel.style.setProperty('bottom', 'auto', 'important');
  }
  function makeMovable(panel) {
    const head = panel.querySelector('.qol-rem-panel-head'), grip = panel.querySelector('[data-rem-resize]');
    let gesture = null;
    function begin(event, resize) {
      if (event.button !== 0 || panel.hidden || !enabled() || !resize && event.target.closest('[role="button"]')) return;
      fitPanel(panel);
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, box: panelBounds(panel), resize };
      event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault(); event.stopPropagation();
    }
    head.addEventListener('pointerdown', event => begin(event, false));
    grip.addEventListener('pointerdown', event => begin(event, true));
    window.addEventListener('pointermove', event => {
      if (!gesture || event.pointerId !== gesture.id) return;
      if (panel.hidden || !enabled()) { gesture = null; return; }
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y, box = { ...gesture.box };
      if (gesture.resize) {
        box.width = Math.min(box.width + dx, window.innerWidth - box.left - 8);
        box.height = Math.min(box.height + dy, window.innerHeight - box.top - 8);
      } else { box.left += dx; box.top += dy; }
      fitPanel(panel, box); event.preventDefault(); event.stopPropagation();
    }, true);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) window.addEventListener(type, event => {
      if (gesture?.id === event.pointerId) { gesture = null; event.stopPropagation(); }
    }, true);
    grip.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const box = panelBounds(panel), step = event.shiftKey ? 50 : 10;
      if (event.key === 'ArrowLeft') box.width -= step;
      if (event.key === 'ArrowRight') box.width += step;
      if (event.key === 'ArrowUp') box.height -= step;
      if (event.key === 'ArrowDown') box.height += step;
      box.width = Math.min(box.width, window.innerWidth - box.left - 8);
      box.height = Math.min(box.height, window.innerHeight - box.top - 8);
      fitPanel(panel, box); event.preventDefault(); event.stopPropagation();
    });
    window.addEventListener('resize', () => { if (!panel.hidden) fitPanel(panel); });
  }
  function open() {
    if (!enabled()) return;
    primeAudio(); window.APES?.ui?.closeOtherTools?.(FEATURE);
    let panel = document.getElementById(PANEL);
    if (!panel) {
      panel = document.createElement('section'); panel.id = PANEL; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Daily Reminders');
      panel.innerHTML = `<header class="qol-rem-panel-head" title="Drag to move"><strong>${BELL} Daily Reminders</strong>${action('×', 'data-rem-close aria-label="Close Daily Reminders"')}</header><div class="qol-rem-panel-body"></div><div class="qol-rem-resize" data-rem-resize role="button" tabindex="0" aria-label="Resize Daily Reminders" title="Drag to resize, or use arrow keys"></div>`;
      wire(panel); document.body.append(panel); makeMovable(panel);
    }
    panel.hidden = false; fitPanel(panel); renderPanel();
    if (!loaded) void load();
  }
  function close() { const panel = document.getElementById(PANEL); if (panel) panel.hidden = true; }
  function wire(root) {
    root.addEventListener('click', async event => {
      event.stopPropagation();
      const control = event.target.closest('[role="button"]');
      if (!control) return;
      event.preventDefault();
      if (!enabled() || busy || control.getAttribute('aria-disabled') === 'true') return;
      primeAudio(); const row = control.closest('[data-rem-id]'), id = row?.dataset.remId;
      if (control.hasAttribute('data-rem-open')) {
        if (!loaded || !items.length) { open(); return; }
        const box = document.getElementById(BOX); box.classList.toggle('qol-rem-open'); control.setAttribute('aria-expanded', String(box.classList.contains('qol-rem-open'))); return;
      }
      if (control.hasAttribute('data-rem-close')) { close(); return; }
      if (control.hasAttribute('data-rem-manage')) { open(); return; }
      if (control.hasAttribute('data-rem-retry')) { void load(); return; }
      if (!loaded) return;
      captureEditor();
      if (control.hasAttribute('data-rem-new')) { editor = newEditor(); deleting = ''; renderPanel(); document.querySelector(`#${PANEL} [data-rem-field="text"]`)?.focus({ preventScroll: true }); }
      if (control.hasAttribute('data-rem-cancel')) { editor = null; message = ''; renderPanel(); }
      if (control.hasAttribute('data-rem-edit')) { editor = { ...items.find(item => item.id === id) }; deleting = ''; renderPanel(); }
      if (control.hasAttribute('data-rem-delete-cancel')) { deleting = ''; renderPanel(); }
      if (control.hasAttribute('data-rem-delete')) {
        if (deleting !== id) { deleting = id; renderPanel(); return; }
        if (await mutate(current => current.filter(item => item.id !== id))) { if (editor?.id === id) editor = null; deleting = ''; renderPanel(); }
      }
      if (control.hasAttribute('data-rem-toggle')) {
        if (await mutate(current => current.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item))) renderPanel();
      }
      if (control.hasAttribute('data-rem-save')) {
        try {
          const value = S.validate(editor), reminderId = editor.id || window.crypto.randomUUID();
          if (await mutate(current => [...current.filter(item => item.id !== reminderId), { id: reminderId, ...value, handledKey: '', snooze: null }])) { editor = null; renderPanel(); }
        } catch (error) { message = error.message; showMessage(); }
      }
      if (control.hasAttribute('data-rem-done') || control.hasAttribute('data-rem-snooze')) {
        const key = row.dataset.remKey, snooze = control.hasAttribute('data-rem-snooze');
        const selectedMinutes = Number(row.querySelector('[data-rem-snooze-minutes]')?.value || 15);
        const minutes = [15, 30, 60].includes(selectedMinutes) ? selectedMinutes : 15;
        const result = await mutate(current => current.map(item => {
          if (item.id !== id || S.due(item)?.key !== key) return item;
          return snooze ? { ...item, snooze: { key, until: Date.now() + minutes * 60000 } } : { ...item, handledKey: key, snooze: null };
        }));
        if (result) { renderPanel(); if (!dueItems().length) { document.getElementById(BOX)?.classList.remove('qol-rem-open'); document.querySelector(`#${BOX} [data-rem-open]`)?.setAttribute('aria-expanded', 'false'); } }
      }
    });
    root.addEventListener('keydown', event => {
      const control = event.target.closest('[role="button"]');
      if (control && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); if (!event.repeat) control.click(); }
    });
    root.addEventListener('input', event => { event.stopPropagation(); captureEditor(); });
    root.addEventListener('change', event => {
      event.stopPropagation(); captureEditor();
      if (event.target.dataset.remField === 'repeat') {
        root.querySelector('[data-rem-weekdays]').hidden = editor.repeat !== 'weekdays';
        root.querySelector('[data-rem-interval]').hidden = editor.repeat !== 'interval';
      }
    });
  }
  window.APES_DAILY_REMINDERS = Object.freeze({ open, close, refresh, load });
  window.APES?.actions?.register({ id: 'reminders.open', label: 'Daily Reminders', description: 'Set up daily tasks, repeats and snoozes.', group: 'Expert Features', keywords: ['reminder', 'daily', 'schedule', 'snooze'], enabled, run: open });
  window.addEventListener('qol_setting_changed', event => { if (event.detail?.key === FEATURE) { refresh(); if (enabled() && !loaded) void load(); } });
  window.addEventListener('qol_close_others', event => { if (event.detail?.source !== FEATURE) close(); });
  window.addEventListener('qol_backup_imported', () => { captureEditor(); void load(); });
  window.addEventListener('resize', position);
  window.addEventListener('focus', refresh);
  // An ordinary game interaction also unlocks pending audio after a page reload.
  document.addEventListener('pointerdown', primeAudio, true);
  document.addEventListener('keydown', primeAudio, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  document.addEventListener('click', event => {
    const box = document.getElementById(BOX);
    if (box && !box.contains(event.target)) { box.classList.remove('qol-rem-open'); box.querySelector('[data-rem-open]').setAttribute('aria-expanded', 'false'); }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.getElementById(PANEL)?.hidden === false) { close(); event.preventDefault(); } });
  window.chrome?.storage?.onChanged?.addListener((changes, area) => {
    const key = accountKey();
    if (area === 'local' && key && Object.hasOwn(changes, key)) {
      queue = queue.then(async () => { captureEditor(); await load(); });
    }
  });
  const start = () => { refresh(); if (enabled()) void load(); window.setInterval(refresh, 1000); };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
