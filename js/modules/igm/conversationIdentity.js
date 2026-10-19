(() => {
  'use strict';

  // Prefer genuine room/conversation IDs. The game does not expose one for
  // every IGM row; use a unique room label or last-activity timestamp when
  // needed to keep the folder controls available. Both consumers reject
  // duplicate identities before persisting any manual choice.
  const ID_ATTRIBUTES = [
    'conversationid', 'conversation-id', 'data-conversation-id',
    'data-conversationid', 'room-id', 'data-room-id',
    'chat-id', 'data-chat-id', 'thread-id', 'data-thread-id',
    'data-apes-igm-room-id'
  ];
  const ID_SELECTOR = ID_ATTRIBUTES.map(attribute => `[${attribute}]`).join(', ');
  const VALID_ID = /^[a-zA-Z0-9_.:-]{1,128}$/;

  function normaliseId(value) {
    const id = String(value ?? '').trim();
    return VALID_ID.test(id) && !/^(?:undefined|null|unknown)$/i.test(id) ? id : null;
  }

  function nodes(row, selector) {
    // Never derive a native ID from our own generated badge.
    return [row, ...Array.from(row.querySelectorAll(selector))]
      .filter(element => !element.closest?.('.qol-igm-row-folder, .qol-row-category-select'));
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
        // conversation_secretSociety_medium_flat_black is a shared ICON
        // SPRITE, not a unique chat identifier. Only accept numeric/UUID IDs.
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

  function roomType(row) {
    if (row.querySelector('[class*="conversation_secretSociety_"], .igmInfos .name.roomType7')) return 'secret-society';
    if (row.querySelector('[class*="conversation_kingdom_"], .igmInfos .name.roomType5')) return 'kingdom';
    return 'private';
  }

  function titledConversationIdentity(row) {
    // For group chats the displayed group name is shared by many rooms.
    // Never use a shared Secret Society/Kingdom title as a room identity.
    if (roomType(row) !== 'private') return null;
    // Only read the conversation heading: never the preview, unread count,
    // most recent message or a badge added by APES.
    const heading = row.querySelector([
      '.igmInfos .name',
      '.igmInfos .conversationName',
      '.igmInfos .roomName',
      '.igmInfos .title',
      '.conversationName',
      '.roomName',
      '.chatName',
      '.conversationTitle'
    ].join(', '));
    const name = String(heading?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    return name && name.length <= 160
      ? `title:${roomType(row)}:${encodeURIComponent(name)}`
      : null;
  }

  function activityIdentity(row) {
    // Legacy compatibility: this was the identifier used by the working
    // version of the folder UI. It may change after new messages arrive,
    // but unlike the old type-level manual overrides it cannot affect every
    // Secret Society/Kingdom chat (duplicate keys are rejected).
    const timestamp = row.querySelector('span[i18ndt]')?.getAttribute('i18ndt');
    const value = String(timestamp || '').trim();
    return value
      ? `activity:${roomType(row)}:${encodeURIComponent(value)}`
      : null;
  }

  // Candidate keys are ordered by stability. The fallback keys also let
  // autoSort transfer explicit choices when Angular later supplies roomId.
  window.qolIgmConversationKeys = row => {
    if (!row) return [];
    return [...new Set([
      nativeAttributeIdentity(row),
      classIdentity(row),
      elementIdIdentity(row),
      linkIdentity(row),
      privatePlayerIdentity(row),
      titledConversationIdentity(row),
      activityIdentity(row)
    ].filter(Boolean))];
  };

  window.qolIgmConversationIdentity = row =>
    window.qolIgmConversationKeys(row)[0] || null;
})();
