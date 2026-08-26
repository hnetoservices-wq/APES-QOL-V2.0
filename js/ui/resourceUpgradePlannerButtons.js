/**
 * APES QoL v2 — Resource Upgrade Planner button normalization.
 * Reuses the shared APES modal button component instead of feature-specific
 * action button styling.
 */
(() => {
    'use strict';

    const PANEL_ID = 'qol-resource-upgrade-planner-overlay';

    function applySharedButtons() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;

        const calculate = panel.querySelector('[data-action="calculate"]');
        const reset = panel.querySelector('[data-action="reset"]');

        if (calculate) {
            calculate.classList.remove('qol-rup-btn', 'secondary');
            calculate.classList.add('qol-modal-btn');
        }

        if (reset) {
            reset.classList.remove('qol-rup-btn', 'secondary');
            reset.classList.add('qol-modal-btn', 'qol-modal-btn-secondary');
        }
    }

    const observer = new MutationObserver(applySharedButtons);

    function begin() {
        applySharedButtons();
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', begin, { once: true });
    } else {
        begin();
    }
})();
