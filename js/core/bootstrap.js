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

    APES.version = '2.0.0-alpha.1';
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

    window.APES = APES;
    APES.events.emit('core:ready', { version: APES.version });
})();
