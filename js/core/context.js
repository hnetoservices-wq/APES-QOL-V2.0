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

    function numericId(value) {
        const text = String(value ?? '').trim();
        return /^\d+$/.test(text) ? text : '';
    }

    function getPlayerId() {
        // Never infer the logged-in player from a generic .playerLink: the user
        // may have another player's profile open. MAIN-world bridge data is
        // intentionally derived from the active own-village cache instead.
        const bridged = numericId(
            document.documentElement?.getAttribute('data-apes-player-id')
        );
        if (bridged) return bridged;

        // Reserved safe hook for any future own-profile marker. Do not broaden
        // this selector to generic player links.
        const explicitOwn = document.querySelector('[data-apes-own-player-id]');
        const explicitId = numericId(explicitOwn?.getAttribute('data-apes-own-player-id'));
        return explicitId || 'unknown';
    }

    function getVillageId() {
        const hashMatch = String(window.location.hash || '')
            .match(/(?:^|\/)villId:(\d+)/i);
        if (hashMatch) return hashMatch[1];

        const bridged = numericId(
            document.documentElement?.getAttribute('data-apes-village-id')
        );
        return bridged || 'unknown';
    }

    function getVillageName() {
        const element = document.querySelector(
            '.currentVillageName .dropdownHead .selectedItem .villageEntry, ' +
            '#villageList .dropdownHead .selectedItem .villageEntry, ' +
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

        isPlayerResolved() {
            return /^\d+$/.test(getPlayerId());
        },

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
