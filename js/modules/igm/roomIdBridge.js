(() => {
  'use strict';

  // Runs in the MAIN world so it can read Travian's AngularJS inbox model.
  // Only the room ID is exposed to the extension's isolated content scripts.
  const ATTR = 'data-apes-igm-room-id';
  const ROW = 'li.igmConversationEntry[inbox-entry]';
  const FLAG = '__APES_QOL_IGM_ROOM_ID_BRIDGE__';
  if (window[FLAG]) return;
  window[FLAG] = true;

  function readRoomId(row) {
    const angular = window.angular;
    if (typeof angular?.element !== 'function') return null;
    try {
      const element = angular.element(row);
      let scope = element.scope?.() || element.isolateScope?.() || null;
      for (let depth = 0; scope && depth < 5; depth += 1, scope = scope.$parent) {
        const entry = scope.inboxEntry;
        const value = entry?.data?.roomId ?? entry?.roomId;
        const id = String(value ?? '').trim();
        if (/^[a-zA-Z0-9_.:-]{1,128}$/.test(id) && !/^(?:undefined|null|unknown)$/i.test(id)) {
          return id;
        }
      }
    } catch (_) {
      // Some production game builds disable Angular scope debugging. The
      // isolated resolver then falls back to the row's exact activity time.
    }
    return null;
  }

  function publish() {
    for (const row of document.querySelectorAll(ROW)) {
      const id = readRoomId(row);
      if (id && row.getAttribute(ATTR) !== id) row.setAttribute(ATTR, id);
      if (!id && row.hasAttribute(ATTR)) row.removeAttribute(ATTR);
    }
  }

  // Chat rows are created dynamically; polling costs nothing until IGM opens.
  window.setInterval(publish, 800);
  if (document.readyState !== 'loading') publish();
  else document.addEventListener('DOMContentLoaded', publish, { once: true });
})();
