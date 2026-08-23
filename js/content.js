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
            'KeyZ',
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

initializeKeybinds();