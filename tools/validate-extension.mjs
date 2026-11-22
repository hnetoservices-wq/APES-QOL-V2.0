import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const fail = (message) => { console.error('ERROR: ' + message); process.exitCode = 1; };
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
if (manifest.manifest_version !== 3) fail('Expected Manifest V3');
if (!manifest.version || !/^\\d+\\.\\d+\\.\\d+(?:\\.\\d+)?$/.test(manifest.version)) fail('Invalid manifest version');

const references = new Set();
for (const script of manifest.content_scripts ?? []) {
  for (const file of [...(script.js ?? []), ...(script.css ?? [])]) references.add(file);
}
for (const file of Object.values(manifest.icons ?? {})) references.add(file);
for (const file of Object.values(manifest.action?.default_icon ?? {})) references.add(file);
for (const group of manifest.web_accessible_resources ?? []) {
  for (const file of group.resources ?? []) {
    if (file.includes('*')) continue;
    references.add(file);
  }
}
for (const file of references) {
  const normalized = path.posix.normalize(file);
  if (path.posix.isAbsolute(file) || normalized === '..' || normalized.startsWith('../')) {
    fail('Unsafe manifest path: ' + file);
    continue;
  }
  if (!existsSync(file)) fail('Manifest references a missing file: ' + file);
}
for (const file of references) {
  if (!file.endsWith('.js') || !existsSync(file)) continue;
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) fail('JavaScript syntax failed: ' + file + '\n' + (check.stderr || check.stdout));
}
if (!process.exitCode) console.log('Manifest paths and JavaScript syntax validated (' + references.size + ' unique references).');
