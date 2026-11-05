const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/ui/menu.js'),'utf8');
const start=source.indexOf('function buildSettingsMarkup() {'),end=source.indexOf('function reconcileCanonicalFeatureCards(',start);
const markup=vm.runInNewContext(source.slice(start,end)+'\nbuildSettingsMarkup()',{
 chrome:{runtime:{getURL:v=>v}},apesHtml_menu:(s,...v)=>String.raw({raw:s},...v),
 KEYBINDS:[],BASIC_FEATURES:[],ADVANCED_FEATURES:[],KINGDOM_MANAGEMENT_FEATURES:[],COSMETIC_FEATURES:[],
 keybindHtml:()=>'',featureCardHtml:()=>'',themePickerHtml:()=>'',escapeHtml:String,window:{location:{hostname:'test.kingdoms.com'}}
});
const dom=new JSDOM('<style>select{display:none;visibility:hidden;opacity:0;width:0;height:0;appearance:none;position:absolute;pointer-events:none}</style>'+markup);
const select=dom.window.document.querySelector('#qol-language-select'),css=dom.window.getComputedStyle(select);
assert.ok(select); assert.equal(select.options.length,8);
for(const [key,value] of Object.entries({display:'inline-block',visibility:'visible',opacity:'1',width:'220px',height:'34px',position:'static',pointerEvents:'auto'})) assert.equal(css[key],value,key);
for(const key of ['display','visibility','opacity','width','height','appearance','pointer-events']) assert.equal(select.style.getPropertyPriority(key),'important');
assert.deepEqual([...select.options].map(o=>o.value),['en','pt-PT','es-ES','fr','ru','cs','de','it']);
assert.equal(dom.window.document.querySelector('label[for="qol-language-select"]').textContent,'Extension language');
dom.window.close(); console.log('Language selector remains visible and usable under host-page select-hiding styles.');
