/**
 * APES QoL v2 radial command menu.
 *
 * Hold G outside typing fields to show every eligible enabled feature.
 * Release G or press Escape to close. Click an icon to launch its feature.
 */

(() => {
    'use strict';

    const APES = window.APES;

    if (!APES?.actions || !APES.ui) {
        return;
    }

    const OVERLAY_ID = 'apes-v2-command-overlay';
    const HOLD_DELAY = 180;
    const ITEMS_PER_RING = 8;
    const FIRST_RING_RADIUS = 150;
    const MIN_ITEM_DISTANCE = 126;
    const RING_GAP = 120;

    let holdTimer = null;
    let commandKecommandKeyHeld = false;

    const ICONS = {
        auction: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20h16M7 17l8-8m-6-2 8 8M5 9l4-4 2 2-4 4zm8 8 4-4 2 2-4 4z"/>
            </svg>
        `,
        checklist: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="3" width="14" height="18" rx="2"/>
                <path d="M8 8l1.5 1.5L12 7M8 14l1.5 1.5L12 13M14 9h2M14 15h2"/>
            </svg>
        `,
        alarm: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="13" r="7"/>
                <path d="M12 9v4l3 2M7 3 4 6m13-3 3 3M9 21h6"/>
            </svg>
        `,
        chat: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5h16v11H9l-5 4z"/>
                <path d="M8 9h8M8 12h6"/>
            </svg>
        `,
        rally: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4l7 7M13 13l7 7M14 4h6v6M20 4l-8 8M4 20l5-5"/>
            </svg>
        `,
        calculator: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="2" width="14" height="20" rx="2"/>
                <path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2"/>
            </svg>
        `,
        cp: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 18V8l8-5 8 5v10"/>
                <path d="M2 18h20M8 18v-6h8v6"/>
                <text x="12" y="10" text-anchor="middle">CP</text>
            </svg>
        `,
        oasis: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="8"/>
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4M8 16c2-5 5-7 8-8-1 4-3 7-8 8z"/>
            </svg>
        `,
        archive: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16v14H4zM3 3h18v4H3zM9 11h6"/>
            </svg>
        `,
        watchlist: `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6h16v15H4zM8 3h8v5H8zM8 12h8M8 16h6"/>
            </svg>
        `
    };

    /*
     * Add future radial commands here. An entry appears only when its
     * feature setting is enabled. Keybind-only and passive features are
     * intentionally not registered.
     */
    const RADIAL_FEATURES = [
        {
            id: 'auction.open',
            featureKey: 'auctionHouseScanner',
            label: 'Auction House Scanner',
            icon: ICONS.auction,
            run: () => navigateTo('/herotab:Auctions/window:hero/cp:1')
        },
        {
            id: 'checklists.open',
            featureKey: 'checklists',
            label: 'Checklists',
            icon: ICONS.checklist,
            controlId: 'qol-checklist-toggle-btn'
        },
        {
            id: 'buildingAlarms.open',
            featureKey: 'buildingAlarm',
            label: 'Building Alarms',
            icon: ICONS.alarm,
            run: () => APES.ui.showById(
                'qol-building-alarm-panel',
                'block'
            )
        },
        {
            id: 'igm.open',
            featureKey: 'igmEnhanced',
            label: 'IGM Enhancer',
            icon: ICONS.chat,
            run: () => navigateTo('/window:igm')
        },
        {
            id: 'rallyPoint.open',
            featureKey: 'rallyPointParser',
            label: 'Rally Point Scanner',
            icon: ICONS.rally,
            controlId: 'qol-rally-point-toggle-btn'
        },
        {
            id: 'npc.open',
            featureKey: 'npcCalculator',
            label: 'NPC Calculator',
            icon: ICONS.calculator,
            controlId: 'qol-npc-calc-toggle-btn'
        },
        {
            id: 'cp.open',
            featureKey: 'cpManager',
            label: 'CP Manager',
            icon: ICONS.cp,
            controlId: 'qol-cp-toggle-btn'
        },
        {
            id: 'oasis.open',
            featureKey: 'oasisScanner',
            label: 'Oasis Scanner',
            icon: ICONS.oasis,
            controlId: 'qol-oasis-toggle-btn'
        },
        {
            id: 'reports.open',
            featureKey: 'reportArchive',
            label: 'Report Archive',
            icon: ICONS.archive,
            controlId: 'qol-report-archive-toggle'
        },
        {
            id: 'watchlist.open',
            featureKey: 'watchlist',
            label: 'Watchlists',
            icon: ICONS.watchlist,
            controlId: 'qol-watchlist-toggle'
        }
    ];

    function featureEnabled(featureKey) {
        return typeof window.isQolEnabled !== 'function' ||
            window.isQolEnabled(featureKey) === true;
    }

    function navigateTo(suffix) {
        const currentPath = String(window.location.hash || '')
            .replace(/^#\/?/, '');
        const basePath = currentPath
            .replace(/\/(?:window|herotab):.*$/i, '')
            .replace(/\/$/, '') ||
            'page:village';

        closeRadial();
        window.location.hash = `#/${basePath}${suffix}`;
    }

    function activateControl(controlId) {
        closeRadial();
        APES.ui.activateById(controlId);
    }

    RADIAL_FEATURES.forEach(feature => {
        APES.actions.register({
            id: feature.id,
            label: feature.label,
            description: `Open ${feature.label}.`,
            keywords: [feature.label, feature.featureKey],
            group: 'Radial menu',
            enabled: () => featureEnabled(feature.featureKey),
            run: feature.run || (() => activateControl(feature.controlId))
        });
    });

    function getEnabledFeatures() {
        return RADIAL_FEATURES.filter(feature => {
            return featureEnabled(feature.featureKey);
        });
    }

    function getRingRadius(itemCount, ringIndex) {
        const minimumRadius = itemCount > 1
            ? MIN_ITEM_DISTANCE / (2 * Math.sin(Math.PI / itemCount))
            : 0;

        return Math.max(
            FIRST_RING_RADIUS + ringIndex * RING_GAP,
            minimumRadius
        );
    }

    function getPosition(index, features) {
        const ringIndex = Math.floor(index / ITEMS_PER_RING);
        const ringStart = ringIndex * ITEMS_PER_RING;
        const ringItems = features.slice(
            ringStart,
            ringStart + ITEMS_PER_RING
        );
        const positionInRing = index - ringStart;
        const angle = -Math.PI / 2 +
            (Math.PI * 2 * positionInRing) / ringItems.length;
        const radius = getRingRadius(ringItems.length, ringIndex);

        return {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
            ringIndex
        };
    }

    function mountRadial() {
        let overlay = document.getElementById(OVERLAY_ID);

        if (overlay) {
            return overlay;
        }

        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="apes-v2-radial" role="dialog" aria-modal="true" aria-label="APES feature wheel">
                <div class="apes-v2-radial-center">
                    <span class="apes-v2-radial-logo">APES</span>
                    <strong>Command Wheel</strong>
                    <span class="apes-v2-radial-hint">Hold G · Click a feature</span>
                </div>
                <div class="apes-v2-radial-items"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', event => {
            if (event.target === overlay) {
                closeRadial();
                return;
            }

            const item = event.target.closest('[data-apes-action-id]');

            if (item) {
                void runFeature(item.dataset.apesActionId);
            }
        });

        overlay.addEventListener('pointerover', event => {
            const item = event.target.closest('[data-apes-action-id]');
            const center = overlay.querySelector(
                '.apes-v2-radial-center strong'
            );

            if (item && center) {
                center.textContent = item.dataset.label;
            }
        });

        overlay.addEventListener('pointerout', event => {
            const item = event.target.closest('[data-apes-action-id]');

            if (
                item &&
                !item.contains(event.relatedTarget)
            ) {
                const center = overlay.querySelector(
                    '.apes-v2-radial-center strong'
                );

                if (center) {
                    center.textContent = 'Command Wheel';
                }
            }
        });

        return overlay;
    }

    function renderRadial() {
        const overlay = mountRadial();
        const radial = overlay.querySelector('.apes-v2-radial');
        const items = overlay.querySelector('.apes-v2-radial-items');
        const features = getEnabledFeatures();
        const rings = Math.max(
            1,
            Math.ceil(features.length / ITEMS_PER_RING)
        );
        const lastRingStart = (rings - 1) * ITEMS_PER_RING;
        const lastRingCount = Math.min(
            ITEMS_PER_RING,
            Math.max(1, features.length - lastRingStart)
        );
        const furthestRadius = getRingRadius(
            lastRingCount,
            rings - 1
        );
        const size = furthestRadius * 2 + 130;

        radial.style.setProperty('--apes-radial-size', `${size}px`);

        if (!features.length) {
            items.innerHTML = `
                <div class="apes-v2-radial-empty">
                    No eligible APES features are enabled.
                </div>
            `;
            return;
        }

        items.innerHTML = features.map((feature, index) => {
            const position = getPosition(index, features);

            return `
                <div
                    class="apes-v2-radial-item"
                    data-apes-action-id="${escapeHtml(feature.id)}"
                    data-label="${escapeHtml(feature.label)}"
                    role="button"
                    tabindex="0"
                    title="${escapeHtml(feature.label)}"
                    style="--apes-x:${position.x.toFixed(2)}px;--apes-y:${position.y.toFixed(2)}px;"
                >
                    <span class="apes-v2-radial-icon">
                        ${feature.icon}
                    </span>
                    <span class="apes-v2-radial-label">
                        ${escapeHtml(feature.label)}
                    </span>
                </div>
            `;
        }).join('');
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function runFeature(actionId) {
        try {
            await APES.actions.run(
                actionId,
                APES.context?.snapshot()
            );
        } catch (error) {
            console.error('[APES radial menu]', error);
        }
    }

    function openRadial() {
        const overlay = mountRadial();
        renderRadial();
        APES.ui.closeOtherTools('commandPalette');
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function closeRadial() {
        const overlay = document.getElementById(OVERLAY_ID);
        overlay?.classList.remove('open');
        overlay?.setAttribute('aria-hidden', 'true');
    }

    function commandPaletteEnabled() {
        try {
            return localStorage.getItem(
                'qol_keybind_commandPalette'
            ) !== 'false';
        } catch (_error) {
            return true;
        }
    }

    function isCommandKey(event) {
        return event.code === 'KeyG' ||
            String(event.key || '').toLowerCase() === 'g';
    }

    function clearHoldTimer() {
        if (holdTimer !== null) {
            window.clearTimeout(holdTimer);
            holdTimer = null;
        }
    }

    window.addEventListener('keydown', event => {
        if (
            !isCommandKey(event) ||
            !commandPaletteEnabled() ||
            event.ctrlKey ||
            event.altKey ||
            event.metaKey ||
            event.shiftKey ||
            APES.ui.isTypingTarget(event.target)
        ) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        if (event.repeat || commandKeyHeld) {
            return;
        }

        commandKeyHeld = true;
        clearHoldTimer();
        holdTimer = window.setTimeout(() => {
            holdTimer = null;

            if (commandKeyHeld) {
                openRadial();
            }
        }, HOLD_DELAY);
    }, true);

    window.addEventListener('keyup', event => {
        if (!isCommandKey(event)) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        commandKeyHeld = false;
        clearHoldTimer();
        closeRadial();
    }, true);

    window.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            commandKeyHeld = false;
            clearHoldTimer();
            closeRadial();
        }
    }, true);

    window.addEventListener('blur', () => {
        commandKeyHeld = false;
        clearHoldTimer();
        closeRadial();
    });

    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source !== 'commandPalette') {
            closeRadial();
        }
    });

    mountRadial();
})();
