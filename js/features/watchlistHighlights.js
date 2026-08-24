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
    const TEXT_HIGHLIGHT_NAME = 'apes-watched-player-text';
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

    function isExcludedTextNode(node) {
        const parent = node.parentElement;

        return !parent ||
            isApesInterface(parent) ||
            Boolean(parent.closest(
                'script, style, noscript, input, textarea, select, option, ' +
                '[contenteditable="true"], [aria-hidden="true"]'
            ));
    }

    function isNameBoundary(character) {
        const separators =
            ' \\t\\r\\n.,:;!?()[]{}<>"\'|/\\+=_*&^%$#@~–—-';

        return !character || separators.includes(character);
    }

    function clearTextHighlights() {
        if (window.CSS?.highlights) {
            window.CSS.highlights.delete(TEXT_HIGHLIGHT_NAME);
        }
    }

    function refreshTextHighlights() {
        clearTextHighlights();

        const watchedNames = Array.from(byPlayerName.keys())
            .filter(Boolean)
            .sort((a, b) => b.length - a.length);

        if (!watchedNames.length || !document.body) {
            return;
        }

        const supportsTextHighlights =
            typeof window.Highlight === 'function' &&
            Boolean(window.CSS?.highlights);
        const ranges = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT
        );

        let node = walker.nextNode();

        while (node) {
            if (!isExcludedTextNode(node)) {
                const parent = node.parentElement;
                const nodeName = normalizeName(node.nodeValue);
                const parentName = normalizeName(parent.textContent);
                const exactInfo = byPlayerName.get(nodeName);

                if (
                    exactInfo &&
                    nodeName === parentName &&
                    !parent.classList.contains(HIGHLIGHT_CLASS)
                ) {
                    applyHighlight(parent, exactInfo);
                } else if (
                    supportsTextHighlights &&
                    !parent.closest('.' + HIGHLIGHT_CLASS)
                ) {
                    const rawText = String(node.nodeValue || '');
                    const lowerText = rawText.toLocaleLowerCase();
                    const occupied = [];

                    watchedNames.forEach(name => {
                        let start = 0;
                        let index = lowerText.indexOf(name, start);

                        while (index !== -1) {
                            const end = index + name.length;
                            const overlaps = occupied.some(range => {
                                return index < range.end &&
                                    end > range.start;
                            });

                            if (
                                !overlaps &&
                                isNameBoundary(lowerText[index - 1]) &&
                                isNameBoundary(lowerText[end])
                            ) {
                                const range = document.createRange();
                                range.setStart(node, index);
                                range.setEnd(node, end);
                                ranges.push(range);
                                occupied.push({ start: index, end });
                            }

                            start = Math.max(end, index + 1);
                            index = lowerText.indexOf(name, start);
                        }
                    });
                }
            }

            node = walker.nextNode();
        }

        if (supportsTextHighlights && ranges.length) {
            window.CSS.highlights.set(
                TEXT_HIGHLIGHT_NAME,
                new window.Highlight(...ranges)
            );
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

        refreshTextHighlights();
    }

    function scheduleScan(root = document) {
        /*
         * Throttle rather than debounce. Travian can mutate the DOM
         * continuously while rendering; restarting this timer on every
         * mutation could postpone highlights indefinitely.
         */
        if (scanTimer !== null) {
            return;
        }

        scanTimer = window.setTimeout(() => {
            scanTimer = null;
            scanRoot(root?.isConnected ? root : document);
        }, SCAN_DELAY);
    }

    function clearHighlights() {
        clearTextHighlights();
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
                color: #d28a16 !important;
            }

            ::highlight(${TEXT_HIGHLIGHT_NAME}) {
                color: #d28a16;
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
                if (mutations.some(mutation => {
                    return mutation.addedNodes.length > 0;
                })) {
                    scheduleScan(document);
                }
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
