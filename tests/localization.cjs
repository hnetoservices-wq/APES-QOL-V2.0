const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const assert = require('node:assert/strict');
(async () => {
 const dom = new JSDOM('<!doctype html><body><div id="ui"></div><p id="player">Settings</p>', { runScripts: 'outside-only' });
 const w = dom.window; let saved = {}; let fail = false;
 w.APES = {};
 w.chrome = { runtime: {}, storage: { local: {
 get: (key, cb) => cb(saved), set: (value, cb) => { if (fail) w.chrome.runtime.lastError = {message:'failed'}; else Object.assign(saved,value); cb(); delete w.chrome.runtime.lastError; }
 }, onChanged: {addListener() {}} } };
 for (const file of ['js/locales/catalogs.js','js/core/i18n.js']) w.eval(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'));
 const i = w.APES.i18n; await i.ready;
 const ui = w.document.querySelector('#ui');
 ui.innerHTML = i.html`<h1>Extension language</h1><input title="Language"><p>${'Settings'}</p>`;
 for (const {code} of i.languages) {
  await i.setLanguage(code); assert.equal(saved[i.STORAGE_KEY],code);
  assert.equal(ui.querySelector('h1').textContent,i.t('Extension language'));
  assert.equal(ui.querySelector('input').title,i.t('Language'));
  assert.equal(ui.querySelector('p').textContent,'Settings');
  assert.equal(w.document.querySelector('#player').textContent,'Settings');
 }
 await assert.rejects(i.setLanguage('xx'));
 fail = true; await assert.rejects(i.setLanguage('fr')); assert.equal(i.getLanguage(),'it');
 fail = false; await i.setLanguage('pt-PT');
 const dynamic = w.document.createElement('div'); dynamic.innerHTML = i.html`<b>Language</b>`; ui.append(dynamic);
 await new Promise(resolve => w.setTimeout(resolve,0)); assert.equal(dynamic.textContent,'Idioma');
 for (const catalog of Object.values(w.APES.localeCatalogs)) { assert.equal(Object.keys(catalog).length,491); assert.ok(Object.values(catalog).every(value=>value.trim())); }
 dom.window.close(); console.log('Localization: eight languages, persistence, switching, attributes, dynamic UI, data isolation and save failures passed.');
})();
