/**
 * APES QoL v2 context service.
 * Reads identity at call time because Travian changes village state without reloads.
 */

(() => {
    'use strict';

    const APES = window.APES;

    if (!APES?.coreReady || APES.context) {
        return;
    }

    function clean(value, fallback = 'unknown') {
        const result = String(value ?? '')
            .replace(/\s+/g, ' ')
            .trim();

        return result || fallback;
    }

    function getPlayerId() {
        const explicit = document.querySelector(
            '[data-player-id], [playerid].playerLink'
        );
        const value = explicit?.getAttribute('data-player-id') ||
            explicit?.getAttribute('playerid');

        return clean(value);
    }

    function getVillageId() {
        const hashMatch = String(window.location.hash || '')
            .match(/villId:(\d+)/i);

        return hashMatch ? hashMatch[1] : 'unknown';
    }

    function getVillageName() {
        const element = document.querySelector(
            '.currentVillageName .villageEntry, ' +
            '.villageEntry.active, .active .villageEntry'
        );

        return clean(element?.textContent, 'Unknown village');
    }

    APES.context = {
        getServer() {
            return clean(window.location.hostname.toLowerCase());
        },

        getPlayerId,
        getVillageId,
        getVillageName,

        snapshot() {
            return Object.freeze({
                server: this.getServer(),
                playerId: getPlayerId(),
                villageId: getVillageId(),
                villageName: getVillageName(),
                capturedAt: Date.now()
            });
        }
    };
})();
