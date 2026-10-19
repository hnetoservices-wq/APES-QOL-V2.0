// Run with: node tests/resourcePlannerObserver.cjs
// Isolated regression checks for the planner's synchronous DOM event handling.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/modules/resourceUpgradePlanner/preference.js'), 'utf8');
function section(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Missing section: ${start}`);
  return source.slice(a, b);
}

let checks = 0;
const eq = (left, right) => { assert.equal(left, right); checks++; };

{
  const callbackSource = section('  function ensureCurrentVillageResults() {', '  function restoreActiveVillage(');
  let clicks = 0;
  let hasError = true;
  let resultsShown = false;
  const panel = () => ({
    querySelector(selector) {
      if (selector === '[data-error].show') return hasError ? {} : null;
      if (selector === '[data-results]') return { classList: { contains: () => resultsShown } };
      return null;
    }
  });
  const sandbox = {
    panel, panelIsOpen: () => true, appliedHasSavedState: true,
    restoreBusy: false, preparationPromise: null,
    plannerApi: () => ({ isScanning: () => false, hasVillageState: () => true }),
    roadmapWasActive: () => false, clickCalculate: () => { clicks++; return true; },
    restoreRoadmapTab: () => {}
  };
  vm.runInNewContext(callbackSource + '\nensureCurrentVillageResults();', sandbox);
  eq(clicks, 0); // A visible error must not trigger automatic retry.
  hasError = false;
  vm.runInNewContext(callbackSource + '\nensureCurrentVillageResults();', sandbox);
  eq(clicks, 1); // A valid missing result still gets one recovery attempt.
  resultsShown = true;
  vm.runInNewContext(callbackSource + '\nensureCurrentVillageResults();', sandbox);
  eq(clicks, 1); // Already-rendered results cannot trigger recalculation.
}

{
  const observerSource = section('  // Only watch for the panel', '  window.setInterval(');
  let callback, observedTarget, observedOptions, floatingUpdates = 0;
  const sandbox = {
    document: { body: { nodeName: 'BODY' } },
    PANEL_ID: 'qol-resource-upgrade-planner-overlay',
    Node: { ELEMENT_NODE: 1 },
    ensureFloatingWindow: () => { floatingUpdates++; },
    MutationObserver: class {
      constructor(fn) { callback = fn; }
      observe(target, options) { observedTarget = target; observedOptions = options; }
    }
  };
  vm.runInNewContext(observerSource, sandbox);
  eq(observedTarget, sandbox.document.body);
  eq(observedOptions.childList, true);
  eq(Boolean(observedOptions.subtree), false);
  eq(Boolean(observedOptions.attributes), false);
  callback([{ type: 'attributes', target: { id: 'qol-rup-error' },
    attributeName: 'class', addedNodes: [] }]);
  eq(floatingUpdates, 0); // In-panel or game class changes are ignored.
  callback([{ type: 'childList', addedNodes: [{ nodeType: 1, id: 'other-element' }] }]);
  eq(floatingUpdates, 0); // Non-planner elements are ignored.
  callback([{ type: 'childList', addedNodes: [{
    nodeType: 1, id: sandbox.PANEL_ID
  }] }]);
  eq(floatingUpdates, 1); // Only initial panel insertion triggers geometry setup.
}

console.log(`Resource Planner mutation/retry safeguards: ${checks} checks passed`);
