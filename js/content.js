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
 * Toolbar policy only.
 *
 * menu.js remains the sole owner of physical toolbar placement. We only
 * replace its collapse decision here until the final menu registry cleanup:
 * keep up to eight enabled tools expanded when they physically fit, and use
 * the cog dropdown for nine or more tools (or a genuinely narrow viewport).
 *
 * Importantly, this code never writes toolbar left/top/display styles and
 * never observes toolbar style mutations. That avoids the previous feedback
 * loop where two layout systems alternated positions every frame.
 */
function configureToolbarCollapsePolicy() {
    if (typeof shouldCollapseToolbar !== 'function') {
        window.setTimeout(configureToolbarCollapsePolicy, 50);
        return;
    }

    shouldCollapseToolbar = function(villageRect, enabledCount) {
        if (enabledCount > 8) return true;

        const buttonSize = 30;
        const buttonGap = 6;
        const start = villageRect.right + 20;
        const requiredWidth = buttonSize + enabledCount * (buttonSize + buttonGap);

        return start + requiredWidth > window.innerWidth - 16;
    };

    window.qolRepositionAllButtons?.();
}

initializeKeybinds();
configureToolbarCollapsePolicy();
