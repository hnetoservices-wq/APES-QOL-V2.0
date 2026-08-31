/**
 * APES QoL v2 — Logged-in player identity bridge.
 *
 * Runs in Travian's MAIN world and exposes only the logged-in player's numeric
 * player id through a DOM data attribute shared with the isolated extension
 * world. This prevents player-scoped storage from guessing identity from an
 * arbitrary player profile currently open on screen.
 */
(() => {
    'use strict';

    const FLAG = '__APES_QOL_PLAYER_IDENTITY_BRIDGE__';
    const PLAYER_ATTRIBUTE = 'data-apes-player-id';
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
        if (hashId) return hashId;

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

    function resolvePlayerId() {
        const cacheObject = cache();
        const villageId = activeVillageId(cacheObject);
        if (!villageId) return '';
        return asId(modelData(cacheObject, `Village:${villageId}`)?.playerId);
    }

    function publish() {
        const playerId = resolvePlayerId();
        if (!playerId || !document.documentElement) return false;
        document.documentElement.setAttribute(PLAYER_ATTRIBUTE, playerId);
        return true;
    }

    let attempts = 0;
    const fastTimer = window.setInterval(() => {
        attempts += 1;
        if (publish() || attempts >= MAX_FAST_ATTEMPTS) {
            window.clearInterval(fastTimer);
        }
    }, FAST_INTERVAL_MS);

    // Try immediately when possible, then retry on SPA navigation. If Travian
    // initialized unusually slowly, the hash change gives us another chance.
    publish();
    window.addEventListener('hashchange', publish, { passive: true });
})();
