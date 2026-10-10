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
const keyboard = (environment, control, key) => {
  const event = new environment.w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  control.dispatchEvent(event); return event;
};
function ownedControls(environment) {
  const selectors = '#qol-kingdom-management-panel, #qol-kingdom-management-scan-lock, #qol-kingdom-management-toggle-btn';
  for (const container of environment.doc.querySelectorAll(selectors)) {
    eq(container.querySelectorAll('button, .button, [clickable]').length, 0);
    for (const control of container.querySelectorAll('[role="button"]')) {
      eq(control.tagName, 'DIV'); ok(control.classList.contains('qol-km-action'));
      eq(control.tabIndex, control.getAttribute('aria-disabled') === 'true' ? -1 : 0);
    }
  }
  eq(environment.nativeCreations, 0);
}

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
  cached.classList.remove('hiddenTab');
  const hiddenParent = w.document.createElement('div'); hiddenParent.className = 'hiddenTab';
  cached.replaceWith(hiddenParent); hiddenParent.append(cached);
  eq(w.APES_KINGDOM_STATISTICS.readPage(stage).rows[0].id, parsed.rows[0].id);
  const table = [...w.document.querySelectorAll('.loadedTab table')].find(table => !table.closest('.hiddenTab'));
  const cell = table.querySelector('tbody tr').children[index === 0 ? 4 : index === 4 ? 2 : 4];
  cell.textContent = ''; eq(w.APES_KINGDOM_STATISTICS.readPage(stage), null);
  dom.window.close();
}

// The new capture obtained by manually selecting Population must parse directly.
{
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, 'fixtures/kingdomManagement/ManualPopulation.html'), 'utf8'), { runScripts: 'outside-only' });
  dom.window.eval(sources[0]);
  const S = dom.window.APES_KINGDOM_STATISTICS, page = S.readPage(S.STAGES[0]);
  eq(page.rows.length, 15); eq(page.page, 1); eq(page.lastPage, 8); eq(page.hasNext, true);
  eq(page.rows[0].ranking, 1); ok(page.firstControl.classList.contains('disabled'));
  dom.window.close();
}

const model = id => ({ id: String(id), name: `Kingdom ${id}`, king: `King ${id}`, kingId: String(100 + Number(id)),
  villages: 10 * id, population: 1000 * id, area: 20 * id, players: 5 * id,
  averageAttack: 7 * id, totalAttack: 35 * id, averageDefense: 9 * id, totalDefense: 45 * id,
  treasures: 100 * id, victoryPoints: 3000 * id });
const defaultPages = () => ({ Population: [[1, 2], [3]], Size: [[3], [1], [2]], Attacker: [[2, 3], [1]], Defender: [[1, 2]], VictoryPoints: [[3, 1], [4, 2]] });

