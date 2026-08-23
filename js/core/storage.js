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

    function assertSegment(value, label) {
        const segment = String(value ?? '').trim();

        if (!segment || segment.includes(':')) {
            throw new Error(`Invalid APES storage ${label}.`);
        }

        return segment;
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

        const playerId = assertSegment(
            APES.context.getPlayerId(),
            'player'
        );

        return `${PREFIX}:${server}:${playerId}:${featureSegment}:${keySegment}`;
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

        async get(options, fallback = null) {
            const storageKey = buildKey(options);
            const result = await chrome.storage.local.get(storageKey);
            return Object.hasOwn(result, storageKey)
                ? result[storageKey]
                : fallback;
        },

        async set(options, value) {
            const storageKey = buildKey(options);
            await chrome.storage.local.set({ [storageKey]: value });
            APES.events.emit('storage:changed', {
                key: storageKey,
                value
            });
            return value;
        },

        async remove(options) {
            const storageKey = buildKey(options);
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
