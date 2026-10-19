// Run with: node --test tests/igm-conversation-identity.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const readScript = relative => fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');

class Element {
  constructor({ attrs = {}, classes = [], children = [], tag = 'div', roomType = '', id = '' } = {}) {
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

test('timestamp and identical display names cannot identify a group chat', () => {
  const unidentified = new Element({ children: [new Element({ roomType: '7', attrs: { i18ndt: '12345' } })] });
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
