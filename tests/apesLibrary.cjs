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

console.log('APES Library regression: native button collision prevented, keyboard and export controls preserved.');
