// Run with: node --test tests/igm-conversation-identity.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const readScript = relative => fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');

class Element {
  constructor({ attrs = {}, classes = [], children = [], tag = 'div', roomType = '', id = '', text = '' } = {}) {
    this.attrs = attrs;
    this.values = new Set(classes);
    this.classList = {
      [Symbol.iterator]: () => this.values[Symbol.iterator](),
      toggle: (name, enabled) => enabled ? this.values.add(name) : this.values.delete(name),
      remove: name => this.values.delete(name)
    };
    this.children = children;
    this.tag = tag;
    this.roomType = roomType;
    this.id = id;
    this.textContent = text;
    this.dataset = {};
    this.style = {};
    this.badge = null;
    children.forEach(child => { child.parent = this; });
  }

  getAttribute(name) { return this.attrs[name] ?? null; }

  querySelectorAll(selector) {
    const descendants = [];
    const collect = element => element.children.forEach(child => {
      descendants.push(child);
      collect(child);
    });
    collect(this);
    const matches = selector.split(',').map(part => part.trim()).map(part => {
      if (part === '[id]') return node => !!node.id;
      if (part === 'span[i18ndt]') return node => node.tag === 'span' && node.getAttribute('i18ndt') !== null;
      if (['.igmInfos .name', '.igmInfos .conversationName', '.igmInfos .roomName',
        '.igmInfos .title', '.conversationName', '.roomName', '.chatName',
        '.conversationTitle'].includes(part)) return node => node.tag === 'heading';
      if (part === 'a[href]') return node => node.tag === 'a' && node.getAttribute('href') !== null;
      if (part === 'avatar-image[player-id]') return node => node.tag === 'avatar-image' && node.getAttribute('player-id') !== null;
      if (part === '.igmInfos .name.roomType7') return node => node.roomType === '7';
      if (part === '.igmInfos .name.roomType5') return node => node.roomType === '5';
      const classFragment = part.match(/^\[class\*="([^"]+)"\]$/);
      if (classFragment) return node => [...node.values].some(name => name.includes(classFragment[1]));
      const attr = part.match(/^\[([a-z-]+)\]$/);
      if (attr) return node => node.getAttribute(attr[1]) !== null;
      return () => false;
    });
    return descendants.filter(node => matches.some(predicate => predicate(node)));
  }

  querySelector(selector) {
    if (selector === '.qol-igm-row-folder') return this.badge;
    return this.querySelectorAll(selector)[0] || null;
  }

  closest(selector) {
    if (selector.includes('.qol-igm-row-folder') && this.tag === 'badge') return this;
    return selector === 'li.igmConversationEntry' ? this.parent : null;
  }
}

function row(id, type = 'secretSociety') {
  const result = new Element({
    children: [new Element({ classes: [`conversation_${type}_${id}`], roomType: type === 'secretSociety' ? '7' : '5' })]
  });
  const badge = new Element({ tag: 'badge' });
  badge.parent = result;
  result.badge = badge;
  return result;
}

function sandboxFor(rows) {
  const storage = new Map();
  const localStorage = {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  };
  const listeners = {};
  let selected = rows[0];
  const document = {
    readyState: 'complete',
    body: {},
    getElementById: () => null,
    querySelectorAll: selector => selector === 'li.igmConversationEntry' ? rows : [],
    querySelector: selector => selector === '.qol-igm-row-folder[aria-expanded="true"]' ? selected?.badge : null,
    addEventListener: (name, callback) => { listeners[name] = callback; }
  };
  const window = {
    isQolEnabled: () => true,
    setTimeout: callback => callback(),
    setInterval: () => 1
  };
  const context = vm.createContext({
    window, document, localStorage,
    MutationObserver: class { observe() {} },
    requestAnimationFrame: callback => callback(),
    Node: { ELEMENT_NODE: 1 }
  });
  vm.runInContext(readScript('js/modules/igm/conversationIdentity.js'), context);
  const startAutoSort = () => vm.runInContext(readScript('js/modules/igm/autoSort.js'), context);
  const moveSelected = (selectedRow, category) => {
    selected = selectedRow;
    listeners.click({ target: { closest: () => ({ dataset: { value: category } }) } });
  };
  return { storage, window, startAutoSort, moveSelected };
}

test('different Secret Society and Kingdom chats receive separate stable IDs', () => {
  const first = row(123), second = row(456), kingdom1 = row(5, 'kingdom'), kingdom2 = row(6, 'kingdom');
  const { window } = sandboxFor([first, second, kingdom1, kingdom2]);
  const identify = window.qolIgmConversationIdentity;
  assert.notEqual(identify(first), identify(second));
  assert.notEqual(identify(kingdom1), identify(kingdom2));
});

test('shared Secret Society name is NOT used as a room ID', () => {
  const one = new Element({ children: [
    new Element({ roomType: '7' }),
    new Element({ tag: 'heading', text: 'triangles' }),
    new Element({ tag: 'span', attrs: { i18ndt: '1791294996.841' } })
  ] });
  const { window } = sandboxFor([one]);
  assert.equal(window.qolIgmConversationIdentity(one), 'activity:secret-society:1791294996.841');
});

