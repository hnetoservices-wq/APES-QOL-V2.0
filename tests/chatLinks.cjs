const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/features/chatLinks.js'), 'utf8');
const pause = () => new Promise(resolve => setTimeout(resolve, 10));
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const ok = value => { assert.ok(value); checks++; };
const gyazo = 'https://gyazo.com/feb6cd9465305a8c1357e454080a59d8';

(async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <p id="outside">${gyazo}</p>
    <div class="modalWrapper igm"><div class="igmSystem">
      <li class="igmConversationEntry">Preview ${gyazo}</li>
      <div class="history"><article id="message"><strong>Nezahualcóyotl</strong><time>02:48</time><p>${gyazo}</p></article></div>
      <textarea>${gyazo}</textarea><div contenteditable="true">${gyazo}</div>
      <div role="textbox">${gyazo}</div><input value="${gyazo}">
      <pre>${gyazo}</pre><code>${gyazo}</code><div id="qol-custom">${gyazo}</div>
      <a id="native-link" href="/native">Existing ${gyazo}</a>
    </div></div></body>`, { url: 'https://trickandtreat.kingdoms.com/', runScripts: 'outside-only' });
  const w = dom.window, doc = w.document;
  let enabled = true;
  w.isQolEnabled = key => { eq(key, 'chatLinks'); return enabled; };
  const message = doc.querySelector('#message'), original = message.textContent;
  const author = message.querySelector('strong'), timestamp = message.querySelector('time');
  const native = doc.querySelector('#native-link');
  w.eval(source);
  eq(doc.querySelectorAll('.qol-chat-link').length, 1);
  const firstLink = message.querySelector('a');
  eq(firstLink.href, gyazo); eq(firstLink.textContent, gyazo);
  eq(firstLink.target, '_blank'); eq(firstLink.rel, 'noopener noreferrer');
  eq(message.textContent, original); ok(message.querySelector('strong') === author); ok(message.querySelector('time') === timestamp);
  ok(doc.querySelector('#native-link') === native); eq(native.target, '');
  for (const selector of ['#outside', '.igmConversationEntry', 'textarea', '[contenteditable]', '[role="textbox"]', 'pre', 'code', '#qol-custom', '#native-link']) {
    eq(doc.querySelector(selector).querySelectorAll('.qol-chat-link').length, 0);
  }
  const history = doc.querySelector('.history'); history.scrollTop = 400;
  function add(text) { const p = doc.createElement('p'); p.textContent = text; history.append(p); return p; }
  const variedText = 'See (https://en.wikipedia.org/wiki/Travian_(game)), www.example.com/path?x=1&y=2! Also discord.gg/APES and https://example.com/a#b.';
  const varied = add(variedText); await pause();
  eq(varied.textContent, variedText);
  eq([...varied.querySelectorAll('a')].map(link => link.textContent), ['https://en.wikipedia.org/wiki/Travian_(game)', 'www.example.com/path?x=1&y=2', 'discord.gg/APES', 'https://example.com/a#b']);
  eq([...varied.querySelectorAll('a')].map(link => link.href), ['https://en.wikipedia.org/wiki/Travian_(game)', 'https://www.example.com/path?x=1&y=2', 'https://discord.gg/APES', 'https://example.com/a#b']);
  eq(history.scrollTop, 400);
  const unsafeText = 'person@example.com ftp://example.com/x javascript:alert(1) data:text/html,test v2.0.0 https://[invalid';
  const unsafe = add(unsafeText); await pause(); eq(unsafe.textContent, unsafeText); eq(unsafe.querySelectorAll('a').length, 0);
  const htmlText = 'https://example.com/?q=<img src=x onerror=alert(1)> & <script>alert(1)</script>';
  const html = add(htmlText); await pause(); eq(html.textContent, htmlText); eq(html.querySelectorAll('img, script').length, 0);
  const explicit = add('HTTP://example.com/a https://example.com/file_(1). (https://example.com/x).'); await pause();
  eq([...explicit.querySelectorAll('a')].map(link => link.textContent), ['HTTP://example.com/a', 'https://example.com/file_(1)', 'https://example.com/x']);
  const edits = add('Waiting for link'); await pause();
  edits.firstChild.data = 'New https://example.com/changed'; await pause();
  eq(edits.querySelector('a').href, 'https://example.com/changed');
  edits.textContent = 'Angular replaced message: https://example.com/replaced'; await pause();
  eq(edits.querySelectorAll('a').length, 1); eq(edits.querySelector('a').href, 'https://example.com/replaced');
  // Repeated surrounding DOM changes must not nest links or duplicate text.
  for (let i = 0; i < 3; i++) { history.append(doc.createElement('span')); await pause(); }
  eq(varied.textContent, variedText); eq(varied.querySelectorAll('a').length, 4); eq(doc.querySelectorAll('a a').length, 0);
  const lateRoot = doc.createElement('div'); lateRoot.className = 'igmSystem';
  lateRoot.innerHTML = '<div class="history"><p>Older https://example.com/older</p></div>';
  doc.body.append(lateRoot); await pause(); eq(lateRoot.querySelector('a').href, 'https://example.com/older');
  // Native activation is retained, while the game's conversation click handler
  // cannot swallow the link or open a reply editor. Covers left/middle clicks.
  let gameClicks = 0;
  history.addEventListener('click', () => gameClicks++); history.addEventListener('auxclick', () => gameClicks++);
  for (const [type, button] of [['click', 0], ['auxclick', 1]]) {
    const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, button });
    firstLink.dispatchEvent(event); eq(event.defaultPrevented, false);
  }
  eq(gameClicks, 0);
  message.querySelector('strong').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); eq(gameClicks, 1);
  const toggle = value => { enabled = value; w.dispatchEvent(new w.CustomEvent('qol_setting_changed', { detail: { key: 'chatLinks' } })); };
  toggle(false); eq(doc.querySelectorAll('.qol-chat-link').length, 0); eq(message.textContent, original);
  ok(doc.querySelector('#native-link') === native); eq(native.href, 'https://trickandtreat.kingdoms.com/native');
  const disabledMessage = add('Disabled https://example.com/disabled'); await pause(); eq(disabledMessage.querySelectorAll('a').length, 0);
  toggle(true); await pause(); eq(disabledMessage.querySelector('a').href, 'https://example.com/disabled');
  eq(message.querySelectorAll('a').length, 1); eq(varied.textContent, variedText);
  w.dispatchEvent(new w.CustomEvent('qol_setting_changed', { detail: { key: 'igmEnhanced' } })); await pause();
  eq(message.querySelectorAll('a').length, 1);
  for (const link of doc.querySelectorAll('.qol-chat-link')) {
    ok(['http:', 'https:'].includes(new URL(link.href).protocol)); eq(link.target, '_blank'); eq(link.rel, 'noopener noreferrer');
  }
  dom.window.close();
  const disabledDom = new JSDOM(`<body><div class="igmSystem">${gyazo}</div></body>`, { url: 'https://com1.kingdoms.com/', runScripts: 'outside-only' });
  disabledDom.window.isQolEnabled = () => false; disabledDom.window.eval(source);
  eq(disabledDom.window.document.querySelectorAll('.qol-chat-link').length, 0); disabledDom.window.close();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const content = manifest.content_scripts.find(entry => entry.js.includes('js/features/chatLinks.js'));
  ok(content); ok(content.js.indexOf('js/ui/menu.js') < content.js.indexOf('js/features/chatLinks.js'));
  ok(content.css.includes('css/features/chatLinks.css')); eq(manifest.permissions, ['storage', 'unlimitedStorage']);
  const menu = fs.readFileSync(path.join(root, 'js/ui/menu.js'), 'utf8');
  const basic = menu.slice(menu.indexOf('const BASIC_FEATURES'), menu.indexOf('const ADVANCED_FEATURES'));
  ok(basic.includes("key: 'chatLinks'"));
  ok(!menu.slice(0, menu.indexOf('const QOL_THEME_STORAGE_KEY')).includes('chatLinks'));
  console.log(`Clickable Chat Links: ${checks} checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
