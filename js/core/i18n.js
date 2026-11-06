(() => {
  'use strict';
  const APES = window.APES;
  if (!APES || APES.i18n) return;
  const languages = Object.freeze([
    ['en', 'English'], ['pt-PT', 'Português (Portugal)'], ['es-ES', 'Español (España)'],
    ['fr', 'Français'], ['ru', 'Русский'], ['cs', 'Čeština'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pl', 'Polski']
  ].map(([code, name]) => Object.freeze({ code, name })));
  const STORAGE_KEY = 'apes:v2:global:i18n:language';
  const valid = value => languages.some(language => language.code === value);
  const catalogs = APES.localeCatalogs || {};
  const folded = Object.fromEntries(Object.entries(catalogs).map(([locale, messages]) => [locale, Object.fromEntries(Object.entries(messages).map(([key, value]) => [key.toLowerCase(), value]))]));
  const normalize = value => String(value).replace(/\s+/g, ' ').trim();
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const decode = value => { const el = document.createElement('textarea'); el.innerHTML = value; return el.value; };
  let language = 'en', revision = 0;
  const missing = new Set();
  // Match only explicitly authored labels and status messages, never page data.
  const sourceCatalog = Object.values(catalogs)[0] || {};
  const escapeRegex = value => value.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&');
  const patterns = Object.keys(sourceCatalog).filter(key => /\{\w+\}/.test(key)).map(key => {
    const names = []; let previous = 0, pattern = '^';
    for (const match of key.matchAll(/\{(\w+)\}/g)) {
      pattern += escapeRegex(key.slice(previous, match.index)) + '(.*?)';
      names.push(match[1]); previous = match.index + match[0].length;
    }
    pattern += escapeRegex(key.slice(previous)) + '$';
    return { key, names, regex: new RegExp(pattern), weight: key.replace(/\{\w+\}/g, '').length };
  }).sort((a, b) => b.weight - a.weight);
  function resolve(source, values) {
    const key = normalize(source);
    if (Object.keys(values).length || Object.hasOwn(sourceCatalog, key)) return [key, values];
    for (const pattern of patterns) {
      const match = key.match(pattern.regex);
      if (match) return [pattern.key, Object.fromEntries(pattern.names.map((name, index) => [name, match[index + 1]]))];
    }
    return [key, values];
  }
  function t(source, values = {}) {
    const key = normalize(source);
    const translated = language === 'en' ? key : (catalogs[language]?.[key] || folded[language]?.[key.toLowerCase()]);
    if (!translated && language !== 'en') missing.add(key);
    return (translated || key).replace(/\{([\w]+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
  }
  const encodeKey = key => encodeURIComponent(key).replace(/-/g, '%2D');
  // Bind authored text only. Interpolated names, saved labels and coordinates
  // remain escaped values; unmarked page content is never translated.
  function label(source, values = {}) {
    const [key, resolvedValues] = resolve(source, values);
    values = resolvedValues;
    if (!key) return '';
    const payload = encodeKey(JSON.stringify([key, values]));
    return `<!--apes-i18n:${payload}-->${escape(t(key, values))}<!--/apes-i18n-->`;
  }
  const cache = new WeakMap();
  const VALUE = /\uE000(\d+)\uE001/g;
  function html(strings, ...values) {
    let parts = cache.get(strings);
    if (!parts) {
      const source = strings.map((part, index) => part + (index < strings.length - 1 ? `\uE000${index}\uE001` : '')).join('');
      parts = [];
      let blocked = '';
      for (const token of source.match(/<[^>]*>|<[^>]*$|[^<]+|</g) || []) {
        if (token.startsWith('<')) {
          if (/^<\/(style|script|textarea)\b/i.test(token)) blocked = '';
          if (/^<(style|script|textarea)\b/i.test(token)) blocked = token.match(/^<(\w+)/)[1];
          parts.push({ tag: token });
        } else parts.push({ text: token, blocked: Boolean(blocked) });
      }
      cache.set(strings, parts);
    }
    const output = parts.map(part => {
      if (part.tag) return part.tag.replace(/\b(title|aria-label|placeholder)=("([^"]*)"|'([^']*)')/g, (whole, attr, quoted, double, single) => {
        const source = double ?? single;
        if (source.includes('\uE000') || !/[a-zA-Z]{2}/.test(source)) return whole;
        const key = normalize(decode(source));
        return `data-apes-i18n-${attr}="${encodeKey(key)}" ${attr}="${escape(t(key))}"`;
      });
      if (part.blocked) return part.text;
      return part.text.split(/(\uE000\d+\uE001)/g).map(text => {
        if (text.includes('\uE000') || !/[a-zA-Z]{2}/.test(text)) return text;
        const source = decode(text), key = normalize(source);
        return source.match(/^\s*/)[0] + label(key) + source.match(/\s*$/)[0];
      }).join('');
    }).join('');
    return output.replace(VALUE, (_, index) => String(values[Number(index)]));
  }
  function apply(root = document) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    let comment;
    while ((comment = walker.nextNode())) {
      if (!comment.data.startsWith('apes-i18n:')) continue;
      const text = comment.nextSibling;
      if (text?.nodeType !== Node.TEXT_NODE || text.nextSibling?.nodeType !== Node.COMMENT_NODE || text.nextSibling.data !== '/apes-i18n') continue;
      try {
        const [key, values] = JSON.parse(decodeURIComponent(comment.data.slice(10)));
        const result = t(key, values);
        if (text.data !== result) text.data = result;
      } catch (_) { /* Ignore unrelated or incomplete markup. */ }
    }
    const selector = '[data-apes-i18n],[data-apes-i18n-title],[data-apes-i18n-aria-label],[data-apes-i18n-placeholder],[data-apes-i18n-label]';
    const elements = [...(root.matches?.(selector) ? [root] : []), ...(root.querySelectorAll?.(selector) || [])];
    for (const el of elements) {
      if (el.hasAttribute('data-apes-i18n')) {
        const value = t(el.getAttribute('data-apes-i18n'));
        if (el.textContent !== value) el.textContent = value;
      }
      for (const attr of ['title', 'aria-label', 'placeholder', 'label']) {
        const key = el.getAttribute(`data-apes-i18n-${attr}`);
        if (!key) continue;
        const value = t(decodeURIComponent(key));
        if (el.getAttribute(attr) !== value) el.setAttribute(attr, value);
      }
    }
    root.querySelectorAll?.('[data-apes-language-select]').forEach(el => { el.value = language; });
  }
  function select(next) {
    language = valid(next) ? next : 'en';
    apply();
    APES.events?.emit('languageChanged', { language });
  }
  const textBindings = new WeakMap();
  function setText(element, key, values = {}) {
    [key, values] = resolve(key, values);
    const signature = JSON.stringify([key, values]);
    if (textBindings.get(element) === signature && element.textContent === t(key, values)) return t(key, values);
    textBindings.set(element, signature);
    element.removeAttribute('data-apes-i18n');
    element.replaceChildren();
    // This API is for authored labels, never for player or server data.
    const template = document.createElement('template');
    template.innerHTML = label(key, values);
    element.append(template.content);
    return t(key, values);
  }
  function setAttribute(element, attr, key) {
    if (!['title', 'aria-label', 'placeholder', 'label'].includes(attr)) throw new RangeError('Unsupported localized attribute.');
    element.setAttribute(`data-apes-i18n-${attr}`, encodeKey(key));
    element.setAttribute(attr, t(key));
  }
  function setLanguage(next) {
    if (!valid(next)) return Promise.reject(new RangeError('Unsupported APES language.'));
    const currentRevision = ++revision;
    return new Promise((resolve, reject) => {
      if (!window.chrome?.storage?.local?.set) { reject(new Error('Language preference could not be saved.')); return; }
      chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
        if (chrome.runtime?.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        if (currentRevision === revision) select(next);
        resolve(next);
      });
    });
  }
  const ready = new Promise(resolve => {
    if (!window.chrome?.storage?.local?.get) { resolve(); return; }
    const initialRevision = revision;
    chrome.storage.local.get(STORAGE_KEY, result => {
      if (!chrome.runtime?.lastError && initialRevision === revision) select(result?.[STORAGE_KEY]);
      resolve();
    });
  });
  APES.i18n = Object.freeze({ languages, STORAGE_KEY, t, html, label, apply, setText, setAttribute, setLanguage, ready,
    getLanguage: () => language, getMissing: () => [...missing].sort(),
    number: (value, options) => new Intl.NumberFormat(language, options).format(value),
    date: (value, options) => new Intl.DateTimeFormat(language, options).format(value)
  });
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && Object.hasOwn(changes, STORAGE_KEY)) { ++revision; select(changes[STORAGE_KEY].newValue); }
  });
  const pending = new Set();
  let scheduled = false;
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') pending.add(record.target.parentNode);
      else {
        for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) pending.add(node);
        if ([...record.addedNodes].some(node => node.nodeType === Node.COMMENT_NODE)) pending.add(record.target);
      }
    }
    if (!scheduled && pending.size) {
      scheduled = true;
      queueMicrotask(() => { scheduled = false; const roots = [...pending]; pending.clear(); roots.forEach(root => { if (root?.isConnected) apply(root); }); });
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
})();
