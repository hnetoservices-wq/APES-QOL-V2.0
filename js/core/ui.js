/**
 * APES QoL v2 shared UI helpers.
 */

(() => {
    'use strict';

    const APES = window.APES;

    if (!APES?.coreReady || APES.ui) {
        return;
    }

    function isTypingTarget(target) {
        if (!(target instanceof Element)) {
            return false;
        }

        return Boolean(target.closest(
            'input, textarea, select, [contenteditable="true"], ' +
            '[contenteditable=""], .ql-editor'
        ));
    }

    APES.ui = {
        isTypingTarget,

        closeOtherTools(source) {
            window.dispatchEvent(new CustomEvent('qol_close_others', {
                detail: { source }
            }));
        },

        activateElement(element) {
            if (!element) {
                throw new Error('The requested APES control is not available.');
            }

            element.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        },

        activateById(elementId) {
            this.activateElement(document.getElementById(elementId));
        },

        showById(elementId, display = 'flex') {
            const element = document.getElementById(elementId);

            if (!element) {
                throw new Error('The requested APES window is not available.');
            }

            this.closeOtherTools(elementId);
            element.style.setProperty('display', display, 'important');
            return element;
        }
    };
})();
