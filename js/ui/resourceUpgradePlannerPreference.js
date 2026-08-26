/** Preserve the Resource Upgrade Planner preference when APES server cache is cleared. */
(() => {
    'use strict';

    const FEATURE_KEY = 'resourceUpgradePlanner';
    const PREFERENCE_KEY = 'qolpref_resourceUpgradePlanner';
    const originalIsEnabled = window.isQolEnabled;

    window.isQolEnabled = function(key) {
        if (key === FEATURE_KEY) {
            try {
                const saved = localStorage.getItem(PREFERENCE_KEY);
                if (saved !== null) return saved !== 'false';
            } catch (_) {}
        }
        return typeof originalIsEnabled === 'function' ? originalIsEnabled(key) : true;
    };

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== FEATURE_KEY) return;
        try { localStorage.setItem(PREFERENCE_KEY, String(event.detail.enabled !== false)); } catch (_) {}
    });
})();
