const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

async function test() {
  const dom = new JSDOM(`
    <div id="villageList"><div class="currentVillageName">
      <a class="navigation previous">Previous</a>
      <div class="dropdownHead">Village</div>
      <a class="navigation next">Next</a>
    </div></div>
    <div class="qol-wl-action-btn primary" role="button" tabindex="0" data-qol-edit-village-order>Reorder villages</div>
  `, { url: 'https://test.kingdoms.com', runScripts: 'outside-only' });
  const { window } = dom;
  const { document, localStorage } = window;
  const account = 'qol_custom_village_order:test.kingdoms.com:7';
  const panelClass = 'dropdownBody villageListDropDown scrollable openDownwards';
  const header = document.querySelector('.dropdownHead');
  const next = document.querySelector('.navigation.next');
  const previous = document.querySelector('.navigation.previous');
  let nativeClicks = 0;
  let selected = '101';
  let ids = ['101', '102', '103'];
  window.APES = { context: {
    getServer: () => window.location.hostname,
    getPlayerId: () => '7',
    isPlayerResolved: () => true
  } };
  window.isQolEnabled = key => localStorage.getItem(`qol_${key}`) === 'true';
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };
  for (const arrow of [next, previous]) arrow.addEventListener('click', () => nativeClicks++);
  function closeList() {
    header.classList.remove('opened');
    document.querySelector('.villageListDropDown')?.remove();
  }
  header.addEventListener('click', () => {
    if (header.classList.contains('opened')) {
      closeList();
      return;
    }
    header.classList.add('opened');
    const panel = document.createElement('div');
    panel.className = panelClass;
    panel.innerHTML = '<ul></ul>';
    const list = panel.querySelector('ul');
    for (const id of ids) {
      const row = document.createElement('li');
      row.className = `dropdownOption dropDownItem${id}${selected === id ? ' selected' : ''}`;
      row.innerHTML = `<div class="villageEntry">Village ${id}</div>`;
      row.addEventListener('click', () => {
        selected = id;
        closeList();
      });
      list.append(row);
    }
    document.body.append(panel);
  });
  const tick = () => new Promise(resolve => window.setTimeout(resolve, 0));
  function setEnabled(value) {
    localStorage.setItem('qol_customVillageOrder', String(value));
    window.dispatchEvent(new window.CustomEvent('qol_setting_changed', { detail: { key: 'customVillageOrder' } }));
  }
  function press(control, key) {
    control.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }
  async function openEditor() {
    press(document.querySelector('[data-qol-edit-village-order]'), 'Enter');
    await tick();
    return document.querySelector('dialog');
  }

  try {
    window.eval(fs.readFileSync(path.join(__dirname, '../js/features/customVillageOrder.js'), 'utf8'));
    next.click();
    assert.equal(nativeClicks, 1);
    assert.equal(await openEditor(), null);

    setEnabled(true);
    const editor = await openEditor();
    assert.equal(editor.querySelector('button'), null);
    const disabled = editor.querySelector('[data-village-id="101"] [data-step="-1"]');
    assert.equal(disabled.getAttribute('aria-disabled'), 'true');
    press(disabled, 'Enter');
    assert.equal(editor.querySelector('li').dataset.villageId, '101');
    press(editor.querySelector('[data-village-id="103"] [data-step="-1"]'), ' ');
    assert.equal(document.activeElement.closest('li').dataset.villageId, '103');
    editor.querySelector('[data-action="save"]').click();
    assert.deepEqual(JSON.parse(localStorage.getItem(account)), ['101', '103', '102']);

    ids.push('104');
    header.click();
    await tick();
    const orders = () => [...document.querySelectorAll('.villageListDropDown li')]
      .map(row => row.style.getPropertyValue('--qol-village-order'));
    assert.deepEqual(orders(), ['0', '2', '1', '3']);

    next.click();
    await tick();
    assert.equal(selected, '103');
    assert.equal(nativeClicks, 1);
    previous.click();
    await tick();
    assert.equal(selected, '101');
    previous.click();
    await tick();
    assert.equal(selected, '104');

    header.click();
    await tick();
    setEnabled(false);
    assert.deepEqual(orders(), ['', '', '', '']);
    next.click();
    assert.equal(nativeClicks, 2);
    closeList();

    setEnabled(true);
    const resetEditor = await openEditor();
    resetEditor.querySelector('[data-action="reset"]').click();
    resetEditor.querySelector('[data-action="save"]').click();
    assert.equal(localStorage.getItem(account), null);
    next.click();
    assert.equal(nativeClicks, 3);
  } finally {
    dom.window.close();
  }
}
test().then(() => console.log('Custom village order editor, dropdown and navigation passed.')).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
