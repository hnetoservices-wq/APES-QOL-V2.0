// npm install --prefix tests, then node tests/rallyPointEnhancer.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../js/features/rallyPointEnhancer.js'), 'utf8');
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const fail = async (promise, pattern) => { await assert.rejects(promise, pattern); checks++; };
const move = (landing = '20:46:57', type = 'reinforcement') => ({ landing, type });
const rowHtml = movement => `<troop-details-rallypoint class="movingTroops"><div class="troopsDetailContainer">
  <div class="troopsTitle"><i class="movement_${movement.type}_small"></i>
  ${movement.type} by <a class="playerLink">Sender</a> from <a class="villageLink">Same village</a></div>
  <div class="countdownTo"><span countdown="">00:04:58</span>
  <span i18ndt="1791661617">${movement.landing}</span></div></div></troop-details-rallypoint>`;

function setup(pages, options = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: `https://trickandtreat.kingdoms.com/#/page:village/villId:123/cp:${options.start || 1}/location:32/window:building/subtab:Incoming`,
    runScripts: 'outside-only'
  });
  const { window } = dom;
  const { document } = window;
  let enabled = true;
  window.isQolEnabled = () => enabled;
  // Model the shared Rally Point lock used by the incoming scanner UI.
  window.qolRallyPointScanLock = {
    show() {
      const lock = document.createElement('div');
      lock.id = 'test-scan-lock';
      document.body.appendChild(lock);
    }, update() {}, hide() { document.querySelector('#test-scan-lock')?.remove(); }
  };
  // Layout measurements are unavailable in jsdom; the fixture is visible.
  Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { get: () => 20 });
  Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { get: () => 20 });
  document.body.innerHTML = `<div id="userNameButton"><span class="text">Player</span></div>
    <div class="villageEntry active">Destination</div><div id="status"></div>
    <div class="buildingDetails rallypoint"><div class="tg-pagination"><ul>
    <li class="firstPage"><a>«</a></li>
    ${pages.map((_, i) => `<li class="number" data-page="${i + 1}"><a>${i + 1}</a></li>`).join('')}
    <li class="nextPage"><a><i class="arrowRight"></i>›</a></li></ul></div>
    <div class="tabIncoming currentTab"><div class="rows"></div></div>
    <div class="tabOutgoing"><div class="movingTroops"><div class="troopsDetailContainer">Unrelated outgoing movement</div></div></div></div>`;
  const root = document.querySelector('.buildingDetails.rallypoint');
  let page = options.start || 1;
  const log = [];
  const timers = [];
  const showPager = () => {
    root.querySelectorAll('.number').forEach(control => control.classList.toggle('disabled', Number(control.dataset.page) === page));
    root.querySelector('.firstPage').classList.toggle('disabled', page === 1);
    root.querySelector('.nextPage').classList.toggle('disabled', page === pages.length);
    window.location.hash = `#/page:village/villId:123/cp:${page}/location:32/window:building/subtab:Incoming`;
  };
  const showRows = () => {
    root.querySelector('.rows').innerHTML = pages[page - 1].length ? pages[page - 1].map(rowHtml).join('') : '<p>No inbound troops</p>';
  };
  const navigate = target => {
    page = target;
    // The page marker changes before the movement data, as in an async game UI.
    showPager();
    if (options.stall) return;
    timers.push(window.setTimeout(showRows, options.lag ?? 20));
  };
  root.querySelector('.nextPage').addEventListener('click', () => {
    if (page >= pages.length) return;
    log.push(`next:${page}`);
    navigate(page + 1);
  });
  root.querySelector('.firstPage').addEventListener('click', () => {
    if (page === 1) return;
    log.push(`first:${page}`);
    navigate(1);
  });
  showPager();
  showRows();
  vm.runInContext(source.replace("  if (document.readyState === 'loading') {", `
    window.testRally = { collectAllPages, scrapePageData, getPageSignature,
      getIncomingPageState, waitForIncomingPage, triggerClick, findPaginationButton,
      mountPanel, destroyUI, awaitRallyPointRender, rows() { return compiledWaves; },
      configure(types) { compiledWaves = []; activeMovementTypes = types; } };
    return;
    if (document.readyState === 'loading') {`), dom.getInternalVMContext());
  const api = window.testRally;
  api.configure({ attack: true, siege: true, raid: true, reinforcement: true });
  return { window, document, root, api, log, navigate, showRows,
    disable() { enabled = false; },
    close() { timers.forEach(t => window.clearTimeout(t)); dom.window.close(); } };
}

