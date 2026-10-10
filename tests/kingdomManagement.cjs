// npm install --prefix tests, then node tests/kingdomManagement.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const files = ['js/modules/kingdomManagement/statistics.js', 'js/modules/kingdomManagement/history.js', 'js/features/kingdomManagement.js'];
const sources = files.map(file => fs.readFileSync(path.join(root, file), 'utf8'));
const tabs = ['Population', 'Size', 'Attacker', 'Defender', 'VictoryPoints'];
const fixtures = Object.fromEntries(tabs.map(tab => [tab, fs.readFileSync(path.join(__dirname, 'fixtures/kingdomManagement', `${tab}.html`), 'utf8')]));
let checks = 0;
const plain = value => JSON.parse(JSON.stringify(value));
const eq = (actual, expected) => { assert.deepEqual(plain(actual), expected); checks++; };
const ok = value => { assert.ok(value); checks++; };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Check native headers, numeric formats, split VP columns and the supplied page 2.
for (let index = 0; index < tabs.length; index++) {
  const dom = new JSDOM(fixtures[tabs[index]], { runScripts: 'outside-only' });
  const w = dom.window; w.eval(sources[0]);
  const stage = w.APES_KINGDOM_STATISTICS.STAGES[index];
  const parsed = w.APES_KINGDOM_STATISTICS.readPage(stage);
  eq(parsed.rows.length, 15); eq(parsed.page, index === 3 ? 2 : 1);
  eq(parsed.lastPage, index < 2 ? 8 : 7); eq(parsed.hasNext, true);
  const expected = [{ id: '120', rank: 1, villages: 120, population: 45543 }, { id: '120', area: 251 },
    { id: '87', players: 50, averageAttack: 1988, totalAttack: 99398 },
    { averageDefense: 341, totalDefense: 2047 }, { id: '100', treasures: 3809, victoryPoints: 7487 }][index];
  for (const [key, value] of Object.entries(expected)) eq(parsed.rows[0][key], value);
  const cached = w.document.querySelector('.loadedTab').cloneNode(true);
  cached.classList.add('hiddenTab'); cached.querySelector('[kingdomid]').setAttribute('kingdomid', '999999');
  w.document.body.prepend(cached); eq(w.APES_KINGDOM_STATISTICS.readPage(stage).rows[0].id, parsed.rows[0].id);
  const table = w.document.querySelector('.loadedTab:not(.hiddenTab) table');
  const cell = table.querySelector('tbody tr').children[index === 0 ? 4 : index === 4 ? 2 : 4];
  cell.textContent = ''; eq(w.APES_KINGDOM_STATISTICS.readPage(stage), null);
  dom.window.close();
}

const model = id => ({ id: String(id), name: `Kingdom ${id}`, king: `King ${id}`, kingId: String(100 + Number(id)),
  villages: 10 * id, population: 1000 * id, area: 20 * id, players: 5 * id,
  averageAttack: 7 * id, totalAttack: 35 * id, averageDefense: 9 * id, totalDefense: 45 * id,
  treasures: 100 * id, victoryPoints: 3000 * id });
const defaultPages = () => ({ Population: [[1, 2], [3]], Size: [[3], [1], [2]], Attacker: [[2, 3], [1]], Defender: [[1, 2]], VictoryPoints: [[3, 1], [4, 2]] });

