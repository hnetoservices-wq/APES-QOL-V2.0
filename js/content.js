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
 * APES toolbar authority.
 *
 * menu.js still owns toolbar creation/dropdown behavior. This layer is the
 * final authority for physical placement of every toolbar control so feature
 * modules cannot leave gaps, overlap one another, or fight over left/top.
 *
 * The toolbar remains expanded with up to eight enabled feature buttons when
 * they fit in the viewport. Nine or more buttons use the cog dropdown.
 */
function initializeToolbarAuthority() {
    const BUTTON_SIZE = 30;
    const BUTTON_GAP = 6;
    const MAX_EXPANDED_ITEMS = 8;
    const COG_ID = 'qol-cog-btn';
    const DROPDOWN_ID = 'qol-toolbar-dropdown';
    const TOOLBAR_ITEMS = [
        { id: 'qol-help-toggle-btn', key: 'help' },
        { id: 'qol-rally-point-toggle-btn', key: 'rallyPointParser' },
        { id: 'qol-watchlist-toggle', key: 'watchlist' },
        { id: 'qol-checklist-toggle-btn', key: 'checklists' },
        { id: 'qol-building-alarm-toggle-btn', key: 'buildingAlarm' },
        { id: 'qol-npc-calc-toggle-btn', key: 'npcCalculator' },
        { id: 'qol-distance-calc-toggle-btn', key: 'distanceCalculator' },
        { id: 'qol-oasis-toggle-btn', key: 'oasisScanner' },
        { id: 'qol-report-archive-toggle', key: 'reportArchive' },
        { id: 'qol-cp-toggle-btn', key: 'cpManager' },
        { id: 'qol-ss-scanner-toggle-btn', key: 'secretSocietyScanner' },
        { id: 'qol-tribe-skins-toggle-btn', key: 'visualTribeSkins' }
    ];
    const MANAGED_IDS = new Set([COG_ID, ...TOOLBAR_ITEMS.map(item => item.id)]);

    const originalReposition = typeof window.qolRepositionAllButtons === 'function'
        ? window.qolRepositionAllButtons.bind(window)
        : null;

    if (!originalReposition) {
        window.setTimeout(initializeToolbarAuthority, 50);
        return;
    }

    let applyingLayout = false;
    let repositionScheduled = false;
    let forceExpanded = false;
    const styleObservers = new Map();

    function featureEnabled(key) {
        return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(key) === true;
    }

    function enabledToolbarItems() {
        return TOOLBAR_ITEMS.filter(item => {
            if (!featureEnabled(item.key)) return false;
            return Boolean(document.getElementById(item.id)?.isConnected);
        });
    }

    function disconnectStyleObservers() {
        styleObservers.forEach(record => record.observer.disconnect());
    }

    function scheduleReposition() {
        if (applyingLayout || repositionScheduled) return;
        repositionScheduled = true;
        requestAnimationFrame(() => {
            repositionScheduled = false;
            window.qolRepositionAllButtons?.();
        });
    }

    function bindStyleObservers() {
        MANAGED_IDS.forEach(id => {
            const node = document.getElementById(id);
            const existing = styleObservers.get(id);

            if (!node) {
                existing?.observer.disconnect();
                styleObservers.delete(id);
                return;
            }

            if (existing?.node === node) {
                existing.observer.observe(node, {
                    attributes: true,
                    attributeFilter: ['style']
                });
                return;
            }

            existing?.observer.disconnect();
            const observer = new MutationObserver(() => {
                if (!applyingLayout) scheduleReposition();
            });
            observer.observe(node, {
                attributes: true,
                attributeFilter: ['style']
            });
            styleObservers.set(id, { node, observer });
        });
    }

    function setManagedButtonLayout(button, left, top) {
        if (!button) return;

        // Remove legacy opposing anchors before assigning the shared slot.
        button.style.removeProperty('right');
        button.style.removeProperty('bottom');

        Object.entries({
            position: 'fixed',
            left: `${left}px`,
            top: `${top}px`,
            width: `${BUTTON_SIZE}px`,
            height: `${BUTTON_SIZE}px`,
            display: 'flex',
            visibility: 'visible',
            opacity: '1',
            'pointer-events': 'auto',
            margin: '0',
            'z-index': '9999'
        }).forEach(([property, value]) => {
            button.style.setProperty(property, value, 'important');
        });

        button.dataset.qolToolbarManaged = 'true';
    }

    function fitsExpanded(villageRect, enabledCount) {
        if (enabledCount > MAX_EXPANDED_ITEMS) return false;

        const start = villageRect.right + 20;
        const requiredWidth = BUTTON_SIZE + enabledCount * (BUTTON_SIZE + BUTTON_GAP);
        return start + requiredWidth <= window.innerWidth - 16;
    }

    function closeToolbarDropdown() {
        document.getElementById(DROPDOWN_ID)?.classList.remove('qol-open');
    }

    function applyToolbarLayout() {
        if (applyingLayout) return;
        applyingLayout = true;
        disconnectStyleObservers();

        try {
            // Let menu.js update its own internal collapsed/dropdown state first.
            originalReposition();

            const villageList = document.getElementById('villageList');
            const cog = document.getElementById(COG_ID);
            if (!villageList || !cog) {
                forceExpanded = false;
                return;
            }

            const rect = villageList.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                forceExpanded = false;
                return;
            }

            const items = enabledToolbarItems();
            forceExpanded = fitsExpanded(rect, items.length);

            // If nine+ tools are enabled, or the viewport is genuinely too
            // narrow, menu.js's collapsed state is already the desired state.
            if (!forceExpanded) return;

            document.body?.classList.remove('qol-toolbar-collapsed');
            window.qolToolbarCollapsed = false;
            closeToolbarDropdown();

            let left = rect.right + 20;
            const top = rect.top + 4;

            setManagedButtonLayout(cog, left, top);
            left += BUTTON_SIZE + BUTTON_GAP;

            items.forEach(item => {
                setManagedButtonLayout(document.getElementById(item.id), left, top);
                left += BUTTON_SIZE + BUTTON_GAP;
            });

            TOOLBAR_ITEMS.forEach(item => {
                if (items.includes(item)) return;
                const button = document.getElementById(item.id);
                if (!button) return;
                if (!featureEnabled(item.key)) {
                    button.style.setProperty('display', 'none', 'important');
                }
            });
        } finally {
            applyingLayout = false;
            bindStyleObservers();
        }
    }

    // Replace the public reposition hook. Feature modules may request a
    // reposition, but only this shared authority decides the final positions.
    window.qolRepositionAllButtons = applyToolbarLayout;

    // menu.js internally still considers 6-8 buttons "collapsed". When this
    // authority has enough room to keep them expanded, intercept the cog so it
    // continues opening Settings instead of the overflow dropdown.
    document.addEventListener('click', event => {
        if (!forceExpanded || !event.target.closest(`#${COG_ID}`)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closeToolbarDropdown();
        window.dispatchEvent(new CustomEvent('qol_close_others', {
            detail: { source: 'menu' }
        }));
        document.getElementById('qol-modal-overlay')
            ?.style.setProperty('display', 'flex', 'important');
    }, true);

    document.addEventListener('keydown', event => {
        if (!forceExpanded || (event.key !== 'Enter' && event.key !== ' ')) return;
        if (!event.target.closest(`#${COG_ID}`)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closeToolbarDropdown();
        window.dispatchEvent(new CustomEvent('qol_close_others', {
            detail: { source: 'menu' }
        }));
        document.getElementById('qol-modal-overlay')
            ?.style.setProperty('display', 'flex', 'important');
    }, true);

    // Rebind when feature modules mount/remove toolbar controls dynamically.
    const mountObserver = new MutationObserver(() => {
        bindStyleObservers();
        scheduleReposition();
    });
    mountObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    window.addEventListener('resize', scheduleReposition);
    window.addEventListener('scroll', scheduleReposition);
    window.addEventListener('qol_setting_changed', scheduleReposition);

    bindStyleObservers();
    applyToolbarLayout();
}

initializeKeybinds();
initializeToolbarAuthority();