// Run with: node tests/apesLibrary.cjs
// Regression guard: Travian globally skins native HTML buttons.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/features/apesLibrary.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/features/apesLibrary.css'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

assert.doesNotMatch(source, /<\/?button\b/i,
  'APES Library must not use native <button> elements (the game replaces their appearance)');
assert.doesNotMatch(source, /createElement\s*\(\s*['"]button['"]\s*\)/i,
  'The APES Library toolbar launcher must not be a native button');
assert.doesNotMatch(css, /#apes-library-panel\s+button\b/i,
  'Use scoped [role="button"] styling, not native button selectors');

const controls = source.match(/role="button" tabindex="0"/g) || [];
assert.equal(controls.length, 8, 'All Library controls should be independently keyboard-focusable');

assert.match(source, /closest\('\[role="button"\]'\)/,
  'Delegated clicks must handle role-button controls');
assert.match(source, /panel\.addEventListener\('keydown'/,
  'Enter/Space should activate APES Library controls');
assert.match(source, /button\.addEventListener\('keydown'/,
  'Toolbar source should be keyboard-accessible');
assert.match(source, /target\.click\(\)/, 'Keyboard handling activates the focused control');
assert.match(source, /setAttribute\('aria-disabled',String\(selected===0\)\)/,
  'Export action must carry an ARIA disabled state');
assert.match(source, /target\.getAttribute\('aria-disabled'\)==='true'/,
  'Disabled export actions must be blocked');
assert.match(css, /#apes-library-panel \[role="button"\]/,
  'APES Library needs explicit independent button styling');
assert.match(css, /\.apes-lib-primary\[aria-disabled="true"\]/,
  'Disabled export button needs matching CSS');
assert.match(source, /data-library-export-step/, 'Selective Roadmap export preserved');
assert.match(source, /data-library-export-confirm/, 'Export confirmation preserved');
assert.match(source, /data-library-toggle/, 'Library accordion preserved');
assert.match(source, /data-category/, 'Category accordions preserved');
assert.match(source, /data-library-guide/, 'Guide navigation preserved');
assert.ok(manifest.content_scripts.some(item =>
  item.js?.includes('js/features/apesLibrary.js') &&
  item.css?.includes('css/features/apesLibrary.css')
), 'Library content scripts and styles must be registered');

// The export control belongs next to the Guide badge, never after the steps.
const articleSource = source.slice(source.indexOf('  const CATEGORIES ='), source.indexOf('  function notify('));
const app = { APES: { roadmaps: { getAllRoadmaps: () => ({
  x3_speedsettle: {
    name: 'x3 Speedsettling',
    description: 'Existing official guide.',
    steps: [{ type: 'building', building: 'Warehouse', level: 1, buildingId: 10, exact: true }]
  }
}) } } };
const article = new Function('window', articleSource +
  '\nreturn { renderArticle, setPanel: value => panel = value, select: id => selectedId = id };'
)(app);
let html = '';
article.setPanel({ querySelector(selector) {
  return selector === '.apes-lib-article' ? {
    set innerHTML(value) { html = value; },
    get innerHTML() { return html; }
  } : null;
}});
article.select('speed_x3');
article.renderArticle();
const head = html.match(/<div class="apes-lib-article-head">([\s\S]*?)<\/div><\/div>/)?.[0];
assert.ok(head, 'Guide header is present');
assert.match(head, /apes-lib-pill[^>]*>Guide<\/span>[\s\S]*?data-library-export/,
  'Export action sits directly to the right of Guide badge');
assert.equal((html.match(/data-library-export(?=\s|>)/g) || []).length, 1,
  'Guide renders exactly one export action');
assert.ok(html.indexOf('data-library-export') < html.indexOf('apes-lib-steps'),
  'Export button is shown before the steps');
assert.doesNotMatch(html, /apes-lib-article-actions/,
  'Do not keep a redundant export action below the guide steps');
assert.match(css, /\.apes-lib-head-actions\{/,
  'Header badge and export share an APES styled action group');
assert.match(css, /\.apes-lib-head-export\{/,
  'Export action has compact header styling');
article.select('speed_x2');
article.renderArticle();
assert.doesNotMatch(html, /data-library-export(?=\s|>)/,
  'Unpublished guides do not offer export');
assert.match(html, /Coming soon/, 'Unpublished guide badge remains visible');

console.log('APES Library regression: native button collision prevented, keyboard and export controls preserved.');
