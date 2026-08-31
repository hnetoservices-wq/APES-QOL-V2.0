/**
 * APES QoL v2 — Logged-in player identity bridge.
 *
 * Runs in Travian's MAIN world and exposes only the logged-in player's numeric
 * player id plus the active own-village id through DOM data attributes shared
 * with the isolated extension world. This prevents player-scoped storage from
 * guessing identity from an arbitrary player profile currently open on screen.
 */
(() => {
    'use strict';

    const FLAG = '__APES_QOL_PLAYER_IDENTITY_BRIDGE__';
    const PLAYER_ATTRIBUTE = 'data-apes-player-id';
    const VILLAGE_ATTRIBUTE = 'data-apes-village-id';
    const MAX_FAST_ATTEMPTS = 80;
    const FAST_INTERVAL_MS = 250;

    if (window[FLAG]) return;
    window[FLAG] = true;

    const asId = value => {
        const text = String(value ?? '').trim();
        return /^\d+$/.test(text) ? text : '';
    };

    function cache() {
        return window.Cache?.c || {};
    }

    function modelData(cacheObject, key) {
        const model = cacheObject?.[key];
        return model?.data ?? model ?? null;
    }

    function activeVillageId(cacheObject) {
        const hashId = String(location.hash || '')
            .match(/(?:^|\/)villId:(\d+)/i)?.[1];
        if (hashId && modelData(cacheObject, `Village:${hashId}`)) return hashId;

        for (const [key, model] of Object.entries(cacheObject)) {
            const match = key.match(/^Village:(\d+)$/);
            if (!match) continue;
            const data = model?.data ?? model;
            if (data?.isActive === true || data?.isActive === 1 || data?.isActive === '1') {
                return asId(data.villageId) || match[1];
            }
        }
        return '';
    }

    function resolveIdentity() {
        const cacheObject = cache();
        const villageId = activeVillageId(cacheObject);
        if (!villageId) return { villageId: '', playerId: '' };
        const playerId = asId(modelData(cacheObject, `Village:${villageId}`)?.playerId);
        return { villageId, playerId };
    }

    function publish() {
        const { villageId, playerId } = resolveIdentity();
        const root = document.documentElement;
        if (!root || !villageId || !playerId) return false;
        root.setAttribute(PLAYER_ATTRIBUTE, playerId);
        root.setAttribute(VILLAGE_ATTRIBUTE, villageId);
        return true;
    }

    let attempts = 0;
    const fastTimer = window.setInterval(() => {
        attempts += 1;
        if (publish() || attempts >= MAX_FAST_ATTEMPTS) {
            window.clearInterval(fastTimer);
        }
    }, FAST_INTERVAL_MS);

    // Try immediately when possible, then refresh on SPA navigation so context
    // follows village switches without requiring a page reload.
    publish();
    window.addEventListener('hashchange', publish, { passive: true });
})();
