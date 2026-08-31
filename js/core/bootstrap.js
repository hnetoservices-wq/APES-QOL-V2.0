/**
 * APES QoL v2 core bootstrap.
 * Creates the shared namespace and event bus before any feature loads.
 */

(() => {
    'use strict';

    if (window.APES?.coreReady) {
        return;
    }

    const listeners = new Map();
    const APES = window.APES || {};

    function readManifest() {
        try {
            return chrome?.runtime?.getManifest?.() || {};
        } catch (_) {
            return {};
        }
    }

    const manifest = readManifest();
    const version = String(
        manifest.version_name ||
        manifest.version ||
        '2.0.0'
    ).trim();

    APES.version = version;
    APES.release = Object.freeze({
        name: String(manifest.name || 'APES QoL v2'),
        version,
        numericVersion: String(manifest.version || version),
        channel: /alpha/i.test(version)
            ? 'alpha'
            : (/beta/i.test(version) ? 'beta' : 'stable')
    });
    APES.coreReady = true;
    APES.startedAt = Date.now();

    APES.events = {
        on(eventName, listener) {
            if (typeof listener !== 'function') {
                throw new TypeError('APES event listener must be a function.');
            }

            if (!listeners.has(eventName)) {
                listeners.set(eventName, new Set());
            }

            listeners.get(eventName).add(listener);
            return () => this.off(eventName, listener);
        },

        off(eventName, listener) {
            listeners.get(eventName)?.delete(listener);
        },

        emit(eventName, detail) {
            listeners.get(eventName)?.forEach(listener => {
                try {
                    listener(detail);
                } catch (error) {
                    console.error(
                        `[APES.events] Listener failed for ${eventName}:`,
                        error
                    );
                }
            });

            window.dispatchEvent(new CustomEvent(
                `apes:${eventName}`,
                { detail }
            ));
        }
    };

    function syncVersionBadge(root = document) {
        const nodes = [];
        if (root?.matches?.('.qol-version-badge,[data-apes-version]')) nodes.push(root);
        root?.querySelectorAll?.('.qol-version-badge,[data-apes-version]').forEach(node => nodes.push(node));
        nodes.forEach(node => {
            const label = `v${APES.version}`;
            if (node.textContent !== label) node.textContent = label;
            node.setAttribute('title', APES.release.name);
        });
    }

    APES.syncVersionBadge = syncVersionBadge;
    window.APES = APES;

    const beginVersionSync = () => {
        syncVersionBadge(document);
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                mutation.addedNodes?.forEach(node => {
                    if (node?.nodeType === Node.ELEMENT_NODE) syncVersionBadge(node);
                });
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    };

    if (document.documentElement) beginVersionSync();
    else document.addEventListener('DOMContentLoaded', beginVersionSync, { once: true });

    APES.events.emit('core:ready', {
        version: APES.version,
        release: APES.release
    });
})();
