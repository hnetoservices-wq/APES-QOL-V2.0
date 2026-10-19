// Run with: node tests/settingsMenu.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ui/menu.js'), 'utf8');
const begin = source.indexOf('function buildSettingsMarkup() {');
const end = source.indexOf('function reconcileCanonicalFeatureCards(', begin);
assert.ok(begin >= 0 && end > begin, 'Settings markup function must exist');
const requestedAssets = [];
const markup = vm.runInNewContext(source.slice(begin, end) + '\nbuildSettingsMarkup()', {
  chrome: { runtime: { getURL: asset => { requestedAssets.push(asset); return `chrome-extension://test-id/${asset}`; } } },
  KEYBINDS: [], BASIC_FEATURES: [], ADVANCED_FEATURES: [],
  KINGDOM_MANAGEMENT_FEATURES: [], COSMETIC_FEATURES: [],
  keybindHtml: () => '', featureCardHtml: () => '',
  themePickerHtml: () => '', escapeHtml: value => String(value),
  window: { location: { hostname: 'trickandtreat.kingdoms.com' } }
});

const target = 'https://chromewebstore.google.com/detail/apes-qol-20-beta/fdlfjnpobgajblbcimfpcmajhodphifi';
const footer = markup.match(/<div class="qol-modal-footer">([\s\S]*?)<span class="qol-footer-hint">/);
assert.ok(footer, 'Settings footer should be present');
const anchor = footer[1].match(/<a\s+[^>]*class="qol-footer-action qol-check-updates-link"[^>]*>Check for Updates<\/a>/);
assert.ok(anchor, 'Footer has the requested link');
assert.ok(anchor[0].includes(`href="${target}"`), 'Opens the expected Web Store listing');
assert.ok(anchor[0].includes('target="_blank"'), 'Opens in a new tab');
assert.ok(anchor[0].includes('rel="noopener noreferrer"'), 'Does not transmit a referrer');
assert.ok(markup.includes('Manage Storage') && markup.includes('♡ Thank You'), 'Existing footer controls remain');

assert.ok(markup.includes('reported bugs throughout its development.</p>'));
assert.ok(!markup.includes('reported bugs throughout its developmen</p>'));
assert.ok(!markup.includes('She is an actual saint for putting up with me.'));
assert.ok(markup.includes('leave me alone.”</p>'));

const expectedNote = "And a big thank you to a very special someone I never had the chance to meet but whom I miss terribly. You've never made a sound, yet you still keep me up at night. Your tiny weight is the heaviest I'll ever carry. I'm a humbler man now. I will carry you with me forever.";
assert.ok(markup.includes(expectedNote + '<span class="qol-thank-tree"'), 'Memorial matches the requested text');
assert.ok(markup.includes('role="img" aria-label="Tree">🌳</span>'), 'Tree remains');
assert.ok(!markup.includes('Rest easy knowing I will carry you'));

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
assert.deepEqual(manifest.permissions, ['storage', 'unlimitedStorage'], 'No new permissions');
assert.ok(!source.includes('fetch(') && !source.includes('XMLHttpRequest'), 'Settings does not make an update-check request');

assert.deepEqual(requestedAssets, ['images/apege.png'], 'Header resolves the packaged asset through runtime.getURL');
assert.ok(markup.includes('<span class="qol-brand-mark" aria-hidden="true"><img src="chrome-extension://test-id/images/apege.png" alt=""></span>'), 'Decorative image replaces the header emoji');
assert.ok(!markup.includes('🦧'), 'Settings header no longer renders the text orangutan');
const png = fs.readFileSync(path.join(root, 'images/apege.png'));
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Packaged asset is a PNG');
assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0, 'PNG has nonzero dimensions');
assert.deepEqual(manifest.web_accessible_resources, [{ resources: ['images/apege.png'], matches: ['*://*.kingdoms.com/*'] }], 'Only the header asset is exposed to game pages');
const markCss = source.match(/#qol-modal \.qol-brand-mark\{([^}]+)\}/)[1];
for (const rule of ['width:34px!important', 'height:34px!important', 'border-radius:50%!important', 'overflow:hidden!important', 'flex-shrink:0!important']) assert.ok(markCss.includes(rule), rule);
const imageCss = source.match(/#qol-modal \.qol-brand-mark img\{([^}]+)\}/)[1];
for (const rule of ['display:block!important', 'width:100%!important', 'height:100%!important', 'object-fit:cover!important']) assert.ok(imageCss.includes(rule), rule);
console.log('Settings footer, Thank You copy and packaged header image: all checks passed');