function setup(options = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="game"></div></body>', {
    url: `https://${options.server || 'trickandtreat.kingdoms.com'}/#/page:village/villId:123/window:building/location:22`, runScripts: 'outside-only'
  });
  const w = dom.window, doc = w.document, store = options.store || new Map(), log = [], progress = [];
  let enabled = true, pages = defaultPages(), changes = {}, writes = 0, failWrite = false;
  const originalHash = w.location.hash;
  // Keep timeout and polling clocks consistent while making failure cases fast.
  const nativeTimer = w.setTimeout.bind(w), nativeNow = w.performance.now.bind(w.performance);
  w.setTimeout = (callback, ms, ...args) => nativeTimer(callback, ms / 10, ...args);
  w.performance.now = () => nativeNow() * 10;
  w.isQolEnabled = () => enabled;
  w.confirm = () => true;
  const actions = new Map();
  w.APES = { actions: { register: action => actions.set(action.id, action) }, ui: { closeOtherTools() {} },
    storage: { get: async config => { eq(config.scope, 'server'); return store.get(w.location.hostname) || null; },
      set: async (config, data) => { if (failWrite) throw new Error('Storage quota exceeded'); eq(config.feature, 'kingdomManagement'); writes++; store.set(w.location.hostname, plain(data)); } } };
  sources.forEach(source => w.eval(source));
  const S = w.APES_KINGDOM_STATISTICS, H = w.APES_KINGDOM_HISTORY, api = w.APES_KINGDOM_MANAGEMENT;
  function pageHTML(tab, page) {
    const stage = S.STAGES.find(item => item.tab === tab);
    const holder = doc.createElement('div'); holder.innerHTML = fixtures[tab];
    const tabRoot = holder.querySelector('.loadedTab');
    const table = tabRoot.querySelector('table'), template = table.querySelector('tbody tr').cloneNode(true);
    const columns = {}; let index = 0;
    table.querySelectorAll('thead th').forEach(th => { columns[th.getAttribute('tooltip-translate').replace('Statistics.TableHeader.Tooltip.', '')] = index; index += Number(th.getAttribute('colspan')) || 1; });
    const body = table.querySelector('tbody'); body.replaceChildren();
    const offset = pages[tab].slice(0, page - 1).reduce((sum, list) => sum + list.length, 0);
    for (const [rowIndex, id] of (pages[tab][page - 1] || []).entries()) {
      const data = { ...model(id), ...changes[id] }, row = template.cloneNode(true), cells = [...row.children];
      cells[columns.Rank].textContent = `${offset + rowIndex + 1}.`;
      const link = cells[columns.Kingdom].querySelector('[kingdomid]'); link.setAttribute('kingdomid', data.id); link.textContent = data.name;
      if (tab === 'Population') { const king = cells[columns.King].querySelector('[playerid]'); king.textContent = data.king; king.setAttribute('playerid', data.kingId); }
      for (const [key, column] of Object.entries(stage.fields)) {
        if (key === 'rank') continue;
        const cell = cells[columns[column]]; cell.textContent = data[key].toLocaleString('en-US');
        if (key === 'victoryPoints') { cell.setAttribute('tooltip-data', `totalPoints: ${data[key].toLocaleString('en-US')}`); cell.textContent = '999'; }
      }
      body.appendChild(row);
    }
    const total = pages[tab].length;
    tabRoot.querySelector('.tg-pagination').innerHTML = `<ul><li class="firstPage${page === 1 ? ' disabled' : ''}">«</li>${Array.from({ length: total }, (_, i) => `<li class="number clickable${i + 1 === page ? ' disabled' : ''}">${i + 1}</li>`).join('')}<li class="number disabled">...</li><li class="nextPage${page === total ? ' disabled' : ''}"><i>›</i></li><li class="lastPage${page === total ? ' disabled' : ''}">»</li></ul>`;
    if (options.prematureEnd && tab === 'Population' && page === 1) tabRoot.querySelector('.nextPage').classList.add('disabled');
    if (options.noPager) tabRoot.querySelector('.tg-pagination').remove();
    return tabRoot.outerHTML;
  }
  w.addEventListener('hashchange', event => {
    const hash = new URL(event.newURL).hash, tab = hash.match(/subtab:([^/]+)/)?.[1], page = Number(hash.match(/statsPage:(\d+)/)?.[1]);
    if (!tabs.includes(tab)) return;
    log.push(`${tab}:${page}`);
    progress.push(doc.querySelector('[data-km-progress]')?.textContent);
    if (options.stall && tab === 'Population' && page === 2) return;
    const game = doc.querySelector('#game');
    if (options.stalePager && tab === 'Population' && page === 2) {
      // The native page marker updates before data, a regression from earlier scanners.
      game.querySelectorAll('.number').forEach(node => node.classList.toggle('disabled', node.textContent === '2' || node.textContent === '...'));
      game.querySelector('.nextPage').classList.add('disabled');
      setTimeout(() => { if (w.location.hash === hash) game.innerHTML = pageHTML(tab, page); }, 85);
      return;
    }
    game.innerHTML = pageHTML(tab, page);
    const cached = game.querySelector('.loadedTab').cloneNode(true); cached.classList.add('hiddenTab');
    cached.querySelector('[kingdomid]').setAttribute('kingdomid', '999999'); game.prepend(cached);
    if (options.navigateAway && tab === 'Attacker') w.location.hash = '#/page:map';
  });
  return { dom, w, doc, api, S, H, store, log, progress, originalHash, actions, pageHTML,
    get writes() { return writes; }, setFailWrite: value => { failWrite = value; },
    setPages: value => { pages = value; }, setChanges: value => { changes = value; },
    disable() { enabled = false; w.dispatchEvent(new w.CustomEvent('qol_setting_changed', { detail: { key: 'kingdomManagement' } })); } };
}