test('last-activity fallback restores sorting when no name or native room ID exists', () => {
  const first = new Element({ children: [
    new Element({ roomType: '7' }), new Element({ tag: 'span', attrs: { i18ndt: '12345' } })
  ] });
  const second = new Element({ children: [
    new Element({ roomType: '7' }), new Element({ tag: 'span', attrs: { i18ndt: '67890' } })
  ] });
  for (const conversation of [first, second]) {
    const badge = new Element({ tag: 'badge' });
    badge.parent = conversation;
    conversation.badge = badge;
  }
  const env = sandboxFor([first, second]);
  assert.notEqual(env.window.qolIgmConversationIdentity(first), env.window.qolIgmConversationIdentity(second));
  env.startAutoSort();
  env.moveSelected(first, 'Private');
  const tags = JSON.parse(env.storage.get('qol_conversation_tags_v3'));
  assert.equal(tags['activity:secret-society:12345'], 'Private');
  assert.equal(tags['activity:secret-society:67890'], 'Secret Society');
});

test('different roomId attributes persist even if last message timestamp changes', () => {
  const first = new Element({ attrs: { 'data-apes-igm-room-id': '123' }, children: [
    new Element({ roomType: '7' }), new Element({ tag: 'span', attrs: { i18ndt: '1791294996.841' } })
  ] });
  const second = new Element({ attrs: { 'data-apes-igm-room-id': '456' }, children: [
    new Element({ roomType: '7' }), new Element({ tag: 'span', attrs: { i18ndt: '1791295005.079' } })
  ] });
  for (const conversation of [first, second]) {
    const badge = new Element({ tag: 'badge' });
    badge.parent = conversation;
    conversation.badge = badge;
  }
  const env = sandboxFor([first, second]);
  env.startAutoSort();
  env.moveSelected(first, 'Spam');
  first.children[1].attrs.i18ndt = '1799999999.100';
  assert.equal(env.window.qolIgmConversationIdentity(first), 'native:123');
  const tags = JSON.parse(env.storage.get('qol_conversation_tags_v3'));
  assert.equal(tags['native:123'], 'Spam');
  assert.equal(tags['native:456'], 'Secret Society');
});

test('unidentifiable chat stays untouched without changing other conversations', () => {
  const unidentified = new Element({ children: [new Element({ roomType: '7' })] });
  const { window } = sandboxFor([unidentified]);
  assert.equal(window.qolIgmConversationIdentity(unidentified), null);
});

test('changing the category of one Secret Society chat does not change others', () => {
  const first = row(123), second = row(456);
  const env = sandboxFor([first, second]);
  env.startAutoSort();
  env.moveSelected(first, 'Private');
  let tags = JSON.parse(env.storage.get('qol_conversation_tags_v3'));
  assert.equal(tags['class:secretsociety:123'], 'Private');
  assert.equal(tags['class:secretsociety:456'], 'Secret Society');
  env.moveSelected(second, 'Trash');
  tags = JSON.parse(env.storage.get('qol_conversation_tags_v3'));
  assert.equal(tags['class:secretsociety:123'], 'Private');
  assert.equal(tags['class:secretsociety:456'], 'Trash');
  assert.equal(env.storage.has('qol_conversation_tag_overrides_v2'), false);
});

test('ambiguous IDs fail closed rather than applying a bulk override', () => {
  const first = row(123), duplicate = row(123);
  const env = sandboxFor([first, duplicate]);
  env.startAutoSort();
  env.moveSelected(first, 'Spam');
  assert.equal(env.storage.has('qol_conversation_tag_overrides_v3'), false);
});

test('duplicate activity fallback never creates a type-wide override', () => {
  const first = new Element({ children: [new Element({ tag: 'span', attrs: { i18ndt: '12345' } })] });
  const duplicate = new Element({ children: [new Element({ tag: 'span', attrs: { i18ndt: '12345' } })] });
  for (const conversation of [first, duplicate]) {
    const badge = new Element({ tag: 'badge' });
    badge.parent = conversation;
    conversation.badge = badge;
  }
  const env = sandboxFor([first, duplicate]);
  env.startAutoSort();
  env.moveSelected(first, 'Private');
  assert.equal(env.storage.has('qol_conversation_tag_overrides_v3'), false);
});

