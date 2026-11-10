const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const browser = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://watchlist-population.kingdoms.com/#/playerId:42/profileTab:playerProfile/window:profile',
  runScripts: 'outside-only'
});
const w = browser.window;
w.isQolEnabled = () => true;
w.eval(read('js/modules/watchlist/scanReliability.js'));
w.eval(read('js/modules/watchlist/history.js'));
w.eval(read('js/modules/watchlist/intelligenceUI.js'));
const feature = read('js/features/watchlist.js').replace(
  '  function openWatchlistMenu(tabId) {',
  '  window.__testScrapeWatchlist = scrapeOpenProfileData;\n  function openWatchlistMenu(tabId) {'
);
assert.ok(feature.includes('__testScrapeWatchlist'));
w.eval(feature);
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

const v = (id, name, x, y, pop) => ({
  id, name, x:String(x), y:String(y), coords:'(' + x + '|' + y + ')',
  isCapital:id === 'a', population:pop
});
const p = (id, population, villages) => ({
  playerId:id, playerName:'Tester', population:String(population),
  capital:villages[0], capitalConfirmed:true, villages
});
const now = Date.now(), hour = 3600000, sixHours = 6 * hour;
function testParsing() {
  w.document.body.innerHTML = '<div class="content" ng-if="!kingdomProfile">Tester</div>' +
    '<div class="contentBoxBody"><div><span class="desc">Population</span><span class="data">2,000</span></div></div>' +
    '<table class="playerVillages"><thead><tr><th>Village</th><th>Population</th><th>Coordinates</th></tr></thead>' +
    '<tbody><tr ng-repeat="village"><td class="name"><a class="villageLink" villageid="a">Capital</a></td>' +
    '<td class="population">1,200</td><td class="coordinates" x="56" y="5">(56|5)</td></tr>' +
    '<tr ng-repeat="village"><td class="name"><a class="villageLink" villageid="b">Second</a></td>' +
    '<td class="number">800</td><td class="coordinates" x="56" y="4">(56|4)</td></tr></tbody></table>';
  const profile = w.__testScrapeWatchlist('42');
  assert.equal(profile.population, '2,000', 'player total remains distinct');
  assert.deepEqual(Array.from(profile.villages, village => village.population), [1200, 800],
    'explicit cell class and column header fallback');
  assert.equal(w.APES_WATCHLIST_SCAN.validateProfile(profile, '42'), null);
  w.document.querySelectorAll('.playerVillages tr[ng-repeat]')[1].querySelector('td.number').textContent = '(56|4)';
  assert.equal(w.__testScrapeWatchlist('42').villages[1].population, null,
    'coordinate string never mistaken for population');
}
function testHistory() {
  const history = w.APES_WATCHLIST_HISTORY;
  const first = p('42', 2000, [v('a','Capital',56,5,1200), v('b','Second',56,4,800)]);
  const next = p('42', 2000, [v('a','Capital',56,5,1205), v('b','Second',56,4,795)]);
  const current = p('42', 2000, [v('new-a','Renamed Capital',56,5,1235),
    v('new-b','Second',56,4,765)]);
  assert.equal(history.seed('42', first, now - 5 * hour), true);
  assert.equal(history.record('42', next, now - 4 * hour).ok, true);
  assert.equal(history.record('42', current, now - hour).ok, true);
  const rec = history.read('42');
  assert.equal(rec.snapshots.length, 3);
  assert.equal(rec.events.filter(e => e.kind === 'village-population-changed').length, 4);
  assert.equal(history.trend(rec, sixHours, now).delta, 0);
  assert.equal(history.villageTrend(rec, '56|5', sixHours, now).delta, 35);
  assert.equal(history.villageTrend(rec, '56|4', sixHours, now).delta, -35);
  assert.equal(history.villageTrend(rec, '56|5', 24 * hour, now).delta, 35);
  assert.equal(history.villageTrend(rec, 'missing', sixHours, now), null);
  assert.equal(history.chart(rec, sixHours, now).length, 3);

  // The six-hour baseline must not include observations from seven hours ago.
  history.seed('43', p('43', 3000, [v('a','Capital',10,10,100)]), now - 7 * hour);
  history.record('43', p('43', 3010, [v('a','Capital',10,10,130)]), now - 5 * hour);
  history.record('43', p('43', 3030, [v('a','Capital',10,10,140)]), now - hour);
  assert.equal(history.villageTrend(history.read('43'), '10|10', sixHours, now).delta, 10);
  assert.equal(history.villageTrend(history.read('43'), '10|10', 24 * hour, now).delta, 40);
  assert.equal(history.chart(history.read('43'), sixHours, now).length, 2);

  // Old records have no per-village population; never invent past values.
  history.seed('44', p('44', 100, [v('a','Old',12,12,undefined)]), now - 3 * hour);
  history.record('44', p('44', 120, [v('a','Old',12,12,777)]), now - hour);
  const oldRecord = history.read('44');
  assert.equal(history.villageTrend(oldRecord, '12|12', sixHours, now), null);
  assert.equal(history.latestVillages(oldRecord)[0].population, 777);
  history.record('44', p('44', 120, [v('a','Old',12,12,780)]), now - 30 * 60000);
  assert.equal(history.villageTrend(oldRecord, '12|12', sixHours, now).delta, 3,
    'once two valid readings exist, older unknown snapshot is safely skipped');

  history.seed('45', p('45', 10, [v('a','A',1,1,5)]), now - 8 * hour);
  history.record('45', p('45', 20, [v('a','A',1,1,15)]), now - hour);
  assert.equal(history.villageTrend(history.read('45'), '1|1', sixHours, now), null);
  assert.equal(history.trend(history.read('45'), sixHours, now), null);
  assert.equal(history.save(), true);
}
function testUI() {
  const intel = w.APES_WATCHLIST_INTELLIGENCE;
  intel.open({ playerId:'42', playerName:'Tester', lastUpdatedAt:now - hour }, 'villages');
  const doc = w.document, panel = doc.getElementById('qol-wl-intel-overlay');
  assert.ok(panel);
  const periods = [...panel.querySelectorAll('[data-wl-intel-action="period"]')];
  assert.deepEqual(periods.map(node=>node.dataset.wlIntelValue), ['6h','24h','7d','30d']);
  const columns = [...panel.querySelectorAll('.qol-wl-intel-villages thead th')].map(node=>node.textContent);
  assert.deepEqual(columns, ['Village','Coordinates','Population','Status']);
  let rows = [...panel.querySelectorAll('.qol-wl-intel-villages tbody tr')];
  assert.equal(rows.find(row=>row.textContent.includes('Renamed Capital'))
    .querySelector('.qol-wl-village-pop strong').textContent, '1,235');
  assert.equal(rows.find(row=>row.textContent.includes('Renamed Capital'))
    .querySelector('.qol-wl-village-pop-change').textContent, '+35');
  assert.equal(rows.find(row=>row.textContent.includes('Second'))
    .querySelector('.qol-wl-village-pop-change').textContent, '-35');
  panel.querySelector('[data-wl-intel-value="6h"]').click();
  assert.equal(panel.querySelector('[data-wl-intel-value="6h"]').getAttribute('aria-pressed'), 'true');
  assert.equal(panel.querySelector('.qol-wl-village-pop-change').textContent, '+35');

  intel.open({ playerId:'43', playerName:'Tester' }, 'villages');
  assert.equal(doc.querySelector('.qol-wl-village-pop-change').textContent, '+40');
  doc.querySelector('[data-wl-intel-value="6h"]').click();
  assert.equal(doc.querySelector('.qol-wl-village-pop-change').textContent, '+10');

  intel.open({ playerId:'44', playerName:'Tester' }, 'villages');
  assert.equal(doc.querySelector('.qol-wl-village-pop strong').textContent, '780');
  assert.equal(doc.querySelector('.qol-wl-village-pop-change').textContent, '+3',
    'UI uses two valid readings even when an older legacy snapshot has unknown village population');
  intel.close();
}
try {
  testParsing();
  testHistory();
  testUI();
  browser.window.close();
  console.log('Watchlist six-hour and village population tests passed.');
 } catch (error) {
  browser.window.close();
  console.error(error);
  process.exitCode = 1;
}
