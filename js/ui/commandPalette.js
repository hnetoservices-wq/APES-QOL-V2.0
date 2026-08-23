/**
 * APES QoL v2 Command Palette.
 * Press Y outside typing fields to open it.
 */

(() => {
    'use strict';

    const APES = window.APES;

    if (!APES?.actions || !APES.ui) {
        return;
    }

    const OVERLAY_ID = 'apes-v2-command-overlay';
    const INPUT_ID = 'apes-v2-command-input';
    let selectedIndex = 0;
    let visibleActions = [];

    function featureEnabled(key) {
        return typeof window.isQolEnabled !== 'function' ||
            window.isQolEnabled(key) === true;
    }

    function registerLauncher({
        id,
        label,
        description,
        keywords,
        group,
        elementId,
        featureKey
    }) {
        APES.actions.register({
            id,
            label,
            description,
            keywords,
            group,
            enabled: () => {
                return featureEnabled(featureKey) &&
                    Boolean(document.getElementById(elementId));
            },
            run: () => {
                closePalette();
                APES.ui.activateById(elementId);
            }
        });
    }

    registerLauncher({
        id: 'settings.open',
        label: 'Open APES Settings',
        description: 'Manage features and keybinds.',
        keywords: ['menu', 'options', 'cog'],
        group: 'APES',
        elementId: 'qol-cog-btn',
        featureKey: 'menu'
    });

    registerLauncher({
        id: 'rallyPoint.open',
        label: 'Open Rally Point Scanner',
        description: 'Scan incoming, outgoing, and resource movements.',
        keywords: ['attack', 'incoming', 'outgoing', 'resources'],
        group: 'Scanners',
        elementId: 'qol-rally-point-toggle-btn',
        featureKey: 'rallyPointParser'
    });

    registerLauncher({
        id: 'watchlist.open',
        label: 'Open Watchlists',
        description: 'View saved players and watchlist groups.',
        keywords: ['players', 'tracking', 'profiles'],
        group: 'Players',
        elementId: 'qol-watchlist-toggle',
        featureKey: 'watchlist'
    });

    registerLauncher({
        id: 'npc.open',
        label: 'Open NPC Calculator',
        description: 'Plan troop resources and NPC distribution.',
        keywords: ['resources', 'troops', 'gold'],
        group: 'Calculators',
        elementId: 'qol-npc-calc-toggle-btn',
        featureKey: 'npcCalculator'
    });

    APES.actions.register({
        id: 'buildingAlarms.open',
        label: 'Open Building Alarms',
        description: 'View upcoming and instant-finish alarms.',
        keywords: ['building', 'clock', 'ding', 'instant finish'],
        group: 'Alarms',
        enabled: () => {
            return featureEnabled('buildingAlarm') &&
                Boolean(document.getElementById('qol-building-alarm-panel'));
        },
        run: () => {
            closePalette();
            APES.ui.showById('qol-building-alarm-panel', 'block');
        }
    });

    function mountPalette() {
        let overlay = document.getElementById(OVERLAY_ID);

        if (overlay) {
            return overlay;
        }

        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="apes-v2-command-dialog" role="dialog" aria-modal="true" aria-label="APES Command Palette">
                <div class="apes-v2-command-search">
                    <span class="apes-v2-command-mark">Y</span>
                    <input id="${INPUT_ID}" type="text" autocomplete="off" spellcheck="false" placeholder="Search APES commands…" aria-label="Search APES commands">
                    <span class="apes-v2-command-key">Esc</span>
                </div>
                <div class="apes-v2-command-results" role="listbox"></div>
                <div class="apes-v2-command-footer">
                    <span><b>↑↓</b> Select</span>
                    <span><b>Enter</b> Open</span>
                    <span><b>Y</b> Toggle palette</span>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector(`#${INPUT_ID}`);
        input.addEventListener('input', () => {
            selectedIndex = 0;
            renderResults(input.value);
        });

        overlay.addEventListener('click', event => {
            if (event.target === overlay) {
                closePalette();
                return;
            }

            const result = event.target.closest('[data-apes-action-id]');
            if (result) {
                void runAction(result.dataset.apesActionId);
            }
        });

        return overlay;
    }

    function renderResults(query = '') {
        const overlay = mountPalette();
        const results = overlay.querySelector('.apes-v2-command-results');
        visibleActions = APES.actions.search(query);
        selectedIndex = Math.max(
            0,
            Math.min(selectedIndex, visibleActions.length - 1)
        );

        if (!visibleActions.length) {
            results.innerHTML = `
                <div class="apes-v2-command-empty">
                    No matching APES commands.
                </div>
            `;
            return;
        }

        results.innerHTML = visibleActions.map((action, index) => `
            <div
                class="apes-v2-command-result${index === selectedIndex ? ' selected' : ''}"
                data-apes-action-id="${escapeHtml(action.id)}"
                role="option"
                aria-selected="${index === selectedIndex}"
            >
                <div class="apes-v2-command-copy">
                    <strong>${escapeHtml(action.label)}</strong>
                    <span>${escapeHtml(action.description)}</span>
                </div>
                <span class="apes-v2-command-group">${escapeHtml(action.group)}</span>
            </div>
        `).join('');

        results.querySelector('.selected')?.scrollIntoView({
            block: 'nearest'
        });
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function runAction(actionId) {
        try {
            await APES.actions.run(actionId, APES.context?.snapshot());
        } catch (error) {
            console.error('[APES Command Palette]', error);
        }
    }

    function openPalette() {
        const overlay = mountPalette();
        APES.ui.closeOtherTools('commandPalette');
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        selectedIndex = 0;
        const input = overlay.querySelector(`#${INPUT_ID}`);
        input.value = '';
        renderResults('');
        window.setTimeout(() => input.focus(), 0);
    }

    function closePalette() {
        const overlay = document.getElementById(OVERLAY_ID);
        overlay?.classList.remove('open');
        overlay?.setAttribute('aria-hidden', 'true');
    }

    function isOpen() {
        return document.getElementById(OVERLAY_ID)
            ?.classList.contains('open') === true;
    }

    document.addEventListener('keydown', event => {
        const typing = APES.ui.isTypingTarget(event.target);

        if (
            event.code === 'KeyY' &&
            !event.ctrlKey &&
            !event.altKey &&
            !event.metaKey &&
            !event.shiftKey &&
            !typing
        ) {
            event.preventDefault();
            event.stopPropagation();
            isOpen() ? closePalette() : openPalette();
            return;
        }

        if (!isOpen()) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            closePalette();
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            const count = visibleActions.length;

            if (count) {
                selectedIndex = (selectedIndex + direction + count) % count;
                renderResults(
                    document.getElementById(INPUT_ID)?.value || ''
                );
            }
            return;
        }

        if (event.key === 'Enter' && visibleActions[selectedIndex]) {
            event.preventDefault();
            void runAction(visibleActions[selectedIndex].id);
        }
    }, true);

    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source !== 'commandPalette') {
            closePalette();
        }
    });

    mountPalette();
})();
