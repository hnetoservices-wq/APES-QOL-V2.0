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

  closest(selector) { return selector === 'li.igmConversationEntry' ? this.parent : null; }
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

test('fallback uses room name rather than mutable last-message time', () => {
  const one = new Element({ children: [
    new Element({ roomType: '7' }),
    new Element({ tag: 'heading', text: 'APES Officers' }),
    new Element({ tag: 'span', attrs: { i18ndt: '12345' } })
  ] });
  const { window } = sandboxFor([one]);
  assert.equal(window.qolIgmConversationIdentity(one), 'title:secret-society:apes%20officers');
  one.children[2].attrs.i18ndt = '67890';
  assert.equal(window.qolIgmConversationIdentity(one), 'title:secret-society:apes%20officers');
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

test('non-numeric Secret Society room tokens can be sorted individually', () => {
  const first = row('apes-warroom'), second = row('allies-room');
  const env = sandboxFor([first, second]);
  assert.notEqual(env.window.qolIgmConversationIdentity(first), env.window.qolIgmConversationIdentity(second));
  env.startAutoSort();
  env.moveSelected(first, 'Spam');
  const tags = JSON.parse(env.storage.get('qol_conversation_tags_v3'));
  assert.equal(tags['class:secretsociety:apes-warroom'], 'Spam');
  assert.equal(tags['class:secretsociety:allies-room'], 'Secret Society');
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
