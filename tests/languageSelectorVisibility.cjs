const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
(async()=>{
 const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'js/ui/menu.js'),'utf8');
 const dom=new JSDOM('<!doctype html><style>select{display:none!important}button{display:none!important}</style><body></body>',{runScripts:'outside-only'}),w=dom.window;
 let saved={},fail=false;
 w.APES={};w.chrome={runtime:{getURL:v=>v},storage:{local:{get:(k,cb)=>cb(saved),set:(v,cb)=>{if(fail)w.chrome.runtime.lastError={message:'failed'};else Object.assign(saved,v);cb();delete w.chrome.runtime.lastError;}},onChanged:{addListener(){}}}};
 for(const f of ['js/locales/catalogs.js','js/core/i18n.js'])w.eval(fs.readFileSync(path.join(root,f),'utf8'));
 await w.APES.i18n.ready;
 for(const name of ['KEYBINDS','BASIC_FEATURES','ADVANCED_FEATURES','KINGDOM_MANAGEMENT_FEATURES','COSMETIC_FEATURES'])w[name]=[];
 w.keybindHtml=w.featureCardHtml=w.themePickerHtml=()=>'';w.escapeHtml=String;w.apesHtml_menu=w.APES.i18n.html;
 const a=source.indexOf('function buildSettingsMarkup() {'),b=source.indexOf('function reconcileCanonicalFeatureCards(',a);
 w.eval(source.slice(a,b));w.document.body.innerHTML=w.buildSettingsMarkup();
 const c=source.indexOf('function bindLanguageSelector(overlay) {'),d=source.indexOf('function bindMenuShell(overlay)',c);w.eval(source.slice(c,d));w.bindLanguageSelector(w.document.body);
 const buttons=[...w.document.querySelectorAll('[data-apes-language]')];
 assert.deepEqual(buttons.map(x=>x.dataset.apesLanguage),['en','pt-PT','es-ES','fr','ru','cs','de','it','pl','ro']);
 for(const button of buttons){
  const css=w.getComputedStyle(button);assert.equal(css.display,'inline-flex');assert.equal(css.visibility,'visible');assert.equal(css.pointerEvents,'auto');
  button.click();await new Promise(r=>w.setTimeout(r,0));
  assert.equal(saved[w.APES.i18n.STORAGE_KEY],button.dataset.apesLanguage);assert.equal(button.getAttribute('aria-pressed'),'true');
  assert.equal(w.document.querySelector('#qol-language-title').textContent,w.APES.i18n.t('Extension language'));
 }
 buttons[1].dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await new Promise(r=>w.setTimeout(r,0));assert.equal(w.APES.i18n.getLanguage(),'pt-PT');
 fail=true;buttons[3].click();await new Promise(r=>w.setTimeout(r,0));assert.equal(w.APES.i18n.getLanguage(),'pt-PT');assert.ok(w.document.querySelector('[data-apes-language-status]').textContent);assert.equal(buttons[1].getAttribute('aria-pressed'),'true');
 dom.window.close();console.log('Actual localized settings: all ten visible choices, mouse selection, keyboard selection, persistence, selected state and save failure passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