(async () => {
  // Screenshot-shaped arrivals: same sender, village, type and seconds on both pages.
  const repeated = [move('20:46:56'), move(), move(), move()];
  const identical = setup([repeated, repeated], { lag: 900 });
  try {
    let complete = 0;
    await identical.api.collectAllPages(identical.document.querySelector('#status'), () => { complete++; });
    equal(identical.api.rows().length, 8);
    equal(identical.api.rows().filter(m => m.landing === '20:46:57').length, 6);
    equal(identical.log, ['next:1']);
    equal(complete, 1);
  } finally { identical.close(); }

  const three = setup([[move('20:46:56')], [move()], [move('20:46:58')]], { start: 3, lag: 100 });
  try {
    await three.api.collectAllPages(three.document.querySelector('#status'), () => {});
    equal(three.log, ['first:3', 'next:1', 'next:2']);
    equal(three.api.rows().map(row => row.landing).join('|'), '20:46:56|20:46:57|20:46:58');
  } finally { three.close(); }
  const opening = setup([[move('20:46:56')], [move()], [move('20:46:58')]], { start: 3 });
  try {
    opening.root.querySelector('.tabIncoming').classList.remove('currentTab');
    opening.root.querySelector('.tabOutgoing').classList.add('currentTab');
    opening.window.location.hash = '#/page:village/villId:123/cp:1/location:32/window:building/subtab:Incoming';
    opening.window.setTimeout(() => {
      opening.root.querySelector('.tabOutgoing').classList.remove('currentTab');
      opening.root.querySelector('.tabIncoming').classList.add('currentTab');
      opening.navigate(1);
    }, 100);
    equal(await opening.api.awaitRallyPointRender(2000), true);
    equal(opening.api.getIncomingPageState(opening.root).page, 1);
    equal(opening.root.querySelector('[i18ndt]').textContent, '20:46:56');
  } finally { opening.close(); }

  const filtered = setup([[move('20:46:56', 'attack'), move()], [move('20:46:58', 'raid'), move()]]);
  try {
    filtered.api.configure({ attack: false, siege: false, raid: true, reinforcement: false });
    await filtered.api.collectAllPages(filtered.document.querySelector('#status'), () => {});
    equal(filtered.api.rows().length, 1);
    equal(filtered.api.rows()[0].type, 'Raid');
    equal(filtered.log, ['next:1']);
  } finally { filtered.close(); }

  const empty = setup([[]]);
  try {
    let complete = false;
    await empty.api.collectAllPages(empty.document.querySelector('#status'), () => { complete = true; });
    equal(empty.api.rows().length, 0);
    equal(complete, true);
  } finally { empty.close(); }

  const controls = setup([[move()]]);
  try {
    equal(controls.api.findPaginationButton('next', controls.root), null);
    equal(controls.api.findPaginationButton('first', controls.root), null);
    let clicks = 0;
    const button = controls.document.createElement('button');
    button.addEventListener('click', () => { clicks++; });
    controls.api.triggerClick(button);
    equal(clicks, 1);
    const signature = controls.api.getPageSignature(controls.root);
    controls.root.querySelector('[countdown]').textContent = '00:01:00';
    equal(controls.api.getPageSignature(controls.root), signature);
    controls.root.querySelector('[i18ndt]').textContent = '21:00:00';
    equal(controls.api.getPageSignature(controls.root) !== signature, true);
  } finally { controls.close(); }
  const inaccessible = setup([[move()], [move()]]);
  try {
    inaccessible.root.querySelector('.nextPage').classList.add('disabled');
    let complete = false;
    await fail(inaccessible.api.collectAllPages(inaccessible.document.querySelector('#status'), () => { complete = true; }), /page 2 is listed/);
    equal(complete, false);
  } finally { inaccessible.close(); }

  // A pager change alone, or a ticking countdown on old rows, cannot prove that
  // the target page finished rendering.
  const stalled = setup([[move()], [move()]], { stall: true });
  try {
    const previous = stalled.api.getIncomingPageState(stalled.root);
    stalled.navigate(2);
    stalled.root.querySelector('[countdown]').textContent = '00:03:57';
    await fail(stalled.api.waitForIncomingPage(2, previous, 450), /page 2 did not finish loading/);
  } finally { stalled.close(); }

  const fallback = setup([[move()]]);
  try {
    fallback.root.querySelector('.rows').innerHTML = `<div class="movementRow">
      <span class="type">Attack</span> by <span class="player">Sender</span>
      from <span class="village">Source</span> in <span class="timer">00:10:00</span>
      at <span class="landingTime">20:00:00</span></div>`;
    fallback.api.scrapePageData(fallback.root, { playerName: 'Player', villageName: 'Destination' });
    equal(fallback.api.rows().length, 1); // Do not parse the same row again through the text fallback.
  } finally { fallback.close(); }

  // Integration: failed pagination must never announce completion or retain a
  // partial result that the history module could mistake for a successful scan.
  const failed = setup([[move()], [move()]], { stall: true });
  try {
    failed.api.mountPanel();
    failed.document.querySelector('#qol-btn-merge').click();
    const started = Date.now();
    while (failed.document.querySelector('#qol-merge-status').dataset.tone !== 'error' && Date.now() - started < 10000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    equal(failed.document.querySelector('#qol-merge-status').dataset.tone, 'error');
    equal(failed.document.querySelector('#qol-merge-status').textContent.includes('page 2'), true);
    equal(failed.api.rows().length, 0);
    equal(failed.document.querySelector('#qol-btn-merge').getAttribute('aria-disabled'), 'false');
    equal(failed.document.querySelector('#test-scan-lock'), null);
  } finally { failed.close(); }
  console.log(`Rally Point Incomings: ${checks} checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
