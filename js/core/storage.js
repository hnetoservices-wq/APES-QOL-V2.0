/**
 * APES QoL v2 namespaced storage.
 * Legacy v1 keys are never removed automatically.
 */

(() => {
    'use strict';

    const APES = window.APES;

    if (!APES?.context || APES.storage) {
        return;
    }

    const PREFIX = 'apes:v2';
    const VALID_SCOPES = new Set(['global', 'server', 'player']);
    const PLAYER_ID_TIMEOUT_MS = 6000;
    const PLAYER_ID_POLL_MS = 60;

    function assertSegment(value, label) {
        const segment = String(value ?? '').trim();

        if (!segment || segment.includes(':')) {
            throw new Error(`Invalid APES storage ${label}.`);
        }

        return segment;
    }

    function assertPlayerId(value) {
        const playerId = String(value ?? '').trim();
        if (!/^\d+$/.test(playerId)) {
            throw new Error('APES player identity is not resolved yet.');
        }
        return playerId;
    }

    function buildKey({ feature, key, scope = 'player' }) {
        if (!VALID_SCOPES.has(scope)) {
            throw new Error(`Unknown APES storage scope: ${scope}`);
        }

        const featureSegment = assertSegment(feature, 'feature');
        const keySegment = assertSegment(key, 'key');

        if (scope === 'global') {
            return `${PREFIX}:global:${featureSegment}:${keySegment}`;
        }

        const server = assertSegment(APES.context.getServer(), 'server');

        if (scope === 'server') {
            return `${PREFIX}:${server}:server:${featureSegment}:${keySegment}`;
        }

        const playerId = assertPlayerId(APES.context.getPlayerId());
        return `${PREFIX}:${server}:${playerId}:${featureSegment}:${keySegment}`;
    }

    async function waitForPlayerId(timeoutMs = PLAYER_ID_TIMEOUT_MS) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const playerId = String(APES.context.getPlayerId?.() || '').trim();
            if (/^\d+$/.test(playerId)) return playerId;
            await new Promise(resolve => window.setTimeout(resolve, PLAYER_ID_POLL_MS));
        }
        throw new Error(
            'APES could not resolve the logged-in player identity. ' +
            'Player-scoped data was not read or written to avoid account mixing.'
        );
    }

    async function buildKeyAsync(options) {
        const scope = options?.scope || 'player';
        if (scope === 'player') await waitForPlayerId();
        return buildKey(options);
    }

    function getAllChromeStorage() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get(null, result => {
                const error = chrome.runtime.lastError;
                error ? reject(error) : resolve(result || {});
            });
        });
    }

    APES.storage = {
        prefix: PREFIX,
        key: buildKey,
        waitForPlayerId,

        async get(options, fallback = null) {
            const storageKey = await buildKeyAsync(options);
            const result = await chrome.storage.local.get(storageKey);
            return Object.hasOwn(result, storageKey)
                ? result[storageKey]
                : fallback;
        },

        async set(options, value) {
            const storageKey = await buildKeyAsync(options);
            await chrome.storage.local.set({ [storageKey]: value });
            APES.events.emit('storage:changed', {
                key: storageKey,
                value
            });
            return value;
        },

        async remove(options) {
            const storageKey = await buildKeyAsync(options);
            await chrome.storage.local.remove(storageKey);
            APES.events.emit('storage:removed', { key: storageKey });
        },

        async list({ prefix = PREFIX } = {}) {
            const all = await getAllChromeStorage();
            return Object.fromEntries(
                Object.entries(all).filter(([key]) => {
                    return key.startsWith(prefix);
                })
            );
        }
    };
})();
