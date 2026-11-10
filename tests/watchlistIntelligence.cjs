const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const load = name => fs.readFileSync(path.join(root, name), 'utf8');
const helper = load('js/modules/watchlist/scanReliability.js');
const historySource = load('js/modules/watchlist/history.js');
const uiSource = load('js/modules/watchlist/intelligenceUI.js');
const watchlistSource = load('js/features/watchlist.js');
const now = Date.now() - 5 * 3600000;
const hour = 3600000;
const village = (name, x, y, isCapital = false) => ({
  name, id: name.replace(/ /g, '-'), x:String(x), y:String(y),
  coords:'(' + x + '|' + y + ')', isCapital
});
const profile = (playerId, playerName, population, villages, capitalConfirmed = true) => ({
  playerId, playerName, population:String(population), villages,
  capital:villages.find(item => item.isCapital) || villages[0], capitalConfirmed
});
function dom() {
  const browser = new JSDOM('<!doctype html><html><body></body></html>', {
    url:'https://history-test.kingdoms.com/#/',
    runScripts:'outside-only'
  });
  browser.window.isQolEnabled = () => true;
  browser.window.eval(helper);
  browser.window.eval(historySource);
  browser.window.eval(uiSource);
  return browser;
}
function checks() {
  const browser = dom(), w = browser.window, document = w.document, h = w.APES_WATCHLIST_HISTORY;
  const base = profile('12', 'Ruboon', 800, [
    village('Capital', 11, -2, true), village('Old Village', 12, -3)
  ]);
  const changed = profile('12', 'Ruboon', 920, [
    village('Capital Renamed', 11, -2),
    village('New Village', 18, 4, true)
  ]);
  assert.equal(h.seed('12', base, now), true);
  assert.equal(h.seed('12', base, now + hour), false, 'duplicate baseline ignored');
  assert.equal(h.record('12', changed, now + hour).ok, true);
  let data = h.read('12');
  assert.equal(data.snapshots.length, 2);
  assert.equal(data.events.filter(e => e.kind === 'village-added').length, 1);
  assert.equal(data.events.filter(e => e.kind === 'village-renamed').length, 1);
  assert.equal(data.events.filter(e => e.kind === 'village-missing').length, 1);
  assert.equal(data.events.filter(e => e.kind === 'capital-changed').length, 1);
  assert.equal(data.events.filter(e => e.kind === 'population-changed').length, 1);
  assert.equal(data.events.find(e => e.kind === 'village-missing').status, 'pending');
  assert.equal(h.record('12', changed, now + 2 * hour).ok, true);
  assert.equal(data.events.find(e => e.kind === 'village-missing').status, 'confirmed');
  assert.equal(h.latestVillages(data).some(v => v.status === 'missing'), true);
  assert.equal(h.record('12', { ...changed, villages: [] }, now + 3 * hour).ok, false, 'incomplete profile rejected');
  assert.equal(data.events.length, 5, 'invalid scan produces no events');
  assert.equal(h.record('12', changed, now + hour).ok, false, 'old scan results rejected');
  const trend = h.trend(data, 7 * 86400000, now + 2 * hour);
  assert.equal(trend.delta, 120);
  assert.equal(trend.villageDelta, 0);
  assert.equal(trend.complete, false, 'partial seven-day period must be identified');
  assert.ok(h.chart(data, 7 * 86400000, now + 2 * hour).length >= 2);
  assert.equal(h.save(), true);
  assert.ok(w.localStorage.getItem('qol_watchlist_history_history-test.kingdoms.com'));
  assert.equal(w.localStorage.getItem('qol_watchlist_history-test.kingdoms.com'), null, 'history uses separate key');
  const restored = h.load();
  assert.equal(restored.players['12'].events.length, 5);

  // First disappearance is not called a confirmed loss; subsequent scans are.
  w.APES_WATCHLIST_INTELLIGENCE.open({
    playerId:'12', playerName:'Ruboon', lastUpdatedAt:now + 2 * hour
  }, 'history', () => {});
  const overlay = document.getElementById('qol-wl-intel-overlay');
  assert.ok(overlay);
  assert.equal(overlay.querySelector('[role="dialog"]').getAttribute('aria-modal'), 'true');
  assert.equal(overlay.querySelectorAll('.qol-wl-intel-metric').length, 3);
  assert.ok(overlay.querySelector('.qol-wl-intel-chart'), 'population history chart rendered');
  assert.ok(overlay.querySelectorAll('.qol-wl-intel-event').length >= 5);
  overlay.querySelector('[data-wl-intel-value="villages"]').click();
  assert.equal(overlay.querySelectorAll('.qol-wl-intel-villages tbody tr').length, 3);
  assert.ok(overlay.textContent.includes('Confirmed missing'));
  assert.ok(overlay.textContent.includes('New Village'));
  overlay.querySelector('[data-wl-intel-value="24h"]').dispatchEvent(
    new w.KeyboardEvent('keydown', { key:'Enter', bubbles:true })
  );
  assert.equal(overlay.querySelector('[data-wl-intel-value="24h"]').getAttribute('aria-pressed'), 'true');
  document.dispatchEvent(new w.KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
  assert.equal(document.getElementById('qol-wl-intel-overlay'), null);

  // A reappearance resolves a previously confirmed absence; it does not
  // silently delete the earlier event from history.
  const returned = profile('12', 'Ruboon', 940, [
    village('Capital Renamed', 11, -2),
    village('New Village', 18, 4, true),
    village('Old Village', 12, -3)
  ]);
  assert.equal(h.record('12', returned, now + 3 * hour).ok, true);
  assert.equal(data.events.find(e => e.kind === 'village-missing').status, 'confirmed',
    'confirmed historical event remains after return');
  assert.equal(h.latestVillages(data).some(v => v.status === 'missing'), false,
    'returned village no longer listed as missing');

  // Unconfirmed capital markers must never create capital-switch events.
  const noCapitalProof = profile('45', 'NoProof', 100, [village('A', 5, 5, true)], false);
  h.seed('45', noCapitalProof, now);
  const later = profile('45', 'NoProof', 120, [village('B', 6, 6, true)], false);
  h.record('45', later, now + hour);
  assert.equal(h.read('45').events.filter(e => e.kind === 'capital-changed').length, 0);

  // A hard cap prevents unbounded browser storage growth.
  const bulk = profile('99', 'Busy', 100, [village('A', 1, 1, true)]);
  h.seed('99', bulk, now - 2 * 86400000);
  for (let i = 1; i <= 210; i++) {
    h.record('99', { ...bulk, population:String(100 + i) }, now - 2 * 86400000 + i * 30000);
  }
  assert.ok(h.read('99').snapshots.length <= h.MAX_SNAPSHOTS);
  assert.ok(h.read('99').events.length <= h.MAX_EVENTS);
  h.save();

  // Two tabs produce only one shared history record, and notes are untouched.
  const twoTabs = [{ id:'a', entries:[{ ...base, notes:'first' }] },
    { id:'b', entries:[{ ...base, notes:'second' }] }];
  h.seedExisting(twoTabs, now);
  assert.equal(Object.keys(h.load().players).filter(id => id === '12').length, 1);
  assert.equal(twoTabs[0].entries[0].notes, 'first');
  assert.equal(twoTabs[1].entries[0].notes, 'second');

  // Main Watchlist table exposes both intelligence entry points.
  w.localStorage.setItem('qol_watchlist_history-test.kingdoms.com', JSON.stringify([
    { id:'tab_1', name:'Enemies', entries:[{ ...base, notes:'My note' }] }
  ]));
  w.eval(watchlistSource);
  document.dispatchEvent(new w.Event('DOMContentLoaded'));
  assert.ok(document.querySelector('[data-wl-intel="history"]'));
  assert.ok(document.querySelector('[data-wl-intel="villages"]'));
  document.querySelector('[data-wl-intel="history"]').click();
  assert.ok(document.getElementById('qol-wl-intel-overlay'), 'Changes opens intelligence modal');
  w.APES_WATCHLIST_INTELLIGENCE.close();
  document.querySelector('[data-wl-intel="villages"]').click();
  assert.ok(document.querySelector('.qol-wl-intel-villages'), 'Village count opens village list');
  w.APES_WATCHLIST_INTELLIGENCE.close();
  browser.window.close();
}
try {
  checks();
  console.log('Watchlist Phase 2 intelligence tests passed.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
