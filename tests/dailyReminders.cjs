process.env.TZ = 'Europe/Lisbon';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const scheduleSource = fs.readFileSync(path.join(root, 'js/modules/dailyReminders/schedule.js'), 'utf8');
const featureSource = fs.readFileSync(path.join(root, 'js/features/dailyReminders.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/features/dailyReminders.css'), 'utf8');
let checks = 0;
const plain = value => JSON.parse(JSON.stringify(value));
const eq = (actual, expected) => { assert.deepEqual(plain(actual), expected); checks++; };
const ok = value => { assert.ok(value); checks++; };
const pause = () => new Promise(resolve => setTimeout(resolve, 10));
const stamp = (date, time = '22:00') => new Date(`${date}T${time}:00`).getTime();
const base = { id: 'daily', text: 'Scan Kingdoms!', time: '22:00', startDate: '2026-10-11', endDate: '', repeat: 'daily', days: [0], interval: 1, enabled: true, sound: false, handledKey: '', snooze: null };
const pure = new JSDOM('', { runScripts: 'outside-only' }); pure.window.eval(scheduleSource);
const S = pure.window.APES_REMINDER_SCHEDULE;
const key = (item, date, time) => S.due(item, stamp(date, time))?.key || null;
eq(key(base, '2026-10-11', '21:59'), null); eq(key(base, '2026-10-11', '22:00'), '2026-10-11');
eq(key(base, '2026-10-12', '00:01'), '2026-10-11');
eq(key(base, '2026-10-18', '23:00'), '2026-10-18'); // Only latest missed day.
eq(key({ ...base, handledKey: '2026-10-11' }, '2026-10-12', '21:59'), null);
eq(key({ ...base, handledKey: '2026-10-11' }, '2026-10-12', '22:00'), '2026-10-12');
eq(key({ ...base, handledKey: '2026-10-18' }, '2026-10-12', '22:00'), null); // Clock rollback.
eq(key({ ...base, enabled: false }, '2026-10-18', '22:00'), null);
eq(key({ ...base, repeat: 'once' }, '2026-10-18', '22:00'), '2026-10-11');
eq(key({ ...base, repeat: 'once', handledKey: '2026-10-11' }, '2026-11-18', '22:00'), null);
eq(key({ ...base, endDate: '2026-10-13' }, '2026-10-18', '22:00'), '2026-10-13');
eq(key({ ...base, endDate: '2026-10-13', handledKey: '2026-10-13' }, '2026-10-18', '22:00'), null);
eq(key({ ...base, repeat: 'interval', interval: 3 }, '2026-10-13', '23:00'), '2026-10-11');
eq(key({ ...base, repeat: 'interval', interval: 3 }, '2026-10-14', '21:59'), '2026-10-11');
eq(key({ ...base, repeat: 'interval', interval: 3 }, '2026-10-14', '22:00'), '2026-10-14');
eq(key({ ...base, repeat: 'weekdays', days: [1, 3, 5] }, '2026-10-11', '23:00'), null);
eq(key({ ...base, repeat: 'weekdays', days: [1, 3, 5] }, '2026-10-12', '22:00'), '2026-10-12');
eq(key({ ...base, repeat: 'weekdays', days: [1, 3, 5] }, '2026-10-18', '23:00'), '2026-10-16');
const snoozed = { ...base, snooze: { key: '2026-10-11', until: stamp('2026-10-12', '00:30') } };
eq(key(snoozed, '2026-10-12', '00:29'), null); eq(key(snoozed, '2026-10-12', '00:30'), '2026-10-11');
eq(key({ ...base, snooze: { key: '2026-10-11', until: stamp('2026-10-20') } }, '2026-10-12', '22:00'), '2026-10-12');
// Local calendar scheduling across daylight saving, month/year and leap days.
const spring = { ...base, startDate: '2026-03-28', time: '01:30' };
eq(key(spring, '2026-03-29', '00:59'), '2026-03-28');
eq(key(spring, '2026-03-29', '02:29'), '2026-03-28');
eq(key(spring, '2026-03-29', '02:30'), '2026-03-29');
const autumn = { ...base, startDate: '2026-10-24', time: '01:30' };
eq(S.due(autumn, new Date('2026-10-25T01:45:00Z').getTime()).key, '2026-10-25');
eq(S.due({ ...autumn, handledKey: '2026-10-25' }, new Date('2026-10-25T01:45:00Z').getTime()), null);
eq(key({ ...base, startDate: '2026-12-31', repeat: 'interval', interval: 2 }, '2027-01-02', '22:00'), '2027-01-02');
eq(key({ ...base, startDate: '2028-02-28', repeat: 'interval', interval: 2 }, '2028-03-01', '22:00'), '2028-03-01');
for (const patch of [{ text: '' }, { text: 'x'.repeat(161) }, { time: '25:00' }, { time: '1:00' }, { startDate: '2026-02-30' }, { endDate: '2026-10-10' }, { repeat: 'bad' }, { repeat: 'weekdays', days: [] }, { repeat: 'weekdays', days: [9] }, { repeat: 'interval', interval: 0 }, { repeat: 'interval', interval: 1.5 }, { repeat: 'interval', interval: 366 }]) {
  assert.throws(() => S.validate({ ...base, ...patch })); checks++; eq(S.normalize({ ...base, ...patch }), null);
}
eq(S.normalize(null), null); eq(S.normalize({ ...base, id: '' }), null);
eq(S.validate({ ...base, text: '  Scan Kingdoms!  ', days: [1, 1] }).text, 'Scan Kingdoms!');
eq(S.validate({ ...base, days: [1, 1] }).days, [1]);
// Upcoming occurrences use local calendar dates and skip completed occurrences.
const nextKey = (item, date, time) => S.next(item, stamp(date, time))?.key || null;
eq(nextKey(base, '2026-10-10', '23:00'), '2026-10-11');
eq(nextKey(base, '2026-10-11', '21:59'), '2026-10-11');
eq(nextKey(base, '2026-10-11', '22:00'), '2026-10-12');
eq(nextKey({ ...base, handledKey: '2026-10-18' }, '2026-10-12', '22:00'), '2026-10-19');
eq(nextKey({ ...base, enabled: false }, '2026-10-11', '21:59'), null);
eq(nextKey({ ...base, repeat: 'once' }, '2026-10-11', '21:59'), '2026-10-11');
eq(nextKey({ ...base, repeat: 'once' }, '2026-10-11', '22:00'), null);
eq(nextKey({ ...base, repeat: 'once', handledKey: base.startDate }, '2026-10-10', '22:00'), null);
eq(nextKey({ ...base, endDate: '2026-10-13' }, '2026-10-13', '22:00'), null);
eq(nextKey({ ...base, repeat: 'interval', interval: 3 }, '2026-10-12', '23:00'), '2026-10-14');
eq(nextKey({ ...base, repeat: 'interval', interval: 3 }, '2026-10-14', '22:00'), '2026-10-17');
eq(nextKey({ ...base, repeat: 'weekdays', days: [1, 3, 5] }, '2026-10-16', '22:00'), '2026-10-19');
eq(nextKey({ ...base, repeat: 'weekdays', days: [1, 3, 5] }, '2026-10-11', '23:00'), '2026-10-12');
eq(S.next(spring, stamp('2026-03-28', '22:00')).at, stamp('2026-03-29', '02:30'));
eq(S.next(autumn, stamp('2026-10-24', '22:00')).at, new Date('2026-10-25T00:30:00Z').getTime());
eq(nextKey({ ...base, startDate: '2026-12-31', repeat: 'interval', interval: 2 }, '2026-12-31', '22:00'), '2027-01-02');
eq(nextKey({ ...base, startDate: '2028-02-28', repeat: 'interval', interval: 2 }, '2028-02-28', '22:00'), '2028-03-01');
eq(S.normalize({ ...base, sound: false }).sound, true); pure.window.close();

