/**
 * APES QoL v2 shared scanner registry.
 *
 * Feature modules register their proven data collectors here. Consumers such
 * as the Village Overview Dashboard can then coordinate those collectors
 * without clicking another feature's UI or duplicating its parser.
 */
(() => {
    'use strict';

    const APES = window.APES;
    if (!APES?.coreReady || APES.scanners) return;

    const registry = new Map();

    function normalizeModes(value) {
        const modes = Array.isArray(value) ? value : ['full'];
        return Object.freeze(Array.from(new Set(modes.map(String))));
    }

    APES.scanners = {
        register(provider) {
            if (!provider?.id || !provider?.label || typeof provider.scan !== 'function') {
                throw new Error('APES scanners require id, label, and scan properties.');
            }

            const normalized = Object.freeze({
                id: String(provider.id),
                label: String(provider.label),
                description: String(provider.description || ''),
                scope: provider.scope === 'village' ? 'village' : 'account',
                modes: normalizeModes(provider.modes),
                enabled: typeof provider.enabled === 'function'
                    ? provider.enabled
                    : () => true,
                scan: provider.scan
            });

            registry.set(normalized.id, normalized);
            APES.events.emit('scanners:changed', { id: normalized.id });
            return () => this.unregister(normalized.id);
        },

        unregister(providerId) {
            const id = String(providerId);
            const removed = registry.delete(id);
            if (removed) APES.events.emit('scanners:changed', { id });
            return removed;
        },

        get(providerId) {
            return registry.get(String(providerId)) || null;
        },

        list({ scope = null, mode = null, includeDisabled = false } = {}) {
            return Array.from(registry.values()).filter(provider => {
                if (scope && provider.scope !== scope) return false;
                if (mode && !provider.modes.includes(mode)) return false;
                return includeDisabled || provider.enabled();
            });
        },

        async run(providerId, context = {}) {
            const provider = registry.get(String(providerId));
            if (!provider) throw new Error(`APES scanner is unavailable: ${providerId}`);
            if (!provider.enabled()) throw new Error(`${provider.label} is disabled.`);

            APES.events.emit('scanner:started', { id: provider.id, context });
            try {
                const result = await provider.scan(context);
                APES.events.emit('scanner:completed', { id: provider.id, result });
                return result;
            } catch (error) {
                APES.events.emit('scanner:failed', { id: provider.id, error });
                throw error;
            }
        }
    };
})();
