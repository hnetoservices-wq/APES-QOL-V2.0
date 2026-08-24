/**
 * APES QoL v2 watched-player highlights.
 *
 * Reuses the existing per-server Watchlist data. Player IDs are preferred;
 * exact normalized player names are used only when no ID is exposed by the
 * game element.
 */

(() => {
    'use strict';

    const STYLE_ID = 'apes-watchlist-highlight-styles';
    const HIGHLIGHT_CLASS = 'apes-watched-player';
    const STORAGE_PREFIX = 'qol_watchlist_';
    const SCAN_DELAY = 90;
    const INDEX_CHECK_INTERVAL = 1000;
    const CANDIDATE_SELECTOR = [
        'a',
        '[data-player-id]',
        '[data-playerid]',
        '[href*="playerId:"]',
        '[ng-href*="playerId:"]',
        '[data-route*="playerId:"]',
        '[clickable*="playerId"]',
        '[ng-click*="playerId"]',
        '.playerName',
        '.player-name',
        '.player',
        '.ownerName',
        '.attacker',
        '.defender',
        'td.player'
    ].join(',');

    let observer = null;
    let scanTimer = null;
    let indexTimer = null;
    let lastStoredValue = null;
    let byPlayerId = new Map();
    let byPlayerName = new Map();

    function storageKey() {
        return STORAGE_PREFIX + window.location.hostname;
    }

    function enabled() {
        return typeof window.isQolEnabled === 'function' &&
            window.isQolEnabled('watchlist');
    }

    function normalizeName(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase();
    }

    function mergeEntry(target, entry, tab) {
        if (!target) {
            target = {
                playerId: String(entry.playerId || ''),
                playerName: String(entry.playerName || '').trim(),
                tabs: []
            };
        }

        const tabName = String(tab.name || 'Unnamed Watchlist').trim();

        if (tabName && !target.tabs.includes(tabName)) {
            target.tabs.push(tabName);
        }

        return target;
    }

    function rebuildIndex(force = false) {
        let storedValue = null;

        try {
            storedValue = localStorage.getItem(storageKey());
        } catch (error) {
            console.warn(
                '[APES Watchlist Highlights] Could not read Watchlist data.',
                error
            );
        }

        if (!force && storedValue === lastStoredValue) {
            return false;
        }

        lastStoredValue = storedValue;
        const nextById = new Map();
        const nextByName = new Map();

        if (storedValue) {
            try {
                const tabs = JSON.parse(storedValue);

                if (Array.isArray(tabs)) {
                    tabs.forEach(tab => {
                        if (!Array.isArray(tab?.entries)) {
                            return;
                        }

                        tab.entries.forEach(entry => {
                            const playerId = String(
                                entry?.playerId || ''
                            ).trim();
                            const playerName = normalizeName(
                                entry?.playerName
                            );

                            if (playerId) {
                                nextById.set(
                                    playerId,
                                    mergeEntry(
                                        nextById.get(playerId),
                                        entry,
                                        tab
                                    )
                                );
                            }

                            if (playerName) {
                                nextByName.set(
                                    playerName,
                                    mergeEntry(
                                        nextByName.get(playerName),
                                        entry,
                                        tab
                                    )
                                );
                            }
                        });
                    });
                }
            } catch (error) {
                console.warn(
                    '[APES Watchlist Highlights] Invalid Watchlist data.',
                    error
                );
            }
        }

        byPlayerId = nextById;
        byPlayerName = nextByName;
        return true;
    }

    function extractPlayerId(element) {
        const attributes = [
            'data-player-id',
            'data-playerid',
            'href',
            'ng-href',
            'data-route',
            'clickable',
            'ng-click'
        ];

        for (const attribute of attributes) {
            const value = element.getAttribute?.(attribute);

            if (!value) {
                continue;
            }

            const explicitMatch = value.match(
                /playerId(?:\s*[:=]\s*|\D{1,8})(\d+)/i
            );

            if (explicitMatch) {
                return explicitMatch[1];
            }

            const profileMatch = value.match(
                /(?:openPlayer|openProfile|playerProfile)\D{0,12}(\d+)/i
            );

            if (profileMatch) {
                return profileMatch[1];
            }
        }

        return '';
    }

    function elementPlayerName(element) {
        const directText = Array.from(element.childNodes || [])
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent)
            .join(' ')
            .trim();

        return normalizeName(directText || element.textContent);
    }

    function watchlistInfoFor(element) {
        const playerId = extractPlayerId(element);

        if (playerId && byPlayerId.has(playerId)) {
            return byPlayerId.get(playerId);
        }

        const playerName = elementPlayerName(element);

        if (playerName && byPlayerName.has(playerName)) {
            return byPlayerName.get(playerName);
        }

        return null;
    }

    function isApesInterface(element) {
        return Boolean(element.closest(
            '#qol-watchlist-container, #qol-modal, ' +
            '#apes-v2-command-overlay, .qol-modal-overlay, ' +
            '.qol-wl-dropdown-menu'
        ));
    }

    function restoreTitle(element) {
        if (!element.hasAttribute('data-apes-watch-original-title')) {
            element.removeAttribute('title');
            return;
        }

        const originalTitle = element.getAttribute(
            'data-apes-watch-original-title'
        );

        if (originalTitle) {
            element.setAttribute('title', originalTitle);
        } else {
            element.removeAttribute('title');
        }

        element.removeAttribute('data-apes-watch-original-title');
    }

    function removeHighlight(element) {
        if (!element.classList?.contains(HIGHLIGHT_CLASS)) {
            return;
        }

        element.classList.remove(HIGHLIGHT_CLASS);
        element.removeAttribute('data-apes-watch-tabs');
        restoreTitle(element);
    }

    function applyHighlight(element, info) {
        if (!element.hasAttribute('data-apes-watch-original-title')) {
            element.setAttribute(
                'data-apes-watch-original-title',
                element.getAttribute('title') || ''
            );
        }

        const tabList = info.tabs.join(', ');
        element.classList.add(HIGHLIGHT_CLASS);
        element.setAttribute('data-apes-watch-tabs', tabList);
        element.setAttribute(
            'title',
            'Watched player · ' + tabList
        );
    }

    function inspectCandidate(element) {
        if (
            !(element instanceof Element) ||
            isApesInterface(element)
        ) {
            return;
        }

        const info = watchlistInfoFor(element);

        if (info) {
            applyHighlight(element, info);
        } else {
            removeHighlight(element);
        }
    }

    function scanRoot(root = document) {
        if (!enabled()) {
            clearHighlights();
            return;
        }

        if (root instanceof Element && root.matches(CANDIDATE_SELECTOR)) {
            inspectCandidate(root);
        }

        root.querySelectorAll?.(CANDIDATE_SELECTOR)
            .forEach(inspectCandidate);
    }

    function scheduleScan(root = document) {
        if (scanTimer !== null) {
            window.clearTimeout(scanTimer);
        }

        scanTimer = window.setTimeout(() => {
            scanTimer = null;
            scanRoot(root?.isConnected ? root : document);
        }, SCAN_DELAY);
    }

    function clearHighlights() {
        document.querySelectorAll('.' + HIGHLIGHT_CLASS)
            .forEach(removeHighlight);
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .${HIGHLIGHT_CLASS} {
                position: relative !important;
                display: inline-block !important;
                margin: 0 1px !important;
                padding: 1px 17px 1px 4px !important;
                border: 1px solid rgba(145, 53, 35, .72) !important;
                border-radius: 4px !important;
                background:
                    linear-gradient(
                        to bottom,
                        rgba(126, 54, 34, .2),
                        rgba(90, 34, 25, .32)
                    ) !important;
                box-shadow:
                    inset 0 0 0 1px rgba(229, 185, 91, .18),
                    0 1px 2px rgba(35, 19, 12, .26) !important;
                color: #6f2018 !important;
                font-weight: 700 !important;
                text-decoration: none !important;
            }

            .${HIGHLIGHT_CLASS}::after {
                content: "●" !important;
                position: absolute !important;
                top: 50% !important;
                right: 5px !important;
                color: #c38b2d !important;
                font-size: 8px !important;
                line-height: 1 !important;
                text-shadow: 0 0 2px rgba(255, 235, 163, .85) !important;
                transform: translateY(-50%) !important;
            }

            .${HIGHLIGHT_CLASS}:hover {
                border-color: #b77c27 !important;
                background:
                    linear-gradient(
                        to bottom,
                        rgba(151, 73, 38, .28),
                        rgba(101, 40, 27, .4)
                    ) !important;
                box-shadow:
                    inset 0 0 0 1px rgba(239, 202, 112, .28),
                    0 0 5px rgba(172, 94, 36, .42) !important;
            }
        `;
        document.head.appendChild(style);
    }

    function start() {
        if (!enabled()) {
            stop();
            return;
        }

        injectStyles();
        rebuildIndex(true);
        scheduleScan(document);

        if (!observer) {
            observer = new MutationObserver(mutations => {
                const addedRoot = mutations
                    .flatMap(mutation => Array.from(mutation.addedNodes))
                    .find(node => node instanceof Element);

                scheduleScan(addedRoot || document);
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        if (!indexTimer) {
            indexTimer = window.setInterval(() => {
                if (rebuildIndex()) {
                    clearHighlights();
                    scheduleScan(document);
                }
            }, INDEX_CHECK_INTERVAL);
        }
    }

    function stop() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }

        if (scanTimer !== null) {
            window.clearTimeout(scanTimer);
            scanTimer = null;
        }

        if (indexTimer) {
            window.clearInterval(indexTimer);
            indexTimer = null;
        }

        clearHighlights();
    }

    window.addEventListener('qol_watchlist_changed', () => {
        if (enabled()) {
            rebuildIndex(true);
            clearHighlights();
            scheduleScan(document);
        }
    });

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== 'watchlist') {
            return;
        }

        if (event.detail.enabled) {
            start();
        } else {
            stop();
        }
    });

    window.addEventListener('hashchange', () => {
        if (enabled()) {
            scheduleScan(document);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, {
            once: true
        });
    } else {
        start();
    }
})();