function setup({ store = new Map(), server = 'trickandtreat.kingdoms.com', player = '42', initial = null, time = stamp('2026-10-11', '21:50'), failRead = false, finish = true, withAudio = false, blockedAudio = false } = {}) {
  const dom = new JSDOM('<!doctype html><head></head><body><div id="heroQuickInfo"><div class="heroStats"></div></div><div id="qol-building-alarm-status"></div></body>', { url: `https://${server}/`, runScripts: 'outside-only' });
  const w = dom.window, doc = w.document;
  const style = doc.createElement('style'); style.textContent = 'select {display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;clip-path:inset(100%)!important;transform:scale(0)!important;width:0!important;height:0!important;} select option{display:none!important;color:transparent!important;}' + css; doc.head.append(style);
  let now = time, enabled = true, failWrite = false, readFailure = failRead, writes = 0, nativeButtons = 0, blockWrite = null;
  const RealDate = w.Date;
  w.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  const ticks = []; w.setInterval = callback => { ticks.push(callback); return ticks.length; };
  let dings = 0, contexts = 0, context;
  if (withAudio) w.AudioContext = class {
    constructor() { contexts++; context = this; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    resume() { if (blockedAudio) return Promise.reject(Error('User activation required')); this.state = 'running'; return Promise.resolve(); }
    createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, start() { dings++; }, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  };
  const listeners = [], actions = new Map();
  const storageKey = `apes:v2:${server}:${player}:dailyReminders:reminders`;
  if (initial) store.set(storageKey, plain(initial));
  w.chrome = { storage: { onChanged: { addListener: fn => listeners.push(fn) } } };
  w.APES = { context: { getPlayerId: () => player }, actions: { register: item => actions.set(item.id, item) }, ui: { closeOtherTools() {} }, storage: {
    key: options => { eq(options.scope, 'player'); return storageKey; },
    get: async (options, fallback) => { eq(options, { feature: 'dailyReminders', key: 'reminders', scope: 'player' }); if (readFailure) throw Error('Identity unresolved'); return plain(store.get(storageKey) || fallback); },
    set: async (options, value) => { eq(options.scope, 'player'); if (blockWrite) await blockWrite; if (failWrite) throw Error('Storage quota exceeded'); writes++; store.set(storageKey, plain(value)); listeners.forEach(fn => fn({ [storageKey]: { newValue: plain(value) } }, 'local')); }
  } };
  w.isQolEnabled = name => { eq(name, 'dailyReminders'); return enabled; };
  const createElement = doc.createElement.bind(doc); doc.createElement = (...args) => { if (String(args[0]).toLowerCase() === 'button') nativeButtons++; return createElement(...args); };
  const hero = doc.querySelector('.heroStats'); hero.getBoundingClientRect = () => ({ left: 920, top: 20, width: 80, height: 40 });
  const finishBox = doc.querySelector('#qol-building-alarm-status'); finishBox.getBoundingClientRect = () => ({ left: 736, top: 20, width: 176, height: 28 });
  if (!finish) finishBox.remove();
  w.eval(scheduleSource); w.eval(featureSource);
  const click = async selector => { const node = doc.querySelector(selector); ok(node); node.click(); await pause(); return node; };
  const field = (name, value) => { const node = doc.querySelector(`[data-rem-field="${name}"]`); ok(node); if (node.type === 'checkbox') node.checked = value; else node.value = value; node.dispatchEvent(new w.Event('input', { bubbles: true })); node.dispatchEvent(new w.Event('change', { bubbles: true })); };
  return { dom, w, doc, store, storageKey, actions, click, field, api: w.APES_DAILY_REMINDERS, listeners,
    get records() { return store.get(storageKey)?.items || []; }, get writes() { return writes; }, get nativeButtons() { return nativeButtons; },
    get dings() { return dings; }, get contexts() { return contexts; }, setBlockedAudio(value) { blockedAudio = value; if (context) context.state = 'suspended'; },
    tick: value => { if (value !== undefined) now = value; ticks.forEach(fn => fn()); },
    setFailWrite: value => { failWrite = value; }, setFailRead: value => { readFailure = value; }, block: value => { blockWrite = value; },
    toggle: value => { enabled = value; w.dispatchEvent(new w.CustomEvent('qol_setting_changed', { detail: { key: 'dailyReminders' } })); } };
}

(async () => {
  const e = setup(); await pause();
  let gameClicks = 0; e.doc.body.addEventListener('click', () => gameClicks++);
  const box = () => e.doc.querySelector('#qol-daily-reminders-status');
  const panel = () => e.doc.querySelector('#qol-daily-reminders-panel');
  eq(box().style.left, '552px'); eq(box().style.top, '20px');
  eq(e.w.getComputedStyle(box()).width, '176px'); eq(e.w.getComputedStyle(box()).height, '28px');
  eq(box().querySelector('.qol-rem-label').textContent, 'Add a reminder');
  eq(e.actions.get('reminders.open').group, 'Expert Features');
  await e.click('[data-rem-open]'); ok(panel());
  await e.click('[data-rem-new]');
  const literal = '<img src=x onerror=alert(1)> Scan Kingdoms!';
  e.field('text', literal); e.field('time', '22:00'); e.field('startDate', '2026-10-11');
  const menu = e.doc.querySelector('[data-rem-field="repeat"]'), menuStyle = e.w.getComputedStyle(menu);
  eq(menuStyle.display, 'block'); eq(menuStyle.visibility, 'visible'); eq(menuStyle.opacity, '1'); eq(menuStyle.pointerEvents, 'auto'); eq(menuStyle.transform, 'none'); eq(menuStyle.clipPath, 'none');
  eq(e.w.getComputedStyle(menu.options[0]).display, 'block');
  await e.click('[data-rem-save]'); eq(e.records.length, 1); eq(e.records[0].text, literal);
  eq(e.doc.querySelectorAll('img').length, 0); eq(box().classList.contains('qol-rem-due'), false);
  e.tick(stamp('2026-10-11', '21:59')); eq(box().classList.contains('qol-rem-due'), false);
  e.tick(stamp('2026-10-11', '22:00')); eq(box().classList.contains('qol-rem-due'), true);
  eq(box().classList.contains('qol-rem-open'), true); ok(box().querySelector('.qol-rem-main').classList.contains('qol-rem-wiggle'));
  eq(box().querySelector('.qol-rem-label').textContent, literal); eq(e.doc.querySelectorAll('img').length, 0);
  const done = box().querySelector('[data-rem-done]');
  for (let i = 0; i < 4; i++) e.tick(); ok(done.isConnected); // No rerender or animation restart each second.
  const keyEvent = new e.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }); done.dispatchEvent(keyEvent); await pause();
  eq(e.records[0].handledKey, '2026-10-11'); eq(box().classList.contains('qol-rem-due'), false); eq(keyEvent.defaultPrevented, true);
  e.tick(stamp('2026-10-12', '21:59')); eq(box().classList.contains('qol-rem-due'), false);
  e.tick(stamp('2026-10-12', '22:00')); eq(box().classList.contains('qol-rem-due'), true);
  const snoozeSelect = box().querySelector('[data-rem-snooze-minutes]'); snoozeSelect.value = '30';
  await e.click('[data-rem-snooze]'); eq(e.records[0].snooze, { key: '2026-10-12', until: stamp('2026-10-12', '22:30') });
  eq(box().classList.contains('qol-rem-due'), false);
  const reopened = setup({ store: e.store, time: stamp('2026-10-12', '22:20') }); await pause();
  eq(reopened.doc.querySelector('.qol-rem-label').textContent, 'No reminders due');
  reopened.tick(stamp('2026-10-12', '22:30')); eq(reopened.doc.querySelector('.qol-rem-label').textContent, literal);
  reopened.dom.window.close();
  e.tick(stamp('2026-10-12', '22:29')); eq(box().classList.contains('qol-rem-due'), false);
  e.tick(stamp('2026-10-12', '22:30')); eq(box().classList.contains('qol-rem-due'), true);
  await e.click('[data-rem-done]');
  await e.click('[data-rem-new]'); e.field('text', 'One-off task'); e.field('repeat', 'once'); e.field('time', '20:00'); e.field('startDate', '2026-10-12');
  await e.click('[data-rem-save]'); eq(e.records.length, 2); eq(box().querySelector('.qol-rem-label').textContent, 'One-off task');
  await e.click('[data-rem-done]'); e.tick(stamp('2026-10-14', '23:00')); eq(box().querySelectorAll('.qol-rem-alert').length, 1);
  // Validation and failed persistence retain drafts and do not claim success.
  await e.click('[data-rem-new]'); e.field('text', 'Weekday task'); e.field('repeat', 'weekdays');
  for (const checkbox of e.doc.querySelectorAll('[data-rem-day]')) { checkbox.checked = false; checkbox.dispatchEvent(new e.w.Event('change', { bubbles: true })); }
  await e.click('[data-rem-save]'); eq(e.records.length, 2); ok(panel().querySelector('[data-rem-message]').textContent.includes('weekday'));
  e.field('repeat', 'interval'); e.field('interval', '0'); await e.click('[data-rem-save]'); ok(panel().querySelector('[data-rem-message]').textContent.includes('interval'));
  e.field('interval', '3'); e.field('startDate', '2026-10-14'); e.field('time', '23:00');
  e.setFailWrite(true); await e.click('[data-rem-save]'); eq(e.records.length, 2); eq(e.doc.querySelector('[data-rem-field="text"]').value, 'Weekday task'); ok(panel().querySelector('[data-rem-message]').textContent.includes('quota'));
  e.setFailWrite(false); await e.click('[data-rem-save]'); eq(e.records.length, 3);
  eq(e.records[2].repeat, 'interval'); eq(e.records[2].interval, 3); eq(box().querySelectorAll('.qol-rem-alert').length, 2);
  // Pause/resume, editing, confirmation and cancellation are APES controls.
  const thirdId = e.records[2].id;
  const selectRow = action => `[data-rem-id="${thirdId}"] [data-rem-${action}]`;
  await e.click(selectRow('toggle')); eq(e.records.find(item => item.id === thirdId).enabled, false); eq(box().querySelectorAll('.qol-rem-alert').length, 1);
  await e.click(selectRow('toggle')); eq(e.records.find(item => item.id === thirdId).enabled, true);
  await e.click(selectRow('edit')); e.field('text', 'Changed task');
  await e.click('[data-rem-save]'); eq(e.records.find(item => item.id === thirdId).text, 'Changed task'); eq(e.records.length, 3);
  await e.click(selectRow('delete')); eq(e.records.length, 3); await e.click(selectRow('delete-cancel')); eq(e.records.length, 3);
  await e.click(selectRow('delete')); await e.click(selectRow('delete')); eq(e.records.length, 2);
  // Pending writes disable controls and avoid duplicate submissions.
  await e.click('[data-rem-new]'); e.field('text', 'Deferred save'); e.field('startDate', '2026-10-14');
  let release; e.block(new Promise(resolve => { release = resolve; }));
  await e.click('[data-rem-save]'); eq(e.doc.querySelector('[data-rem-save]').getAttribute('aria-disabled'), 'true');
  await e.click('[data-rem-save]'); eq(e.records.length, 2); release(); e.block(null); await pause(); eq(e.records.length, 3);
  // Storage change from another tab updates reminders without losing a draft.
  await e.click('[data-rem-new]'); e.field('text', 'Unsaved draft');
  const external = { version: 1, items: [...e.records, { ...base, id: 'external', text: 'Other tab', startDate: '2026-10-14' }] };
  e.store.set(e.storageKey, external); e.listeners.forEach(fn => fn({ [e.storageKey]: { newValue: external } }, 'local')); await pause();
  eq(e.doc.querySelector('[data-rem-field="text"]').value, 'Unsaved draft'); eq(panel().querySelectorAll('.qol-rem-saved-row').length, 4);
  await e.click('[data-rem-cancel]');
  const persisted = plain(e.records); e.toggle(false); eq(box(), null); eq(panel().hidden, true); eq(e.records, persisted);
  e.toggle(true); ok(box()); eq(e.records, persisted);
  await e.click('[data-rem-manage]'); await e.click('[data-rem-close]'); eq(panel().hidden, true);
  e.api.open(); e.doc.dispatchEvent(new e.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); eq(panel().hidden, true);
  eq(e.doc.querySelectorAll('#qol-daily-reminders-status button, #qol-daily-reminders-panel button, #qol-daily-reminders-status .button, #qol-daily-reminders-panel .button').length, 0);
  eq(e.nativeButtons, 0); eq(gameClicks, 0);
  // Position fallback and small viewports keep both boxes apart.
  e.doc.querySelector('#qol-building-alarm-status').getBoundingClientRect = () => ({ left: 120, top: 20, width: 176, height: 28 });
  e.w.innerWidth = 340; e.tick(); eq(box().style.left, '120px'); eq(box().style.top, '54px');
  const solo = setup({ finish: false }); await pause(); eq(solo.doc.querySelector('#qol-daily-reminders-status').style.left, '736px'); solo.dom.window.close();
  const otherPlayer = setup({ store: e.store, player: '43' }); const otherServer = setup({ store: e.store, server: 'com1.kingdoms.com' }); await pause();
  eq(otherPlayer.records, []); eq(otherServer.records, []); otherPlayer.dom.window.close(); otherServer.dom.window.close();
  const failed = setup({ failRead: true }); await pause(); failed.api.open(); await pause();
  ok(failed.doc.querySelector('[data-rem-message]').textContent.includes('Identity unresolved'));
  eq(failed.writes, 0); failed.setFailRead(false); await failed.click('[data-rem-retry]'); ok(failed.doc.querySelector('[data-rem-new]')); failed.dom.window.close();
  e.dom.window.close();
  // Live countdowns update only their text, preserving the editor and scroll position.
  const c = setup({ initial: { version: 1, items: [base] } }); await pause(); c.api.open();
  const countdownNode = () => c.doc.querySelector('[data-rem-countdown]');
  eq(countdownNode().textContent, 'Will go off in 00:10:00');
  await c.click('[data-rem-new]'); c.field('text', 'Keep this draft');
  const input = c.doc.querySelector('[data-rem-field="text"]'); input.focus(); input.setSelectionRange(3, 7);
  const countdownBefore = countdownNode(), body = c.doc.querySelector('.qol-rem-panel-body'); body.scrollTop = 90;
  c.tick(stamp('2026-10-11', '21:50') + 1000);
  eq(countdownNode().textContent, 'Will go off in 00:09:59'); eq(countdownNode() === countdownBefore, true);
  eq(input.isConnected, true); eq(c.doc.activeElement === input, true); eq(input.value, 'Keep this draft'); eq(input.selectionStart, 3); eq(body.scrollTop, 90);
  c.tick(stamp('2026-10-11', '22:00')); eq(countdownNode().textContent, 'Due now · Next scheduled in 24:00:00');
  await c.click('[data-rem-done]'); eq(countdownNode().textContent, 'Will go off in 24:00:00');
  c.tick(stamp('2026-10-12', '22:00')); await c.click('[data-rem-snooze]'); eq(countdownNode().textContent, 'Snoozed · Will go off in 00:15:00');
  c.tick(stamp('2026-10-12', '22:15')); eq(countdownNode().textContent, 'Due now · Next scheduled in 23:45:00');
  await c.click('.qol-rem-saved-row [data-rem-toggle]'); eq(countdownNode().textContent, 'Paused'); c.dom.window.close();

  // Initial sounds and two-minute repeats include old sound:false reminders and one-offs.
  const a = setup({ withAudio: true, initial: { version: 1, items: [base, { ...base, id: 'second', repeat: 'once' }] } }); await pause();
  eq(a.dings, 0); a.api.open(); await pause(); eq(a.contexts, 1);
  const dueAt = stamp('2026-10-11', '22:00');
  const wiggles = () => a.doc.querySelector('.qol-rem-main').classList.contains('qol-rem-wiggle');
  a.tick(dueAt); await pause(); eq(a.dings, 1); eq(wiggles(), true); // Simultaneous alarms do not overlap.
  await a.click('[data-rem-open]'); eq(wiggles(), true); // Closing the popover does not acknowledge alarms.
  a.tick(dueAt + 119000); eq(a.dings, 1); eq(wiggles(), true);
  a.tick(dueAt + 120000); eq(a.dings, 2);
  a.tick(dueAt + 239000); eq(a.dings, 2); a.tick(dueAt + 240000); eq(a.dings, 3);
  await a.click('[data-rem-id="daily"] [data-rem-done]'); eq(wiggles(), true);
  a.tick(dueAt + 360000); eq(a.dings, 4);
  await a.click('[data-rem-id="second"] [data-rem-done]'); eq(wiggles(), false);
  a.tick(dueAt + 600000); eq(a.dings, 4); a.api.close(); a.api.open(); await pause(); eq(a.dings, 4); eq(a.contexts, 1);
  a.tick(stamp('2026-10-12', '22:00')); await pause(); eq(a.dings, 5); eq(wiggles(), true);
  await a.click('[data-rem-snooze]'); eq(wiggles(), true);
  a.tick(stamp('2026-10-12', '22:02')); eq(a.dings, 5);
  a.tick(stamp('2026-10-12', '22:15')); await pause(); eq(a.dings, 6); eq(wiggles(), true);
  a.tick(stamp('2026-10-12', '22:17')); eq(a.dings, 7);
  a.toggle(false); a.tick(stamp('2026-10-12', '22:19')); eq(a.dings, 7);
  a.toggle(true); await pause(); eq(a.dings, 8);
  a.api.open(); await a.click('.qol-rem-saved-row [data-rem-toggle]'); a.tick(stamp('2026-10-12', '22:21')); eq(a.dings, 8); eq(wiggles(), false);
  a.dom.window.close();

  // Blocked audio does not count as a ding; the next ordinary game interaction retries it.
  const b = setup({ withAudio: true, blockedAudio: true, time: dueAt, initial: { version: 1, items: [base] } }); await pause();
  eq(b.dings, 0); b.tick(dueAt + 120000); eq(b.dings, 0);
  b.setBlockedAudio(false); b.doc.body.dispatchEvent(new b.w.Event('pointerdown', { bubbles: true })); await pause(); eq(b.dings, 1);
  b.tick(dueAt + 239000); eq(b.dings, 1); b.tick(dueAt + 240000); eq(b.dings, 2);
  // A resumed suspended tab plays once, rather than replaying every missed interval.
  b.tick(dueAt + 3600000); eq(b.dings, 3); b.tick(dueAt + 3600000); eq(b.dings, 3);
  await b.click('[data-rem-done]'); b.tick(dueAt + 3720000); eq(b.dings, 3); b.dom.window.close();

  // Pointer-driven dragging and the visible resize grip work independently of native CSS resize.
  const m = setup(); await pause(); m.api.open();
  const manager = m.doc.querySelector('#qol-daily-reminders-panel'), head = manager.querySelector('.qol-rem-panel-head'), grip = manager.querySelector('[data-rem-resize]');
  manager.getBoundingClientRect = () => Object.fromEntries(['left', 'top', 'width', 'height'].map(key => [key, parseFloat(manager.style[key])]));
  const pointer = (node, type, x, y, id = 1, button = 0) => {
    const event = new m.w.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y }, pointerId: { value: id }, button: { value: button } }); node.dispatchEvent(event); return event;
  };
  eq(manager.style.width, '480px'); eq(manager.style.height, '530px'); eq(manager.style.left, '520px'); eq(manager.style.top, '84px');
  eq(m.w.getComputedStyle(head).cursor, 'move'); eq(m.w.getComputedStyle(grip).cursor, 'nwse-resize');
  pointer(head, 'pointerdown', 540, 90); pointer(m.w, 'pointermove', 240, 120); pointer(m.w, 'pointerup', 240, 120);
  eq(manager.style.left, '220px'); eq(manager.style.top, '114px'); eq(manager.style.getPropertyPriority('left'), 'important');
  pointer(grip, 'pointerdown', 700, 644); pointer(m.w, 'pointermove', 820, 674); pointer(m.w, 'pointerup', 820, 674);
  eq(manager.style.width, '600px'); eq(manager.style.height, '560px'); eq(manager.style.left, '220px'); eq(manager.style.top, '114px');
  pointer(head, 'pointerdown', 250, 125); pointer(m.w, 'pointermove', -1000, -1000, 2); eq(manager.style.left, '220px');
  pointer(m.w, 'pointermove', -1000, -1000); pointer(m.w, 'pointercancel', -1000, -1000); eq(manager.style.left, '8px'); eq(manager.style.top, '8px');
  pointer(m.w, 'pointermove', 1000, 1000); eq(manager.style.left, '8px');
  pointer(grip, 'pointerdown', 600, 560); pointer(m.w, 'pointermove', -1000, -1000); pointer(m.w, 'pointerup', -1000, -1000);
  eq(manager.style.width, '320px'); eq(manager.style.height, '240px');
  grip.dispatchEvent(new m.w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })); eq(manager.style.width, '330px');
  grip.dispatchEvent(new m.w.KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true })); eq(manager.style.height, '290px');
  m.api.close(); m.api.open(); eq(manager.style.left, '8px'); eq(manager.style.width, '330px'); eq(manager.style.height, '290px');
  pointer(manager.querySelector('[data-rem-close]'), 'pointerdown', 300, 20); pointer(m.w, 'pointermove', 700, 700); pointer(m.w, 'pointerup', 700, 700); eq(manager.style.left, '8px');
  pointer(head, 'pointerdown', 10, 10, 1, 2); pointer(m.w, 'pointermove', 700, 700); eq(manager.style.left, '8px');
  pointer(grip, 'pointerdown', 330, 290); pointer(m.w, 'pointermove', 5000, 5000); pointer(m.w, 'pointerup', 5000, 5000);
  eq(manager.style.width, '1008px'); eq(manager.style.height, '752px');
  m.w.innerWidth = 300; m.w.innerHeight = 220; m.w.dispatchEvent(new m.w.Event('resize'));
  eq(manager.style.width, '284px'); eq(manager.style.height, '204px'); eq(manager.style.left, '8px'); eq(manager.style.top, '8px');
  eq(m.nativeButtons, 0); eq(m.doc.querySelector('[data-rem-field="sound"]'), null); m.dom.window.close();
  // Green active alarms override yellow upcoming alarms, including the exact one-hour boundary.
  const colors = setup({ time: stamp('2026-10-11', '21:00') - 1000, initial: { version: 1, items: [base, { ...base, id: 'later', time: '22:30', repeat: 'once' }, { ...base, id: 'paused', time: '21:10', enabled: false }] } }); await pause();
  const colorBox = () => colors.doc.querySelector('#qol-daily-reminders-status');
  const colorState = () => [colorBox().classList.contains('qol-rem-due'), colorBox().classList.contains('qol-rem-soon')];
  const mainColor = () => colors.w.getComputedStyle(colorBox().querySelector('.qol-rem-main'));
  eq(colorState(), [false, false]);
  eq(colors.w.getComputedStyle(colorBox().querySelector('.qol-rem-label')).textAlign, 'center');
  eq(colors.w.getComputedStyle(colorBox().querySelector('.qol-rem-label')).paddingLeft, '18px');
  eq(colors.w.getComputedStyle(colorBox().querySelector('.qol-rem-label')).paddingRight, '18px');
  eq(colors.w.getComputedStyle(colorBox().querySelector('.qol-rem-main > svg')).position, 'absolute');
  colors.tick(stamp('2026-10-11', '21:00')); eq(colorState(), [false, true]); eq(mainColor().color, 'rgb(73, 53, 11)'); ok(mainColor().backgroundImage.includes('rgb(255, 228, 154)'));
  colors.tick(dueAt - 1000); eq(colorState(), [false, true]);
  colors.tick(dueAt); eq(colorState(), [true, false]); eq(mainColor().color, 'rgb(255, 250, 240)'); ok(mainColor().backgroundImage.includes('rgb(67, 143, 72)'));
  await colors.click('[data-rem-id="daily"] [data-rem-done]'); eq(colorState(), [false, true]);
  colors.tick(stamp('2026-10-11', '22:30')); eq(colorState(), [true, false]);
  await colors.click('[data-rem-id="later"] [data-rem-done]'); eq(colorState(), [false, false]);
  colors.tick(stamp('2026-10-12', '22:00')); eq(colorState(), [true, false]);
  await colors.click('[data-rem-snooze]'); eq(colorState(), [false, true]);
  colors.tick(stamp('2026-10-12', '22:15')); eq(colorState(), [true, false]);
  colors.api.open(); await colors.click('.qol-rem-saved-row[data-rem-id="daily"] [data-rem-toggle]'); eq(colorState(), [false, false]);
  colors.dom.window.close();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))), content = manifest.content_scripts.find(entry => entry.js.includes('js/features/dailyReminders.js'));
  ok(content); ok(content.js.indexOf('js/modules/dailyReminders/schedule.js') < content.js.indexOf('js/features/dailyReminders.js'));
  ok(content.css.includes('css/features/dailyReminders.css')); eq(manifest.permissions, ['storage', 'unlimitedStorage']);
  const settingsSource = fs.readFileSync(path.join(root, 'js/ui/menu.js'), 'utf8');
  ok(settingsSource.slice(settingsSource.indexOf('const ADVANCED_FEATURES'), settingsSource.indexOf('const KINGDOM_MANAGEMENT_FEATURES')).includes("key: 'dailyReminders'"));
  ok(!settingsSource.slice(settingsSource.indexOf('const BASIC_FEATURES'), settingsSource.indexOf('const ADVANCED_FEATURES')).includes("key: 'dailyReminders'"));
  ok(css.includes('prefers-reduced-motion: reduce'));
  ok(css.includes('animation: qol-reminder-wiggle 2.5s infinite !important'));
  for (const frame of ['3% { transform: rotate(-4deg)', '6% { transform: rotate(4deg)', '9% { transform: rotate(-4deg)', '12% { transform: rotate(4deg)', '15% { transform: rotate(0deg)']) ok(css.includes(frame));
  console.log(`Daily Reminders: ${checks} checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
