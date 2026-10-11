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
    try { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) { audio ||= new Audio(); void audio.resume().catch(() => {}); } } catch (_) {}
  }
  function ding() {
    if (!audio || audio.state !== 'running') return;
    try {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(660, now); gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35); oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(now); oscillator.stop(now + 0.35);
    } catch (_) {}
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
    if (!enabled()) { document.getElementById(BOX)?.remove(); close(); activeKeys.clear(); signature = ''; return; }
    const box = mountBox(), main = box.querySelector('.qol-rem-main'), due = dueItems();
    const keys = new Set(due.map(row => `${row.item.id}:${row.key}`));
    const arrived = due.filter(row => !activeKeys.has(`${row.item.id}:${row.key}`));
    if (arrived.length) {
      box.classList.add('qol-rem-open'); main.setAttribute('aria-expanded', 'true');
      main.classList.remove('qol-rem-wiggle'); void main.offsetWidth; main.classList.add('qol-rem-wiggle');
      if (arrived.some(row => row.item.sound)) ding();
    }
    activeKeys = keys; box.classList.toggle('qol-rem-due', due.length > 0);
    const label = !loaded ? 'Reminders · click to set up' : due.length === 1 ? due[0].item.text : due.length ? `${due.length} reminders due!` : items.length ? 'No reminders due' : 'Add a reminder';
    const nextSignature = JSON.stringify([label, due.map(row => [row.item.id, row.key, row.item.text]), message, busy]);
    if (signature !== nextSignature) {
      box.querySelector('.qol-rem-label').textContent = label; main.title = label;
      box.querySelector('[data-rem-alerts]').innerHTML = due.length ? due.map(row => `<div class="qol-rem-alert" data-rem-id="${esc(row.item.id)}" data-rem-key="${row.key}"><strong>${esc(row.item.text)}</strong><small>Due ${row.key} at ${row.item.time} · local time</small><div class="qol-rem-actions">${action('Done', 'data-rem-done', busy)}<select data-rem-snooze-minutes aria-label="Snooze duration"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option></select>${action('Snooze', 'data-rem-snooze', busy)}</div></div>`).join('') : `<p class="qol-rem-empty">${esc(message || (items.length ? 'Nothing due right now. Manage your schedules below.' : 'Create your first reminder, such as “Scan Kingdoms!” at 22:00.'))}</p>`;
      signature = nextSignature; syncDisabled();
    }
    position();
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
    return { id: '', text: '', time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, startDate: S.dateKey(now), endDate: '', repeat: 'daily', days: [1, 2, 3, 4, 5], interval: 1, enabled: true, sound: false };
  }
  function editorHTML() {
    if (!editor) return '';
    return `<section class="qol-rem-editor"><strong>${editor.id ? 'Edit reminder' : 'New reminder'}</strong><label>Reminder<input data-rem-field="text" maxlength="160" value="${esc(editor.text)}" placeholder="Scan Kingdoms!"></label><div class="qol-rem-fields"><label>Time<input data-rem-field="time" type="time" value="${editor.time}"></label><label>Repeat<select data-rem-field="repeat">${[['once', 'Once'], ['daily', 'Every day'], ['weekdays', 'Selected weekdays'], ['interval', 'Every X days']].map(([value, label]) => `<option value="${value}"${editor.repeat === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label>Start date<input data-rem-field="startDate" type="date" value="${editor.startDate}"></label><label>End date · optional<input data-rem-field="endDate" type="date" value="${editor.endDate}"></label></div><div data-rem-weekdays${editor.repeat === 'weekdays' ? '' : ' hidden'}>${DAYS.map((day, index) => `<label><input type="checkbox" data-rem-day="${index}"${editor.days.includes(index) ? ' checked' : ''}>${day}</label>`).join('')}</div><label data-rem-interval${editor.repeat === 'interval' ? '' : ' hidden'}>Repeat every<input data-rem-field="interval" type="number" min="1" max="365" value="${editor.interval}">days</label><label class="qol-rem-check"><input data-rem-field="sound" type="checkbox"${editor.sound ? ' checked' : ''}>Play a short sound when due</label><div class="qol-rem-actions">${action('Save reminder', 'data-rem-save', busy)}${action('Cancel', 'data-rem-cancel', busy)}</div></section>`;
  }
  function renderPanel() {
    const panel = document.getElementById(PANEL); if (!panel) return;
    const body = panel.querySelector('.qol-rem-panel-body'), scrollTop = body.scrollTop;
    body.innerHTML = `<p class="qol-rem-intro">Times use this device’s local time. Reminders appear while the game is open; the latest missed occurrence is shown when you return.</p><p data-rem-message role="status">${esc(message)}</p>${!loaded ? action('Retry loading', 'data-rem-retry') : `${action('New reminder', 'data-rem-new')}${editorHTML()}<div class="qol-rem-saved">${items.map(item => `<section class="qol-rem-saved-row" data-rem-id="${esc(item.id)}"><strong>${esc(item.text)}</strong><small>${esc(describe(item))}${!item.enabled ? ' · Paused' : ''}${item.snooze?.until > Date.now() ? ` · Snoozed until ${esc(new Date(item.snooze.until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}` : ''}</small><div class="qol-rem-actions">${action(item.enabled ? 'Pause' : 'Resume', 'data-rem-toggle')}${action('Edit', 'data-rem-edit')}${action(deleting === item.id ? 'Confirm delete' : 'Delete', 'data-rem-delete')}${deleting === item.id ? action('Cancel', 'data-rem-delete-cancel') : ''}</div></section>`).join('') || '<p class="qol-rem-empty">No reminders yet.</p>'}</div>`}`;
    body.scrollTop = scrollTop; syncDisabled();
  }
  function captureEditor() {
    if (!editor) return;
    const panel = document.getElementById(PANEL);
    for (const field of panel.querySelectorAll('[data-rem-field]')) editor[field.dataset.remField] = field.type === 'checkbox' ? field.checked : field.value;
    editor.days = [...panel.querySelectorAll('[data-rem-day]:checked')].map(field => Number(field.dataset.remDay));
  }
  function open() {
    if (!enabled()) return;
    primeAudio(); window.APES?.ui?.closeOtherTools?.(FEATURE);
    let panel = document.getElementById(PANEL);
    if (!panel) {
      panel = document.createElement('section'); panel.id = PANEL; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Daily Reminders');
      panel.innerHTML = `<header class="qol-rem-panel-head"><strong>${BELL} Daily Reminders</strong>${action('×', 'data-rem-close aria-label="Close Daily Reminders"')}</header><div class="qol-rem-panel-body"></div>`;
      wire(panel); document.body.append(panel);
    }
    panel.hidden = false; renderPanel();
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
