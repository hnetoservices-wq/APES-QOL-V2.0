'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/features/poopScanner.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/features/poopScanner.css'), 'utf8');

assert.doesNotThrow(() => new Function(src));
assert.match(css, /resize:both!important/, 'Panel can be resized in both directions');
assert.match(css, /width:min\(780px,calc\(100vw - 40px\)\);height:/,
  'Default panel dimensions must not use !important or override native CSS resizing');
assert.match(css, /min-width:min\(420px,calc\(100vw - 24px\)\)!important/);
assert.match(css, /max-width:calc\(100vw - 24px\)!important/);
assert.match(css, /padding:4px 6px!important/, 'Both tables use compact row padding');
assert.match(css, /line-height:14px!important/, 'Table rows use a compact line height');
assert.match(css, /\.apes-poop-scroll \{[\s\S]*?flex:1 1 auto!important/,
  'Saved villages table fills remaining window height');
assert.match(css, /\.apes-poop-results \{[\s\S]*?max-height:45%!important/,
  'Attack summary adapts to available window height');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url:'https://tr2nx3.kingdoms.com/#/page:map',
  runScripts:'outside-only'
});
const { window } = dom;
window.isQolEnabled = () => true;
window.APES = { ui: {closeOtherTools() {}}, actions: {register() {}} };
Object.defineProperty(window,'innerWidth',{configurable:true,writable:true,value:1000});
Object.defineProperty(window,'innerHeight',{configurable:true,writable:true,value:800});
window.eval(src);
const api = window.APES_POOP_SCANNER;
assert.ok(api);
const panel = window.document.querySelector('#apes-poop-panel');
assert.ok(panel && panel.__apesPoopDrag, 'POOP panel initialized with one drag handler');

let panelWidth=600,panelHeight=400;
Object.defineProperty(panel,'offsetWidth',{configurable:true,get:()=>panelWidth});
Object.defineProperty(panel,'offsetHeight',{configurable:true,get:()=>panelHeight});
panel.getBoundingClientRect=()=>({
  left:Number.parseFloat(panel.style.left)||300,
  top:Number.parseFloat(panel.style.top)||75,
  width:panelWidth,height:panelHeight,
  right:(Number.parseFloat(panel.style.left)||300)+panelWidth,
  bottom:(Number.parseFloat(panel.style.top)||75)+panelHeight
});
api.open();
assert.ok(panel.classList.contains('is-open'));
assert.equal(panel.style.left,'300px','First opening preserves initial right-anchored location');
assert.equal(panel.style.right,'auto','Resizing grows to the right');

const header = panel.querySelector('.apes-poop-head');
const pointer=(type,clientX,clientY,target=header)=>{
  target.dispatchEvent(new window.MouseEvent(type,{
    bubbles:true,button:0,clientX,clientY
  }));
};
pointer('pointerdown',350,96);
pointer('pointermove',500,196,window);
assert.equal(panel.style.left,'400px','Dragging is clamped to right viewport edge');
assert.equal(panel.style.top,'175px','Header moves window vertically');
pointer('pointerup',500,196,window);
pointer('pointermove',100,100,window);
assert.equal(panel.style.left,'400px','Window stops moving after pointerup');

pointer('pointerdown',440,180);
pointer('pointermove',0,0,window);
assert.equal(panel.style.left,'0px','Dragging is clamped to left edge');
assert.equal(panel.style.top,'0px','Dragging is clamped to top edge');
pointer('pointerup',0,0,window);

// Native resize changes dimensions. The resize observer/window resize must
// keep the position visible rather than trapping the drag handle offscreen.
panel.style.left='360px';panel.style.top='350px';
panelWidth=760;panelHeight=530;
window.dispatchEvent(new window.Event('resize'));
assert.equal(panel.style.left,'240px');
assert.equal(panel.style.top,'270px');

// Closing via the header button must never start a dragging gesture.
const close=panel.querySelector('.apes-poop-close');
pointer('pointerdown',650,95,close);
pointer('pointermove',700,150,window);
assert.equal(panel.style.left,'240px','Close button is excluded from dragging');
close.click();
assert.ok(!panel.classList.contains('is-open'));
api.open();
assert.ok(panel.classList.contains('is-open'),'Panel still opens normally after closing');

dom.window.close();
console.log('POOP layout: two-axis resize CSS, compact rows, header-only dragging, viewport clamping and close/reopen passed.');
