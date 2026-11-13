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
    choose.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(shift(28), '', 'Picker shows the native layout');
    assert.equal(document.querySelector('[data-qol-layout-slot="33"]'), null, 'Wall cannot be selected');
    document.querySelector('[data-qol-layout-slot="29"]').click();
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

    const resized = '45,40,55,40,55,50,45,50';
    area(28).setAttribute('coords', resized);
    await wait();
    assert.equal(area(28).getAttribute('coords'), '95,70,105,70,105,80,95,80');

    const view = document.querySelector('#villageView');
    view.querySelector('.buildingId17').classList.replace('buildingId17', 'buildingId8');
    await wait();
    assert.equal(shift(28), '', 'A village without a Marketplace keeps its native positions');

    view.parentElement.innerHTML = markup;
    await wait();
    assert.equal(shift(28), '100px', 'The saved spot is reapplied on a fresh village render');
    area(28).setAttribute('coords', resized);
    await wait();
    setEnabled(false);
    await wait();
    assert.equal(shift(28), '');
    assert.equal(area(28).getAttribute('coords'), resized, 'Disabling restores the latest native polygon');
  } finally {
    dom.window.close();
  }
}

test().then(() => console.log('Marketplace preview selection, native actions, redraw, scaling and cleanup passed.'))
  .catch(error => { console.error(error); process.exitCode = 1; });
