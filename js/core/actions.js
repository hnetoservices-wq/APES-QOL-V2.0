/**
 * APES QoL v2 action registry.
 * The Command Palette will consume this registry.
 */

(() => {
    'use strict';

    const APES = window.APES;

    if (!APES?.coreReady || APES.actions) {
        return;
    }

    const registry = new Map();

    function normalizeText(value) {
        return String(value ?? '').toLowerCase().trim();
    }

    APES.actions = {
        register(action) {
            if (!action?.id || !action?.label || typeof action.run !== 'function') {
                throw new Error(
                    'APES actions require id, label, and run properties.'
                );
            }

            const normalized = Object.freeze({
                id: String(action.id),
                label: String(action.label),
                description: String(action.description || ''),
                keywords: Array.isArray(action.keywords)
                    ? action.keywords.map(String)
                    : [],
                group: String(action.group || 'General'),
                enabled: typeof action.enabled === 'function'
                    ? action.enabled
                    : () => true,
                run: action.run
            });

            registry.set(normalized.id, normalized);
            APES.events.emit('actions:changed', { id: normalized.id });
            return () => this.unregister(normalized.id);
        },

        unregister(actionId) {
            const removed = registry.delete(String(actionId));

            if (removed) {
                APES.events.emit('actions:changed', { id: String(actionId) });
            }

            return removed;
        },

        list() {
            return Array.from(registry.values())
                .filter(action => action.enabled());
        },

        search(query = '') {
            const wanted = normalizeText(query);

            return this.list().filter(action => {
                const haystack = [
                    action.label,
                    action.description,
                    action.group,
                    ...action.keywords
                ].map(normalizeText).join(' ');

                return !wanted || haystack.includes(wanted);
            });
        },

        async run(actionId, context) {
            const action = registry.get(String(actionId));

            if (!action || !action.enabled()) {
                throw new Error(`APES action is unavailable: ${actionId}`);
            }

            APES.events.emit('action:started', { id: action.id });

            try {
                const result = await action.run(context);
                APES.events.emit('action:completed', { id: action.id });
                return result;
            } catch (error) {
                APES.events.emit('action:failed', {
                    id: action.id,
                    error
                });
                throw error;
            }
        }
    };
})();
