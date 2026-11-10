const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const helper = fs.readFileSync(path.join(root, 'js/modules/watchlist/scanReliability.js'), 'utf8');
const feature = fs.readFileSync(path.join(root, 'js/features/watchlist.js'), 'utf8');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const village = (id, x, y, isCapital = false) => ({ id, name: 'Village ' + id, x: String(x), y: String(y), coords: '(' + x + '|' + y + ')', isCapital });
const snapshot = (id, name, pop, villages) => ({ playerId: id, playerName: name, population: pop, villages, capital: villages[0] || null });

function makeDom(body = '') {
  const dom = new JSDOM('<!doctype html><body>' + body + '</body>', {
    url: 'https://test.kingdoms.com/#/playerId:1/profileTab:playerProfile/window:profile',
    runScripts: 'outside-only'
  });
  dom.window.isQolEnabled = () => true;
  dom.window.eval(helper);
  return dom;
}

function testDataValidationAndDuplicateSync() {
  const dom = makeDom(), logic = dom.window.APES_WATCHLIST_SCAN;
  const original = snapshot('1', 'Alpha', '1,200', [village('c', 1, 2, true), village('a', 3, 4)]);
  const changed = snapshot('1', 'Alpha', '1,260', [village('nc', 1, 2, true), village('na', 3, 4), village('nb', 5, 6)]);
  assert.equal(logic.validateProfile(original, '1'), null);
  assert.match(logic.validateProfile({ ...original, playerId: '2' }, '1'), /identity/i);
  assert.match(logic.validateProfile({ ...original, playerName: 'Unknown' }, '1'), /name/i);
  assert.match(logic.validateProfile({ ...original, population: 'N/A' }, '1'), /population/i);
  assert.match(logic.validateProfile({ ...original, villages: [] }, '1'), /village/i);
  assert.match(logic.validateProfile({ ...original, villages: [village('x', '', 1)] }, '1'), /coordinates/i);
  assert.match(logic.validateProfile({ ...original, villages: [village('x', 1, 2), village('y', 1, 2)] }, '1'), /duplicate/i);
  assert.notEqual(logic.profileSignature(original), logic.profileSignature(changed));
  const older = { ...original, notes: 'A', selected2ndId: 'a', selected2ndCoords: '(3|4)', lastUpdatedAt: 10 };
  const newer = { ...original, notes: 'B', selected2ndId: 'a', selected2ndCoords: '(3|4)', lastUpdatedAt: 20 };
  const tabs = [{ id: 't1', entries: [older] }, { id: 't2', entries: [newer, { playerId: '2' }] }];
  assert.equal(logic.entriesInScope(tabs, 't1', false).length, 1);
  assert.equal(logic.entriesInScope(tabs, 't1', true).length, 2);
  assert.equal(logic.synchronizePlayer(tabs, '1', changed, 30), 2);
  for (const entry of [older, newer]) {
    assert.equal(entry.populationChange, 60);
    assert.equal(entry.villageChange, 1);
    assert.equal(entry.selected2ndId, 'na', 'selection survives regenerated village IDs');
    assert.equal(entry.population, '1,260');
  }
  assert.equal(older.notes, 'A');
  assert.equal(newer.notes, 'B');
  assert.notStrictEqual(older.villages, newer.villages);
  logic.synchronizePlayer(tabs, '1', snapshot('1', 'Alpha', '1000', [village('c', 1, 2, true)]), 40);
  assert.equal(older.selected2ndId, '', 'missing secondary selection is cleared');
  const copies = [
    { id: 't1', entries: [{ ...original, notes: 'A', lastUpdatedAt: 1 }] },
    { id: 't2', entries: [{ ...changed, notes: 'B', lastUpdatedAt: 2 }] }
  ];
  logic.synchronizeExistingDuplicates(copies);
  assert.equal(copies[0].entries[0].population, '1,260');
  assert.equal(copies[0].entries[0].notes, 'A');
  dom.window.close();
}

function profileHtml(id, name, population, coords) {
  const rows = coords.map(([x, y], index) =>
    '<tr ng-repeat="village in villages"><td class="name"><a class="villageLink" villageid="' + id + '-' + index + '">' + name + '</a></td>' +
    '<td class="coordinates" x="' + x + '" y="' + y + '">(' + x + '|' + y + ')</td>' +
    '<td><i class="' + (index === 0 ? 'icon-capital' : '') + '"></i></td></tr>').join('');
  return '<div class="contentBox playerDescription" data-player-id="' + id + '">' +
    '<div class="contentBoxHeader">Profile</div><div class="contentBoxBody"><div><span class="desc">Population</span>' +
    '<span class="data">' + population + '</span></div></div></div>' +
    '<div class="content" ng-if="!kingdomProfile">' + name + '</div>' +
    '<table class="playerVillages">' + rows + '</table>';
}