test('real Travian sprite class is shared but does not hide Secret Society folder controls', () => {
  // This CSS class and row shape come from the user's Travian Kingdoms HTML.
  const make = timestamp => new Element({ children: [
    new Element({ classes: ['conversation_secretSociety_medium_flat_black'], roomType: '7' }),
    new Element({ tag: 'heading', text: 'triangles' }),
    new Element({ tag: 'span', attrs: { i18ndt: timestamp } })
  ] });
  const first = make('1791294996.841');
  const second = make('1791295005.079');
  for (const conversation of [first, second]) {
    const badge = new Element({ tag: 'badge' });
    badge.parent = conversation;
    conversation.badge = badge;
  }
  const env = sandboxFor([first, second]);
  assert.equal(env.window.qolIgmConversationIdentity(first), 'activity:secret-society:1791294996.841');
  assert.equal(env.window.qolIgmConversationIdentity(second), 'activity:secret-society:1791295005.079');
  env.startAutoSort();
  env.moveSelected(first, 'Private');
  const tags = JSON.parse(env.storage.get('qol_conversation_tags_v3'));
  assert.equal(tags['activity:secret-society:1791294996.841'], 'Private');
  assert.equal(tags['activity:secret-society:1791295005.079'], 'Secret Society');
});

test('MAIN-world bridge publishes the actual Angular inboxEntry roomId', () => {
  const row = {
    attrs: {},
    getAttribute(key) { return this.attrs[key] ?? null; },
    setAttribute(key, value) { this.attrs[key] = value; },
    hasAttribute(key) { return key in this.attrs; },
    removeAttribute(key) { delete this.attrs[key]; }
  };
  const model = { inboxEntry: { data: { roomId: 88991 } } };
  const window = {
    angular: { element: () => ({ scope: () => model }) },
    setInterval: callback => { window.refresh = callback; }
  };
  const document = {
    readyState: 'complete',
    querySelectorAll: () => [row]
  };
  vm.runInContext(readScript('js/modules/igm/roomIdBridge.js'), vm.createContext({ window, document }));
  assert.equal(row.getAttribute('data-apes-igm-room-id'), '88991');
  model.inboxEntry.data.roomId = 88992;
  window.refresh();
  assert.equal(row.getAttribute('data-apes-igm-room-id'), '88992');
});

test('explicit manual folder survives roomId publication after a timestamp fallback', () => {
  const first = new Element({ children: [
    new Element({ classes: ['conversation_secretSociety_medium_flat_black'], roomType: '7' }),
    new Element({ tag: 'heading', text: 'triangles' }),
    new Element({ tag: 'span', attrs: { i18ndt: '1791294996.841' } })
  ] });
  const badge = new Element({ tag: 'badge' });
  badge.parent = first;
  first.badge = badge;
  const env = sandboxFor([first]);
  env.startAutoSort();
  env.moveSelected(first, 'Private');

  // MAIN-world Angular bridge resolves the actual stable inbox room ID later.
  first.attrs['data-apes-igm-room-id'] = '77741';
  env.startAutoSort();
  const tags = JSON.parse(env.storage.get('qol_conversation_tags_v3'));
  const overrides = JSON.parse(env.storage.get('qol_conversation_tag_overrides_v3'));
  assert.equal(tags['native:77741'], 'Private');
  assert.equal(overrides['native:77741'], 'Private');
});

test('an APES-generated badge cannot override its own private-chat identity', () => {
  const avatar = new Element({ tag: 'avatar-image', attrs: { 'player-id': '42' } });
  const badge = new Element({ tag: 'badge', attrs: { 'data-conversation-id': 'private-player:42' } });
  const privateChat = new Element({ children: [avatar, badge] });
  const env = sandboxFor([privateChat]);
  assert.equal(env.window.qolIgmConversationIdentity(privateChat), 'private-player:42');

  // The earlier bug recursively wrapped this ID as native:private-player:42,
  // then native:native:private-player:42 on each refresh.
  badge.attrs['data-conversation-id'] = 'native:private-player:42';
  assert.equal(env.window.qolIgmConversationIdentity(privateChat), 'private-player:42');
});

test('SS is display-only: tabs, dropdowns and badges keep the full stored category', () => {
  const enhancer = readScript('js/features/igmEnhancer.js');
  const messageCenter = readScript('js/modules/igm/messageCenter.js');
  const autoSort = readScript('js/modules/igm/autoSort.js');
  const displayFunction = enhancer.match(/function displayCategory\(category\)\s*\{[^}]+\}/)?.[0];
  assert.ok(displayFunction, 'shared visible-category formatter exists');
  const label = vm.runInNewContext(`(() => { ${displayFunction}; return displayCategory('Secret Society'); })()`);
  assert.equal(label, 'SS');
  assert.match(messageCenter, /label\.textContent = value === 'Secret Society' \? 'SS' : value/);
  assert.match(messageCenter, /tab\.dataset\.qolMessageFilter = value/);
  assert.match(enhancer, /value: category,\s*label: displayCategory\(category\)/);
  assert.match(enhancer, /badge\.textContent = displayCategory\(currentTag\)/);
  assert.match(enhancer, /badge\.dataset\.currentTag = currentTag/);
  assert.match(autoSort, /const SECRET_SOCIETY = 'Secret Society'/);
  assert.match(autoSort, /badge\.textContent = desired === SECRET_SOCIETY \? 'SS' : desired/);
  assert.match(autoSort, /badge\.dataset\.currentTag = desired/);
});
