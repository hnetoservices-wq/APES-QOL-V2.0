(() => {
  'use strict';

  // A folder belongs to a conversation, never to its type, display name or
  // last-message timestamp. All IGM modules must use this same identity.
  const ID_ATTRIBUTES = [
    'conversationid', 'conversation-id', 'data-conversation-id',
    'data-conversationid', 'room-id', 'data-room-id',
    'chat-id', 'data-chat-id', 'thread-id', 'data-thread-id'
  ];
  const ID_SELECTOR = ID_ATTRIBUTES.map(attribute => `[${attribute}]`).join(', ');
  const VALID_ID = /^[a-zA-Z0-9_.:-]{1,128}$/;

  function normaliseId(value) {
    const id = String(value ?? '').trim();
    return VALID_ID.test(id) && !/^(?:undefined|null|unknown)$/i.test(id) ? id : null;
  }

  function nodes(row, selector) {
    return [row, ...Array.from(row.querySelectorAll(selector))];
  }

  function nativeAttributeIdentity(row) {
    for (const element of nodes(row, ID_SELECTOR)) {
      for (const attribute of ID_ATTRIBUTES) {
        const id = normaliseId(element.getAttribute(attribute));
        if (id) return `native:${id}`;
      }
    }
    return null;
  }

  function classIdentity(row) {
    for (const element of nodes(row, '[class*="conversation_"]')) {
      for (const name of element.classList || []) {
        // The suffix must be an actual conversation identifier, not a shared
        // room-type CSS class. Numeric IDs and UUID-like tokens are supported.
        const match = /^conversation_(secretSociety|kingdom|private|player|group|room|chat)_([a-zA-Z0-9-]+)$/i.exec(name);
        if (!match) continue;
        const id = match[2];
        if (!/^\d+$/.test(id) && !/^[a-f\d]{8,}(?:-[a-f\d]+)*$/i.test(id)) continue;
        return `class:${match[1].toLowerCase()}:${id.toLowerCase()}`;
      }
    }
    return null;
  }

  function elementIdIdentity(row) {
    for (const element of nodes(row, '[id]')) {
      const match = /^(?:igmConversationEntry|igmConversation|conversation|chat|thread|room)[_:-]([a-zA-Z0-9-]+)$/i.exec(element.id || '');
      if (match) return `element:${match[1].toLowerCase()}`;
    }
    return null;
  }

  function linkIdentity(row) {
    for (const link of row.querySelectorAll('a[href]')) {
      const href = link.getAttribute('href') || '';
      const match = /(?:^|[?#&/])(?:conversation|chat|thread|room)(?:Id)?[=/:]([a-zA-Z0-9_-]+)/i.exec(href);
      if (match) return `link:${match[1].toLowerCase()}`;
    }
    return null;
  }

  function privatePlayerIdentity(row) {
    // A player ID identifies a one-to-one chat, but not a group conversation.
    if (row.querySelector('[class*="conversation_secretSociety_"], [class*="conversation_kingdom_"], .igmInfos .name.roomType7, .igmInfos .name.roomType5')) return null;
    const playerIds = [...new Set(
      Array.from(row.querySelectorAll('avatar-image[player-id]'))
        .map(node => normaliseId(node.getAttribute('player-id')))
        .filter(Boolean)
    )];
    return playerIds.length === 1 ? `private-player:${playerIds[0]}` : null;
  }

  window.qolIgmConversationIdentity = row => {
    if (!row) return null;
    return nativeAttributeIdentity(row)
      || classIdentity(row)
      || elementIdIdentity(row)
      || linkIdentity(row)
      || privatePlayerIdentity(row)
      || null;
    // Deliberately no fallback to display name or message timestamp. It is
    // safer to leave an unidentifiable chat untouched than change other chats.
  };
})();
