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
 assert.deepEqual(Array.from(i.languages, language=>language.code),['en','pt-PT','es-ES','fr','ru','cs','de','it','pl']);
 assert.equal(Object.keys(w.APES.localeCatalogs.pl).length,Object.keys(w.APES.localeCatalogs['pt-PT']).length);
 const ui = w.document.querySelector('#ui');
 const fragment = w.document.createElement('div');
 fragment.innerHTML = i.html`<a href="` + '/map' + '">Open map</a>';
 assert.equal(fragment.querySelector('a')?.getAttribute('href'), '/map', 'Split opening tags must stay markup');
 assert.equal(fragment.textContent, 'Open map');
 ui.innerHTML = i.html`<h1>Extension language</h1><input title="Language"><p>${'Settings'}</p>`;
 for (const {code} of i.languages) {
  await i.setLanguage(code); assert.equal(saved[i.STORAGE_KEY],code);
  assert.equal(ui.querySelector('h1').textContent,i.t('Extension language'));
  assert.equal(ui.querySelector('input').title,i.t('Language'));
  assert.equal(ui.querySelector('p').textContent,'Settings');
  assert.equal(w.document.querySelector('#player').textContent,'Settings');
 }
 await assert.rejects(i.setLanguage('xx'));
 fail = true; await assert.rejects(i.setLanguage('fr')); assert.equal(i.getLanguage(),'pl');
 fail = false; await i.setLanguage('pt-PT');
 const dynamic = w.document.createElement('div'); dynamic.innerHTML = i.html`<b>Language</b>`; ui.append(dynamic);
 await new Promise(resolve => w.setTimeout(resolve,0)); assert.equal(dynamic.textContent,'Idioma');
 for (const catalog of Object.values(w.APES.localeCatalogs)) { assert.ok(Object.keys(catalog).length >= 870); assert.ok(Object.values(catalog).every(value=>value.trim())); }
 await i.setLanguage('pl');
 assert.equal(i.t('Extension language'),'Język rozszerzenia');
 assert.equal(i.t('Update current watchlist'),'Aktualizuj bieżącą listę obserwowanych');
 assert.equal(i.t('Open map'),'Otwórz mapę');
 assert.equal(i.number(1234.5),new Intl.NumberFormat('pl').format(1234.5));
 const reload=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only'});
 reload.window.APES={};reload.window.chrome=w.chrome;
 for(const file of ['js/locales/catalogs.js','js/core/i18n.js'])reload.window.eval(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'));
 await reload.window.APES.i18n.ready;
 assert.equal(reload.window.APES.i18n.getLanguage(),'pl','Saved Polish preference survives reload');
 reload.window.close();
 dom.window.close(); console.log('Localization: nine languages, persistence, switching, attributes, dynamic UI, data isolation and save failures passed.');
})();
