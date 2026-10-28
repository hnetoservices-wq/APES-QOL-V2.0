'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css/modules/villageDashboard/accountOverview.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js/modules/villageDashboard/accountOverview.js'), 'utf8');

const rule = css.match(/#apes-v2-village-overlay \.apes-ao-resource-legend em\s*\{([^}]*)\}/);
assert.ok(rule, 'Production legend values must have an explicit scoped rule');
assert.match(rule[1], /margin-left:\s*0\s*!important/, 'Values sit directly beside the resource names');
assert.doesNotMatch(rule[1], /margin-left:\s*auto/, 'No spacer between name and value');
assert.match(css, /\.apes-ao-resource-stack \.apes-ao-resource-legend\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,1fr\)\)/, 'Four-resource layout retained');
assert.match(js, /<b>\$\{safe\(item\.label\)\}<\/b>\s*\n\s*<em>\$\{current>0\?'\+':''\}/, 'Legend keeps each label adjacent to its value');
console.log('Account Overview production legend labels and hourly amounts remain grouped.');
