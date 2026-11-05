// One-time migration helper: tag UI templates without rewriting expressions or logic.
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('../tests/node_modules/acorn');
const root = path.join(__dirname, '..');
const messages = new Set();
function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (node.type) fn(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue;
    if (Array.isArray(value)) value.forEach(child => walk(child, fn));
    else if (value && typeof value === 'object') walk(value, fn);
  }
}
function collect(html) {
  for (const part of html.split(/<[^>]*>/g)) {
    for (const value of part.split(/__APES_VALUE_\d+__/g)) {
      const text = value.trim();
      if (/[a-zA-Z]{2}/.test(text) && !/[{};]|=>/.test(text)) messages.add(text);
    }
  }
  for (const match of html.matchAll(/(?:title|aria-label|placeholder)=["']([^"']+)["']/g)) {
    if (!match[1].includes('__APES_VALUE_') && /[a-zA-Z]{2}/.test(match[1])) messages.add(match[1]);
  }
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
for (const file of manifest.content_scripts.filter(s => s.world !== 'MAIN').flatMap(s => s.js)) {
  if (/js\/core\//.test(file)) continue;
  const full = path.join(root, file), source = fs.readFileSync(full, 'utf8');
  const ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const edits = [];
  const alias = 'apesHtml_' + path.basename(file, '.js').replace(/\W/g, '_');
  walk(ast, node => {
    if (node.type === 'TemplateLiteral') {
      const html = node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? `__APES_VALUE_${i}__` : '')).join('');
      if (/<(?:div|span|section|header|footer|button|label|input|select|option|table|tr|td|th|p|h[1-6]|strong|small|a)\b/i.test(html) && !/\{\s*[^}]*!important/.test(html)) {
        collect(html); edits.push({ start: node.start, end: node.start, text: alias });
      }
    }
    if (node.type === 'Literal' && typeof node.value === 'string' && /<\w+\b[^>]*>/.test(node.value) && !/<(?:svg|path)\b/.test(node.value)) {
      collect(node.value);
      edits.push({ start: node.start, end: node.end, text: alias + '`' + node.value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`' });
    }
    if (node.type === 'Property' && ['label','name','description'].includes(node.key?.name) && node.value.type === 'Literal' && typeof node.value.value === 'string' && /[A-Za-z]{2}/.test(node.value.value)) messages.add(node.value.value);
  });
  if (!edits.length) continue;
  let updated = source;
  for (const edit of edits.sort((a,b) => b.start-a.start)) updated = updated.slice(0, edit.start)+edit.text+updated.slice(edit.end);
  // Unique file-local alias also lets isolated legacy test harnesses use English.
  const declaration = `const ${alias} = window.APES?.i18n?.html || ((s, ...v) => String.raw({ raw: s }, ...v));\n`;
  const strict = updated.indexOf("'use strict';");
  updated = strict >= 0 ? updated.slice(0, strict+13)+'\n'+declaration+updated.slice(strict+13) : declaration+updated;
  fs.writeFileSync(full, updated);
}
fs.writeFileSync(path.join(root, 'tools/ui-messages.json'), JSON.stringify([...messages].sort(), null, 2)+'\n');
console.log(messages.size + ' interface messages extracted');
