const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/features/chatWindowStyle.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/features/chatWindowStyle.css'), 'utf8');
const tabsCSS = fs.readFileSync(path.join(root, 'css/modules/igm/messageCenter.css'), 'utf8');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/chatWindowStyle.html'), 'utf8');
const pause = () => new Promise(resolve => setTimeout(resolve, 25));
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const ok = value => { assert.ok(value); checks++; };
function setup(html = fixture, initialEnabled = true) {
  const dom = new JSDOM(html, { url: 'https://trickandtreat.kingdoms.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, doc = w.document;
  let enabled = initialEnabled, frames = 0, nativeButtons = 0;
  const style = doc.createElement('style'); style.textContent = '.ng-hide{display:none!important} input[type=search]{width:0;height:0}' + tabsCSS + css; doc.head.append(style);
  const create = doc.createElement.bind(doc); doc.createElement = (...args) => { if (args[0] === 'button') nativeButtons++; return create(...args); };
  w.isQolEnabled = () => enabled;
  const frame = w.requestAnimationFrame.bind(w); w.requestAnimationFrame = callback => { frames++; return frame(callback); };
  w.eval(source);
  return { dom, w, doc, get frames() { return frames; }, get nativeButtons() { return nativeButtons; },
    toggle(value) { enabled = value; w.dispatchEvent(new w.CustomEvent('qol_setting_changed', { detail: { key: 'chatWindowStyle', enabled: value } })); } };
}
function pointer(e, node, type, x, y, id = 1, button = 0) {
  const event = new e.w.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y }, pointerId: { value: id }, button: { value: button } }); node.dispatchEvent(event); return event;
}
(async () => {
  const e = setup(), { w, doc } = e;
  const native = doc.querySelector('.modalWrapper.igm'), system = doc.querySelector('.igmSystem'), row = doc.querySelector('#kingdom-row');
  const h2 = native.querySelector('h2'), close = native.querySelector('.closeWindow'), newThread = native.querySelector('.newThreadContainer .clickableContainer');
  const clickNodes = [row, close, newThread, row.querySelector('.qol-igm-row-folder')];
  const calls = clickNodes.map(() => 0); clickNodes.forEach((node, i) => node.addEventListener('click', () => calls[i]++));
  const history = native.querySelector('.history .scrollContent'); history.scrollTop = 30;
  const gameStyle = native.getAttribute('style').replace(/--qol-chat-[^;]*;?/g, '').trim();
  ok(native.classList.contains('qol-chat-window')); eq(system.getAttribute('ng-controller'), 'igmSystemCtrl');
  eq(doc.querySelector('#kingdom-row'), row); eq(row.getAttribute('clickable'), 'openConversation(inboxEntry)');
  eq(native.querySelector('h2'), h2); eq(h2.textContent, 'Messages'); eq(history.scrollTop, 30);
  eq(native.style.transform, 'translate3d(591px,125px,0px)'); eq(native.style.zIndex, '1070');
  eq(doc.querySelector('#other-window').classList.contains('qol-chat-window'), false); eq(doc.querySelector('#chatFooterBar [data-qol-chat-owned]'), null);
  eq(doc.querySelectorAll('[data-qol-chat-search]').length, 1); eq(doc.querySelector('[data-qol-chat-count]').textContent, '2 conversations');
  eq(w.getComputedStyle(doc.querySelector('#folder-hidden-row')).display, 'none'); eq(w.getComputedStyle(doc.querySelector('#angular-hidden-row')).display, 'none');
  eq(w.getComputedStyle(native.querySelector('.firstHalf')).display, 'flex'); eq(w.getComputedStyle(doc.querySelector('#qol-message-center-tabs')).width, '100%');
  eq(w.getComputedStyle(native.querySelector('.modalContent')).height, '100%');
  eq(doc.querySelector('[data-qol-chat-empty]').hidden, false); eq(e.nativeButtons, 0);
  const search = doc.querySelector('[data-qol-chat-search]');
  function type(value) { search.value = value; search.dispatchEvent(new w.Event('input', { bubbles: true })); }
  type('andre'); eq(w.getComputedStyle(row).display, 'none'); eq(w.getComputedStyle(doc.querySelector('#private-row')).display, 'flex'); eq(doc.querySelector('[data-qol-chat-count]').textContent, '1 conversation found');
  type('KINGDOM'); eq(doc.querySelector('[data-qol-chat-count]').textContent, '1 conversation found'); eq(w.getComputedStyle(doc.querySelector('#folder-hidden-row')).display, 'none');
  type('no such conversation'); eq(doc.querySelector('[data-qol-chat-count]').textContent, '0 conversations found');
  type(''); eq(doc.querySelector('[data-qol-chat-count]').textContent, '2 conversations'); eq(history.scrollTop, 30); eq(doc.querySelector('#kingdom-row'), row);
  let keys = 0; native.addEventListener('keydown', () => keys++); search.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'x', bubbles: true })); eq(keys, 0);
  // Native rows, close/new controls and folder controls retain their real listeners.
  clickNodes.forEach(node => node.click()); eq(calls, [2, 1, 1, 1]);
  const originalInput = search; search.focus(); search.value = 'King'; search.setSelectionRange(1, 2);
  // A new-conversation form can appear before the game changes the header state.
  const newForm = doc.createElement('form'); newForm.innerHTML = '<input aria-label="Recipient"><textarea>New conversation draft</textarea>';
  native.querySelector('.threadView').append(newForm); await pause(); eq(doc.querySelector('[data-qol-chat-empty]').hidden, true);
  eq(newForm.querySelector('textarea').value, 'New conversation draft'); newForm.remove(); await pause(); eq(doc.querySelector('[data-qol-chat-empty]').hidden, false);
  // Synthetic selected-thread markup exercises late game insertion without moving controls.
  const thread = native.querySelector('.threadView'); thread.querySelector('.selectConversation').remove(); thread.querySelector('.conversationHeader').classList.add('selected');
  const content = doc.createElement('div'); content.className = 'conversationMessages scrollable';
  content.innerHTML = '<div class="scrollContent"><article class="conversationLine"><span class="messageText">Read https://example.com/chat</span></article></div><textarea aria-label="Native message editor">Unsaved message</textarea><div data-native-send role="button">Send</div>';
  thread.append(content); const editor = content.querySelector('textarea'), send = content.querySelector('[data-native-send]'); let sends = 0;
  send.addEventListener('click', () => sends++); editor.focus(); editor.setSelectionRange(2, 5);
  await pause(); eq(doc.querySelector('[data-qol-chat-empty]').hidden, true); eq(doc.querySelector('textarea'), editor); eq(editor.value, 'Unsaved message'); eq(editor.selectionStart, 2); eq(doc.activeElement, editor); eq(sends, 0); eq(doc.querySelector('[data-qol-chat-search]'), originalInput);
  send.click(); eq(sends, 1);
  // New/edited conversations are searched immediately; a folder filter remains authoritative.
  type('deliveries'); row.querySelector('.linePreview').textContent = 'New deliveries scheduled'; await pause(); eq(doc.querySelector('[data-qol-chat-count]').textContent, '2 conversations found');
  row.style.display = 'none'; await pause(); eq(doc.querySelector('[data-qol-chat-count]').textContent, '1 conversation found'); eq(w.getComputedStyle(row).display, 'none');
  row.setAttribute('style', 'display : none'); await pause(); eq(w.getComputedStyle(row).display, 'none'); eq(doc.querySelector('[data-qol-chat-count]').textContent, '1 conversation found');
  row.style.display = ''; type('');
  await pause(); const settled = e.frames; await pause(); await pause(); eq(e.frames, settled); // No observer/frame loop while idle.
  // Pointer movement changes only APES geometry; the native transform is preserved.
  const beforeX = Number.parseFloat(native.style.getPropertyValue('--qol-chat-x'));
  pointer(e, h2, 'pointerdown', 100, 100); pointer(e, w, 'pointermove', 150, 120); pointer(e, w, 'pointerup', 150, 120);
  eq(Number.parseFloat(native.style.getPropertyValue('--qol-chat-x')), beforeX + 50); eq(native.style.transform, 'translate3d(591px,125px,0px)');
  const grip = doc.querySelector('.qol-chat-resize'), beforeWidth = Number.parseFloat(native.style.getPropertyValue('--qol-chat-width'));
  pointer(e, grip, 'pointerdown', 200, 200); pointer(e, w, 'pointermove', 150, 160); pointer(e, w, 'pointerup', 150, 160);
  eq(Number.parseFloat(native.style.getPropertyValue('--qol-chat-width')), beforeWidth - 50);
  grip.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); eq(Number.parseFloat(native.style.getPropertyValue('--qol-chat-width')), beforeWidth - 60);
  eq(editor.value, 'Unsaved message'); eq(doc.querySelector('textarea'), editor);
  w.innerWidth = 480; w.innerHeight = 300; w.dispatchEvent(new w.Event('resize'));
  eq(native.style.getPropertyValue('--qol-chat-width'), '456px'); eq(native.style.getPropertyValue('--qol-chat-height'), '276px'); eq(native.style.getPropertyValue('--qol-chat-x'), '12px'); eq(native.style.getPropertyValue('--qol-chat-y'), '12px');
  // Hidden Angular windows remain hidden despite the new shell styling.
  native.classList.add('ng-hide'); eq(w.getComputedStyle(native).display, 'none'); native.classList.remove('ng-hide');
  type('no match'); e.toggle(false); eq(doc.querySelector('[data-qol-chat-owned]'), null); eq(native.classList.contains('qol-chat-window'), false); eq(row.classList.contains('qol-chat-filtered'), false);
  eq(native.style.transform, 'translate3d(591px,125px,0px)'); eq(doc.querySelector('#folder-hidden-row').style.display, 'none'); eq(doc.querySelector('#qol-message-center-tabs').isConnected, true); eq(editor.value, 'Unsaved message'); eq(doc.querySelector('textarea'), editor);
  eq(native.getAttribute('style').replace(/\s+/g, ''), gameStyle.replace(/\s+/g, ''));
  e.toggle(true); eq(doc.querySelectorAll('[data-qol-chat-search]').length, 1); eq(doc.querySelectorAll('.qol-chat-resize').length, 1); eq(e.nativeButtons, 0);
  // Closing/reopening or replacing the Angular root remounts cleanly.
  native.remove(); await pause(); const replacement = new JSDOM(fixture).window.document.querySelector('.modalWrapper.igm'); doc.body.append(doc.importNode(replacement, true)); await pause();
  eq(doc.querySelectorAll('.qol-chat-window').length, 1); eq(doc.querySelectorAll('[data-qol-chat-search]').length, 1);
  e.dom.window.close();
  const disabled = setup(fixture, false); eq(disabled.doc.querySelector('.qol-chat-window'), null); disabled.toggle(true); ok(disabled.doc.querySelector('.qol-chat-window')); disabled.dom.window.close();
  const late = setup('<body></body>'); late.doc.body.innerHTML = new JSDOM(fixture).window.document.body.innerHTML; await pause(); ok(late.doc.querySelector('.qol-chat-window')); late.dom.window.close();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))), scripts = manifest.content_scripts.flatMap(x => x.js || []), styles = manifest.content_scripts.flatMap(x => x.css || []);
  ok(scripts.includes('js/features/chatWindowStyle.js')); ok(styles.includes('css/features/chatWindowStyle.css')); eq(manifest.permissions, ['storage', 'unlimitedStorage']);
  const menu = fs.readFileSync(path.join(root, 'js/ui/menu.js'), 'utf8'); ok(menu.slice(menu.indexOf('const COSMETIC_FEATURES'), menu.indexOf('const KEYBINDS')).includes("key: 'chatWindowStyle'"));
  console.log(`APES Chat Window: ${checks} checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
