const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../js/features/buildingAlarm.js'), 'utf8');
let checks = 0;
function eq(actual, expected) { assert.deepEqual(actual, expected); checks++; }
function setup(now, alarms = []) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><span i18ndt full="true"></span><div id="heroQuickInfo"><div class="heroStats"></div></div><div class="currentVillageName"><div class="selectedItem"><div class="villageEntry">Test village</div></div></div><div class="queueContainer"><div class="detailsContent"><div class="detailsInfo"><div><span>Granary</span><span class="levelText">4 → 5</span></div></div><div class="detailsTime"><i class="symbol_clock_small_flat_black duration"></i><span countdown="1000"></span></div></div></div></body></html>', { url: 'https://test.kingdoms.com/#/page:village/villId:123', runScripts: 'outside-only' });
  const w = dom.window, d = w.document; let refresh, enabled = true, oscillators = 0;
  Object.defineProperty(d, 'readyState', { value: 'complete' });
  d.querySelector('[i18ndt]').setAttribute('i18ndt', now);
  d.querySelector('.heroStats').getBoundingClientRect = () => ({ left: 500, top: 20, width: 100, height: 28 });
  w.localStorage.setItem('qol_building_alarms', JSON.stringify(alarms));
  w.isQolEnabled = () => enabled; w.setInterval = callback => { refresh = callback; return 1; };
  const audioNode = () => ({ connect() {}, start() {}, stop() {}, frequency: { setValueAtTime() {} }, gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } });
  w.AudioContext = class { currentTime = 0; destination = {}; resume() {} createGain() { return audioNode(); } createOscillator() { oscillators++; return audioNode(); } };
  w.eval(source);
  return { dom, d, w, get dings() { return oscillators / 3; },
    alarms: () => JSON.parse(w.localStorage.getItem('qol_building_alarms')),
    advance(time) { d.querySelector('[i18ndt]').setAttribute('i18ndt', time); refresh(); },
    toggle(value) { enabled = value; w.dispatchEvent(new w.CustomEvent('qol_setting_changed', { detail: { key: 'buildingAlarm', enabled: value } })); },
    text: () => d.querySelector('.qol-building-alarm-status-text')?.textContent,
    ready: () => d.querySelector('#qol-building-alarm-status')?.classList.contains('ready') };
}
const alarm = { id: 'existing', villageId: '123', villageName: 'Test village', buildingName: 'Granary', levelText: '4 → 5', finishAt: 1000, alarmAt: 700, triggered: false };
const e = setup(694);
eq(e.d.querySelector('.duration').title.includes('5 minutes and 5 seconds'), true);
e.d.querySelector('.duration').click(); eq(e.alarms()[0].alarmAt, 695); eq(e.dings, 0);
e.advance(694.9); eq(e.dings, 0); eq(e.ready(), false);
e.advance(695); eq(e.dings, 1); eq(e.alarms()[0].triggeredAt, 695); eq(e.text(), '1 Free Finish in 00:00:05!'); eq(e.ready(), false);
eq(e.d.querySelector('.qol-building-alarm-hover-time').textContent, 'Free in 00:00:05');
e.advance(696); eq(e.dings, 1); eq(e.text(), '1 Free Finish in 00:00:04!');
e.advance(699); eq(e.ready(), false); eq(e.text(), '1 Free Finish in 00:00:01!');
e.advance(700); eq(e.ready(), true); eq(e.text(), '1 Free Finish Ready!'); eq(e.dings, 1);
e.advance(701); eq(e.dings, 1); e.advance(1000); eq(e.alarms().length, 0); eq(e.text(), 'No Free Finish Ready'); e.dom.window.close();
const migrated = setup(694, [alarm]); eq(migrated.alarms()[0].alarmAt, 695); eq(migrated.dings, 0); migrated.advance(695); eq(migrated.dings, 1); eq(migrated.ready(), false); migrated.advance(700); eq(migrated.dings, 1); eq(migrated.ready(), true); migrated.dom.window.close();
const fired = setup(695, [{ ...alarm, triggered: true }]); eq(fired.alarms()[0].alarmAt, 695); eq(fired.dings, 0); eq(fired.ready(), false); fired.advance(700); eq(fired.dings, 0); eq(fired.ready(), true); fired.dom.window.close();
const disabled = setup(694, [alarm]); disabled.toggle(false); disabled.advance(695); eq(disabled.dings, 0); eq(disabled.text(), undefined); disabled.toggle(true); eq(disabled.dings, 1); eq(disabled.ready(), false); disabled.dom.window.close();
const late = setup(698, [alarm]); eq(late.dings, 1); eq(late.ready(), false); eq(late.text(), '1 Free Finish in 00:00:02!'); late.dom.window.close();
const expired = setup(1000, [alarm]); eq(expired.dings, 0); eq(expired.alarms().length, 0); expired.dom.window.close();
console.log(`Building Alarm: ${checks} alert-boundary, readiness, saved-alarm and one-ding checks passed.`);
