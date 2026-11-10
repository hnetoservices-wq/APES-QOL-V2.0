const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(condition, message, timeout = 3500) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (condition()) return;
    await sleep(25);
  }
  assert.fail(message);
}

async function main() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://trickandtreat.kingdoms.com/'
  });
  const { window: w } = dom;
  const doc = w.document;
  const server = w.location.hostname;
  let reportArchiveEnabled = true;
  w.isQolEnabled = feature => feature !== 'reportArchive' || reportArchiveEnabled;
  const reports = [
    { id: 'jason-1', title: 'Jason (No. 01) → Kanunpanze', sourcePlayer: 'Jason', savedAt: 30, folderId: 'tb' },
    { id: 'jason-2', title: 'Attack on defender', destPlayer: 'Jason', savedAt: 20, folderId: null },
    { id: 'other', title: 'Another player report', sourcePlayer: 'Apequinte', savedAt: 10, folderId: 'tb' }
  ];
  w.localStorage.setItem('qol_report_archive_' + server, JSON.stringify({
    version: 2,
    updatedAt: Date.now(),
    folders: [{ id: 'tb', name: 'TB' }],
    reports
  }));
  w.eval(source('js/modules/watchlist/scanReliability.js'));
  w.eval(source('js/modules/watchlist/history.js'));
  w.eval(source('js/modules/watchlist/intelligenceUI.js'));
  w.eval(source('js/features/reportArchive.js'));
  doc.dispatchEvent(new w.Event('DOMContentLoaded'));
  await waitFor(() => doc.getElementById('qol-report-archive-panel'), 'Report Archive failed to initialize');
  const archive = w.APES_REPORT_ARCHIVE;
  assert.equal(typeof archive.openForPlayer, 'function', 'Report Archive publishes a player search API');

  // An existing date search must not carry across a Watchlist shortcut.
  archive.open();
  const mode = doc.querySelector('.qol-ra-search-mode');
  mode.value = 'date';
  mode.dispatchEvent(new w.Event('change', { bubbles: true }));
  archive.close();

  const intelligence = w.APES_WATCHLIST_INTELLIGENCE;
  intelligence.open({ playerId: '77', playerName: 'Jason', lastUpdatedAt: Date.now() });
  const button = doc.querySelector('[data-wl-intel-action="reports"]');
  assert.ok(button, 'Saved Reports button exists');
  assert.equal(button.textContent, 'Saved Reports');
  assert.ok(button.classList.contains('qol-wl-intel-btn'), 'uses APES-themed control styling');
  assert.equal(button.getAttribute('role'), 'button');
  assert.equal(button.getAttribute('tabindex'), '0');
  button.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await waitFor(() => !doc.getElementById('qol-wl-intel-overlay'), 'Player Intelligence should close after successful handoff');

  const panel = doc.getElementById('qol-report-archive-panel');
  assert.equal(panel.style.display, 'flex', 'Report Archive is displayed');
  assert.equal(doc.querySelector('.qol-ra-search-mode').value, 'name', 'name search is selected');
  assert.equal(doc.querySelector('.qol-ra-search-input').value, 'Jason', 'target name is prefilled');
  const titles = [...panel.querySelectorAll('.qol-ra-report-title')].map(element => element.textContent.trim());
  assert.equal(titles.length, 2, 'results include all folders, but only matching reports');
  assert.ok(titles.includes('Jason (No. 01) → Kanunpanze'));
  assert.ok(titles.includes('Attack on defender'));
  assert.ok(!titles.includes('Another player report'));
  assert.equal(doc.querySelector('.qol-ra-main-title').textContent, 'All Reports');

  // Repeated requests replace the previous search rather than append.
  await archive.openForPlayer('Apequinte');
  assert.equal(doc.querySelector('.qol-ra-search-input').value, 'Apequinte');
  assert.equal(panel.querySelectorAll('.qol-ra-report-title').length, 1);
  archive.close();

  // Disabled tools should leave the intelligence window visible and explain why.
  reportArchiveEnabled = false;
  intelligence.open({ playerId: '77', playerName: 'Jason' });
  doc.querySelector('[data-wl-intel-action="reports"]').click();
  await waitFor(() => doc.querySelector('.qol-wl-intel-notice')?.textContent.includes('unavailable'),
    'disabled Report Archive warning missing');
  assert.ok(doc.getElementById('qol-wl-intel-overlay'));
  assert.equal(doc.querySelector('[data-wl-intel-action="reports"]').getAttribute('aria-disabled'), 'false');
  intelligence.close();
  dom.window.close();
  console.log('Saved Reports integration: prefilled name, all-folder results, keyboard control, and unavailable state passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