async function testAdaptiveAllTabsScan() {
  const dom = makeDom('<main id="profile"></main>'), w = dom.window, doc = w.document;
  const a = snapshot('1', 'Alpha', '100', [village('1-a', 1, 2, true)]);
  const b = snapshot('2', 'Beta', '150', [village('2-b', 3, 4, true)]);
  w.localStorage.setItem('qol_watchlist_test.kingdoms.com', JSON.stringify([
    { id: 'tab_1', name: 'Enemy', entries: [{ ...a, notes: 'A' }, { ...b, notes: 'B' }] },
    { id: 'tab_2', name: 'Rivals', entries: [{ ...b, notes: 'B in other tab' }] }
  ]));
  function render(id) {
    doc.getElementById('profile').innerHTML = id === '1' ?
      profileHtml('1', 'Alpha', '120', [[1, 2]]) :
      profileHtml('2', 'Beta', '180', [[3, 4], [5, 6]]);
  }
  render('1');
  w.addEventListener('hashchange', () => {
    const id = (w.location.hash.match(/playerId:(\d+)/) || [])[1];
    if (id) w.setTimeout(() => render(id), 20);
  });
  w.eval(feature);
  doc.dispatchEvent(new w.Event('DOMContentLoaded'));
  await pause(30);
  const button = doc.getElementById('qol-wl-update-all-btn');
  assert.ok(button);
  button.click();
  const started = Date.now();
  while (doc.getElementById('qol-watchlist-overlay') && Date.now() - started < 6000) await pause(50);
  assert.equal(doc.getElementById('qol-watchlist-overlay'), null, 'scan did not require 1.2s per player');
  const tabs = JSON.parse(w.localStorage.getItem('qol_watchlist_test.kingdoms.com'));
  assert.equal(tabs[0].entries[0].population, '120');
  assert.equal(tabs[0].entries[1].population, '180');
  assert.equal(tabs[1].entries[0].population, '180');
  assert.equal(tabs[1].entries[0].populationChange, 30);
  assert.equal(tabs[1].entries[0].notes, 'B in other tab');
  assert.equal(tabs[0].lastScanResult.updated, 2);
  assert.equal(tabs[1].lastScanResult.updated, 1);
  w.close();
}

async function testImmediateCancellation() {
  const dom = makeDom('<main id="profile">' + profileHtml('1', 'Alpha', '100', [[1, 2]]) + '</main>');
  const w = dom.window, doc = w.document;
  w.localStorage.setItem('qol_watchlist_test.kingdoms.com', JSON.stringify([
    { id: 'tab_1', name: 'Targets', entries: [{ ...snapshot('2', 'Beta', '150', [village('b', 3, 4, true)]), notes: 'Keep me' }] }
  ]));
  w.eval(feature);
  doc.dispatchEvent(new w.Event('DOMContentLoaded'));
  await pause(20);
  doc.getElementById('qol-wl-update-btn').click();
  const cancel = doc.querySelector('.qol-wl-scan-cancel');
  assert.ok(cancel);
  assert.equal(cancel.tagName, 'DIV', 'APES control must not inherit Travian native button styling');
  assert.ok(cancel.classList.contains('qol-wl-action-control'), 'Cancel uses the shared APES action-control styling');
  assert.equal(cancel.getAttribute('role'), 'button');
  assert.equal(cancel.tabIndex, 0);
  assert.ok(doc.getElementById('qol-watchlist-styles').textContent.includes('#qol-watchlist-overlay .qol-wl-scan-cancel'));
  cancel.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(cancel.getAttribute('aria-disabled'), 'true');
  assert.equal(cancel.tabIndex, -1);
  const started = Date.now();
  while (doc.getElementById('qol-watchlist-overlay') && Date.now() - started < 2000) await pause(25);
  assert.equal(doc.getElementById('qol-watchlist-overlay'), null);
  const tabs = JSON.parse(w.localStorage.getItem('qol_watchlist_test.kingdoms.com'));
  assert.equal(tabs[0].entries[0].population, '150');
  assert.equal(tabs[0].entries[0].notes, 'Keep me');
  assert.equal(tabs[0].lastScanResult.cancelled, true);
  w.close();
}

(async () => {
  testDataValidationAndDuplicateSync();
  await testAdaptiveAllTabsScan();
  await testImmediateCancellation();
  console.log('Watchlist Phase 1 tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
