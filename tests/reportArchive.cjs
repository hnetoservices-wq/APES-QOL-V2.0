// Install DOM test dependency with: npm install --prefix tests
// Run with: node tests/reportArchive.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let checks = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); checks++; };
const source = fs.readFileSync(path.join(__dirname, '../js/features/reportArchive.js'), 'utf8');
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://trickandtreat.kingdoms.com/', runScripts: 'outside-only'
});
const { window } = dom;
const { document } = window;
// Expose private functions only inside this test; skip startup observers/UI.
vm.runInContext(source.replace("  if (document.readyState === 'loading') {", `
  window.testArchive = { captureReport, sanitizeStoredHtml, sanitizeSnapshot,
    getCompactBodyHtml, buildCompactReportHtml, refreshStoredReport };
  return;
  if (document.readyState === 'loading') {`), dom.getInternalVMContext());
const api = window.testArchive;
const parse = html => {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
};
// Exact building DOM from the supplied live report, with no player information.
const residence = `<div ng-if="infoModules.damage" class="buildingInfo"
  ng-repeat="building in infoModules.damage track by $index">
  <span class="buildingLarge buildingType25 tribeId2" tooltip=""
    tooltip-translate="Building_25"></span>
  <div>10\n<span class="finalLevel">0</span></div>
</div>`;
const report = parse(`<section><div class="reportBody fightReport">
  <div class="buildingsModule"><span class="caption">Buildings</span>
  <div class="buildingsContainer">${residence}</div></div>
  <table class="troopsTable"><tr><td>500</td><td>20</td></tr></table>
</div></section>`).firstChild;
const icon = report.querySelector('.buildingLarge');
// Simulate a sprite rule scoped to the original game popup.
const originalComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = node => node === icon ? {
  getPropertyValue: property => ({
    'background-image': 'url("https://static.kingdoms.com/buildings.png")',
    'background-position': '-120px -60px', 'background-size': '600px 400px',
    'background-repeat': 'no-repeat', width: '60px', height: '60px',
    display: 'inline-block'
  })[property] || ''
} : originalComputedStyle(node);
const saved = api.captureReport(report);
const body = parse(saved.bodyHtml);
equal(body.querySelector('.qol-ra-building-name').textContent, 'Residence');
equal(body.querySelector('.qol-ra-building-levels').textContent, '10 → 0 (destroyed)');
equal(body.querySelector('.buildingLarge').title, 'Residence');
equal(body.querySelector('.buildingLarge').style.backgroundPosition, '-120px -60px');
equal(body.querySelector('.buildingLarge').style.width, '60px');
equal(body.querySelector('.buildingLarge').style.backgroundImage.includes('buildings.png'), true);
equal(body.querySelector('[tooltip-translate], [ng-repeat], [ng-if]'), null);
equal(body.querySelector('.troopsTable').textContent, '50020');
equal(report.querySelector('.qol-ra-building-name'), null);
equal(icon.getAttribute('tooltip-translate'), 'Building_25');
equal(api.sanitizeStoredHtml(saved.bodyHtml), saved.bodyHtml);
equal(api.sanitizeStoredHtml(saved.snapshotHtml).includes('Residence'), true);

// Previous archives have no tooltip, but retain the sprite's building type.
const legacy = residence.replace(/\s(?:tooltip|tooltip-translate|ng-if|ng-repeat)="[^"]*"/g, '');
const oldBody = `<div class="reportBody fightReport">${legacy}</div>`;
const old = { bodyHtml: oldBody };
const recovered = parse(api.getCompactBodyHtml(old));
equal(recovered.querySelector('.qol-ra-building-name').textContent, 'Residence');
equal(recovered.querySelector('.qol-ra-building-levels').textContent, '10 → 0 (destroyed)');
equal(old.bodyHtml, oldBody); // Opening does not rewrite existing archive data.
equal(parse(api.buildCompactReportHtml(old)).querySelector('.qol-ra-building-name').textContent, 'Residence');
const snapshotOnly = { snapshotHtml: `<section>${oldBody}</section>` };
equal(parse(api.getCompactBodyHtml(snapshotOnly)).querySelector('.qol-ra-building-name').textContent, 'Residence');
equal(snapshotOnly.bodyHtml.includes('10 → '), true);
equal(api.sanitizeStoredHtml(snapshotOnly.bodyHtml), snapshotOnly.bodyHtml);

const partial = residence.replaceAll('25', '10').replace('>10\n', '>\u202a20\u202c\n').replace('>0<', '>\u202a12\u202c<');
const scout = `<div class="buildingInfo"><span class="buildingLarge buildingType32 tribeId2"></span><div>15</div></div>`;
const multiple = parse(api.sanitizeStoredHtml(`${residence}${partial}${scout}`));
equal([...multiple.querySelectorAll('.qol-ra-building-name')].map(n => n.textContent).join('|'), 'Residence|Warehouse|Earth Wall');
equal(multiple.querySelectorAll('.qol-ra-building-levels')[1].textContent, '20 → \u202a12\u202c');
equal(multiple.querySelectorAll('.qol-ra-building-levels')[1].textContent.includes('destroyed'), false);
equal(multiple.querySelectorAll('.qol-ra-building-levels').length, 2);
equal(multiple.querySelectorAll('.buildingInfo')[2].lastElementChild.textContent, '15');

// Tooltip-only IDs, unknown types, and unsupported level formats remain honest.
const unknown = residence.replace('buildingType25 ', '').replace('Building_25', 'Building_999');
equal(parse(api.sanitizeStoredHtml(unknown)).querySelector('.qol-ra-building-name').textContent, 'Building #999');
const hidden = residence.replace('>10\n', '>?\n');
equal(parse(api.sanitizeStoredHtml(hidden)).querySelector('.qol-ra-building-levels'), null);
const noType = residence.replace('buildingType25 ', '').replace('Building_25', 'unknown');
equal(parse(api.sanitizeStoredHtml(noType)).querySelector('.qol-ra-building-name'), null);
equal(parse(api.sanitizeStoredHtml(residence.replace('>10\n', '>0\n'))).querySelector('.qol-ra-building-levels').textContent, '0 → 0');

// Re-saving a report replaces its body/snapshot without changing its folder.
const stored = { id: 'existing', folderId: 'attacks', bodyHtml: oldBody };
api.refreshStoredReport(stored, saved);
equal(stored.id, 'existing');
equal(stored.folderId, 'attacks');
equal(stored.bodyHtml, saved.bodyHtml);
equal(stored.snapshotHtml, saved.snapshotHtml);

// The additional labels must not weaken existing snapshot sanitization.
const unsafe = api.sanitizeStoredHtml(`${residence}<script>alert(1)</script>
  <a href="javascript:alert(1)" onclick="alert(1)" ng-click="run()" tooltip="">link</a>`);
const safe = parse(unsafe);
equal(safe.querySelector('script'), null);
equal(safe.querySelector('[onclick], [href], [ng-click], [tooltip]'), null);
equal(safe.querySelector('a').getAttribute('aria-disabled'), 'true');
dom.window.close();
console.log(`Report Archive: ${checks} checks passed`);