(async () => {
  const e = setup({ stalePager: true });
  await pause(5); e.api.open(); await pause(5);
  eq(e.doc.querySelector('[data-km-body]').querySelectorAll('button').length, 1);
  eq(e.doc.querySelector('[data-km-scan]').textContent, 'Scan Kingdoms');
  ok(e.doc.querySelector('#qol-kingdom-management-toggle-btn svg')); ok(e.actions.has('kingdoms.open'));
  for (const [value, expected] of [['1,234', 1234], ['1.234', 1234], ['1\u00a0234', 1234], ['0', 0], ['', null], ['-', null], ['loading', null]]) eq(e.S.count(value), expected);
  const pending = e.api.scan(); eq(e.api.scan() === pending, true);
  ok(e.doc.querySelector('#qol-kingdom-management-scan-lock')); eq(e.api.isScanning(), true);
  eq(await pending, true); eq(e.writes, 1); eq(e.api.isScanning(), false);
  eq(e.doc.querySelector('#qol-kingdom-management-scan-lock'), null); eq(e.w.location.hash, e.originalHash);
  eq(e.log, ['Population:1', 'Population:2', 'Size:1', 'Size:2', 'Size:3', 'Attacker:1', 'Attacker:2', 'Defender:1', 'VictoryPoints:1', 'VictoryPoints:2']);
  ok(e.progress.some(text => text.includes('Total Kingdom Population')));
  const first = e.api.getSnapshots()[0]; eq(first.kingdoms.length, 4);
  eq(first.pages, { Population: 2, Size: 3, Attacker: 2, Defender: 1, VictoryPoints: 2 });
  eq(first.missing, { Population: 1, Size: 1, Attacker: 1, Defender: 2, VictoryPoints: 0 });
  const one = first.kingdoms.find(row => row.id === '1');
  for (const key of e.H.METRICS) eq(one[key], key === 'rank' ? 1 : model(1)[key]);
  eq(first.kingdoms.find(row => row.id === '4').population, null); eq(first.kingdoms.find(row => row.id === '3').averageDefense, null);
  eq(e.doc.querySelectorAll('.qol-km-table-wrap tbody tr').length, 4);
  e.doc.querySelector('[data-km-tab="comparison"]').click(); ok(e.doc.querySelector('.qol-km-empty').textContent.includes('again'));
  // New snapshot: same IDs with changed ranks, names, kings and values; one enters/one leaves.
  e.setPages({ Population: [[2, 1], [5]], Size: [[5, 1, 2]], Attacker: [[2, 1, 5]], Defender: [[5, 1, 2]], VictoryPoints: [[5, 1, 2]] });
  e.setChanges({ 1: { name: '<img src=x onerror=alert(1)>', king: 'New King', kingId: '900', population: 1500, area: 30, players: 6, treasures: 120 } });
  eq(await e.api.scan(), true); eq(e.writes, 2); eq(e.api.getSnapshots().length, 2);
  const second = e.api.getSnapshots()[0];
  eq(first.kingdoms.find(row => row.id === '1').population, 1000); ok(second.id !== first.id);
  const comparison = e.H.compare(first, second); const changed = comparison.find(row => row.id === '1');
  eq(changed.renamed, true); eq(changed.kingChanged, true); eq(changed.changes.population, 500);
  eq(changed.changes.rank, 1); eq(changed.changes.area, 10); eq(changed.changes.players, 1); eq(changed.changes.treasures, 20);
  eq(comparison.filter(row => row.status === 'New').length, 1); eq(comparison.filter(row => row.status === 'Missing').length, 2);
  eq(comparison.find(row => row.id === '4').changes.population, null);
  e.doc.querySelector('[data-km-tab="comparison"]').click();
  eq(e.doc.querySelectorAll('.qol-km-table-wrap tbody tr').length, 5);
  ok(e.doc.querySelector('.qol-km-caption').textContent.includes('1 king changes'));
  eq(e.doc.querySelectorAll('.qol-km-table-wrap img').length, 0);
  const search = e.doc.querySelector('[data-km-search]'); search.value = '<img'; search.dispatchEvent(new e.w.Event('input', { bubbles: true }));
  eq(e.doc.querySelectorAll('.qol-km-table-wrap tbody tr').length, 1);
  e.doc.querySelector('[data-km-earlier]').value = second.id; e.doc.querySelector('[data-km-earlier]').dispatchEvent(new e.w.Event('change', { bubbles: true }));
  ok(e.doc.querySelector('.qol-km-empty').textContent.includes('chronological'));
  // Saving failure leaves the old history intact and releases the lock.
  e.setFailWrite(true); eq(await e.api.scan(), false); eq(e.api.getSnapshots().length, 2);
  ok(e.doc.querySelector('[data-km-status]').textContent.includes('quota'));
  eq(e.doc.querySelector('#qol-kingdom-management-scan-lock'), null); eq(e.w.location.hash, e.originalHash);
  e.setFailWrite(false);
  // Public server snapshots survive reopening and stay isolated across servers.
  const reopened = setup({ store: e.store }); eq((await reopened.H.load()).length, 2); reopened.dom.window.close();
  const other = setup({ store: e.store, server: 'com1.kingdoms.com' }); eq((await other.H.load()).length, 0); other.dom.window.close();
  const blankCompare = e.H.compare({ kingdoms: [{ id: '1', name: 'Old', population: null }] }, { kingdoms: [{ id: '1', name: 'New', population: 0 }] });
  eq(blankCompare[0].changes.population, null); eq(blankCompare[0].renamed, true);
  // Identical repeated scans are still distinct snapshots.
  eq(await e.api.scan(), true); eq(e.api.getSnapshots().length, 3);
  const beforeDelete = e.api.getSnapshots()[0].id;
  e.doc.querySelector('[data-km-delete]').click(); await pause(10);
  eq(e.api.getSnapshots().length, 2); eq(e.api.getSnapshots().some(row => row.id === beforeDelete), false);
  // AOC uses the same panel and cleans up its embedding without duplicate controls.
  const adapters = new Map(); e.w.APES_AOC_WORKSPACE = { register: (key, adapter) => adapters.set(key, adapter) };
  e.w.requestAnimationFrame = callback => setTimeout(callback, 0);
  e.w.eval(fs.readFileSync(path.join(root, 'js/ui/accountOperationsCenterToolAdaptersRemaining.js'), 'utf8'));
  const host = e.doc.createElement('div'); e.doc.body.appendChild(host);
  const cleanup = adapters.get('kingdomManagement').mount(host); await pause(5);
  eq(host.querySelectorAll('#qol-kingdom-management-panel').length, 1);
  ok(host.querySelector('.apes-aoc-embedded-tool')); cleanup();
  eq(e.doc.body.querySelectorAll('#qol-kingdom-management-panel').length, 1);
  eq(e.doc.querySelector('#qol-kingdom-management-panel').classList.contains('qol-km-open'), false);
  e.dom.window.close();

  for (const options of [{ stall: true }, { noPager: true }, { prematureEnd: true }, { navigateAway: true }]) {
    const test = setup(options); test.api.open(); eq(await test.api.scan(), false);
    eq(test.writes, 0); eq((await test.H.load()).length, 0); eq(test.api.isScanning(), false);
    eq(test.doc.querySelector('#qol-kingdom-management-scan-lock'), null);
    eq(test.w.location.hash, options.navigateAway ? '#/page:map' : test.originalHash);
    test.dom.window.close();
  }
  for (const method of ['button', 'escape', 'disabled']) {
    const test = setup(); test.api.open(); const pending = test.api.scan();
    if (method === 'button') test.doc.querySelector('[data-km-cancel]').click();
    if (method === 'escape') test.doc.dispatchEvent(new test.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    if (method === 'disabled') test.disable();
    eq(await pending, false); eq(test.writes, 0); eq(test.api.isScanning(), false);
    eq(test.doc.querySelector('#qol-kingdom-management-scan-lock'), null);
    test.dom.window.close();
  }
  // Reject duplicated rows and duplicate IDs across pages rather than silently truncating.
  const duplicate = setup(); duplicate.setPages({ ...defaultPages(), Population: [[1, 1], [3]] });
  eq(await duplicate.api.scan(), false); eq(duplicate.writes, 0); duplicate.dom.window.close();
  const across = setup(); across.setPages({ ...defaultPages(), Population: [[1, 2], [2, 3]] });
  eq(await across.api.scan(), false); eq(across.writes, 0); across.dom.window.close();
  // Match the supplied world's 8/8/7/7/7-page shape with differently ordered rankings.
  const large = setup(); const ids = Array.from({ length: 16 }, (_, i) => i + 1);
  const pairs = list => Array.from({ length: list.length / 2 }, (_, i) => list.slice(i * 2, i * 2 + 2));
  large.setPages({ Population: pairs(ids), Size: pairs([...ids].reverse()), Attacker: pairs(ids.slice(0, 14).reverse()),
    Defender: pairs(ids.slice(2)), VictoryPoints: pairs(ids.slice(1, 15).reverse()) });
  large.api.open(); eq(await large.api.scan(), true);
  eq(large.log.length, 37); eq(large.api.getSnapshots()[0].kingdoms.length, 16);
  eq(large.api.getSnapshots()[0].pages, { Population: 8, Size: 8, Attacker: 7, Defender: 7, VictoryPoints: 7 });
  for (const row of large.api.getSnapshots()[0].kingdoms) {
    eq(row.area, model(row.id).area); eq(row.population, model(row.id).population);
  }
  const saved = large.store;
  const interrupted = setup({ stall: true, store: saved }); interrupted.api.open(); await pause(5);
  eq(await interrupted.api.scan(), false); eq(interrupted.api.getSnapshots().length, 1);
  eq(saved.get('trickandtreat.kingdoms.com').snapshots.length, 1);
  interrupted.dom.window.close(); large.dom.window.close();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const content = manifest.content_scripts.find(entry => entry.js.includes(files[2]));
  const scripts = content.js;
  ok(scripts.indexOf(files[0]) < scripts.indexOf(files[1])); ok(scripts.indexOf(files[1]) < scripts.indexOf(files[2]));
  ok(content.css.includes('css/features/kingdomManagement.css'));
  console.log(`Kingdom Management: ${checks} checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
