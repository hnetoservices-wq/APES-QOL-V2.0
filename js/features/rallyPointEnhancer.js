/**
 * Rally Point Multi-Page Incoming Movement Parser
 * Native Feature Module - V5.0
 *
 * Visual refresh:
 * - Matches the Oasis & Cropper Scanner styling.
 * - Resizable and draggable panel.
 * - Dedicated Parse, Copy and Clear controls.
 * - Sticky results table with movement-type badges.
 */

function initRallyPointEnhancer() {
    'use strict';

    const FEATURE_KEY = 'rallyPointParser';
    const PANEL_ID = 'qol-rp-action-bar';
    const TOGGLE_ID = 'qol-wm-toggle-btn';
    const STYLE_ID = 'qol-rp-enhancer-styles';
    const MOVEMENT_TYPE_STORAGE_KEY =
        'qol_rallyPointMovementTypes';

    const DEFAULT_MOVEMENT_TYPES = {
        attack: true,
        siege: true,
        raid: false,
        reinforcement: false
    };

    let compiledWaves = [];
    let isScanning = false;
    let activeMovementTypes = null;

    function isEnabled() {
        if (typeof window.isQolEnabled === 'function') {
            return window.isQolEnabled(FEATURE_KEY) === true;
        }

        return true;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showScanLock(message) {
        window.qolRallyPointScanLock
            ?.show({
                title: 'Scanning Incomings...',
                message
            });
    }

    function updateScanLock(message) {
        window.qolRallyPointScanLock
            ?.update(message);
    }

    function hideScanLock() {
        window.qolRallyPointScanLock
            ?.hide();
    }

    function getMovementCategory(value) {
        const normalized = String(value || '')
            .trim()
            .toLowerCase();

        if (normalized.includes('siege')) {
            return 'siege';
        }

        if (normalized.includes('raid')) {
            return 'raid';
        }

        if (
            normalized.includes('reinforcement') ||
            normalized.includes('reinforcements') ||
            normalized.includes('support')
        ) {
            return 'reinforcement';
        }

        if (normalized.includes('attack')) {
            return 'attack';
        }

        return null;
    }

    function getSelectedMovementTypes() {
        const selectedTypes = {
            ...DEFAULT_MOVEMENT_TYPES
        };

        try {
            const storedValue =
                localStorage.getItem(
                    MOVEMENT_TYPE_STORAGE_KEY
                );

            if (storedValue) {
                const parsedValue =
                    JSON.parse(storedValue);

                Object.keys(selectedTypes)
                    .forEach((type) => {
                        if (
                            typeof parsedValue?.[type] ===
                            'boolean'
                        ) {
                            selectedTypes[type] =
                                parsedValue[type];
                        }
                    });
            }
        } catch (_) {
            // Keep the defaults if the saved preference is unavailable.
        }

        document
            .querySelectorAll(
                '[data-qol-rally-movement-type]'
            )
            .forEach((checkbox) => {
                const type =
                    checkbox.getAttribute(
                        'data-qol-rally-movement-type'
                    );

                if (
                    type &&
                    Object.prototype.hasOwnProperty.call(
                        selectedTypes,
                        type
                    )
                ) {
                    selectedTypes[type] =
                        checkbox.checked === true;
                }
            });

        return selectedTypes;
    }

    function shouldIncludeMovement(value) {
        const category =
            getMovementCategory(value);

        if (!category) {
            return false;
        }

        const selectedTypes =
            activeMovementTypes ||
            getSelectedMovementTypes();

        return selectedTypes[category] === true;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;

        style.textContent = `
            #${PANEL_ID} {
                position: fixed !important;
                display: none;
                flex-direction: column !important;
                width: 900px;
                min-width: 620px !important;
                max-width: 96vw !important;
                height: 500px;
                min-height: 340px !important;
                max-height: 92vh !important;
                background-color: #f7f5f0 !important;
                border: 3px solid var(--qol-border) !important;
                border-radius: 4px !important;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5) !important;
                color: #333333 !important;
                font-family: Arial, sans-serif !important;
                font-size: 11px !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                resize: both !important;
                z-index: 999999 !important;
            }

            .qol-rp-header {
                height: 34px !important;
                padding: 6px 10px !important;
                background: linear-gradient(
                    to bottom,
                    var(--qol-accent-mid),
                    var(--qol-accent-dark)
                ) !important;
                color: #f7f5f0 !important;
                font-size: 14px !important;
                font-weight: bold !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                cursor: move !important;
                user-select: none !important;
                box-sizing: border-box !important;
                touch-action: none !important;
            }

            .qol-rp-close {
                cursor: pointer !important;
                color: #ffffff !important;
                font-size: 21px !important;
                font-weight: bold !important;
                line-height: 1 !important;
                padding: 0 5px !important;
                border-radius: 3px !important;
                background-color: rgba(0, 0, 0, 0.2) !important;
                user-select: none !important;
            }

            .qol-rp-close:hover {
                background-color: rgba(255, 255, 255, 0.16) !important;
            }

            .qol-rp-body {
                display: flex !important;
                flex-direction: column !important;
                gap: 8px !important;
                flex: 1 1 auto !important;
                min-height: 0 !important;
                padding: 10px !important;
                background-color: #f7f5f0 !important;
                box-sizing: border-box !important;
            }

            .qol-rp-description {
                padding: 7px 9px !important;
                background-color: #fff6e5 !important;
                border: 1px solid #d4c2a5 !important;
                border-radius: 4px !important;
                color: #5b4630 !important;
                line-height: 1.4 !important;
            }

            .qol-rp-controls {
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }

            .qol-rp-action-btn {
                height: auto !important;
                padding: 4px 8px !important;
                border: 1px solid var(--qol-accent-outline) !important;
                border-radius: 4px !important;
                background-color: var(--qol-accent-dark) !important;
                background: linear-gradient(
                    to bottom,
                    var(--qol-accent),
                    var(--qol-accent-dark)
                ) !important;
                color: #ffffff !important;
                font-size: 11px !important;
                font-weight: bold !important;
                white-space: nowrap !important;
                cursor: pointer !important;
                user-select: none !important;
                box-sizing: border-box !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-family: Arial, sans-serif !important;
                line-height: 1.2 !important;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2) !important;
            }

            .qol-rp-action-primary {
                min-width: 190px !important;
            }

            .qol-rp-action-secondary {
                background-color: var(--qol-accent-dark) !important;
                background: linear-gradient(to bottom, var(--qol-accent), var(--qol-accent-dark)) !important;
                color: #ffffff !important;
                border-color: var(--qol-accent-outline) !important;
            }

            .qol-rp-action-danger {
                background: linear-gradient(
                    to bottom,
                    #d9534f,
                    #b52b27
                ) !important;
                border-color: #8f211e !important;
            }

            .qol-rp-action-btn:not(.qol-action-disabled):hover {
                background-color: var(--qol-accent-dark) !important;
                background: linear-gradient(to bottom, var(--qol-accent-hover), var(--qol-accent-hover-dark)) !important;
            }

            .qol-rp-action-danger:not(.qol-action-disabled):hover {
                background: linear-gradient(to bottom, #e4605d, #d43f3a) !important;
            }

            .qol-rp-action-btn.qol-action-disabled {
                opacity: 0.45 !important;
                cursor: default !important;
                pointer-events: none !important;
            }

            .qol-rp-status-line {
                min-height: 18px !important;
                color: #5b4630 !important;
                font-size: 11px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 10px !important;
            }

            #qol-merge-status[data-tone="working"] {
                color: #8a5a16 !important;
                font-weight: bold !important;
            }

            #qol-merge-status[data-tone="success"] {
                color: #4f7328 !important;
                font-weight: bold !important;
            }

            #qol-merge-status[data-tone="error"] {
                color: #a52a2a !important;
                font-weight: bold !important;
            }

            #qol-rp-result-count {
                white-space: nowrap !important;
                color: #6c5a43 !important;
            }

            .qol-rp-table-wrapper {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                overflow: auto !important;
                background-color: #ffffff !important;
                border: 1px solid #c7b99e !important;
                border-radius: 3px !important;
            }

            .qol-rp-table {
                width: 100% !important;
                border-collapse: collapse !important;
                background-color: #ffffff !important;
                font-size: 11px !important;
            }

            .qol-rp-table th,
            .qol-rp-table td {
                padding: 7px 8px !important;
                border-bottom: 1px solid #e4dccd !important;
                text-align: left !important;
                vertical-align: middle !important;
                white-space: nowrap !important;
            }

            .qol-rp-table th {
                position: sticky !important;
                top: 0 !important;
                z-index: 2 !important;
                background-color: #e9dfcc !important;
                color: var(--qol-accent-deep) !important;
                font-size: 10px !important;
                text-transform: uppercase !important;
                letter-spacing: 0.3px !important;
            }

            .qol-rp-table tbody tr:hover {
                background-color: #fff8e9 !important;
            }

            .qol-rp-enemy {
                font-weight: bold !important;
                color: #3e3020 !important;
            }

            .qol-rp-time {
                font-family: Consolas, Monaco, monospace !important;
            }

            .qol-rp-landing {
                font-family: Consolas, Monaco, monospace !important;
                font-weight: bold !important;
            }

            .qol-rp-type-badge {
                display: inline-block !important;
                min-width: 66px !important;
                padding: 2px 7px !important;
                border-radius: 10px !important;
                text-align: center !important;
                font-size: 10px !important;
                font-weight: bold !important;
                box-sizing: border-box !important;
            }

            .qol-rp-type-badge.attack {
                background-color: #fff0cf !important;
                color: #8a5909 !important;
                border: 1px solid #d1a34f !important;
            }

            .qol-rp-type-badge.siege {
                background-color: #f7d8d6 !important;
                color: #8d2420 !important;
                border: 1px solid #c47975 !important;
            }

            .qol-rp-type-badge.raid {
                background-color: #e5edf8 !important;
                color: #315f8e !important;
                border: 1px solid #86a6c7 !important;
            }

            .qol-rp-type-badge.reinforcement {
                background-color: #dfefdc !important;
                color: #3f6f39 !important;
                border: 1px solid #8db186 !important;
            }

            .qol-rp-empty {
                min-height: 130px !important;
                padding: 28px 12px !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 5px !important;
                color: #777777 !important;
                font-size: 12px !important;
                text-align: center !important;
                box-sizing: border-box !important;
            }

            .qol-rp-empty strong {
                color: #5b4630 !important;
                font-size: 13px !important;
            }

            .qol-rp-scanning {
                min-height: 130px !important;
                padding: 28px 12px !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 9px !important;
                color: #5b4630 !important;
                font-size: 12px !important;
                text-align: center !important;
                box-sizing: border-box !important;
            }

            .qol-rp-spinner {
                width: 24px !important;
                height: 24px !important;
                border: 3px solid #d8ccb6 !important;
                border-top-color: var(--qol-accent-mid) !important;
                border-radius: 50% !important;
                animation: qolRpSpin 0.8s linear infinite !important;
            }

            @keyframes qolRpSpin {
                to {
                    transform: rotate(360deg);
                }
            }

            @media (max-width: 760px) {
                #${PANEL_ID} {
                    min-width: 94vw !important;
                }

                .qol-rp-controls {
                    flex-wrap: wrap !important;
                }

                .qol-rp-action-primary {
                    flex: 1 1 100% !important;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function makeDraggable(element, handle) {
        handle.addEventListener('pointerdown', (event) => {
            if (event.target.closest('.qol-rp-close')) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const startX = event.clientX;
            const startY = event.clientY;
            const rectangle = element.getBoundingClientRect();
            const originalLeft = rectangle.left;
            const originalTop = rectangle.top;

            element.style.setProperty('transform', 'none', 'important');
            element.style.setProperty('left', `${originalLeft}px`, 'important');
            element.style.setProperty('top', `${originalTop}px`, 'important');
            element.style.setProperty('right', 'auto', 'important');
            element.style.setProperty('bottom', 'auto', 'important');

            try {
                handle.setPointerCapture(event.pointerId);
            } catch (error) {
                // Pointer capture is optional.
            }

            function handlePointerMove(moveEvent) {
                moveEvent.preventDefault();

                const nextLeft = Math.max(
                    0,
                    Math.min(
                        window.innerWidth - 70,
                        originalLeft + moveEvent.clientX - startX
                    )
                );

                const nextTop = Math.max(
                    0,
                    Math.min(
                        window.innerHeight - 40,
                        originalTop + moveEvent.clientY - startY
                    )
                );

                element.style.setProperty(
                    'left',
                    `${nextLeft}px`,
                    'important'
                );

                element.style.setProperty(
                    'top',
                    `${nextTop}px`,
                    'important'
                );
            }

            function handlePointerUp(upEvent) {
                try {
                    handle.releasePointerCapture(upEvent.pointerId);
                } catch (error) {
                    // Pointer capture may already be released.
                }

                handle.removeEventListener(
                    'pointermove',
                    handlePointerMove
                );

                handle.removeEventListener(
                    'pointerup',
                    handlePointerUp
                );
            }

            handle.addEventListener(
                'pointermove',
                handlePointerMove
            );

            handle.addEventListener(
                'pointerup',
                handlePointerUp
            );
        });
    }

    function positionPanelUnderButton(bar) {
        if (!bar) {
            return;
        }

        const cogButton = document.getElementById('qol-cog-btn');

        if (!cogButton) {
            bar.style.setProperty('left', '20px', 'important');
            bar.style.setProperty('top', '80px', 'important');
            return;
        }

        const rectangle = cogButton.getBoundingClientRect();
        const panelWidth = bar.offsetWidth || 900;
        const panelHeight = bar.offsetHeight || 500;

        const maximumLeft = Math.max(
            10,
            window.innerWidth - panelWidth - 10
        );

        const maximumTop = Math.max(
            10,
            window.innerHeight - panelHeight - 10
        );

        const left = Math.max(
            10,
            Math.min(rectangle.left, maximumLeft)
        );

        const top = Math.max(
            10,
            Math.min(rectangle.bottom + 20, maximumTop)
        );

        bar.style.setProperty('position', 'fixed', 'important');
        bar.style.setProperty('left', `${left}px`, 'important');
        bar.style.setProperty('top', `${top}px`, 'important');
        bar.style.setProperty('right', 'auto', 'important');
        bar.style.setProperty('bottom', 'auto', 'important');
        bar.style.setProperty('transform', 'none', 'important');
    }

    function setStatus(message, tone = 'neutral') {
        const statusElement = document.getElementById('qol-merge-status');

        if (!statusElement) {
            return;
        }

        statusElement.textContent = message;
        statusElement.dataset.tone = tone;
    }

    function updateResultCount() {
        const countElement = document.getElementById('qol-rp-result-count');

        if (!countElement) {
            return;
        }

        const total = compiledWaves.length;

        const counts = {
            attack: 0,
            siege: 0,
            raid: 0,
            reinforcement: 0
        };

        compiledWaves.forEach((wave) => {
            const category =
                getMovementCategory(
                    wave.type
                );

            if (category) {
                counts[category] += 1;
            }
        });

        if (total === 0) {
            countElement.textContent = '0 movements';
            return;
        }

        const detailParts = [
            ['attack', 'attack', 'attacks'],
            ['siege', 'siege', 'sieges'],
            ['raid', 'raid', 'raids'],
            [
                'reinforcement',
                'reinforcement',
                'reinforcements'
            ]
        ]
            .filter(([type]) => counts[type] > 0)
            .map(([type, singular, plural]) => {
                const count = counts[type];

                return `${count} ${
                    count === 1
                        ? singular
                        : plural
                }`;
            });

        countElement.textContent =
            `${total} ${
                total === 1
                    ? 'movement'
                    : 'movements'
            }` +
            (
                detailParts.length
                    ? ` · ${detailParts.join(' · ')}`
                    : ''
            );
    }

    function setButtonDisabled(button, disabled) {
        if (!button) {
            return;
        }

        button.classList.toggle(
            'qol-action-disabled',
            disabled
        );

        button.setAttribute(
            'aria-disabled',
            disabled ? 'true' : 'false'
        );
    }

    function renderEmptyState(
        container,
        title = 'No scan results yet.',
        description = 'Choose the incoming types, then select “Scan Incomings”.'
    ) {
        container.innerHTML = `
            <div class="qol-rp-empty">
                <strong>
                    ${escapeHtml(title)}
                </strong>

                <span>
                    ${escapeHtml(description)}
                </span>
            </div>
        `;
    }

    function renderScanningState(container) {
        container.innerHTML = `
            <div class="qol-rp-scanning">
                <div class="qol-rp-spinner"></div>

                <strong>
                    Scanning Rally Point...
                </strong>

                <span>
                    Checking every available incoming movement page.
                </span>
            </div>
        `;
    }

    console.log(
        '[RallyPointEnhancer] Module successfully initialized (V5.0).'
    );

    window.addEventListener(
        'qol_close_others',
        (event) => {
            if (
                event.detail &&
                event.detail.source !== 'wm'
            ) {
                const bar =
                    document.getElementById(
                        PANEL_ID
                    );

                if (bar) {
                    bar.style.setProperty(
                        'display',
                        'none',
                        'important'
                    );
                }
            }
        }
    );

    document.addEventListener(
        'keydown',
        (event) => {
            if (event.key !== 'Escape') {
                return;
            }

            const bar =
                document.getElementById(
                    PANEL_ID
                );

            if (
                bar &&
                window
                    .getComputedStyle(bar)
                    .display !== 'none'
            ) {
                bar.style.setProperty(
                    'display',
                    'none',
                    'important'
                );
            }
        },
        true
    );

    function getContextData() {
        let playerName = 'UnknownPlayer';
        let villageName = 'UnknownVillage';

        const playerElement =
            document.querySelector(
                '#userNameButton .text'
            );

        if (
            playerElement &&
            playerElement.textContent.trim()
        ) {
            playerName =
                playerElement.textContent
                    .replace(/[\r\n]+/g, ' ')
                    .trim();
        } else {
            const fallbackPlayer =
                document.querySelector(
                    '.playerName'
                ) ||
                document.querySelector(
                    '.avatar .name'
                );

            if (fallbackPlayer) {
                playerName =
                    fallbackPlayer.textContent
                        .replace(/[\r\n]+/g, ' ')
                        .trim();
            }
        }

        const villageElement =
            document.querySelector(
                '.villageEntry.active'
            ) ||
            document.querySelector(
                '.active .villageEntry'
            ) ||
            document.querySelector(
                '.villageEntry'
            );

        if (
            villageElement &&
            villageElement.textContent.trim()
        ) {
            villageName =
                villageElement.textContent
                    .replace(/[\r\n]+/g, ' ')
                    .trim();
        } else {
            const fallbackVillage =
                document.querySelector(
                    '.villageList .active .name'
                ) ||
                document.querySelector(
                    '.villageName'
                );

            if (fallbackVillage) {
                villageName =
                    fallbackVillage.textContent
                        .replace(/[\r\n]+/g, ' ')
                        .trim();
            }
        }

        return {
            playerName,
            villageName
        };
    }

    function getRallyPointContainer() {
        const selectors = [
            '.rallyPoint',
            '.movementsView',
            '.buildingView[data-building-type="16"]',
            '.buildingView',
            '.windowContent',
            '#windowContent'
        ];

        for (const selector of selectors) {
            const element =
                document.querySelector(
                    selector
                );

            if (
                element &&
                element.offsetHeight > 0
            ) {
                return element;
            }
        }

        const elements =
            Array.from(
                document.querySelectorAll(
                    'div, span, h1, h2, h3, th'
                )
            );

        const inboundHeader =
            elements.find((element) => {
                return (
                    element.textContent &&
                    element.textContent.includes(
                        'Inbound troops'
                    )
                );
            });

        if (inboundHeader) {
            return (
                inboundHeader.closest(
                    '.window, ' +
                    '.buildingView, ' +
                    'div[style*="position"]'
                ) ||
                inboundHeader.parentElement
            );
        }

        return null;
    }

    function findPaginationButton(
        type,
        container
    ) {
        if (!container) {
            return null;
        }

        const candidates =
            container.querySelectorAll(
                'button, a, span, div, li, i, svg, ' +
                '[class*="next"], ' +
                '[class*="pager"], ' +
                '[class*="arrow"], ' +
                '[class*="page"]'
            );

        for (const element of candidates) {
            if (
                element.offsetWidth === 0 &&
                element.offsetHeight === 0
            ) {
                continue;
            }

            if (
                element.closest('.villageList') ||
                element.closest('#sidebar') ||
                element.closest('.navigation')
            ) {
                continue;
            }

            const className =
                element.className &&
                typeof element.className ===
                    'string'
                    ? element.className.toLowerCase()
                    : '';

            if (
                className.includes('disabled') ||
                className.includes('inactive')
            ) {
                continue;
            }

            const text =
                (element.textContent || '')
                    .trim()
                    .toLowerCase();

            const title =
                (
                    element.getAttribute(
                        'title'
                    ) || ''
                ).toLowerCase();

            const aria =
                (
                    element.getAttribute(
                        'aria-label'
                    ) || ''
                ).toLowerCase();

            if (
                title.includes('village') ||
                text.includes('village')
            ) {
                continue;
            }

            if (type === 'next') {
                const hasNextClass =
                    className.includes('next') ||
                    className.includes(
                        'arrowright'
                    ) ||
                    className.includes(
                        'pageright'
                    ) ||
                    className.includes(
                        'forward'
                    );

                const hasNextText =
                    text === '>' ||
                    text === '›' ||
                    text === 'next' ||
                    title.includes('next') ||
                    aria.includes('next');

                if (
                    hasNextClass ||
                    hasNextText
                ) {
                    if (
                        text.includes('>>') ||
                        text.includes('»') ||
                        title.includes('last') ||
                        className.includes('last')
                    ) {
                        continue;
                    }

                    return (
                        element.closest(
                            'button, ' +
                            'a, ' +
                            'div[role="button"]'
                        ) ||
                        element
                    );
                }
            }

            if (type === 'first') {
                const hasFirstClass =
                    className.includes('first') ||
                    className.includes(
                        'arrowleft'
                    ) ||
                    className.includes(
                        'pageleft'
                    );

                const hasFirstText =
                    text === '<' ||
                    text === '«' ||
                    text === '<<' ||
                    text === 'first' ||
                    title.includes('first');

                if (
                    hasFirstClass ||
                    hasFirstText
                ) {
                    return (
                        element.closest(
                            'button, ' +
                            'a, ' +
                            'div[role="button"]'
                        ) ||
                        element
                    );
                }
            }
        }

        return null;
    }

    function triggerClick(element) {
        if (!element) {
            return;
        }

        try {
            element.click();
        } catch (error) {
            // Fall back to dispatched events.
        }

        [
            'pointerdown',
            'mousedown',
            'pointerup',
            'mouseup',
            'click'
        ].forEach((eventType) => {
            const event =
                new MouseEvent(
                    eventType,
                    {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    }
                );

            element.dispatchEvent(event);
        });
    }

    function getPageSignature(container) {
        if (!container) {
            return '';
        }

        let signature = '';

        container
            .querySelectorAll(
                'tr, div, li'
            )
            .forEach((element) => {
                const text =
                    (
                        element.innerText || ''
                    ).replace(/\s+/g, ' ');

                if (
                    text.includes('by') &&
                    text.includes('from')
                ) {
                    signature +=
                        text
                            .trim()
                            .substring(0, 30);
                }
            });

        return signature;
    }

    async function triggerVirtualScrollSweep(
        container
    ) {
        if (!container) {
            return;
        }

        const scrollable =
            container.querySelector(
                '.scrollPane, ' +
                '.scrollContentInnerWrapper, ' +
                '.movementList, ' +
                '.overviewList'
            ) ||
            container;

        if (
            scrollable &&
            scrollable.scrollHeight >
                scrollable.clientHeight
        ) {
            const originalScroll =
                scrollable.scrollTop;

            scrollable.scrollTop =
                scrollable.scrollHeight;

            await new Promise((resolve) => {
                setTimeout(resolve, 150);
            });

            scrollable.scrollTop =
                originalScroll;

            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
        }
    }

    function scrapePageData(
        container,
        contextData
    ) {
        if (!container) {
            return;
        }

        const pageWaves = [];

        const detailRows =
            container.querySelectorAll(
                'troop-details-rallypoint.movingTroops > ' +
                '.troopsDetailContainer, ' +
                '.movingTroops > .troopsDetailContainer'
            );

        const rowElements =
            detailRows.length > 0
                ? []
                : container.querySelectorAll(
                    'tr.movement, ' +
                    'tr.troopRow, ' +
                    'div.movementRow, ' +
                    '.movementList .entry'
                );

        if (rowElements.length > 0) {
            rowElements.forEach((row) => {
                const typeElement =
                    row.querySelector(
                        '.type, ' +
                        '.movementType, ' +
                        '.title'
                    );

                const enemyElement =
                    row.querySelector(
                        '.player, ' +
                        '.playerName, ' +
                        '.sourcePlayer'
                    );

                const villageElement =
                    row.querySelector(
                        '.village, ' +
                        '.villageName, ' +
                        '.sourceVillage'
                    );

                const travelElement =
                    row.querySelector(
                        '.timer, ' +
                        '.duration, ' +
                        '.remaining'
                    );

                const landingElement =
                    row.querySelector(
                        '.landingTime, ' +
                        '.at, ' +
                        '.time'
                    );

                if (
                    enemyElement &&
                    landingElement
                ) {
                    const movementType =
                        (
                            typeElement
                                ? typeElement
                                    .textContent
                                : 'Attack'
                        ).trim();

                    if (
                        shouldIncludeMovement(
                            movementType
                        )
                    ) {
                        pageWaves.push({
                            enemy:
                                (
                                    enemyElement
                                        .textContent ||
                                    'Unknown'
                                ).trim(),

                            enemyVillage:
                                (
                                    villageElement
                                        ? villageElement
                                            .textContent
                                        : 'Unknown'
                                ).trim(),

                            type:
                                movementType,

                            travel:
                                (
                                    travelElement
                                        ? travelElement
                                            .textContent
                                        : '00:00:00'
                                ).trim(),

                            landing:
                                landingElement
                                    .textContent
                                    .trim(),

                            player:
                                contextData
                                    .playerName,

                            village:
                                contextData
                                    .villageName
                        });
                    }
                }
            });
        }

        /*
         * Current Travian Kingdoms Rally Point layout.
         *
         * Support rows do not contain visible text such as
         * "Reinforcement" or "Support". Their movement type is exposed
         * only by an icon class (for example
         * movement_support_small_flat_black), so the text-regex fallback
         * below cannot discover them.
         */
        detailRows.forEach((row) => {
            const movementIcon =
                row.querySelector(
                    '.troopsTitle [class*="movement_"][class*="_small"]'
                );

            if (!movementIcon) {
                return;
            }

            const iconClasses =
                String(movementIcon.className || '');
            const titleText =
                String(
                    row.querySelector(
                        '.troopsTitle'
                    )?.textContent || ''
                );
            const category =
                getMovementCategory(titleText) ||
                getMovementCategory(iconClasses);

            if (
                !category ||
                !(
                    activeMovementTypes ||
                    getSelectedMovementTypes()
                )[category]
            ) {
                return;
            }

            const enemyElement =
                row.querySelector(
                    '.troopsTitle .playerLink'
                );
            const villageElement =
                row.querySelector(
                    '.troopsTitle .villageLink'
                );
            const travelElement =
                row.querySelector(
                    '.countdownTo [countdown], ' +
                    '.countdownContainer [countdown]'
                );
            const landingElement =
                row.querySelector(
                    '.countdownTo [i18ndt], ' +
                    '.countdownContainer [i18ndt]'
                );

            if (
                !enemyElement ||
                !villageElement ||
                !landingElement
            ) {
                return;
            }

            const movementLabels = {
                attack: 'Attack',
                siege: 'Siege',
                raid: 'Raid',
                reinforcement: 'Reinforcement'
            };

            pageWaves.push({
                enemy:
                    enemyElement.textContent
                        .trim() || 'Unknown',

                enemyVillage:
                    villageElement.textContent
                        .trim() || 'Unknown',

                type:
                    movementLabels[category],

                travel:
                    travelElement
                        ? travelElement.textContent
                            .trim()
                        : '00:00:00',

                landing:
                    landingElement.textContent
                        .trim(),

                player:
                    contextData.playerName,

                village:
                    contextData.villageName
            });
        });

        const waveRegex =
            /([A-Za-z\s]+?)\s+by\s+(.+?)\s+from\s+(.+?)\s+(?:in|within)\s+([0-9:]+)\s+(?:at|on)\s+([0-9:]+)/gi;

        const rawText =
            (
                container.innerText ||
                container.textContent ||
                ''
            ).replace(/\s+/g, ' ');

        const matches =
            detailRows.length > 0
                ? []
                : [
                    ...rawText.matchAll(
                        waveRegex
                    )
                ];

        for (const match of matches) {
            const [
                ,
                type,
                enemy,
                enemyVillage,
                travel,
                landing
            ] = match;

            const trimmedType =
                type.trim();

            if (
                shouldIncludeMovement(
                    trimmedType
                )
            ) {
                pageWaves.push({
                    enemy:
                        enemy.trim(),

                    enemyVillage:
                        enemyVillage.trim(),

                    type:
                        trimmedType,

                    travel:
                        travel.trim(),

                    landing:
                        landing.trim(),

                    player:
                        contextData.playerName,

                    village:
                        contextData.villageName
                });
            }
        }

        pageWaves.forEach((newWave) => {
            const existingMatches =
                compiledWaves.filter(
                    (wave) => {
                        return (
                            wave.landing ===
                                newWave.landing &&
                            wave.enemyVillage ===
                                newWave.enemyVillage &&
                            wave.enemy ===
                                newWave.enemy &&
                            wave.type ===
                                newWave.type
                        );
                    }
                ).length;

            const pageMatches =
                pageWaves.filter(
                    (wave) => {
                        return (
                            wave.landing ===
                                newWave.landing &&
                            wave.enemyVillage ===
                                newWave.enemyVillage &&
                            wave.enemy ===
                                newWave.enemy &&
                            wave.type ===
                                newWave.type
                        );
                    }
                ).length;

            if (
                existingMatches <
                pageMatches
            ) {
                compiledWaves.push(
                    newWave
                );
            }
        });
    }

    async function awaitRallyPointRender(
        timeoutMilliseconds = 8000
    ) {
        const startTime =
            Date.now();

        while (
            Date.now() - startTime <
            timeoutMilliseconds
        ) {
            const container =
                getRallyPointContainer();

            if (container) {
                const nextButton =
                    findPaginationButton(
                        'next',
                        container
                    );

                const firstButton =
                    findPaginationButton(
                        'first',
                        container
                    );

                let wavesExist = false;

                container
                    .querySelectorAll(
                        'tr, div'
                    )
                    .forEach(
                        (element) => {
                            const text =
                                (
                                    element.innerText ||
                                    ''
                                ).replace(
                                    /\s+/g,
                                    ' '
                                );

                            if (
                                (
                                    text.includes(
                                        'by'
                                    ) &&
                                    text.includes(
                                        'from'
                                    )
                                ) ||
                                text.includes(
                                    'Inbound troops'
                                ) ||
                                text.includes(
                                    'Incoming'
                                )
                            ) {
                                wavesExist = true;
                            }
                        }
                    );

                if (
                    wavesExist ||
                    nextButton ||
                    firstButton
                ) {
                    await new Promise(
                        (resolve) => {
                            setTimeout(
                                resolve,
                                400
                            );
                        }
                    );

                    return true;
                }
            }

            await new Promise(
                (resolve) => {
                    setTimeout(
                        resolve,
                        300
                    );
                }
            );
        }

        return false;
    }

    async function collectAllPages(
        statusBox,
        onComplete
    ) {
        compiledWaves = [];

        let pageCount = 1;

        const contextData =
            getContextData();

        const initialContainer =
            getRallyPointContainer();

        if (!initialContainer) {
            statusBox.textContent =
                'Error: Rally Point container not found.';
            updateScanLock(
                'Rally Point container could not be found.'
            );

            onComplete();
            return;
        }

        const firstButton =
            findPaginationButton(
                'first',
                initialContainer
            );

        if (firstButton) {
            updateScanLock(
                'Returning to the first incoming page...'
            );
            triggerClick(firstButton);

            await new Promise(
                (resolve) => {
                    setTimeout(
                        resolve,
                        800
                    );
                }
            );
        }

        while (pageCount <= 50) {
            statusBox.textContent =
                `Scanning page ${pageCount}...`;
            updateScanLock(
                `Scanning incoming page ${pageCount}...`
            );

            const currentContainer =
                getRallyPointContainer();

            if (!currentContainer) {
                break;
            }

            await triggerVirtualScrollSweep(
                currentContainer
            );

            const currentSignature =
                getPageSignature(
                    currentContainer
                );

            scrapePageData(
                currentContainer,
                contextData
            );

            const nextButton =
                findPaginationButton(
                    'next',
                    currentContainer
                );

            if (nextButton) {
                triggerClick(nextButton);

                let waited = 0;
                let pageChanged = false;

                while (waited < 3500) {
                    await new Promise(
                        (resolve) => {
                            setTimeout(
                                resolve,
                                200
                            );
                        }
                    );

                    waited += 200;

                    const newContainer =
                        getRallyPointContainer();

                    const newSignature =
                        getPageSignature(
                            newContainer
                        );

                    if (
                        newSignature !==
                            currentSignature &&
                        newSignature.length > 0
                    ) {
                        pageChanged = true;
                        break;
                    }
                }

                if (!pageChanged) {
                    break;
                }

                pageCount += 1;
            } else {
                break;
            }
        }

        statusBox.textContent =
            `Done! Processed ${compiledWaves.length} movements.`;
        updateScanLock(
            `Finishing scan with ${compiledWaves.length} matching movements...`
        );

        onComplete();
    }

    function renderScrollableUI(container) {
        if (!container) {
            return;
        }

        if (
            compiledWaves.length === 0
        ) {
            renderEmptyState(
                container,
                'No matching incomings found.',
                'The Rally Point scan completed without finding any of the selected movement types.'
            );

            updateResultCount();
            return;
        }

        const rows =
            compiledWaves
                .map((wave) => {
                    const typeText =
                        String(
                            wave.type ||
                            'Attack'
                        );

                    const category =
                        getMovementCategory(
                            typeText
                        ) ||
                        'attack';

                    return `
                        <tr>
                            <td class="qol-rp-enemy">
                                ${escapeHtml(
                                    wave.enemy ||
                                    'Unknown'
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    wave.enemyVillage ||
                                    'Unknown'
                                )}
                            </td>

                            <td>
                                <span
                                    class="qol-rp-type-badge ${category}"
                                >
                                    ${escapeHtml(
                                        typeText
                                    )}
                                </span>
                            </td>

                            <td class="qol-rp-time">
                                ${escapeHtml(
                                    wave.travel ||
                                    '00:00:00'
                                )}
                            </td>

                            <td class="qol-rp-landing">
                                ${escapeHtml(
                                    wave.landing ||
                                    'Unknown'
                                )}
                            </td>
                        </tr>
                    `;
                })
                .join('');

        container.innerHTML = `
            <table class="qol-rp-table">
                <thead>
                    <tr>
                        <th>Enemy</th>
                        <th>Village</th>
                        <th>Type</th>
                        <th>Remaining</th>
                        <th>Landing</th>
                    </tr>
                </thead>

                <tbody>
                    ${rows}
                </tbody>
            </table>
        `;

        updateResultCount();
    }

    async function copyResultsToClipboard() {
        if (!compiledWaves.length) {
            setStatus(
                'There are no scan results to copy.',
                'error'
            );

            return;
        }

        const output =
            compiledWaves
                .map((wave) => {
                    return (
                        `${wave.type} by ` +
                        `${wave.enemy} from ` +
                        `${wave.enemyVillage} ` +
                        `in ${wave.travel} ` +
                        `at ${wave.landing}`
                    );
                })
                .join('\n');

        try {
            await navigator
                .clipboard
                .writeText(output);

            const copyButton =
                document.getElementById(
                    'qol-btn-copy'
                );

            if (copyButton) {
                copyButton.textContent =
                    'Copied!';

                window.setTimeout(
                    () => {
                        if (
                            copyButton
                                .isConnected
                        ) {
                            copyButton
                                .textContent =
                                'Copy';
                        }
                    },
                    1200
                );
            }

            setStatus(
                `Copied ${compiledWaves.length} incoming movements.`,
                'success'
            );
        } catch (error) {
            console.error(
                '[RallyPointEnhancer] Clipboard access error:',
                error
            );

            setStatus(
                'Could not copy the scan results.',
                'error'
            );
        }
    }

    function clearScan() {
        if (isScanning) {
            return;
        }

        hideScanLock();
        compiledWaves = [];
        activeMovementTypes = null;

        const tableTarget =
            document.getElementById(
                'qol-table-target-wrapper'
            );

        const copyButton =
            document.getElementById(
                'qol-btn-copy'
            );

        const clearButton =
            document.getElementById(
                'qol-btn-clear'
            );

        const parseButton =
            document.getElementById(
                'qol-btn-merge'
            );

        if (tableTarget) {
            renderEmptyState(
                tableTarget
            );
        }

        if (copyButton) {
            copyButton.style.setProperty(
                'display',
                'none',
                'important'
            );
        }

        if (clearButton) {
            clearButton.style.setProperty(
                'display',
                'none',
                'important'
            );
        }

        if (parseButton) {
            parseButton.textContent =
                'Scan Incomings';
        }

        setStatus(
            'Ready.',
            'neutral'
        );

        updateResultCount();
    }

    function mountPanel() {
        if (
            document.getElementById(
                PANEL_ID
            )
        ) {
            return;
        }

        injectStyles();

        const bar =
            document.createElement(
                'div'
            );

        bar.id = PANEL_ID;

        bar.innerHTML = `
            <div class="qol-rp-header">
                <span>
                    Rally Point Scanner
                </span>

                <span
                    class="qol-rp-close"
                    id="qol-rp-close"
                    title="Close Parser"
                >
                    &times;
                </span>
            </div>

            <div class="qol-rp-body">
                <div class="qol-rp-description">
                    Open and scan every incoming Rally Point page for
                    the selected movement types, then copy the results
                    in a share-ready format.
                </div>

                <div class="qol-rp-controls">
                    <div
                        id="qol-btn-merge"
                        class="qol-rp-action-btn qol-rp-action-primary"
                        data-state="ready"
                    >
                        Scan Incomings
                    </div>

                    <div
                        id="qol-btn-copy"
                        class="qol-rp-action-btn qol-rp-action-secondary"
                        style="display: none !important;"
                    >
                        Copy
                    </div>

                    <div
                        id="qol-btn-clear"
                        class="qol-rp-action-btn qol-rp-action-danger"
                        style="display: none !important;"
                    >
                        Clear
                    </div>
                </div>

                <div class="qol-rp-status-line">
                    <span
                        id="qol-merge-status"
                        data-tone="neutral"
                    >
                        Ready.
                    </span>

                    <span id="qol-rp-result-count">
                        0 movements
                    </span>
                </div>

                <div
                    id="qol-table-target-wrapper"
                    class="qol-rp-table-wrapper"
                ></div>
            </div>
        `;

        document.body.appendChild(bar);

        const header =
            bar.querySelector(
                '.qol-rp-header'
            );

        const closeButton =
            bar.querySelector(
                '#qol-rp-close'
            );

        const parseButton =
            bar.querySelector(
                '#qol-btn-merge'
            );

        const copyButton =
            bar.querySelector(
                '#qol-btn-copy'
            );

        const clearButton =
            bar.querySelector(
                '#qol-btn-clear'
            );

        const tableTarget =
            bar.querySelector(
                '#qol-table-target-wrapper'
            );

        makeDraggable(
            bar,
            header
        );

        renderEmptyState(
            tableTarget
        );

        updateResultCount();

        closeButton.addEventListener(
            'click',
            () => {
                bar.style.setProperty(
                    'display',
                    'none',
                    'important'
                );
            }
        );

        parseButton.addEventListener(
            'click',
            async (event) => {
                event.stopPropagation();

                if (isScanning) {
                    return;
                }

                activeMovementTypes =
                    getSelectedMovementTypes();

                if (
                    !Object.values(
                        activeMovementTypes
                    ).some(Boolean)
                ) {
                    activeMovementTypes = null;

                    setStatus(
                        'Select at least one incoming movement type.',
                        'error'
                    );

                    return;
                }

                isScanning = true;
                compiledWaves = [];
                showScanLock(
                    'Opening the Rally Point...'
                );

                setButtonDisabled(
                    parseButton,
                    true
                );

                setButtonDisabled(
                    copyButton,
                    true
                );

                setButtonDisabled(
                    clearButton,
                    true
                );

                copyButton.style.setProperty(
                    'display',
                    'none',
                    'important'
                );

                clearButton.style.setProperty(
                    'display',
                    'none',
                    'important'
                );

                parseButton.textContent =
                    'Opening Rally Point...';

                setStatus(
                    'Opening Rally Point...',
                    'working'
                );

                updateResultCount();

                renderScanningState(
                    tableTarget
                );

                const currentAddress =
                    window.location.hash ||
                    '';

                const isAlreadyOnTab =
                    currentAddress.includes(
                        'subtab:Incoming'
                    ) &&
                    currentAddress.includes(
                        'window:building'
                    );

                if (!isAlreadyOnTab) {
                    const cpMatch =
                        currentAddress.match(
                            /cp:([^/]+)/
                        );

                    const targetCp =
                        cpMatch
                            ? cpMatch[1]
                            : '1';

                    window.location.hash =
                        `page:village/cp:${targetCp}/` +
                        `location:32/window:building/` +
                        `subtab:Incoming`;
                }

                let panelLoaded = false;

                try {
                    panelLoaded =
                        await awaitRallyPointRender(
                            8000
                        );
                } catch (error) {
                    console.error(
                        '[RallyPointEnhancer] Rally Point render error:',
                        error
                    );
                }

                if (!panelLoaded) {
                    isScanning = false;
                    activeMovementTypes = null;
                    hideScanLock();

                    parseButton.textContent =
                        'Scan Incomings';

                    setButtonDisabled(
                        parseButton,
                        false
                    );

                    setButtonDisabled(
                        copyButton,
                        false
                    );

                    setButtonDisabled(
                        clearButton,
                        false
                    );

                    setStatus(
                        'Error: Rally Point failed to render.',
                        'error'
                    );

                    renderEmptyState(
                        tableTarget,
                        'Rally Point could not be opened.',
                        'Open the Rally Point manually and try the scan again.'
                    );

                    return;
                }

                parseButton.textContent =
                    'Scanning...';

                setStatus(
                    'Scanning incoming movement pages...',
                    'working'
                );
                updateScanLock(
                    'Scanning incoming movement pages...'
                );

                collectAllPages(
                    document.getElementById(
                        'qol-merge-status'
                    ),
                    () => {
                        isScanning = false;

                        renderScrollableUI(
                            tableTarget
                        );

                        activeMovementTypes = null;

                        parseButton.textContent =
                            'Parse Again';

                        setButtonDisabled(
                            parseButton,
                            false
                        );

                        setButtonDisabled(
                            copyButton,
                            false
                        );

                        setButtonDisabled(
                            clearButton,
                            false
                        );

                        clearButton.style.setProperty(
                            'display',
                            'inline-flex',
                            'important'
                        );

                        if (
                            compiledWaves.length >
                            0
                        ) {
                            copyButton.style.setProperty(
                                'display',
                                'inline-flex',
                                'important'
                            );

                            setStatus(
                                `Scan complete. Found ${compiledWaves.length} incoming movements.`,
                                'success'
                            );
                        } else {
                            copyButton.style.setProperty(
                                'display',
                                'none',
                                'important'
                            );

                            setStatus(
                                'Scan complete. No matching incomings found.',
                                'success'
                            );
                        }

                        hideScanLock();
                    }
                ).catch((error) => {
                    console.error(
                        '[RallyPointEnhancer] Incoming scan error:',
                        error
                    );

                    isScanning = false;
                    activeMovementTypes = null;
                    hideScanLock();

                    parseButton.textContent =
                        'Scan Incomings';
                    setButtonDisabled(
                        parseButton,
                        false
                    );
                    setButtonDisabled(
                        copyButton,
                        false
                    );
                    setButtonDisabled(
                        clearButton,
                        false
                    );
                    setStatus(
                        'The incoming scan stopped unexpectedly.',
                        'error'
                    );
                    renderEmptyState(
                        tableTarget,
                        'Incoming scan stopped.',
                        'Try the scan again. The screen is no longer locked.'
                    );
                });
            }
        );

        copyButton.addEventListener(
            'click',
            (event) => {
                event.stopPropagation();
                copyResultsToClipboard();
            }
        );

        clearButton.addEventListener(
            'click',
            (event) => {
                event.stopPropagation();
                clearScan();
            }
        );
    }

    function mountToggleButton() {
        if (
            document.getElementById(
                TOGGLE_ID
            )
        ) {
            return;
        }

        const toggleButton =
            document.createElement(
                'div'
            );

        toggleButton.id =
            TOGGLE_ID;

        toggleButton.setAttribute(
            'title',
            'Rally Point Scanner'
        );

        toggleButton.innerHTML = `
            <svg
                viewBox="0 0 24 24"
                style="
                    fill: none !important;
                    stroke: var(--qol-accent) !important;
                    stroke-width: 2 !important;
                    stroke-linecap: round !important;
                    stroke-linejoin: round !important;
                "
            >
                <polyline
                    points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"
                ></polyline>

                <line
                    x1="13"
                    y1="19"
                    x2="19"
                    y2="13"
                ></line>

                <line
                    x1="16"
                    y1="16"
                    x2="20"
                    y2="20"
                ></line>

                <line
                    x1="19"
                    y1="21"
                    x2="21"
                    y2="19"
                ></line>
            </svg>
        `;

        toggleButton.addEventListener(
            'click',
            (event) => {
                event.preventDefault();
                event.stopPropagation();

                const bar =
                    document.getElementById(
                        PANEL_ID
                    );

                if (!bar) {
                    return;
                }

                const isHidden =
                    window
                        .getComputedStyle(
                            bar
                        )
                        .display ===
                    'none';

                if (isHidden) {
                    window.dispatchEvent(
                        new CustomEvent(
                            'qol_close_others',
                            {
                                detail: {
                                    source:
                                        'wm'
                                }
                            }
                        )
                    );

                    positionPanelUnderButton(
                        bar
                    );

                    bar.style.setProperty(
                        'display',
                        'flex',
                        'important'
                    );
                } else {
                    bar.style.setProperty(
                        'display',
                        'none',
                        'important'
                    );
                }
            }
        );

        document.body.appendChild(
            toggleButton
        );

        if (
            typeof window
                .qolRepositionAllButtons ===
            'function'
        ) {
            window.qolRepositionAllButtons();
        }
    }

    function destroyUI() {
        hideScanLock();

        const bar =
            document.getElementById(
                PANEL_ID
            );

        const toggleButton =
            document.getElementById(
                TOGGLE_ID
            );

        if (bar) {
            bar.remove();
        }

        if (toggleButton) {
            toggleButton.remove();
        }

        isScanning = false;
    }

    function ensureUI() {
        if (!document.body) {
            return;
        }

        if (!isEnabled()) {
            destroyUI();
            return;
        }

        injectStyles();
        mountPanel();
        mountToggleButton();

        if (
            typeof window
                .qolRepositionAllButtons ===
            'function'
        ) {
            window.qolRepositionAllButtons();
        }
    }

    window.addEventListener(
        'resize',
        () => {
            const bar =
                document.getElementById(
                    PANEL_ID
                );

            if (
                bar &&
                window
                    .getComputedStyle(
                        bar
                    )
                    .display !== 'none'
            ) {
                const rectangle =
                    bar.getBoundingClientRect();

                if (
                    rectangle.right >
                        window.innerWidth ||
                    rectangle.bottom >
                        window.innerHeight
                ) {
                    positionPanelUnderButton(
                        bar
                    );
                }
            }
        }
    );

    window.addEventListener(
        'qol_setting_changed',
        (event) => {
            if (
                !event.detail ||
                event.detail.key !==
                    FEATURE_KEY
            ) {
                return;
            }

            if (
                event.detail.enabled
            ) {
                ensureUI();
            } else {
                destroyUI();
            }
        }
    );

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            ensureUI,
            { once: true }
        );
    } else {
        ensureUI();
    }

    window.setInterval(
        ensureUI,
        1200
    );
}

initRallyPointEnhancer();