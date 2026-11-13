const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const markup = `
  <div id="qol-modal">
    <div data-qol-marketplace-layout role="button" tabindex="0">Choose Marketplace spot</div>
    <div data-qol-marketplace-layout-feedback></div>
  </div>
  <div id="villageView">
    <building-location class="buildingLocation28">
      <img class="location buildingId17">
      <span building-status style="left:100px;top:100px"></span>
    </building-location>
    <building-location class="buildingLocation29 free"></building-location>
    <building-location class="buildingLocation33"></building-location>
    <map id="clickareasVillage">
      <area shape="poly" location-id="28" tg-coords="90,80,110,80,110,100,90,100" coords="90,80,110,80,110,100,90,100">
      <area shape="poly" location-id="29" tg-coords="190,140,210,140,210,160,190,160" coords="190,140,210,140,210,160,190,160">
      <area shape="poly" location-id="33" tg-coords="0,0,10,0,10,10" coords="0,0,10,0,10,10">
    </map>
    <img usemap="#clickareasVillage">
  </div>`;

async function test() {
  const dom = new JSDOM(markup, {
    url: 'https://test.kingdoms.com/#/page:village/villId:101',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const { document, localStorage } = window;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.APES = {};
  window.eval(fs.readFileSync(path.join(__dirname, '../js/core/buildingNames.js'), 'utf8'));
  const wait = () => new Promise(resolve => window.setTimeout(resolve, 40));
  const area = id => document.querySelector(`area[location-id="${id}"]`);
  const slot = id => document.querySelector(`.buildingLocation${id}`);
  const shift = id => slot(id).style.getPropertyValue('--qol-layout-x');
  let enabled = false;
  window.isQolEnabled = key => key === 'marketplaceLayout' && enabled;
  function setEnabled(value) {
    enabled = value;
    window.dispatchEvent(new window.CustomEvent('qol_setting_changed', {
      detail: { key: 'marketplaceLayout' }
    }));
  }
  try {
    localStorage.setItem('qol_marketplace_display_slot', '29');
    window.eval(fs.readFileSync(path.join(__dirname, '../js/features/marketplaceLayout.js'), 'utf8'));
    await wait();
    assert.equal(shift(28), '', 'Saved preset has no effect while the feature is disabled');

    setEnabled(true);
    const choose = document.querySelector('[data-qol-marketplace-layout]');
    const clickSpot = id => document.querySelector(`[data-qol-layout-slot="${id}"]`).click();
    const action = name => document.querySelector(`[data-qol-layout-action="${name}"]`).click();
    choose.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.ok(document.querySelector('dialog[open]'));
    assert.equal(document.querySelector('[data-qol-layout-slot="33"]'), null, 'Wall cannot be selected');
    assert.match(document.querySelector('[data-qol-layout-slot="29"]').textContent, /Marketplace/);
    action('save');
    await wait();

    assert.equal(shift(28), '100px');
    assert.equal(shift(29), '-100px');
    assert.equal(area(28).getAttribute('coords'), '190,140,210,140,210,160,190,160');
    assert.equal(area(29).getAttribute('coords'), '90,80,110,80,110,100,90,100');
    const clicked = [];
    for (const id of [28, 29]) area(id).addEventListener('click', () => clicked.push(id));
    area(28).click();
    area(29).click();
    assert.deepEqual(clicked, [28, 29], 'Original Marketplace and construction actions remain attached');

    slot(29).classList.replace('buildingLocation29', 'buildingLocation37');
    area(29).setAttribute('location-id', '37');
    choose.click();
    action('reset');
    clickSpot(28);
    clickSpot(37);
    action('save');
    await wait();
    assert.equal(slot(28).style.getPropertyValue('--qol-layout-y'), '24px');
    assert.equal(area(28).getAttribute('coords'), '190,104,210,104,210,124,190,124');
    assert.equal(slot(37).style.getPropertyValue('--qol-layout-y'), '-60px');
    slot(37).classList.replace('buildingLocation37', 'buildingLocation29');
    area(37).setAttribute('location-id', '29');
    choose.click();
    action('reset');
    clickSpot(28);
    clickSpot(29);
    action('save');
    await wait();

    const resized = '45,40,55,40,55,50,45,50';
    area(28).setAttribute('coords', resized);
    await wait();
    assert.equal(area(28).getAttribute('coords'), '95,70,105,70,105,80,95,80');

    const view = document.querySelector('#villageView');
    view.querySelector('.buildingId17').classList.replace('buildingId17', 'buildingId8');
    await wait();
    assert.equal(shift(28), '100px', 'The explicitly empty spot takes priority when the requested building is missing');

    view.parentElement.innerHTML = markup;
    await wait();
    assert.equal(shift(28), '100px', 'The saved spot is reapplied on a fresh village render');
    area(28).setAttribute('coords', resized);
    await wait();
    setEnabled(false);
    await wait();
    assert.equal(shift(28), '');
    assert.equal(area(28).getAttribute('coords'), resized, 'Disabling restores the latest native polygon');

    const replaceLayout = types => {
      document.querySelector('#villageView').outerHTML = '<div id="villageView">' +
        types.map((type, index) => `<building-location class="buildingLocation${28 + index}${type ? '' : ' free'}">` +
          (type ? `<img class="location buildingId${type}">` : '') + '</building-location>').join('') +
        '<map id="clickareasVillage">' + types.map((_, index) => {
          const x = index * 100;
          const coords = `${x},0,${x + 20},0,${x + 20},20,${x},20`;
          return `<area shape="poly" location-id="${28 + index}" tg-coords="${coords}" coords="${coords}">`;
        }).join('') + '</map><img usemap="#clickareasVillage"></div>';
    };
    replaceLayout([17, 10, 10, 0]);
    setEnabled(true);
    document.querySelector('[data-qol-marketplace-layout]').click();
    action('reset');
    clickSpot(28);
    clickSpot(29);
    clickSpot(30);
    clickSpot(31);
    action('save');
    await wait();
    assert.deepEqual(JSON.parse(localStorage.getItem('qol_village_layout_v1')),
      [[28, 10], [29, 17], [30, 0], [31, 10]]);
    assert.deepEqual([28, 29, 30, 31].map(shift), ['100px', '-100px', '100px', '-100px']);

    replaceLayout([10, 0, 17, 10]);
    window.location.hash = '#/page:village/villId:202';
    await wait();
    assert.deepEqual([28, 29, 30, 31].map(shift), ['', '100px', '-100px', ''],
      'Same preset resolves against different real slots, including duplicate buildings');
    document.querySelector('[data-qol-marketplace-layout]').click();
    action('reset');
    action('cancel');
    await wait();
    assert.equal(shift(30), '-100px', 'Cancel restores the saved arrangement');
    document.querySelector('[data-qol-marketplace-layout]').click();
    action('reset');
    action('save');
    await wait();
    assert.equal(shift(30), '', 'Applying a reset restores the native arrangement');
    document.querySelector('[data-qol-marketplace-layout]').click();
    document.querySelector('[data-qol-layout-type="19"]').click();
    clickSpot(29);
    assert.match(document.querySelector('[data-qol-layout-slot="29"]').textContent, /Barracks/);
    assert.deepEqual(JSON.parse(localStorage.getItem('qol_village_layout_v1')), [], 'Draft stays separate until Apply');
    action('save');
    assert.deepEqual(JSON.parse(localStorage.getItem('qol_village_layout_v1')), [[29, 19]]);
    replaceLayout([10, 0, 17, 19]);
    await wait();
    assert.equal(shift(31), '-200px', 'An absent building type is placed when found in another village');

    document.querySelector('#villageView').remove();
    const gameStyle = document.createElement('style');
    gameStyle.textContent = '.viewBackground.village { background-image: url("https://test.kingdoms.com/village_view.jpg"); }';
    document.head.append(gameStyle);
    window.location.hash = '#/page:map';
    await wait();
    document.querySelector('[data-qol-marketplace-layout]').click();
    assert.ok(document.querySelector('dialog[open]'), 'Designer opens on the map with no village DOM');
    assert.match(document.querySelector('.qol-marketplace-layout-markers').style
      .getPropertyValue('--qol-village-art'), /village_view\.jpg/);
    assert.equal(document.querySelector('.viewBackground.village'), null, 'Artwork probe is removed');
    action('reset');
    const warehouse = document.querySelector('[data-qol-layout-type="10"]');
    assert.equal(warehouse.textContent, 'Warehouse');
    warehouse.click();
    clickSpot(29);
    assert.equal(document.querySelector('[data-qol-layout-slot="29"]').textContent, 'Warehouse');
    action('save');
    document.body.insertAdjacentHTML('beforeend', '<div id="villageView"></div>');
    replaceLayout([10, 0, 17, 19]);
    await wait();
    assert.equal(shift(28), '100px', 'A design applied outside the village is used when a village opens');

    const chooseType = type => document.querySelector(`[data-qol-layout-type="${type}"]`).click();
    document.querySelector('[data-qol-marketplace-layout]').click();
    action('reset');
    chooseType(17);
    clickSpot(42);
    chooseType(17);
    clickSpot(43);
    assert.match(document.querySelector('[data-qol-layout-slot="42"]').textContent, /Empty/);
    assert.match(document.querySelector('[data-qol-layout-slot="43"]').textContent, /Marketplace/);
    chooseType(10);
    clickSpot(28);
    chooseType(10);
    clickSpot(42);
    action('save');
    const preset = new Map(JSON.parse(localStorage.getItem('qol_village_layout_v1')));
    assert.equal(preset.get(28), 10);
    assert.equal(preset.get(42), 10, 'Warehouses can repeat');
    assert.equal(preset.get(43), 17);
    const village = document.querySelector('#villageView');
    village.insertAdjacentHTML('afterbegin', '<building-location class="buildingLocation43 free"></building-location>');
    village.querySelector('map').insertAdjacentHTML('beforeend',
      '<area shape="poly" location-id="43" tg-coords="970,815,990,815,990,840,970,840" coords="970,815,990,815,990,840,970,840">');
    await wait();
    assert.equal(shift(30), '770px', 'An unlocked extra plot can receive a real Marketplace');
    assert.equal(area(30).getAttribute('location-id'), '30', 'The moved area keeps its original game location');
  } finally {
    dom.window.close();
  }
}

test().then(() => console.log('Marketplace preview selection, native actions, redraw, scaling and cleanup passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
