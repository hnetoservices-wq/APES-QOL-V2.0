/**
 * Incoming Resource Parser Module
 * Visual refresh matching the Oasis & Cropper Scanner style.
 */

function initIncomingResourceEnhancer() {
    'use strict';

    const FEATURE_KEY = 'rallyPointParser';
    const PANEL_ID = 'qol-ir-action-bar';
    const TOGGLE_ID = 'qol-ir-toggle-btn';
    const STYLE_ID = 'qol-ir-enhancer-styles';

    let compiledShipments = [];
    let isScanning = false;

    console.log('[IncomingResourceEnhancer] Module successfully initialized.');

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
                title: 'Scanning Resources...',
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

    function formatNumber(value) {
        return Number(value || 0).toLocaleString();
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
                border: 3px solid #634d31 !important;
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

            .qol-ir-header {
                height: 34px !important;
                padding: 6px 10px !important;
                background: linear-gradient(
                    to bottom,
                    #6d5436,
                    #543f26
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

            .qol-ir-close {
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

            .qol-ir-close:hover {
                background-color: rgba(255, 255, 255, 0.16) !important;
            }

            .qol-ir-body {
                display: flex !important;
                flex-direction: column !important;
                gap: 8px !important;
                flex: 1 1 auto !important;
                min-height: 0 !important;
                padding: 10px !important;
                background-color: #f7f5f0 !important;
                box-sizing: border-box !important;
            }

            .qol-ir-description {
                padding: 7px 9px !important;
                background-color: #fff6e5 !important;
                border: 1px solid #d4c2a5 !important;
                border-radius: 4px !important;
                color: #5b4630 !important;
                line-height: 1.4 !important;
            }

            .qol-ir-controls {
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
                width: 100% !important;
                box-sizing: border-box !important;
            }

            .qol-ir-action-btn {
                height: auto !important;
                padding: 4px 8px !important;
                border: 1px solid #42311c !important;
                border-radius: 4px !important;
                background-color: #543f26 !important;
                background: linear-gradient(
                    to bottom,
                    #7d6342,
                    #543f26
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

            .qol-ir-action-primary {
                min-width: 170px !important;
            }

            .qol-ir-action-danger {
                background: linear-gradient(
                    to bottom,
                    #d9534f,
                    #b52b27
                ) !important;
                border-color: #8f211e !important;
            }

            .qol-ir-action-btn:not(.qol-action-disabled):hover {
                background-color: #543f26 !important;
                background: linear-gradient(to bottom, #8d7352, #644f36) !important;
            }

            .qol-ir-action-danger:not(.qol-action-disabled):hover {
                background: linear-gradient(to bottom, #e4605d, #d43f3a) !important;
            }

            .qol-ir-action-btn.qol-action-disabled {
                opacity: 0.45 !important;
                cursor: default !important;
                pointer-events: none !important;
            }

            .qol-ir-status-line {
                min-height: 18px !important;
                color: #5b4630 !important;
                font-size: 11px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                gap: 10px !important;
            }

            #qol-ir-status[data-tone="working"] {
                color: #8a5a16 !important;
                font-weight: bold !important;
            }

            #qol-ir-status[data-tone="success"] {
                color: #4f7328 !important;
                font-weight: bold !important;
            }

            #qol-ir-status[data-tone="error"] {
                color: #a52a2a !important;
                font-weight: bold !important;
            }

            #qol-ir-result-count {
                color: #6c5a43 !important;
                white-space: nowrap !important;
            }

            #qol-ir-table-wrapper {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 1 auto !important;
                width: 100% !important;
                min-width: 0 !important;
                min-height: 0 !important;
                overflow: hidden !important;
            }

            .qol-ir-results {
                flex: 1 1 auto !important;
                width: 100% !important;
                height: 100% !important;
                min-width: 0 !important;
                min-height: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 8px !important;
                overflow: hidden !important;
            }

            .qol-ir-summary-grid {
                display: grid !important;
                grid-template-columns:
                    repeat(5, minmax(110px, 1fr))
                    !important;
                gap: 6px !important;
                flex: 0 0 auto !important;
            }

            .qol-ir-summary-card {
                min-width: 0 !important;
                padding: 8px 10px !important;
                background-color: #ffffff !important;
                border: 1px solid #c7b99e !important;
                border-radius: 3px !important;
                box-sizing: border-box !important;
            }

            .qol-ir-summary-card.total {
                background-color: #fff6e5 !important;
                border-color: #bda57e !important;
            }

            .qol-ir-summary-label {
                display: flex !important;
                align-items: center !important;
                gap: 5px !important;
                margin-bottom: 4px !important;
                color: #6a573d !important;
                font-size: 10px !important;
                font-weight: bold !important;
                text-transform: uppercase !important;
                letter-spacing: 0.3px !important;
                white-space: nowrap !important;
            }

            .qol-ir-summary-value {
                color: #3f3020 !important;
                font-size: 15px !important;
                font-weight: bold !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }

            .qol-ir-table-wrapper {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                overflow: auto !important;
                background-color: #ffffff !important;
                border: 1px solid #c7b99e !important;
                border-radius: 3px !important;
            }

            .qol-ir-table {
                width: 100% !important;
                border-collapse: collapse !important;
                background-color: #ffffff !important;
                font-size: 11px !important;
            }

            .qol-ir-table th,
            .qol-ir-table td {
                padding: 7px 8px !important;
                border-bottom: 1px solid #e4dccd !important;
                text-align: left !important;
                vertical-align: middle !important;
                white-space: nowrap !important;
            }

            .qol-ir-table th {
                position: sticky !important;
                top: 0 !important;
                z-index: 2 !important;
                background-color: #e9dfcc !important;
                color: #4f3b24 !important;
                font-size: 10px !important;
                text-transform: uppercase !important;
                letter-spacing: 0.3px !important;
            }

            .qol-ir-table tbody tr:hover {
                background-color: #fff8e9 !important;
            }

            .qol-ir-player {
                font-weight: bold !important;
                color: #3e3020 !important;
            }

            .qol-ir-time {
                font-family:
                    Consolas,
                    Monaco,
                    monospace
                    !important;
            }

            .qol-ir-resource-cell {
                text-align: right !important;
                font-variant-numeric: tabular-nums !important;
            }

            .qol-ir-total-cell {
                text-align: right !important;
                color: #5b4328 !important;
                font-weight: bold !important;
                font-variant-numeric: tabular-nums !important;
            }

            .qol-ir-empty,
            .qol-ir-scanning {
                min-height: 150px !important;
                padding: 28px 12px !important;
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 7px !important;
                color: #777777 !important;
                font-size: 12px !important;
                text-align: center !important;
                background-color: #ffffff !important;
                border: 1px solid #c7b99e !important;
                border-radius: 3px !important;
                box-sizing: border-box !important;
            }

            .qol-ir-empty strong,
            .qol-ir-scanning strong {
                color: #5b4630 !important;
                font-size: 13px !important;
            }

            .qol-ir-spinner {
                width: 24px !important;
                height: 24px !important;
                border: 3px solid #d8ccb6 !important;
                border-top-color: #6d5436 !important;
                border-radius: 50% !important;
                animation:
                    qolIrSpin 0.8s linear infinite
                    !important;
            }

            @keyframes qolIrSpin {
                to {
                    transform: rotate(360deg);
                }
            }

            @media (max-width: 900px) {
                .qol-ir-summary-grid {
                    grid-template-columns:
                        repeat(2, minmax(120px, 1fr))
                        !important;
                }
            }

            @media (max-width: 760px) {
                #${PANEL_ID} {
                    min-width: 94vw !important;
                }

                .qol-ir-controls {
                    flex-wrap: wrap !important;
                }

                .qol-ir-action-primary {
                    flex: 1 1 100% !important;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function destroyUI() {
        hideScanLock();

        const bar =
            document.getElementById(
                PANEL_ID
            );

        if (bar) {
            bar.remove();
        }

        const toggleButton =
            document.getElementById(
                TOGGLE_ID
            );

        if (toggleButton) {
            toggleButton.remove();
        }

        isScanning = false;
    }

    function makeDraggable(
        element,
        handle
    ) {
        handle.addEventListener(
            'pointerdown',
            event => {
                if (
                    event.target.closest(
                        '.qol-ir-close'
                    )
                ) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                const startX =
                    event.clientX;

                const startY =
                    event.clientY;

                const rectangle =
                    element.getBoundingClientRect();

                const originalLeft =
                    rectangle.left;

                const originalTop =
                    rectangle.top;

                element.style.setProperty(
                    'transform',
                    'none',
                    'important'
                );

                element.style.setProperty(
                    'left',
                    `${originalLeft}px`,
                    'important'
                );

                element.style.setProperty(
                    'top',
                    `${originalTop}px`,
                    'important'
                );

                element.style.setProperty(
                    'right',
                    'auto',
                    'important'
                );

                element.style.setProperty(
                    'bottom',
                    'auto',
                    'important'
                );

                try {
                    handle.setPointerCapture(
                        event.pointerId
                    );
                } catch (error) {
                    // Pointer capture is optional.
                }

                function handlePointerMove(
                    moveEvent
                ) {
                    moveEvent.preventDefault();

                    const nextLeft =
                        Math.max(
                            0,
                            Math.min(
                                window.innerWidth -
                                    70,

                                originalLeft +
                                    moveEvent.clientX -
                                    startX
                            )
                        );

                    const nextTop =
                        Math.max(
                            0,
                            Math.min(
                                window.innerHeight -
                                    40,

                                originalTop +
                                    moveEvent.clientY -
                                    startY
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

                function handlePointerUp(
                    upEvent
                ) {
                    try {
                        handle.releasePointerCapture(
                            upEvent.pointerId
                        );
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
            }
        );
    }

    function positionPanelUnderButton(bar) {
        if (!bar) {
            return;
        }

        const cogButton =
            document.getElementById(
                'qol-cog-btn'
            );

        if (!cogButton) {
            bar.style.setProperty(
                'left',
                '20px',
                'important'
            );

            bar.style.setProperty(
                'top',
                '80px',
                'important'
            );

            return;
        }

        const rectangle =
            cogButton.getBoundingClientRect();

        const panelWidth =
            bar.offsetWidth || 900;

        const panelHeight =
            bar.offsetHeight || 500;

        const maximumLeft =
            Math.max(
                10,
                window.innerWidth -
                    panelWidth -
                    10
            );

        const maximumTop =
            Math.max(
                10,
                window.innerHeight -
                    panelHeight -
                    10
            );

        const left =
            Math.max(
                10,
                Math.min(
                    rectangle.left,
                    maximumLeft
                )
            );

        const top =
            Math.max(
                10,
                Math.min(
                    rectangle.bottom + 20,
                    maximumTop
                )
            );

        bar.style.setProperty(
            'position',
            'fixed',
            'important'
        );

        bar.style.setProperty(
            'left',
            `${left}px`,
            'important'
        );

        bar.style.setProperty(
            'top',
            `${top}px`,
            'important'
        );

        bar.style.setProperty(
            'right',
            'auto',
            'important'
        );

        bar.style.setProperty(
            'bottom',
            'auto',
            'important'
        );

        bar.style.setProperty(
            'transform',
            'none',
            'important'
        );
    }

    function setStatus(
        message,
        tone = 'neutral'
    ) {
        const statusElement =
            document.getElementById(
                'qol-ir-status'
            );

        if (!statusElement) {
            return;
        }

        statusElement.textContent =
            message;

        statusElement.dataset.tone =
            tone;
    }

    function setButtonDisabled(
        button,
        disabled
    ) {
        if (!button) {
            return;
        }

        button.classList.toggle(
            'qol-action-disabled',
            disabled
        );

        button.setAttribute(
            'aria-disabled',
            disabled
                ? 'true'
                : 'false'
        );
    }

    function updateResultCount() {
        const countElement =
            document.getElementById(
                'qol-ir-result-count'
            );

        if (!countElement) {
            return;
        }

        const totalResources =
            compiledShipments.reduce(
                (
                    sum,
                    shipment
                ) => {
                    return (
                        sum +
                        Number(
                            shipment.total ||
                            0
                        )
                    );
                },
                0
            );

        if (
            compiledShipments.length ===
            0
        ) {
            countElement.textContent =
                '0 shipments';

            return;
        }

        countElement.textContent =
            `${compiledShipments.length} shipments · ` +
            `${formatNumber(totalResources)} resources`;
    }

    function renderEmptyState(
        container,
        title =
            'No scan results yet.',
        description =
            'Select “Parse Resources” to scan incoming Rally Point shipments.'
    ) {
        if (!container) {
            return;
        }

        container.innerHTML = `
            <div class="qol-ir-empty">
                <strong>
                    ${escapeHtml(title)}
                </strong>

                <span>
                    ${escapeHtml(description)}
                </span>
            </div>
        `;
    }

    function renderScanningState(
        container
    ) {
        if (!container) {
            return;
        }

        container.innerHTML = `
            <div class="qol-ir-scanning">
                <div class="qol-ir-spinner"></div>

                <strong>
                    Scanning incoming resources...
                </strong>

                <span>
                    Checking all available incoming movement pages.
                </span>
            </div>
        `;
    }

    window.addEventListener(
        'qol_setting_changed',
        event => {
            if (
                event.detail &&
                event.detail.key ===
                    FEATURE_KEY &&
                !event.detail.enabled
            ) {
                destroyUI();
            }
        }
    );

    window.addEventListener(
        'qol_close_others',
        event => {
            if (
                event.detail &&
                event.detail.source !==
                    'ir'
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
        event => {
            if (
                event.key !==
                'Escape'
            ) {
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
                    .display !==
                    'none'
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
        let playerName =
            'UnknownPlayer';

        let villageName =
            'UnknownVillage';

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
                    .replace(
                        /[\r\n]+/g,
                        ' '
                    )
                    .trim();
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
                    .replace(
                        /[\r\n]+/g,
                        ' '
                    )
                    .trim();
        }

        return {
            playerName:
                playerName.replace(
                    /"/g,
                    '""'
                ),

            villageName:
                villageName.replace(
                    /"/g,
                    '""'
                )
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
            const element = document.querySelector(selector);

            if (element && element.offsetHeight > 0) {
                return element;
            }
        }

        const inboundHeader = Array.from(
            document.querySelectorAll('div, span, h1, h2, h3, th')
        ).find(element => {
            return element.textContent?.includes('Inbound troops');
        });

        return inboundHeader?.closest(
            '.window, .buildingView, div[style*="position"]'
        ) || inboundHeader?.parentElement || null;
    }

    function getIncomingDataContainer(container) {
        const selector =
            '.tabIncoming.currentTab, ' +
            '.tabIncoming.activeTab';
        const candidates = [
            ...Array.from(
                container?.querySelectorAll(
                    selector
                ) || []
            ),
            ...Array.from(
                document.querySelectorAll(
                    selector
                )
            )
        ];

        return candidates.find(element => {
            if (!element?.isConnected) {
                return false;
            }

            const style =
                window.getComputedStyle(
                    element
                );

            return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                (
                    element.offsetWidth > 0 ||
                    element.offsetHeight > 0
                )
            );
        }) || candidates[0] || null;
    }

    function findPaginationButton(
        type,
        container
    ) {
        if (!container) {
            return null;
        }

        const exactClass =
            type === 'next'
                ? 'nextPage'
                : 'firstPage';
        const exactControl =
            container.querySelector(
                `.tg-pagination > ul > li.${exactClass}`
            );

        if (
            exactControl &&
            !exactControl.classList.contains(
                'disabled'
            ) &&
            (
                exactControl.offsetWidth > 0 ||
                exactControl.offsetHeight > 0
            )
        ) {
            return exactControl;
        }

        const candidates =
            container.querySelectorAll(
                'button, a, span, div, li, i, svg, ' +
                '[class*="next"], ' +
                '[class*="pager"], ' +
                '[class*="arrow"], ' +
                '[class*="page"]'
            );

        for (
            const element of candidates
        ) {
            if (
                element.offsetWidth === 0 &&
                element.offsetHeight === 0
            ) {
                continue;
            }

            if (
                element.closest(
                    '.villageList'
                ) ||
                element.closest(
                    '#sidebar'
                ) ||
                element.closest(
                    '.navigation'
                ) ||
                element.closest(
                    '.tg-pagination .disabled, ' +
                    '.tg-pagination .inactive'
                )
            ) {
                continue;
            }

            const className =
                element.className &&
                typeof element.className ===
                    'string'
                    ? element.className
                        .toLowerCase()
                    : '';

            if (
                className.includes(
                    'disabled'
                ) ||
                className.includes(
                    'inactive'
                )
            ) {
                continue;
            }

            const text =
                (
                    element.textContent ||
                    ''
                )
                    .trim()
                    .toLowerCase();

            const title =
                (
                    element.getAttribute(
                        'title'
                    ) ||
                    ''
                ).toLowerCase();

            const aria =
                (
                    element.getAttribute(
                        'aria-label'
                    ) ||
                    ''
                ).toLowerCase();

            if (
                title.includes(
                    'village'
                ) ||
                text.includes(
                    'village'
                )
            ) {
                continue;
            }

            if (type === 'next') {
                const hasNextClass =
                    className.includes(
                        'next'
                    ) ||
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
                    title.includes(
                        'next'
                    ) ||
                    aria.includes(
                        'next'
                    );

                if (
                    hasNextClass ||
                    hasNextText
                ) {
                    if (
                        text.includes(
                            '>>'
                        ) ||
                        text.includes(
                            '»'
                        ) ||
                        title.includes(
                            'last'
                        ) ||
                        className.includes(
                            'last'
                        )
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
                    className.includes(
                        'first'
                    ) ||
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
                    title.includes(
                        'first'
                    );

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
            return false;
        }

        try {
            element.click();
            return true;
        } catch (_error) {
            element.dispatchEvent(
                new MouseEvent(
                    'click',
                    {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    }
                )
            );
            return true;
        }
    }

    function getCurrentPage(container) {
        const activeControl =
            container?.querySelector(
                '.tg-pagination li.number.disabled a, ' +
                '.tg-pagination li.number.disabled, ' +
                '.tg-pagination li.number.active a, ' +
                '.tg-pagination li.number.active'
            );
        const controlPage =
            Number.parseInt(
                String(
                    activeControl
                        ?.textContent || ''
                ).replace(
                    /[^0-9]/g,
                    ''
                ),
                10
            );

        if (
            Number.isFinite(
                controlPage
            )
        ) {
            return controlPage;
        }

        const hashMatch =
            String(
                window.location.hash || ''
            ).match(
                /(?:^|\/)cp:(\d+)/i
            );

        return hashMatch
            ? Number.parseInt(
                hashMatch[1],
                10
            )
            : 1;
    }

    async function waitForNextPage(
        previousPage,
        timeout = 7000
    ) {
        const startedAt =
            Date.now();
        let pageSeenAt = 0;
        let stableSignature = '';
        let stableChecks = 0;

        while (
            Date.now() - startedAt <
                timeout &&
            isScanning &&
            isEnabled()
        ) {
            await new Promise(
                resolve => {
                    setTimeout(
                        resolve,
                        200
                    );
                }
            );

            const container =
                getRallyPointContainer();
            const page =
                getCurrentPage(
                    container
                );

            if (
                page <=
                    previousPage
            ) {
                continue;
            }

            if (
                pageSeenAt === 0
            ) {
                pageSeenAt =
                    Date.now();
            }

            const signature =
                getPageSignature(
                    container
                );

            if (
                signature &&
                signature ===
                    stableSignature
            ) {
                stableChecks += 1;
            } else {
                stableSignature =
                    signature;
                stableChecks =
                    signature
                        ? 1
                        : 0;
            }

            if (
                Date.now() - pageSeenAt >=
                    700 &&
                stableChecks >= 2
            ) {
                await new Promise(
                    resolve => {
                        setTimeout(
                            resolve,
                            350
                        );
                    }
                );

                return page;
            }
        }

        return null;
    }

    function getPageSignature(
        container
    ) {
        const dataContainer =
            getIncomingDataContainer(
                container
            );

        if (!dataContainer) {
            return '';
        }

        let signature = '';

        dataContainer
            .querySelectorAll(
                '.troopsDetailContainer'
            )
            .forEach(
                element => {
                    signature +=
                        (
                            element.innerText ||
                            ''
                        )
                            .replace(
                                /\s+/g,
                                ' '
                            )
                            .substring(
                                0,
                                40
                            );
                }
            );

        return signature;
    }

    async function triggerVirtualScrollSweep(
        container
    ) {
        const dataContainer =
            getIncomingDataContainer(
                container
            );

        if (!dataContainer) {
            return;
        }

        const scrollable =
            dataContainer.querySelector(
                '.scrollPane, ' +
                '.scrollContentInnerWrapper, ' +
                '.movementList, ' +
                '.overviewList'
            ) ||
            dataContainer;

        if (
            scrollable &&
            scrollable.scrollHeight >
                scrollable.clientHeight
        ) {
            const originalScroll =
                scrollable.scrollTop;

            scrollable.scrollTop =
                scrollable.scrollHeight;

            await new Promise(
                resolve => {
                    setTimeout(
                        resolve,
                        150
                    );
                }
            );

            scrollable.scrollTop =
                originalScroll;

            await new Promise(
                resolve => {
                    setTimeout(
                        resolve,
                        100
                    );
                }
            );
        }
    }

    function isStrikethrough(
        element
    ) {
        if (!element) {
            return false;
        }

        if (
            element.tagName === 'S' ||
            element.tagName === 'STRIKE' ||
            element.tagName === 'DEL' ||
            element.querySelector(
                's, strike, del, ' +
                '.strikethrough, ' +
                '[old="true"]'
            ) ||
            element.closest(
                's, strike, del, ' +
                '.strikethrough, ' +
                'display-resources[old="true"]'
            )
        ) {
            return true;
        }

        let current =
            element;

        while (
            current &&
            current.classList &&
            !current.classList.contains(
                'troopsDetailContainer'
            )
        ) {
            const classList =
                current.className &&
                typeof current.className ===
                    'string'
                    ? current.className
                        .toLowerCase()
                    : '';

            if (
                classList.includes(
                    'strike'
                ) ||
                classList.includes(
                    'linethrough'
                ) ||
                classList.includes(
                    'disabled'
                )
            ) {
                return true;
            }

            if (
                current.getAttribute &&
                current.getAttribute(
                    'old'
                ) === 'true'
            ) {
                return true;
            }

            current =
                current.parentElement;
        }

        try {
            const style =
                window.getComputedStyle(
                    element
                );

            const decoration =
                style.textDecorationLine ||
                style.textDecoration ||
                '';

            if (
                decoration.includes(
                    'line-through'
                )
            ) {
                return true;
            }
        } catch (error) {
            // Ignore computed-style failures.
        }

        return false;
    }

    function scrapePageData(
        container,
        contextData
    ) {
        const dataContainer =
            getIncomingDataContainer(
                container
            );

        if (!dataContainer) {
            return;
        }

        const pageShipments = [];

        const detailContainers =
            dataContainer.querySelectorAll(
                '.troopsDetailContainer'
            );

        detailContainers.forEach(
            item => {
                const isTrade =
                    item.querySelector(
                        '.movement_trade_small_flat_black'
                    ) ||
                    item.querySelector(
                        '[tooltip-translate*="merchant"]'
                    ) ||
                    item.querySelector(
                        '.bounty'
                    );

                if (!isTrade) {
                    return;
                }

                const playerElement =
                    item.querySelector(
                        '.playerLink'
                    );

                const villageElement =
                    item.querySelector(
                        '.villageLink'
                    );

                const senderPlayer =
                    playerElement
                        ? playerElement
                            .textContent
                            .trim()
                        : 'Unknown';

                const senderVillage =
                    villageElement
                        ? villageElement
                            .textContent
                            .trim()
                        : 'Unknown';

                const countdownElement =
                    item.querySelector(
                        '.countdownContainer [countdown]'
                    ) ||
                    item.querySelector(
                        '.countdownContainer .countdownTo'
                    ) ||
                    item.querySelector(
                        '.countdownContainer'
                    );

                let travel =
                    '00:00:00';

                if (countdownElement) {
                    const match =
                        countdownElement
                            .textContent
                            .match(
                                /\d{2}:\d{2}:\d{2}/
                            );

                    if (match) {
                        travel =
                            match[0];
                    }
                }

                function getResourceValue(
                    containerSelector
                ) {
                    const resourceElement =
                        item.querySelector(
                            containerSelector
                        );

                    if (!resourceElement) {
                        return 0;
                    }

                    const valueElement =
                        resourceElement
                            .querySelector(
                                '.resourceValue'
                            ) ||
                        resourceElement;

                    if (
                        isStrikethrough(
                            valueElement
                        ) ||
                        isStrikethrough(
                            resourceElement
                        )
                    ) {
                        return 0;
                    }

                    const cleaned =
                        valueElement
                            .textContent
                            .replace(
                                /[^\d]/g,
                                ''
                            );

                    return (
                        Number.parseInt(
                            cleaned,
                            10
                        ) ||
                        0
                    );
                }

                const wood =
                    getResourceValue(
                        '.woodValue'
                    );

                const clay =
                    getResourceValue(
                        '.clayValue'
                    );

                const iron =
                    getResourceValue(
                        '.ironValue'
                    );

                const crop =
                    getResourceValue(
                        '.cropValue'
                    );

                const total =
                    wood +
                    clay +
                    iron +
                    crop;

                if (total === 0) {
                    return;
                }

                pageShipments.push({
                    senderPlayer:
                        senderPlayer.replace(
                            /"/g,
                            '""'
                        ),

                    senderVillage:
                        senderVillage.replace(
                            /"/g,
                            '""'
                        ),

                    travel,
                    wood,
                    clay,
                    iron,
                    crop,
                    total,

                    targetPlayer:
                        contextData.playerName,

                    targetVillage:
                        contextData.villageName
                });
            }
        );

        /*
         * Every matching DOM row represents a real shipment. Separate
         * shipments can legitimately have the same sender, village,
         * countdown and resource amounts, so comparing those values is not
         * a safe way to detect duplicates. The page scanner already visits
         * each rendered page once, therefore all rows found on that page
         * should be preserved.
         */
        compiledShipments.push(
            ...pageShipments
        );
    }

    async function awaitRallyPointRender(
        timeoutMilliseconds = 8000
    ) {
        const startTime =
            Date.now();

        while (
            Date.now() -
                startTime <
            timeoutMilliseconds
        ) {
            const container =
                getRallyPointContainer();

            if (container) {
                const hasTrade =
                    container.querySelector(
                        '.movement_trade_small_flat_black'
                    ) ||
                    container.querySelector(
                        '.bounty'
                    ) ||
                    container.querySelector(
                        '.troopsDetailContainer'
                    ) ||
                    findPaginationButton(
                        'next',
                        container
                    );

                const hasLoadedIncomingState = hasTrade ||
                    /Inbound troops|Incoming troops|No troop/i.test(
                        container.textContent || ''
                    );

                if (hasLoadedIncomingState) {
                    await new Promise(
                        resolve => {
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
                resolve => {
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
        compiledShipments = [];
        isScanning = true;

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
            isScanning = false;
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
            triggerClick(
                firstButton
            );

            const firstPageStartedAt =
                Date.now();

            while (
                Date.now() -
                    firstPageStartedAt <
                    5000 &&
                getCurrentPage(
                    getRallyPointContainer()
                ) > 1 &&
                isScanning &&
                isEnabled()
            ) {
                await new Promise(
                    resolve => {
                        setTimeout(
                            resolve,
                            200
                        );
                    }
                );
            }

            await new Promise(
                resolve => {
                    setTimeout(
                        resolve,
                        500
                    );
                }
            );
        }

        const visitedPages =
            new Set();
        let page =
            getCurrentPage(
                getRallyPointContainer()
            );

        while (
            page <= 50 &&
            isScanning &&
            isEnabled()
        ) {
            const currentContainer =
                getRallyPointContainer();

            if (!currentContainer) {
                break;
            }

            page =
                getCurrentPage(
                    currentContainer
                );

            if (
                visitedPages.has(
                    page
                )
            ) {
                break;
            }

            visitedPages.add(
                page
            );
            statusBox.textContent =
                `Scanning page ${page}...`;
            updateScanLock(
                `Scanning resource page ${page}...`
            );

            await triggerVirtualScrollSweep(
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

            if (!nextButton) {
                break;
            }

            const previousPage =
                getCurrentPage(
                    currentContainer
                );

            triggerClick(
                nextButton
            );

            const nextPage =
                await waitForNextPage(
                    previousPage
                );

            if (
                !Number.isFinite(
                    nextPage
                ) ||
                nextPage <=
                    previousPage
            ) {
                break;
            }

            page =
                nextPage;
        }

        if (
            !isScanning ||
            !isEnabled()
        ) {
            return;
        }

        isScanning = false;
        statusBox.textContent =
            `Done! Processed ${compiledShipments.length} shipments across ${visitedPages.size} pages.`;
        updateScanLock(
            `Finishing scan with ${compiledShipments.length} resource shipments...`
        );
        onComplete();
    }

    function buildDashboardResourceHash() {
        const villageMatch = String(window.location.hash || '')
            .match(/(?:^|\/)villId:([^/]+)/i);
        const villagePart = villageMatch ? `villId:${villageMatch[1]}/` : '';
        return `#/page:village/${villagePart}location:32/window:building/cp:1/subtab:Incoming`;
    }

    async function scanIncomingResourcesForDashboard(context = {}) {
        if (isScanning) throw new Error('The incoming resource scanner is already running.');

        const onProgress = typeof context.onProgress === 'function'
            ? context.onProgress
            : () => {};
        const progressTarget = {};
        Object.defineProperty(progressTarget, 'textContent', {
            set(value) { onProgress(String(value || 'Scanning incoming resources...')); }
        });

        isScanning = true;
        compiledShipments = [];

        try {
            onProgress('Opening incoming resource page 1...');
            window.location.hash = buildDashboardResourceHash();
            if (!await awaitRallyPointRender(10000)) {
                throw new Error('The incoming resource Rally Point did not render.');
            }

            await collectAllPages(progressTarget, () => {});
            return compiledShipments.map(shipment => ({ ...shipment }));
        } finally {
            isScanning = false;
        }
    }

    function getTotals() {
        return compiledShipments.reduce(
            (
                totals,
                shipment
            ) => {
                totals.wood +=
                    Number(
                        shipment.wood ||
                        0
                    );

                totals.clay +=
                    Number(
                        shipment.clay ||
                        0
                    );

                totals.iron +=
                    Number(
                        shipment.iron ||
                        0
                    );

                totals.crop +=
                    Number(
                        shipment.crop ||
                        0
                    );

                totals.grandTotal +=
                    Number(
                        shipment.total ||
                        0
                    );

                return totals;
            },
            {
                wood: 0,
                clay: 0,
                iron: 0,
                crop: 0,
                grandTotal: 0
            }
        );
    }

    function renderScrollableUI(
        container
    ) {
        if (!container) {
            return;
        }

        if (
            compiledShipments.length ===
            0
        ) {
            renderEmptyState(
                container,
                'No incoming resources found.',
                'The Rally Point scan completed without finding any active incoming resource shipments.'
            );

            updateResultCount();

            return;
        }

        const totals =
            getTotals();

        const rows =
            compiledShipments
                .map(
                    shipment => {
                        return `
                            <tr>
                                <td class="qol-ir-player">
                                    ${escapeHtml(
                                        shipment.senderPlayer ||
                                        'Unknown'
                                    )}
                                </td>

                                <td>
                                    ${escapeHtml(
                                        shipment.senderVillage ||
                                        'Unknown'
                                    )}
                                </td>

                                <td class="qol-ir-time">
                                    ${escapeHtml(
                                        shipment.travel ||
                                        '00:00:00'
                                    )}
                                </td>

                                <td class="qol-ir-resource-cell">
                                    ${formatNumber(
                                        shipment.wood
                                    )}
                                </td>

                                <td class="qol-ir-resource-cell">
                                    ${formatNumber(
                                        shipment.clay
                                    )}
                                </td>

                                <td class="qol-ir-resource-cell">
                                    ${formatNumber(
                                        shipment.iron
                                    )}
                                </td>

                                <td class="qol-ir-resource-cell">
                                    ${formatNumber(
                                        shipment.crop
                                    )}
                                </td>

                                <td class="qol-ir-total-cell">
                                    ${formatNumber(
                                        shipment.total
                                    )}
                                </td>
                            </tr>
                        `;
                    }
                )
                .join('');

        container.innerHTML = `
            <div class="qol-ir-results">
                <div class="qol-ir-summary-grid">
                    <div class="qol-ir-summary-card">
                        <div class="qol-ir-summary-label">
                            <i class="unit_wood_small_illu resType1"></i>
                            Wood
                        </div>

                        <div class="qol-ir-summary-value">
                            ${formatNumber(
                                totals.wood
                            )}
                        </div>
                    </div>

                    <div class="qol-ir-summary-card">
                        <div class="qol-ir-summary-label">
                            <i class="unit_clay_small_illu resType2"></i>
                            Clay
                        </div>

                        <div class="qol-ir-summary-value">
                            ${formatNumber(
                                totals.clay
                            )}
                        </div>
                    </div>

                    <div class="qol-ir-summary-card">
                        <div class="qol-ir-summary-label">
                            <i class="unit_iron_small_illu resType3"></i>
                            Iron
                        </div>

                        <div class="qol-ir-summary-value">
                            ${formatNumber(
                                totals.iron
                            )}
                        </div>
                    </div>

                    <div class="qol-ir-summary-card">
                        <div class="qol-ir-summary-label">
                            <i class="unit_crop_small_illu resType4"></i>
                            Crop
                        </div>

                        <div class="qol-ir-summary-value">
                            ${formatNumber(
                                totals.crop
                            )}
                        </div>
                    </div>

                    <div class="qol-ir-summary-card total">
                        <div class="qol-ir-summary-label">
                            Total Resources
                        </div>

                        <div class="qol-ir-summary-value">
                            ${formatNumber(
                                totals.grandTotal
                            )}
                        </div>
                    </div>
                </div>

                <div class="qol-ir-table-wrapper">
                    <table class="qol-ir-table">
                        <thead>
                            <tr>
                                <th>Player</th>
                                <th>Village</th>
                                <th>Remaining</th>
                                <th>Wood</th>
                                <th>Clay</th>
                                <th>Iron</th>
                                <th>Crop</th>
                                <th>Total</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        updateResultCount();
    }

    function clearScan() {
        if (isScanning) {
            return;
        }

        hideScanLock();
        compiledShipments = [];

        const resultsTarget =
            document.getElementById(
                'qol-ir-table-wrapper'
            );

        const parseButton =
            document.getElementById(
                'qol-ir-btn-parse'
            );

        const clearButton =
            document.getElementById(
                'qol-ir-btn-clear'
            );

        if (resultsTarget) {
            renderEmptyState(
                resultsTarget
            );
        }

        if (parseButton) {
            parseButton.textContent =
                'Parse Resources';
        }

        if (clearButton) {
            clearButton.style.setProperty(
                'display',
                'none',
                'important'
            );
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

        bar.id =
            PANEL_ID;

        bar.innerHTML = `
            <div class="qol-ir-header">
                <span>
                    Incoming Resources
                </span>

                <span
                    class="qol-ir-close"
                    id="qol-ir-close"
                    title="Close Panel"
                >
                    &times;
                </span>
            </div>

            <div class="qol-ir-body">
                <div class="qol-ir-description">
                    Open and scan every incoming Rally Point page,
                    then total all active resource shipments headed
                    to the current village.
                </div>

                <div class="qol-ir-controls">
                    <div
                        id="qol-ir-btn-parse"
                        class="qol-ir-action-btn qol-ir-action-primary"
                        data-state="ready"
                    >
                        Parse Resources
                    </div>

                    <div
                        id="qol-ir-btn-clear"
                        class="qol-ir-action-btn qol-ir-action-danger"
                        style="display: none !important;"
                    >
                        Clear
                    </div>
                </div>

                <div class="qol-ir-status-line">
                    <span
                        id="qol-ir-status"
                        data-tone="neutral"
                    >
                        Ready.
                    </span>

                    <span id="qol-ir-result-count">
                        0 shipments
                    </span>
                </div>

                <div
                    id="qol-ir-table-wrapper"
                ></div>
            </div>
        `;

        document.body.appendChild(
            bar
        );

        const header =
            bar.querySelector(
                '.qol-ir-header'
            );

        const closeButton =
            bar.querySelector(
                '#qol-ir-close'
            );

        const parseButton =
            bar.querySelector(
                '#qol-ir-btn-parse'
            );

        const clearButton =
            bar.querySelector(
                '#qol-ir-btn-clear'
            );

        const resultsTarget =
            bar.querySelector(
                '#qol-ir-table-wrapper'
            );

        makeDraggable(
            bar,
            header
        );

        renderEmptyState(
            resultsTarget
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
            async event => {
                event.stopPropagation();

                if (isScanning) {
                    return;
                }

                isScanning = true;
                compiledShipments = [];
                showScanLock(
                    'Opening the Rally Point...'
                );

                setButtonDisabled(
                    parseButton,
                    true
                );

                setButtonDisabled(
                    clearButton,
                    true
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
                    resultsTarget
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
                        'location:32/window:building/' +
                        'subtab:Incoming';
                }

                let panelLoaded = false;

                try {
                    panelLoaded =
                        await awaitRallyPointRender(
                            8000
                        );
                } catch (error) {
                    console.error(
                        '[IncomingResourceEnhancer] Rally Point render error:',
                        error
                    );
                }

                if (!panelLoaded) {
                    isScanning = false;
                    hideScanLock();

                    parseButton.textContent =
                        'Parse Resources';

                    setButtonDisabled(
                        parseButton,
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
                        resultsTarget,
                        'Rally Point could not be opened.',
                        'Open the Rally Point manually and try the scan again.'
                    );

                    return;
                }

                parseButton.textContent =
                    'Scanning...';

                setStatus(
                    'Scanning incoming resource pages...',
                    'working'
                );
                updateScanLock(
                    'Scanning incoming resource pages...'
                );

                collectAllPages(
                    document.getElementById(
                        'qol-ir-status'
                    ),
                    () => {
                        isScanning = false;

                        renderScrollableUI(
                            resultsTarget
                        );

                        parseButton.textContent =
                            'Parse Again';

                        setButtonDisabled(
                            parseButton,
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
                            compiledShipments.length >
                            0
                        ) {
                            setStatus(
                                `Scan complete. Found ${compiledShipments.length} incoming shipments.`,
                                'success'
                            );
                        } else {
                            setStatus(
                                'Scan complete. No incoming resources found.',
                                'success'
                            );
                        }

                        hideScanLock();
                    }
                ).catch((error) => {
                    console.error(
                        '[IncomingResourceEnhancer] Resource scan error:',
                        error
                    );

                    isScanning = false;
                    hideScanLock();

                    parseButton.textContent =
                        'Parse Resources';
                    setButtonDisabled(
                        parseButton,
                        false
                    );
                    setButtonDisabled(
                        clearButton,
                        false
                    );
                    setStatus(
                        'The resource scan stopped unexpectedly.',
                        'error'
                    );
                    renderEmptyState(
                        resultsTarget,
                        'Resource scan stopped.',
                        'Try the scan again. The screen is no longer locked.'
                    );
                });
            }
        );

        clearButton.addEventListener(
            'click',
            event => {
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
            'Incoming Resources Panel'
        );

        toggleButton.innerHTML = `
            <svg
                viewBox="0 0 24 24"
                style="
                    fill: none !important;
                    stroke: #7d6342 !important;
                    stroke-width: 2 !important;
                    stroke-linecap: round !important;
                    stroke-linejoin: round !important;
                "
            >
                <path
                    d="
                        M21 8
                        a2 2 0 0 0-1-1.73
                        l-7-4
                        a2 2 0 0 0-2 0
                        l-7 4
                        A2 2 0 0 0 3 8
                        v8
                        a2 2 0 0 0 1 1.73
                        l7 4
                        a2 2 0 0 0 2 0
                        l7-4
                        A2 2 0 0 0 21 16Z
                    "
                ></path>

                <path
                    d="m3.3 7 8.7 5 8.7-5"
                ></path>

                <path
                    d="M12 22V12"
                ></path>
            </svg>
        `;

        toggleButton.addEventListener(
            'click',
            event => {
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
                                        'ir'
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

    window.APES?.scanners?.register({
        id: 'rally.resources',
        label: 'Incoming Resources',
        description: 'Scans incoming Rally Point pages for active merchant deliveries.',
        scope: 'village',
        modes: ['full'],
        enabled: isEnabled,
        scan: scanIncomingResourcesForDashboard
    });

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
                    .display !==
                    'none'
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

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            ensureUI,
            {
                once: true
            }
        );
    } else {
        ensureUI();
    }

    window.setInterval(
        ensureUI,
        1200
    );
}

initIncomingResourceEnhancer();
