(() => {
  'use strict';
  const FEATURE = 'chatLinks';
  // Native IGM contains private, kingdom and Secret Society conversations.
  const ROOT = '.igmSystem';
  const LINK = 'a.qol-chat-link';
  const SKIP = 'a, script, style, textarea, input, select, button, code, pre, [role="textbox"], [contenteditable]:not([contenteditable="false"]), .igmConversationEntry, [id^="qol-"], [id^="apes-"]';
  const ADDRESS = /(?:https?:\/\/|www\.)[^\s<>"\u0000-\u001f]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?::\d{1,5})?(?:[/?#][^\s<>"\u0000-\u001f]*)?/gi;
  let observer = null;
  const enabled = () => typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE);

  function trimAddress(value) {
    let result = value.replace(/[.,!?;:'’”]+$/, '');
    const pairs = { ')': '(', ']': '[', '}': '{' };
    while (pairs[result.at(-1)]) {
      const closing = result.at(-1), opening = pairs[closing];
      if ([...result].filter(char => char === closing).length <= [...result].filter(char => char === opening).length) break;
      result = result.slice(0, -1).replace(/[.,!?;:'’”]+$/, '');
    }
    return result;
  }
  function linkText(node) {
    const parent = node.parentElement;
    if (!parent?.closest(ROOT) || parent.closest(SKIP)) return;
    const text = node.data;
    const fragment = document.createDocumentFragment();
    let end = 0, found = false;
    ADDRESS.lastIndex = 0;
    for (const match of text.matchAll(ADDRESS)) {
      // Avoid email addresses, fragments of words and unsupported schemes.
      if (match.index && /[\p{L}\p{N}_@./-]/u.test(text[match.index - 1])) continue;
      const label = trimAddress(match[0]);
      let url;
      try { url = new URL(/^https?:\/\//i.test(label) ? label : `https://${label}`); } catch (_) { continue; }
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) continue;
      fragment.append(document.createTextNode(text.slice(end, match.index)));
      const anchor = document.createElement('a');
      anchor.className = 'qol-chat-link'; anchor.textContent = label; anchor.href = url.href;
      anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
      fragment.append(anchor);
      end = match.index + label.length; found = true;
    }
    if (!found) return;
    fragment.append(document.createTextNode(text.slice(end)));
    node.replaceWith(fragment);
  }
  function process(root) {
    if (!root.isConnected) return;
    if (root.nodeType === Node.TEXT_NODE) { linkText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(SKIP)) return;
    if (!root.closest(ROOT) && !root.querySelector(ROOT)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(linkText);
  }
  function sync() {
    observer?.disconnect(); observer = null;
    if (!enabled()) {
      document.querySelectorAll(LINK).forEach(anchor => anchor.replaceWith(document.createTextNode(anchor.textContent)));
      return;
    }
    document.querySelectorAll(ROOT).forEach(process);
    observer = new MutationObserver(records => {
      if (!enabled()) { sync(); return; }
      // Observe game updates only; suppress mutations produced by our links.
      observer.disconnect();
      const roots = new Set();
      for (const record of records) {
        if (record.type === 'characterData') roots.add(record.target);
        else record.addedNodes.forEach(node => roots.add(node));
      }
      roots.forEach(process);
      observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }
  // Keep the browser's native link activation, while preventing the game's
  // conversation click handlers from swallowing it or opening the reply editor.
  for (const type of ['click', 'auxclick']) document.addEventListener(type, event => {
    if (enabled() && event.target.closest?.(LINK)) event.stopPropagation();
  }, true);
  window.addEventListener('qol_setting_changed', event => { if (event.detail?.key === FEATURE) sync(); });
  if (document.body) sync(); else document.addEventListener('DOMContentLoaded', sync, { once: true });
})();
