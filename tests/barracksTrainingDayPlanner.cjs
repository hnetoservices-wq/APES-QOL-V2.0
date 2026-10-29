'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const rootDir = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(rootDir, 'js/modules/barracksTraining/dayPlanner.js'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'css/features/barracksTrainingDayPlanner.css'), 'utf8');
const menu = fs.readFileSync(path.join(rootDir, 'js/ui/menu.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
assert.doesNotThrow(() => new Function(src));
assert.equal((css.match(/{/g) || []).length, (css.match(/}/g) || []).length);
assert.match(css, /description.qol-training24-original/);
assert.match(css, /qol-training24-plan/);
assert.match(menu, /key: 'barracks24hPlanner'/);
const main = manifest.content_scripts.find(part => part.world === 'MAIN');
const isolated = manifest.content_scripts.find(part => part.world !== 'MAIN');
assert.ok(main.js.includes('js/modules/barracksTraining/dayPlanner.js'));
assert.ok(isolated.css.includes('css/features/barracksTrainingDayPlanner.css'));
assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|\.click\s*\(|dispatchEvent\s*\(/);

class Node {
  set className(value) {
    this._className = String(value);
    this.classes = new Set(this._className.split(/\s+/).filter(Boolean));
  }
  get className() { return this._className; }
  constructor(tag) {
    this.tagName = tag;
    this._text = '';
    this.className = '';
    this.classes = new Set();
    this.children = [];
    this.dataset = {};
    this.parentElement = null;
    this.classList = {
      add: value => { this.classes.add(value); this.className = Array.from(this.classes).join(' '); },
      remove: value => { this.classes.delete(value); this.className = Array.from(this.classes).join(' '); },
      contains: value => this.classes.has(value)
    };
  }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get previousElementSibling() {
    if (!this.parentElement) return null;
    const siblings = this.parentElement.children;
    return siblings[siblings.indexOf(this) - 1] || null;
  }
  appendChild(node) { node.parentElement = this; this.children.push(node); return node; }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  insertAdjacentElement(position, node) {
    assert.equal(position, 'afterend');
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this) + 1, 0, node);
    node.parentElement = this.parentElement;
  }
  setAttribute(name, value) { this[name] = value; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const classname = sel.slice(1);
    const walk = node => node.children.flatMap(child =>
      (child.classList.contains(classname) ? [child] : []).concat(walk(child)));
    return walk(this);
  }
}
const cell = new Node('td'), description = new Node('div');
description.classList.add('description');
description.textContent = 'Original unit description';
cell.appendChild(description);
const icon = { getAttribute: name => name === 'data' ? unitId : null };
const info = {querySelector: sel => sel === '.description' ? description :
  sel === '.unitHeader .unitIcon[data]' ? icon : null };
let time = '00:02:08', unitId = '11', fallbackTime = '128';
const fallback = { wood: '85', clay: '65', iron: '30' };
const footer = {
  getAttribute: name => name === 'time' ? fallbackTime : null,
  querySelector(sel) {
    if (sel === '.timeValue') return {textContent:time};
    const type = sel.match(/^\.(wood|clay|iron)Value \.resourceValue$/)?.[1];
    return type ? {textContent:fallback[type]} : null;
  }
};
const unitRoot = {
  querySelector: sel => sel === 'table.unitInfo' ? info :
    sel === 'display-resources.costsFooter' ? footer : null,
  querySelectorAll: sel => sel === '.qol-training24-plan' ||
    sel === '.qol-training24-original' ? cell.querySelectorAll(sel) : []
};
const document = {
  readyState:'loading',
  createElement:tag => new Node(tag),
  querySelectorAll:sel => sel.includes('buildingType19') ? [unitRoot] : [],
  addEventListener(){}
};
let on=true, runner=null;
const window = {
  localStorage:{getItem:()=>on?null:'false'},
  setInterval:fn=>{runner=fn},
  Travian:{Config:{troopConfig:{
    11:{costs:{1:85,2:65,3:30,4:0}},
    12:{costs:{1:125,2:50,3:65,4:0}}
  }}}
};
new Function('window','document',src)(window,document);
assert.equal(typeof runner,'function');
runner();
let plan=cell.querySelector('.qol-training24-plan');
assert.ok(plan,'24h plan inserted');
assert.ok(description.classList.contains('qol-training24-original'),'Original description hidden, not destroyed');
assert.match(plan.textContent,/675 units \/ 24h/);
assert.match(plan.textContent,/00:02:08 each/);
assert.match(plan.textContent,/57,375/);
assert.match(plan.textContent,/43,875/);
assert.match(plan.textContent,/20,250/);
assert.match(plan.textContent,/Total: 121,500 Resources \| 5,062\.5 Resources\/hour/);
assert.equal(plan.children[3].children[1].tagName, 'em', 'Hourly figure is italicized');
assert.ok(plan.children[3].children[1].classList.contains('qol-training24-hourly'));
assert.match(css, /qol-training24-hourly/);
assert.equal(plan.children[2].children.length,3,'Three individually itemized resources');
runner();
assert.equal(cell.querySelectorAll('.qol-training24-plan').length,1,'Never inject duplicates');
assert.equal(cell.querySelector('.qol-training24-plan'),plan,'Do not recreate unchanged summary');

unitId='12';time='00:05:00';
fallback.wood='125';fallback.clay='50';fallback.iron='65';runner();
plan=cell.querySelector('.qol-training24-plan');
assert.match(plan.textContent,/288 units \/ 24h/);
assert.match(plan.textContent,/36,000/);
assert.match(plan.textContent,/14,400/);
assert.match(plan.textContent,/18,720/);
assert.match(plan.textContent,/Total: 69,120 Resources \| 2,880 Resources\/hour/);
assert.doesNotMatch(plan.textContent,/57,375/);

time='00:02:09';runner();
plan=cell.querySelector('.qol-training24-plan');
assert.match(plan.textContent,/669 units \/ 24h/);
assert.match(plan.textContent,/queue one extra/,'Partial trailing unit mentioned when duration does not divide 24h');

// In-game displayed unit costs take precedence over static troopConfig.
time='00:02:08';fallback.wood='130';runner();
plan=cell.querySelector('.qol-training24-plan');
assert.match(plan.textContent,/87,750/,'Current displayed wood cost of 130 must override the static 125');
assert.match(plan.textContent,/Total: 165,375 Resources \| 6,890\.63 Resources\/hour/,'Hourly average updates with displayed costs');

on=false;runner();
assert.equal(cell.querySelector('.qol-training24-plan'),null,'Disabling removes replacement');
assert.ok(!description.classList.contains('qol-training24-original'),'Disabling restores translated description');
on=true;time='bad';fallbackTime='bad';runner();
assert.equal(cell.querySelector('.qol-training24-plan'),null,'Do not create summary when timing cannot be trusted');
time='00:02:08';runner();
assert.equal(cell.querySelectorAll('.qol-training24-plan').length,1,'Re-enable cleanly');
assert.ok(description.classList.contains('qol-training24-original'));

console.log('Barracks 24h Planner: example costs, selected unit switch, incomplete cycles, deduplication, fail-open and toggle passed.');
