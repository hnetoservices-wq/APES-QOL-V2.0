function isMapPage() {
    return window.location.hash.includes('/page:map');
}

function isUserTyping() {
    const activeEl = document.activeElement;

    return !!(activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable ||
        activeEl.closest('[contenteditable="true"]')
    ));
}

function hasModifierKey(event) {
    return (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey
    );
}

function initializeKeybinds() {
    console.log('Travian QoL Extension: Modular Keybinds Initialized.');

    window.addEventListener('keydown', (event) => {
        if (isUserTyping()) {
            return;
        }

        // Never interfere with browser or operating-system shortcuts.
        // Examples: Ctrl/Cmd+C, Ctrl/Cmd+V, Ctrl/Cmd+F and Ctrl/Cmd+Z.
        if (hasModifierKey(event)) {
            return;
        }

        const code = event.code;

        // 1. Map movement (WASD)
        if (isMapPage() && isMapKey(code)) {
            handleMapMovement(event);
            return;
        }

        // Synthetic arrow events created by mapKeys.js must reach Travian's
        // map controls, but they must not trigger our village shortcuts.
        if (!event.isTrusted) {
            return;
        }

        // 2. Map hover hotkey (only active on the map page)
        if (isMapPage() && code === 'KeyR') {
            event.preventDefault();
            handleHoverSendTroops();
            return;
        }

        // 3. Navigation/action shortcuts
        const navKeys = [
            'Digit1',
            'Numpad1',
            'Digit2',
            'Numpad2',
            'Digit3',
            'Numpad3',
            'KeyQ',
            'ArrowLeft',
            'KeyE',
            'ArrowRight',
            'KeyB',
            'KeyT',
            'KeyC',
            'KeyF',
            'KeyV'
        ];

        if (navKeys.includes(code)) {
            event.preventDefault();
            handleNavigation(code);
        }
    }, true);

    window.addEventListener('keyup', (event) => {
        if (isUserTyping()) {
            return;
        }

        if (hasModifierKey(event)) {
            return;
        }

        if (isMapPage() && isMapKey(event.code)) {
            handleMapMovement(event);
        }
    }, true);
}

/**
 * The responsive APES toolbar is the single source of truth for toolbar
 * placement. CP Manager still performs a legacy maintenance pass that writes
 * its own left/top/display styles. When both systems run between frames the
 * CP icon can visibly jump. Reconcile those writes through the shared toolbar
 * before the browser paints, without creating another feature module/file.
 */
function stabilizeCpManagerToolbarIcon() {
    const BUTTON_ID = 'qol-cp-toggle-btn';
    let watchedButton = null;
    let styleObserver = null;
    let correcting = false;

    function applySharedToolbarLayout() {
        if (correcting || typeof window.qolRepositionAllButtons !== 'function') {
            return;
        }

        correcting = true;
        try {
            window.qolRepositionAllButtons();
        } finally {
            // Keep the guard active through the MutationObserver delivery
            // caused by the shared toolbar's own style writes.
            window.setTimeout(() => {
                correcting = false;
            }, 0);
        }
    }

    function watchButton() {
        const button = document.getElementById(BUTTON_ID);
        if (!button || button === watchedButton) {
            return;
        }

        styleObserver?.disconnect();
        watchedButton = button;

        styleObserver = new MutationObserver((mutations) => {
            if (correcting) {
                return;
            }

            const styleChanged = mutations.some((mutation) => (
                mutation.type === 'attributes' &&
                mutation.attributeName === 'style'
            ));

            if (styleChanged) {
                applySharedToolbarLayout();
            }
        });

        styleObserver.observe(button, {
            attributes: true,
            attributeFilter: ['style']
        });

        applySharedToolbarLayout();
    }

    watchButton();

    const mountObserver = new MutationObserver(() => {
        watchButton();
    });

    mountObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
}

initializeKeybinds();
stabilizeCpManagerToolbarIcon();