function setup(options = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="game"></div></body>', {
    url: `https://${options.server || 'trickandtreat.kingdoms.com'}/#/page:${options.basePage || 'resources'}/villId:123/window:building/location:22`, runScripts: 'outside-only'
  });
  const w = dom.window, doc = w.document, store = options.store || new Map(), log = [], progress = [], nativeTabs = [];
  let enabled = true, pages = defaultPages(), changes = {}, writes = 0, failWrite = false;
  // Model the game's native-button decorator, including controls later removed by render().
  let nativeCreations = 0, bubbledActions = 0;
  const decorated = new WeakSet();
  const observer = new w.MutationObserver(records => {
    for (const record of records) for (const added of record.addedNodes) {
      if (added.nodeType !== 1) continue;
      for (const button of [...(added.matches('button') ? [added] : []), ...added.querySelectorAll('button')]) {
        if (!decorated.has(button)) { decorated.add(button); nativeCreations++; button.classList.add('game-decorated'); }
      }
    }
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  doc.addEventListener('click', event => { if (event.target.closest?.('.qol-km-action')) bubbledActions++; });
  const style = doc.createElement('style');
  style.textContent = 'button { background: lime !important; color: transparent !important; }' + fs.readFileSync(path.join(root, 'css/features/kingdomManagement.css'), 'utf8');
  doc.head.appendChild(style);
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
  let gameTab = '', gamePage = 1, ignoredHash = '';
  const transientTabs = new Set();
  function navigate(tab, page, bootstrap = false) {
    const hash = w.location.hash;
    if (!bootstrap) log.push(`${tab}:${page}`);
    progress.push(doc.querySelector('[data-km-progress]')?.textContent);
    if (options.stall && tab === 'Population' && page === 2) return;
    const game = doc.querySelector('#game');
    if (!bootstrap && options.transientRoute && page === 1 && !transientTabs.has(tab)) {
      transientTabs.add(tab); w.location.hash = `#/page:${options.basePage || 'resources'}/villId:123`;
      setTimeout(() => { ignoredHash = hash; w.location.hash = hash; navigate(tab, page); }, 60); return;
    }
    function showRows() {
      gameTab = tab; gamePage = page;
      // Captured native navigation: the parent Kingdoms tab initializes first,
      // then its child ranking is selected with selectTab(...). Opening a
      // combined Population deep link initially renders VictoryPoints instead.
      const parentIsPlayer = bootstrap && options.startOnPlayer;
      game.innerHTML = `<div class="statistics"><nav class="maintab">${['Player', 'Kingdoms', 'World'].map(name => `<a class="tab naviTab${name} clickable ${name === (parentIsPlayer ? 'Player' : 'Kingdoms') ? 'active' : 'inactive'}" clickable="selectTab('${name}')">${name}</a>`).join('')}</nav><div class="loadedTab tabKingdoms currentTab activeTab${parentIsPlayer ? ' hiddenTab' : ''}"><nav class="subtab">${tabs.filter(name => name !== options.missingNativeTab).map(name => `<a class="tab naviTab${name} clickable ${name === tab ? 'active' : 'inactive'}" clickable="selectTab('${name}')">${name}</a>`).join('')}</nav>${pageHTML(tab, page)}</div></div>`;
      const ranking = game.querySelector(`.loadedTab.tab${tab}.currentTab`);
      if (bootstrap && options.delayNativeTabs) {
        const childNav = game.querySelector('nav.subtab'); childNav.classList.add('ng-hide');
        setTimeout(() => childNav.classList.remove('ng-hide'), 70);
      }
      const cached = ranking.cloneNode(true); cached.classList.add('hiddenTab');
      cached.querySelector('[kingdomid]')?.setAttribute('kingdomid', '999999'); ranking.before(cached);
      if (bootstrap && options.emptyInitialVictoryPoints) ranking.querySelector('tbody').replaceChildren();
      game.querySelector('.maintab .naviTabKingdoms').addEventListener('click', event => {
        event.preventDefault();
        nativeTabs.push('Kingdoms'); selectRanking('VictoryPoints', 1);
      });
      for (const control of game.querySelectorAll('.subtab a')) control.addEventListener('click', event => {
        event.preventDefault();
        const name = tabs.find(name => control.classList.contains(`naviTab${name}`));
        nativeTabs.push(name); selectRanking(name, name === gameTab ? gamePage : 1);
      });
      function advance(nextPage) {
        if (options.pagerKeepsHash) { navigate(tab, nextPage); return; }
        let next = w.location.hash.replace(/\/(statsPage|cp):\d+/g, '');
        w.location.hash = next + `/statsPage:${nextPage}`;
      }
      ranking.querySelector('.firstPage')?.addEventListener('click', () => { if (page > 1) advance(1); });
      ranking.querySelector('.nextPage')?.addEventListener('click', () => {
        if (page < pages[tab].length) advance(page + 1);
      });
      if (options.normalizedRoute) {
        let normalized = w.location.hash.replace(/\/statsPage:\d+/g, '');
        if (tab === 'Population') normalized = normalized.replace('/subtab:Population', '');
        ignoredHash = normalized; w.location.hash = normalized;
      }
      if (!bootstrap && options.navigateAway && tab === 'Attacker') w.location.hash = '#/page:map';
      if (!bootstrap && options.wrongStatisticsTab && tab === 'Attacker') w.location.hash = w.location.hash.replace('tab:Kingdoms', 'tab:Players');
    }
    if (options.stalePager && tab === 'Population' && page === 2) {
      // The native page marker updates before data, a regression from earlier scanners.
      game.querySelectorAll('.number').forEach(node => node.classList.toggle('disabled', node.textContent === '2' || node.textContent === '...'));
      game.querySelector('.nextPage').classList.add('disabled');
      setTimeout(() => { if (w.location.hash === hash) showRows(); }, 85);
      return;
    }
    showRows();
  }
  function selectRanking(tab, page) {
    let hash = w.location.hash.replace(/\/(subtab|tab|statsPage|cp):[^/]+/g, '');
    const nextHash = hash + `/tab:Kingdoms/subtab:${tab}/statsPage:${page}`;
    if (nextHash !== w.location.hash) { ignoredHash = nextHash; w.location.hash = nextHash; }
    navigate(tab, page);
  }
  w.addEventListener('hashchange', event => {
    const hash = new URL(event.newURL).hash;
    if (hash === ignoredHash) { ignoredHash = ''; return; }
    if (!hash.includes('window:statistics')) return;
    if (!new URL(event.oldURL).hash.includes('window:statistics') && !transientTabs.has(gameTab)) {
      const initialTab = options.startOnPopulationPage2 ? 'Population' : 'VictoryPoints';
      ignoredHash = hash.replace(/\/(subtab|statsPage):[^/]+/g, '') + `/subtab:${initialTab}/statsPage:${options.startOnPopulationPage2 ? 2 : 1}`;
      w.location.hash = ignoredHash;
      navigate(initialTab, options.startOnPopulationPage2 ? 2 : 1, true); return;
    }
    const tab = hash.match(/subtab:([^/]+)/)?.[1] || gameTab, page = Number(hash.match(/(?:statsPage|cp):(\d+)/)?.[1] || 1);
    if (tabs.includes(tab)) navigate(tab, page);
  });
  return { dom, w, doc, api, S, H, store, log, progress, nativeTabs, originalHash, actions, pageHTML,
    get nativeCreations() { return nativeCreations; }, get bubbledActions() { return bubbledActions; },
    get writes() { return writes; }, setFailWrite: value => { failWrite = value; },
    setPages: value => { pages = value; }, setChanges: value => { changes = value; },
    disable() { enabled = false; w.dispatchEvent(new w.CustomEvent('qol_setting_changed', { detail: { key: 'kingdomManagement' } })); } };
}

(async () => {
  const e = setup({ stalePager: true });
  await pause(5);
  const launcher = e.doc.querySelector('#qol-kingdom-management-toggle-btn'); eq(launcher.tagName, 'DIV');
  eq(launcher.getAttribute('role'), 'button'); eq(launcher.tabIndex, 0);
  eq(keyboard(e, launcher.querySelector('svg'), 'Enter').defaultPrevented, true); await pause(5);
  ok(e.doc.querySelector('#qol-kingdom-management-panel').classList.contains('qol-km-open'));
  keyboard(e, launcher, ' '); eq(e.doc.querySelector('#qol-kingdom-management-panel').classList.contains('qol-km-open'), false);
  launcher.click(); await pause(5); ownedControls(e);
  eq(e.doc.querySelector('[data-km-body]').querySelectorAll('.qol-km-action').length, 1);
  eq(e.doc.querySelector('[data-km-scan]').textContent, 'Scan Kingdoms');
  eq(e.w.getComputedStyle(e.doc.querySelector('[data-km-scan]')).display, 'inline-flex');
  eq(e.w.getComputedStyle(e.doc.querySelector('[data-km-scan]')).color, 'rgb(255, 248, 233)');
  const panel = e.doc.querySelector('#qol-kingdom-management-panel');
  eq(e.w.getComputedStyle(panel).resize, 'both');
  panel.getBoundingClientRect = () => panel.classList.contains('qol-km-open')
    ? { left: parseFloat(panel.style.left || '100'), top: parseFloat(panel.style.top || '80'), width: 900, height: 600 }
    : { left: 0, top: 0, width: 0, height: 0 };
  const pointer = (type, x, y, target = panel.querySelector('.qol-km-head')) => {
    const event = new e.w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: 1 }); target.dispatchEvent(event);
  };
  pointer('pointerdown', 150, 100); pointer('pointermove', 900, 700);
  eq(panel.style.left, '124px'); eq(panel.style.top, '168px');
  pointer('pointerup', 900, 700); pointer('pointermove', 100, 100); eq(panel.style.left, '124px');
  ok(e.doc.querySelector('#qol-kingdom-management-toggle-btn svg')); ok(e.actions.has('kingdoms.open'));
  for (const [value, expected] of [['1,234', 1234], ['1.234', 1234], ['1\u00a0234', 1234], ['0', 0], ['', null], ['-', null], ['loading', null]]) eq(e.S.count(value), expected);
  keyboard(e, e.doc.querySelector('[data-km-scan]'), 'Enter');
  const pending = e.api.scan(); eq(e.api.scan() === pending, true);
  eq(e.doc.querySelector('[data-km-scan]').getAttribute('aria-disabled'), 'true');
  eq(e.doc.querySelector('[data-km-scan]').tabIndex, -1);
  keyboard(e, e.doc.querySelector('[data-km-scan]'), ' '); e.doc.querySelector('[data-km-scan]').click();
  ownedControls(e);
  ok(e.doc.querySelector('#qol-kingdom-management-scan-lock')); eq(e.api.isScanning(), true);
  eq(e.doc.querySelector('#qol-kingdom-management-panel').classList.contains('qol-km-scan-hidden'), true);
  eq(await pending, true); eq(e.writes, 1); eq(e.api.isScanning(), false);
  eq(e.doc.querySelector('#qol-kingdom-management-scan-lock'), null); eq(e.w.location.hash, e.originalHash);
  eq(e.doc.querySelector('#qol-kingdom-management-panel').classList.contains('qol-km-scan-hidden'), false);
  eq(e.log, ['Population:1', 'Population:2', 'Size:1', 'Size:2', 'Size:3', 'Attacker:1', 'Attacker:2', 'Defender:1', 'VictoryPoints:1', 'VictoryPoints:2']);
  eq(e.nativeTabs, tabs);
  ok(e.progress.some(text => text.includes('Total Kingdom Population')));
  const first = e.api.getSnapshots()[0]; eq(first.kingdoms.length, 4);
  eq(first.pages, { Population: 2, Size: 3, Attacker: 2, Defender: 1, VictoryPoints: 2 });
  eq(first.missing, { Population: 1, Size: 1, Attacker: 1, Defender: 2, VictoryPoints: 0 });
  const one = first.kingdoms.find(row => row.id === '1');
  for (const key of e.H.METRICS) eq(one[key], key === 'rank' ? 1 : model(1)[key]);
  eq(first.kingdoms.find(row => row.id === '4').population, null); eq(first.kingdoms.find(row => row.id === '3').averageDefense, null);
  eq(e.doc.querySelectorAll('.qol-km-table-wrap tbody tr').length, 4);
  ownedControls(e);
  keyboard(e, e.doc.querySelector('[data-km-sort="population"]'), 'Enter');
  eq(e.doc.querySelector('[data-km-sort="population"]').parentElement.getAttribute('aria-sort'), 'ascending');
  keyboard(e, e.doc.querySelector('[data-km-sort="population"]'), ' ');
  eq(e.doc.querySelector('[data-km-sort="population"]').parentElement.getAttribute('aria-sort'), 'descending');
  keyboard(e, e.doc.querySelector('[data-km-tab="comparison"]'), ' '); ok(e.doc.querySelector('.qol-km-empty').textContent.includes('again'));
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
  ownedControls(e);
  ok(e.doc.querySelector('.qol-km-caption').textContent.includes('1 king changes'));
  eq(e.doc.querySelectorAll('.qol-km-table-wrap img').length, 0);
  const search = e.doc.querySelector('[data-km-search]'); search.value = '<img'; search.dispatchEvent(new e.w.Event('input', { bubbles: true }));
  eq(keyboard(e, e.doc.querySelector('[data-km-search]'), ' ').defaultPrevented, false);
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
  keyboard(e, e.doc.querySelector('[data-km-delete]'), 'Enter'); await pause(10);
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
  e.api.open(); keyboard(e, e.doc.querySelector('[data-km-close]'), ' ');
  eq(e.doc.querySelector('#qol-kingdom-management-panel').classList.contains('qol-km-open'), false);
  e.w.dispatchEvent(new e.w.Event('resize')); eq(panel.style.left, '124px'); eq(panel.style.top, '168px');
  eq(e.bubbledActions, 0); eq(e.nativeCreations, 0);
  e.dom.window.close();

  for (const options of [{ stall: true }, { noPager: true }, { prematureEnd: true }, { navigateAway: true }]) {
    const test = setup(options); test.api.open(); eq(await test.api.scan(), false);
    eq(test.writes, 0); eq((await test.H.load()).length, 0); eq(test.api.isScanning(), false);
    eq(test.doc.querySelector('#qol-kingdom-management-scan-lock'), null);
    eq(test.doc.querySelector('#qol-kingdom-management-panel').classList.contains('qol-km-scan-hidden'), false);
    if (options.navigateAway) {
      ok(test.doc.querySelector('[data-km-status]').textContent.includes('Kingdom Attacker Points, page 1'));
      ok(test.doc.querySelector('[data-km-status]').textContent.includes('no window'));
    }
    eq(test.w.location.hash, options.navigateAway ? '#/page:map' : test.originalHash);
    test.dom.window.close();
  }
  for (const options of [{ normalizedRoute: true }, { pagerKeepsHash: true }, { normalizedRoute: true, pagerKeepsHash: true }, { transientRoute: true }]) {
    const test = setup(options); test.api.open(); eq(await test.api.scan(), true);
    eq(test.api.getSnapshots()[0].pages, { Population: 2, Size: 3, Attacker: 2, Defender: 1, VictoryPoints: 2 });
    eq(test.api.getSnapshots()[0].kingdoms.length, 4); eq(test.w.location.hash, test.originalHash);
    eq(test.doc.querySelector('#qol-kingdom-management-panel').classList.contains('qol-km-scan-hidden'), false);
    ok(test.log.every(entry => !entry.includes('NaN')));
    test.dom.window.close();
  }
  // Reproduce the reported startup on VictoryPoints (including an empty table),
  // delayed child controls, an inactive parent, and an already-selected page 2.
  for (const options of [{ emptyInitialVictoryPoints: true }, { startOnPlayer: true },
    { delayNativeTabs: true }, { startOnPopulationPage2: true }, { basePage: 'village' }]) {
    const test = setup(options); test.api.open(); const result = await test.api.scan();
    assert.ok(result, `${JSON.stringify(options)}: ${test.doc.querySelector('[data-km-status]').textContent}; ${test.log.join(',')}`); checks++;
    eq(test.api.getSnapshots()[0].pages, { Population: 2, Size: 3, Attacker: 2, Defender: 1, VictoryPoints: 2 });
    eq(test.api.getSnapshots()[0].kingdoms.length, 4); eq(test.w.location.hash, test.originalHash);
    eq(test.nativeTabs.filter(tab => tab !== 'Kingdoms'), tabs);
    if (options.startOnPlayer) eq(test.nativeTabs[0], 'Kingdoms');
    if (options.startOnPopulationPage2) eq(test.log.slice(0, 3), ['Population:2', 'Population:1', 'Population:2']);
    test.dom.window.close();
  }
  const missingTab = setup({ missingNativeTab: 'Population' }); missingTab.api.open();
  eq(await missingTab.api.scan(), false); eq(missingTab.writes, 0);
  ok(missingTab.doc.querySelector('[data-km-status]').textContent.includes('Population tab did not become available'));
  eq(missingTab.w.location.hash, missingTab.originalHash); missingTab.dom.window.close();
  const wrongTab = setup({ wrongStatisticsTab: true }); wrongTab.api.open(); eq(await wrongTab.api.scan(), false);
  eq(wrongTab.writes, 0); ok(wrongTab.w.location.hash.includes('tab:Players'));
  ok(wrongTab.doc.querySelector('[data-km-status]').textContent.includes('Players'));
  wrongTab.dom.window.close();
  for (const method of ['button', 'keyboard', 'escape', 'disabled']) {
    const test = setup(); test.api.open(); const pending = test.api.scan();
    if (method === 'button') test.doc.querySelector('[data-km-cancel]').click();
    if (method === 'keyboard') keyboard(test, test.doc.querySelector('[data-km-cancel]'), 'Enter');
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
