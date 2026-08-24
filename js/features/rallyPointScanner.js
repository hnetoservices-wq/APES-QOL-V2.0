/**
 * APES QoL Unified Rally Point Scanner
 *
 * First-stage unification layer:
 * - One toolbar launcher and one APES window.
 * - Incomings, Outgoings, and Resources tabs.
 * - Reuses the proven parser controls and result views while the shared
 *   Rally Point traversal engine is prepared for a later extraction.
 */

function initUnifiedRallyPointScanner() {
    'use strict';

    const FEATURE_KEY = 'rallyPointParser';
    const PANEL_ID = 'qol-rally-point-scanner';
    const TOGGLE_ID = 'qol-rally-point-toggle-btn';
    const STYLE_ID = 'qol-rally-point-scanner-styles';
    const SCAN_LOCK_ID = 'qol-rally-point-scan-lock';
    const ACTIVE_TAB_STORAGE_KEY =
        'qol_rallyPointActiveTab';
    const MOVEMENT_TYPE_STORAGE_KEY =
        'qol_rallyPointMovementTypes';
    const OUTGOING_TYPE_STORAGE_KEY =
        'qol_rallyPointOutgoingTypes';

    const DEFAULT_MOVEMENT_TYPES = {
        attack: true,
        siege: true,
        raid: false,
        reinforcement: false
    };

    const DEFAULT_OUTGOING_TYPES = {
        attack: true,
        siege: true,
        reinforcement: true,
        merchant: true
    };

    let outgoingResults = [];
    let outgoingScanning = false;

    function isEnabled() {
        if (
            typeof window.isQolEnabled ===
            'function'
        ) {
            return window.isQolEnabled(
                FEATURE_KEY
            ) === true;
        }

        return true;
    }

    function hideScanLock() {
        document
            .getElementById(SCAN_LOCK_ID)
            ?.remove();
    }

    function updateScanLock(message) {
        const status =
            document.querySelector(
                `#${SCAN_LOCK_ID} .qol-rally-scan-lock-status`
            );

        if (status && message) {
            status.textContent = message;
        }
    }

    function showScanLock({
        title = 'Scanning Rally Point...',
        message = 'Please wait while APES checks the incoming pages.'
    } = {}) {
        hideScanLock();

        if (!document.body) {
            return;
        }

        const lock =
            document.createElement('div');

        lock.id = SCAN_LOCK_ID;
        lock.setAttribute('role', 'status');
        lock.setAttribute('aria-live', 'polite');
        lock.setAttribute('aria-busy', 'true');
        lock.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background-color: rgba(0, 0, 0, 0.7) !important;
            z-index: 2147483646 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            color: #ffffff !important;
            font-family: Arial, sans-serif !important;
            font-size: 15px !important;
            font-weight: bold !important;
            flex-direction: column !important;
            gap: 8px !important;
            text-align: center !important;
            cursor: wait !important;
            user-select: none !important;
            pointer-events: auto !important;
            touch-action: none !important;
        `;
        lock.innerHTML = `
            <div class="qol-rally-scan-lock-title"></div>
            <div
                class="qol-rally-scan-lock-status"
                style="
                    max-width: min(520px, 80vw) !important;
                    color: #dddddd !important;
                    font-size: 11px !important;
                    font-weight: normal !important;
                    line-height: 1.45 !important;
                "
            ></div>
            <div
                style="
                    margin-top: 2px !important;
                    color: #aaaaaa !important;
                    font-size: 10px !important;
                    font-weight: normal !important;
                "
            >
                Keep this window open until the scan finishes.
            </div>
        `;

        lock.querySelector(
            '.qol-rally-scan-lock-title'
        ).textContent = title;
        lock.querySelector(
            '.qol-rally-scan-lock-status'
        ).textContent = message;

        [
            'pointerdown',
            'pointermove',
            'pointerup',
            'mousemove',
            'mousedown',
            'mouseup',
            'click',
            'dblclick',
            'contextmenu',
            'wheel',
            'touchstart',
            'touchmove',
            'touchend'
        ].forEach((eventName) => {
            lock.addEventListener(
                eventName,
                (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                },
                { passive: false }
            );
        });

        document.body.appendChild(lock);
    }

    window.qolRallyPointScanLock = {
        show: showScanLock,
        update: updateScanLock,
        hide: hideScanLock
    };

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style =
            document.createElement('style');

        style.id = STYLE_ID;
        style.textContent = `
            #qol-rp-action-bar,
            #qol-ir-action-bar,
            #qol-wm-toggle-btn,
            #qol-ir-toggle-btn {
                display: none !important;
            }

            #${PANEL_ID} {
                position: fixed !important;
                display: none;
                flex-direction: column !important;
                width: 900px;
                min-width: 620px !important;
                max-width: 96vw !important;
                height: 540px;
                min-height: 390px !important;
                max-height: 92vh !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 3px solid #634d31 !important;
                border-radius: 5px !important;
                background: #f7f5f0 !important;
                box-shadow: 0 10px 30px rgba(0, 0, 0, .5) !important;
                color: #333 !important;
                font-family: Arial, sans-serif !important;
                font-size: 11px !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                resize: both !important;
                z-index: 999999 !important;
            }

            #${PANEL_ID},
            #${PANEL_ID} * {
                box-sizing: border-box !important;
            }

            .qol-rally-scanner-header {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                flex: 0 0 38px !important;
                min-height: 38px !important;
                padding: 6px 10px !important;
                border-bottom: 1px solid #3f2d19 !important;
                background: linear-gradient(to bottom, #6d5436, #543f26) !important;
                color: #f7f5f0 !important;
                cursor: move !important;
                user-select: none !important;
                touch-action: none !important;
            }

            .qol-rally-scanner-title {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
                font-size: 14px !important;
                font-weight: bold !important;
            }

            .qol-rally-scanner-mark {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 22px !important;
                height: 22px !important;
                border: 1px solid rgba(255, 255, 255, .2) !important;
                border-radius: 4px !important;
                background: rgba(0, 0, 0, .18) !important;
                font-size: 13px !important;
            }

            .qol-rally-scanner-close {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 26px !important;
                height: 26px !important;
                border-radius: 4px !important;
                background: rgba(0, 0, 0, .2) !important;
                color: #fff !important;
                cursor: pointer !important;
                font-size: 21px !important;
                font-weight: bold !important;
                line-height: 1 !important;
            }

            .qol-rally-scanner-close:hover {
                background: rgba(255, 255, 255, .16) !important;
            }

            .qol-rally-tabs {
                display: flex !important;
                align-items: stretch !important;
                flex: 0 0 38px !important;
                min-height: 38px !important;
                padding: 0 10px !important;
                border-bottom: 1px solid #cbbda8 !important;
                background: #e8dfcf !important;
            }

            .qol-rally-tab {
                position: relative !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                min-width: 116px !important;
                padding: 0 18px !important;
                border: 0 !important;
                border-left: 1px solid transparent !important;
                border-right: 1px solid transparent !important;
                background: transparent !important;
                color: #6b563d !important;
                font: inherit !important;
                font-size: 11px !important;
                font-weight: bold !important;
                cursor: pointer !important;
                user-select: none !important;
            }

            .qol-rally-tab:hover {
                background: rgba(255, 255, 255, .36) !important;
            }

            .qol-rally-tab.active {
                border-left-color: #cbbda8 !important;
                border-right-color: #cbbda8 !important;
                background: #f7f5f0 !important;
                color: #3f2f1f !important;
            }

            .qol-rally-tab.active::after {
                content: '' !important;
                position: absolute !important;
                right: 14px !important;
                bottom: 0 !important;
                left: 14px !important;
                height: 3px !important;
                background: #9a7a50 !important;
            }

            .qol-rally-scanner-content {
                display: flex !important;
                flex: 1 1 auto !important;
                min-width: 0 !important;
                min-height: 0 !important;
                background: #f7f5f0 !important;
                overflow: hidden !important;
            }

            .qol-rally-tab-panel {
                display: none !important;
                flex: 1 1 auto !important;
                min-width: 0 !important;
                min-height: 0 !important;
                overflow: hidden !important;
            }

            .qol-rally-tab-panel.active {
                display: flex !important;
            }

            .qol-rally-tab-panel > .qol-rp-body,
            .qol-rally-tab-panel > .qol-ir-body {
                width: 100% !important;
                height: 100% !important;
                flex: 1 1 auto !important;
                min-width: 0 !important;
                min-height: 0 !important;
            }

            .qol-rally-loading {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 100% !important;
                min-height: 160px !important;
                color: #7b6a56 !important;
                font-size: 12px !important;
            }

            .qol-rally-movement-picker {
                display: flex !important;
                align-items: center !important;
                gap: 8px 14px !important;
                flex-wrap: wrap !important;
                padding: 8px 10px !important;
                border: 1px solid #d7c9b4 !important;
                border-radius: 4px !important;
                background: #eee7dc !important;
            }

            .qol-rally-movement-picker-title {
                margin-right: 2px !important;
                color: #5a4630 !important;
                font-size: 10px !important;
                font-weight: bold !important;
                text-transform: uppercase !important;
                letter-spacing: .25px !important;
            }

            .qol-rally-movement-option {
                position: relative !important;
                display: inline-flex !important;
                align-items: center !important;
                gap: 5px !important;
                color: #4b3822 !important;
                font-size: 11px !important;
                font-weight: bold !important;
                cursor: pointer !important;
                user-select: none !important;
            }

            .qol-rally-checkbox {
                position: relative !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                flex: 0 0 16px !important;
                width: 16px !important;
                height: 16px !important;
                border: 1px solid #8a7559 !important;
                border-radius: 3px !important;
                background: linear-gradient(to bottom, #fffdf8, #eee5d7) !important;
                box-shadow: inset 0 1px 1px rgba(70, 50, 28, .08), 0 1px 0 rgba(255, 255, 255, .65) !important;
                transition: border-color .12s ease, background .12s ease !important;
            }

            .qol-rally-checkbox::before {
                content: none !important;
                display: none !important;
            }

            .qol-rally-checkbox::after {
                content: '' !important;
                display: block !important;
                width: 8px !important;
                height: 4px !important;
                margin-top: -2px !important;
                border: solid #fff !important;
                border-width: 0 0 2px 2px !important;
                opacity: 0 !important;
                transform: rotate(-45deg) scale(.6) !important;
                transition: opacity .12s ease, transform .12s ease !important;
            }

            .qol-rally-checkbox.checked {
                border-color: #604727 !important;
                background: linear-gradient(to bottom, #8b6d45, #684d2d) !important;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, .2) !important;
            }

            .qol-rally-checkbox.checked::after {
                opacity: 1 !important;
                transform: rotate(-45deg) scale(1) !important;
            }

            .qol-rally-movement-option:hover .qol-rally-checkbox {
                border-color: #604727 !important;
            }

            .qol-rally-movement-option:focus-visible .qol-rally-checkbox {
                outline: 2px solid rgba(116, 89, 54, .38) !important;
                outline-offset: 2px !important;
            }

            .qol-rally-movement-warning {
                display: none !important;
                margin-left: auto !important;
                color: #9a2f2a !important;
                font-size: 10px !important;
                font-weight: bold !important;
            }

            .qol-rally-movement-warning.visible {
                display: inline !important;
            }

            #qol-rally-outgoing-view {
                display: flex !important;
                flex-direction: column !important;
                width: 100% !important;
                height: 100% !important;
                min-width: 0 !important;
                min-height: 0 !important;
                padding: 10px !important;
                gap: 8px !important;
                overflow: hidden !important;
            }

            #qol-rally-outgoing-view .qol-rp-table-wrapper {
                flex: 1 1 auto !important;
                min-height: 0 !important;
            }

            .qol-rp-type-badge.merchant {
                background-color: #eee4f5 !important;
                color: #65427b !important;
                border: 1px solid #ae91bf !important;
            }

            #${TOGGLE_ID} {
                position: fixed !important;
                display: none;
                align-items: center !important;
                justify-content: center !important;
                width: 30px !important;
                height: 30px !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 2px solid #7d6342 !important;
                border-radius: 50% !important;
                background: #ebdcb9 !important;
                box-shadow: 0 2px 4px rgba(0, 0, 0, .22) !important;
                cursor: pointer !important;
                user-select: none !important;
                z-index: 9999 !important;
            }

            #${TOGGLE_ID}:hover {
                transform: scale(1.08) !important;
                background: #f7f5f0 !important;
            }

            #${TOGGLE_ID} svg {
                width: 17px !important;
                height: 17px !important;
                fill: none !important;
                stroke: #7d6342 !important;
                stroke-width: 2 !important;
                stroke-linecap: round !important;
                stroke-linejoin: round !important;
                pointer-events: none !important;
            }

            body.qol-toolbar-collapsed #${TOGGLE_ID} {
                visibility: hidden !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }

            @media (max-width: 760px) {
                #${PANEL_ID} {
                    width: calc(100vw - 20px) !important;
                    min-width: 0 !important;
                    height: min(600px, calc(100vh - 20px)) !important;
                    left: 10px !important;
                }

                .qol-rally-tab {
                    flex: 1 1 33.333% !important;
                    min-width: 0 !important;
                }

                .qol-rally-movement-warning {
                    width: 100% !important;
                    margin-left: 0 !important;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function readMovementTypes() {
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
            // Keep the default selection.
        }

        return selectedTypes;
    }

    function saveMovementTypes(selectedTypes) {
        try {
            localStorage.setItem(
                MOVEMENT_TYPE_STORAGE_KEY,
                JSON.stringify(selectedTypes)
            );
        } catch (_) {
            // The current selection still works for this page session.
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function readOutgoingTypes() {
        const selectedTypes = {
            ...DEFAULT_OUTGOING_TYPES
        };

        try {
            const storedValue =
                localStorage.getItem(
                    OUTGOING_TYPE_STORAGE_KEY
                );
            const parsedValue = storedValue
                ? JSON.parse(storedValue)
                : null;

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
        } catch (_) {
            // Keep defaults.
        }

        return selectedTypes;
    }

    function saveOutgoingTypes(selectedTypes) {
        try {
            localStorage.setItem(
                OUTGOING_TYPE_STORAGE_KEY,
                JSON.stringify(selectedTypes)
            );
        } catch (_) {
            // Persistence is optional.
        }
    }

    function getOutgoingContainer() {
        return document.querySelector(
            '.tabOutgoing.currentTab, ' +
            '.tabOutgoing.activeTab'
        );
    }

    function getOutgoingNavigationContainer() {
        const outgoingTab =
            getOutgoingContainer();
        const rallyPointRoot =
            outgoingTab?.closest(
                '.buildingDetails.rallypoint'
            );

        if (rallyPointRoot) {
            return rallyPointRoot;
        }

        const selectors = [
            '.buildingDetails.rallypoint',
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

        return getOutgoingContainer();
    }

    function getOutgoingRows(container) {
        if (!container) {
            return [];
        }

        return Array.from(
            container.querySelectorAll(
                'troop-details-rallypoint.movingTroops > ' +
                '.troopsDetailContainer, ' +
                '.movingTroops > .troopsDetailContainer'
            )
        );
    }

    function getOutgoingCategory(row) {
        const titleText = String(
            row.querySelector('.troopsTitle')
                ?.textContent || ''
        ).toLowerCase();
        const iconClasses = String(
            row.querySelector(
                '.troopsTitle [class*="movement_"][class*="_small"]'
            )?.className || ''
        ).toLowerCase();
        const value = `${titleText} ${iconClasses}`;

        if (value.includes('siege')) {
            return 'siege';
        }

        if (
            value.includes('merchant') ||
            value.includes('movement_trade')
        ) {
            return 'merchant';
        }

        if (
            value.includes('reinforcement') ||
            value.includes('support')
        ) {
            return 'reinforcement';
        }

        if (
            titleText.includes('attack') ||
            iconClasses.includes(
                'movement_attack'
            )
        ) {
            return 'attack';
        }

        return null;
    }

    function formatFinishTimestamp(value) {
        const seconds = Number(value);

        if (!Number.isFinite(seconds)) {
            return '';
        }

        return new Date(seconds * 1000)
            .toLocaleTimeString(
                [],
                {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                }
            );
    }

    function getFinishTimestamp(element) {
        if (!element) {
            return '';
        }

        const directValue =
            element.getAttribute(
                'data-time-finish'
            ) ||
            element.dataset?.timeFinish;

        if (directValue) {
            return directValue;
        }

        const angularData = [
            element.getAttribute('data'),
            element.getAttribute('tooltip-data')
        ].filter(Boolean).join(' ');
        const match = angularData.match(
            /timeFinish\s*:\s*(\d+)/i
        );

        return match ? match[1] : '';
    }

    function parseOutgoingRow(row) {
        const category =
            getOutgoingCategory(row);

        if (!category) {
            return null;
        }

        const playerElement =
            row.querySelector(
                '.troopsTitle .playerLink'
            );
        const villageElement =
            row.querySelector(
                '.troopsTitle .villageLink'
            );
        const countdownContainer =
            row.querySelector(
                '.countdownTo, ' +
                '.countdownContainer'
            );
        const countdownElement =
            countdownContainer?.querySelector(
                '[countdown]'
            );
        const landingElement =
            countdownContainer?.querySelector(
                '[i18ndt]'
            );
        const finishTimestamp =
            getFinishTimestamp(
                countdownContainer
            ) ||
            landingElement?.getAttribute(
                'i18ndt'
            );

        if (!villageElement || !countdownElement) {
            return null;
        }

        const labels = {
            attack: 'Attack',
            siege: 'Siege',
            reinforcement: 'Reinforcement',
            merchant: 'Merchant'
        };

        return {
            target:
                playerElement?.textContent
                    .trim() || 'Unknown',
            targetVillage:
                villageElement.textContent
                    .trim() || 'Unknown',
            type: labels[category],
            category,
            remaining:
                countdownElement.textContent
                    .trim() || '00:00:00',
            landing:
                landingElement?.textContent
                    .trim() ||
                formatFinishTimestamp(
                    finishTimestamp
                ) ||
                'Unknown'
        };
    }

    function getOutgoingSignature(container) {
        return getOutgoingRows(container)
            .map((row) => {
                const icon = row.querySelector(
                    '.troopsTitle [class*="movement_"]'
                );
                const finish = row.querySelector(
                    '.countdownTo, .countdownContainer'
                );

                return [
                    icon?.className || '',
                    row.querySelector('.playerLink')
                        ?.textContent || '',
                    row.querySelector('.villageLink')
                        ?.textContent || '',
                    getFinishTimestamp(finish)
                ].join('|');
            })
            .join('||');
    }

    function findOutgoingPaginationButton(type, container) {
        if (!container) {
            return null;
        }

        const exactClass = type === 'next'
            ? 'nextPage'
            : 'firstPage';
        const exactControl = container.querySelector(
            `.tg-pagination > ul > li.${exactClass}`
        );

        if (
            exactControl &&
            !exactControl.classList.contains('disabled') &&
            (
                exactControl.offsetWidth > 0 ||
                exactControl.offsetHeight > 0
            )
        ) {
            return exactControl;
        }

        const candidates = container.querySelectorAll(
            'button, a, span, div, li, i, svg, ' +
            '[class*="next"], [class*="pager"], ' +
            '[class*="arrow"], [class*="page"]'
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

            const className = typeof element.className === 'string'
                ? element.className.toLowerCase()
                : '';
            const text = String(element.textContent || '')
                .trim()
                .toLowerCase();
            const title = String(element.getAttribute('title') || '')
                .toLowerCase();
            const aria = String(element.getAttribute('aria-label') || '')
                .toLowerCase();

            if (
                className.includes('disabled') ||
                className.includes('inactive') ||
                title.includes('village') ||
                text.includes('village')
            ) {
                continue;
            }

            if (type === 'next') {
                const matches =
                    className.includes('next') ||
                    className.includes('arrowright') ||
                    className.includes('pageright') ||
                    className.includes('forward') ||
                    text === '>' ||
                    text === '›' ||
                    text === 'next' ||
                    title.includes('next') ||
                    aria.includes('next');

                if (
                    matches &&
                    !text.includes('>>') &&
                    !text.includes('»') &&
                    !title.includes('last') &&
                    !className.includes('last')
                ) {
                    return element.closest(
                        'button, a, div[role="button"]'
                    ) || element;
                }
            }

            if (type === 'first') {
                const matches =
                    className.includes('first') ||
                    className.includes('arrowleft') ||
                    className.includes('pageleft') ||
                    text === '<' ||
                    text === '«' ||
                    text === '<<' ||
                    text === 'first' ||
                    title.includes('first');

                if (matches) {
                    return element.closest(
                        'button, a, div[role="button"]'
                    ) || element;
                }
            }
        }

        return null;
    }

    function getOutgoingCurrentPage(container) {
        const currentPageControl = container?.querySelector(
            '.tg-pagination li.number.disabled a, ' +
            '.tg-pagination li.number.disabled'
        );
        const controlPage = Number.parseInt(
            String(currentPageControl?.textContent || '')
                .replace(/[^0-9]/g, ''),
            10
        );

        if (Number.isFinite(controlPage)) {
            return controlPage;
        }

        const hashPage = String(window.location.hash || '')
            .match(/(?:^|\/)cp:(\d+)/i);

        return hashPage
            ? Number.parseInt(hashPage[1], 10)
            : 1;
    }

    function triggerOutgoingPagination(element) {
        if (!element) {
            return;
        }

        try {
            element.click();
            return;
        } catch (_) {
            // Fall back to the complete pointer/mouse event sequence.
        }

        [
            'pointerdown', 'mousedown', 'pointerup',
            'mouseup', 'click'
        ].forEach(eventType => {
            element.dispatchEvent(new MouseEvent(eventType, {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        });
    }

    async function sweepOutgoingVirtualScroll(container) {
        const scrollable = container?.querySelector(
            '.scrollPane, .scrollContentInnerWrapper, ' +
            '.movementList, .overviewList'
        ) || container;

        if (
            !scrollable ||
            scrollable.scrollHeight <= scrollable.clientHeight
        ) {
            return;
        }

        const originalScroll = scrollable.scrollTop;
        scrollable.scrollTop = scrollable.scrollHeight;
        await new Promise(resolve => window.setTimeout(resolve, 150));
        scrollable.scrollTop = originalScroll;
        await new Promise(resolve => window.setTimeout(resolve, 100));
    }

    function buildOutgoingHash(page = 1) {
        let path = String(
            window.location.hash || ''
        ).replace(/^#\/?/, '');

        if (
            !path.includes('window:building') ||
            !path.includes('location:32')
        ) {
            const villageMatch =
                path.match(/villId:[^/]+/);

            path =
                'page:village/' +
                (
                    villageMatch
                        ? `${villageMatch[0]}/`
                        : ''
                ) +
                'location:32/window:building/' +
                `cp:${page}/subtab:Outgoing`;

            return path;
        }

        path = path.match(/cp:\d+/)
            ? path.replace(
                /cp:\d+/,
                `cp:${page}`
            )
            : `${path}/cp:${page}`;

        path = path.match(/subtab:[^/]+/)
            ? path.replace(
                /subtab:[^/]+/,
                'subtab:Outgoing'
            )
            : `${path}/subtab:Outgoing`;

        return path;
    }

    async function waitForOutgoingRender(
        previousSignature = null,
        timeout = 10000,
        minimumSettleTime = 900
    ) {
        const start = Date.now();
        let stableSignature = null;
        let stableChecks = 0;

        while (Date.now() - start < timeout) {
            const container =
                getOutgoingContainer();

            if (container) {
                const signature =
                    getOutgoingSignature(
                        container
                    );
                const hasLoadedState =
                    signature.length > 0 ||
                    /Outbound troops|No troop/i
                        .test(
                            container.textContent || ''
                        );

                const isNewPage =
                    previousSignature === null ||
                    signature !== previousSignature;

                if (hasLoadedState && isNewPage) {
                    if (signature === stableSignature) {
                        stableChecks += 1;
                    } else {
                        stableSignature = signature;
                        stableChecks = 1;
                    }

                    if (
                        Date.now() - start >= minimumSettleTime &&
                        stableChecks >= 3
                    ) {
                        return container;
                    }
                } else {
                    stableSignature = null;
                    stableChecks = 0;
                }
            }

            await new Promise(resolve => {
                window.setTimeout(resolve, 200);
            });
        }

        return null;
    }

    function renderOutgoingResults(view) {
        const target = view?.querySelector(
            '#qol-outgoing-table-target'
        );
        const count = view?.querySelector(
            '#qol-outgoing-result-count'
        );
        const copyButton = view?.querySelector(
            '#qol-outgoing-copy'
        );
        const clearButton = view?.querySelector(
            '#qol-outgoing-clear'
        );

        if (!target || !count) {
            return;
        }

        count.textContent =
            `${outgoingResults.length} movement${
                outgoingResults.length === 1
                    ? ''
                    : 's'
            }`;

        [copyButton, clearButton]
            .forEach((button) => {
                button?.style.setProperty(
                    'display',
                    outgoingResults.length > 0
                        ? 'inline-flex'
                        : 'none',
                    'important'
                );
            });

        if (outgoingResults.length === 0) {
            target.innerHTML = `
                <div class="qol-rp-empty">
                    <strong>No outgoing results yet.</strong>
                    <span>Choose the outgoing types, then select “Scan Outgoings”.</span>
                </div>
            `;
            return;
        }

        target.innerHTML = `
            <table class="qol-rp-table">
                <thead>
                    <tr>
                        <th>Target</th>
                        <th>Village</th>
                        <th>Type</th>
                        <th>Remaining</th>
                        <th>Landing</th>
                    </tr>
                </thead>
                <tbody>
                    ${outgoingResults.map((movement) => `
                        <tr>
                            <td>${escapeHtml(movement.target)}</td>
                            <td>${escapeHtml(movement.targetVillage)}</td>
                            <td>
                                <span class="qol-rp-type-badge ${escapeHtml(movement.category)}">
                                    ${escapeHtml(movement.type)}
                                </span>
                            </td>
                            <td>${escapeHtml(movement.remaining)}</td>
                            <td>${escapeHtml(movement.landing)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function setOutgoingStatus(
        view,
        message,
        tone = 'neutral'
    ) {
        const status = view?.querySelector(
            '#qol-outgoing-status'
        );

        if (status) {
            status.textContent = message;
            status.dataset.tone = tone;
        }
    }

    function updateOutgoingPicker(view) {
        const selectedTypes = {};

        view.querySelectorAll(
            '[data-qol-outgoing-type]'
        ).forEach((control) => {
            const type = control.getAttribute(
                'data-qol-outgoing-type'
            );

            selectedTypes[type] =
                control.checked === true;
            control.setAttribute(
                'aria-checked',
                control.checked ? 'true' : 'false'
            );
            control.querySelector(
                '.qol-rally-checkbox'
            )?.classList.toggle(
                'checked',
                control.checked === true
            );
        });

        saveOutgoingTypes(selectedTypes);

        const hasSelection =
            Object.values(selectedTypes)
                .some(Boolean);

        view.querySelector(
            '#qol-outgoing-scan'
        )?.classList.toggle(
            'qol-action-disabled',
            !hasSelection
        );
        view.querySelector(
            '.qol-rally-movement-warning'
        )?.classList.toggle(
            'visible',
            !hasSelection
        );

        return selectedTypes;
    }

    async function scanOutgoings(view, options = {}) {
        if (outgoingScanning) {
            if (options.external) throw new Error('The outgoing Rally Point scanner is already running.');
            return null;
        }

        const external = options.external === true;
        const onProgress = typeof options.onProgress === 'function'
            ? options.onProgress
            : () => {};
        const selectedTypes = external
            ? {
                attack: true,
                siege: true,
                reinforcement: true,
                merchant: true,
                ...(options.selectedTypes || {})
            }
            : updateOutgoingPicker(view);
        if (!Object.values(selectedTypes).some(Boolean)) {
            if (external) throw new Error('Select at least one outgoing movement type.');
            setOutgoingStatus(
                view,
                'Select at least one outgoing movement type.',
                'error'
            );
            return null;
        }

        outgoingScanning = true;
        outgoingResults = [];

        const scanButton = view?.querySelector(
            '#qol-outgoing-scan'
        );

        if (!external) {
            scanButton.textContent = 'Opening Rally Point...';
            scanButton.classList.add('qol-action-disabled');
            setOutgoingStatus(view, 'Opening Outgoing Rally Point...', 'working');
            showScanLock({
                title: 'Scanning Outgoings...',
                message: 'Opening outgoing Rally Point page 1...'
            });
        }
        onProgress('Opening outgoing Rally Point page 1...');

        try {
            window.location.hash = buildOutgoingHash(1);
            let container = await waitForOutgoingRender(
                null,
                10000,
                400
            );

            if (!container) {
                throw new Error(
                    'Outgoing Rally Point did not render.'
                );
            }

            const firstButton = findOutgoingPaginationButton(
                'first',
                getOutgoingNavigationContainer()
            );

            if (firstButton) {
                if (!external) updateScanLock('Returning to the first outgoing page...');
                onProgress('Returning to the first outgoing page...');
                triggerOutgoingPagination(firstButton);
                await new Promise(resolve => {
                    window.setTimeout(resolve, 800);
                });
                container = getOutgoingContainer() || container;
            }

            let page = getOutgoingCurrentPage(
                getOutgoingNavigationContainer()
            );

            while (
                page <= 50 &&
                outgoingScanning &&
                isEnabled()
            ) {
                if (!external) {
                    updateScanLock(`Scanning outgoing page ${page}...`);
                    setOutgoingStatus(view, `Scanning page ${page}...`, 'working');
                }
                onProgress(`Scanning outgoing page ${page}...`);

                container = getOutgoingContainer();

                if (!container) {
                    break;
                }

                await sweepOutgoingVirtualScroll(container);

                const signature =
                    getOutgoingSignature(
                        container
                    );

                getOutgoingRows(container)
                    .forEach((row) => {
                        const movement =
                            parseOutgoingRow(row);

                        if (
                            movement &&
                            selectedTypes[
                                movement.category
                            ]
                        ) {
                            outgoingResults.push(
                                movement
                            );
                        }
                    });

                const nextButton = findOutgoingPaginationButton(
                    'next',
                    getOutgoingNavigationContainer()
                );

                if (!nextButton) {
                    break;
                }

                const navigationContainer =
                    getOutgoingNavigationContainer();
                const currentPage = getOutgoingCurrentPage(
                    navigationContainer
                );
                triggerOutgoingPagination(nextButton);

                let waited = 0;
                let pageChanged = false;
                let renderedPage = currentPage;
                let pageAdvanceSeenAt = 0;

                while (
                    waited < 6000 &&
                    outgoingScanning &&
                    isEnabled()
                ) {
                    await new Promise(resolve => {
                        window.setTimeout(resolve, 200);
                    });
                    waited += 200;

                    const newNavigationContainer =
                        getOutgoingNavigationContainer();
                    const newPage = getOutgoingCurrentPage(
                        newNavigationContainer
                    );
                    const newSignature = getOutgoingSignature(
                        getOutgoingContainer()
                    );
                    const pageAdvanced =
                        newPage > currentPage;
                    const navigationAdvanced =
                        pageAdvanced;

                    if (
                        navigationAdvanced &&
                        pageAdvanceSeenAt === 0
                    ) {
                        pageAdvanceSeenAt = Date.now();
                    }

                    if (
                        navigationAdvanced &&
                        newSignature.length > 0 &&
                        (
                            newSignature !== signature ||
                            Date.now() - pageAdvanceSeenAt >= 800
                        )
                    ) {
                        pageChanged = true;
                        renderedPage = pageAdvanced
                            ? newPage
                            : currentPage + 1;
                        break;
                    }
                }

                if (!pageChanged) {
                    break;
                }

                await new Promise(resolve => {
                    window.setTimeout(resolve, 500);
                });

                page = renderedPage;
            }

            if (!external) {
                renderOutgoingResults(view);
                setOutgoingStatus(
                    view,
                    outgoingResults.length > 0
                        ? `Scan complete. Found ${outgoingResults.length} outgoing movements.`
                        : 'Scan complete. No matching outgoings found.',
                    'success'
                );
            }
            return outgoingResults.map(movement => ({ ...movement }));
        } catch (error) {
            console.error(
                '[RallyPointScanner] Outgoing scan failed:',
                error
            );
            if (external) throw error;
            renderOutgoingResults(view);
            setOutgoingStatus(view, 'The outgoing scan stopped unexpectedly.', 'error');
            return null;
        } finally {
            outgoingScanning = false;
            if (!external) {
                hideScanLock();
                scanButton.textContent = outgoingResults.length > 0
                    ? 'Scan Again'
                    : 'Scan Outgoings';
                scanButton.classList.remove('qol-action-disabled');
                updateOutgoingPicker(view);
            }
        }
    }

    function mountOutgoingView(target) {
        if (
            !target ||
            target.querySelector(
                '#qol-rally-outgoing-view'
            )
        ) {
            return;
        }

        const selectedTypes =
            readOutgoingTypes();

        target.innerHTML = `
            <div id="qol-rally-outgoing-view" class="qol-rp-body">
                <div class="qol-rp-description">
                    Open and scan every outgoing Rally Point page for the selected movement types, then copy the results in a share-ready format.
                </div>
                <div class="qol-rally-movement-picker">
                    <span class="qol-rally-movement-picker-title">Scan for</span>
                    ${[
                        ['attack', 'Attack'],
                        ['siege', 'Siege'],
                        ['reinforcement', 'Reinforcements'],
                        ['merchant', 'Merchants']
                    ].map(([type, label]) => `
                        <div
                            class="qol-rally-movement-option"
                            data-qol-outgoing-type="${type}"
                            role="checkbox"
                            aria-checked="${selectedTypes[type] ? 'true' : 'false'}"
                            tabindex="0"
                        >
                            <span class="qol-rally-checkbox${selectedTypes[type] ? ' checked' : ''}" aria-hidden="true"></span>
                            <span>${label}</span>
                        </div>
                    `).join('')}
                    <span class="qol-rally-movement-warning">Select at least one type.</span>
                </div>
                <div class="qol-rp-controls">
                    <div id="qol-outgoing-scan" class="qol-rp-action-btn qol-rp-action-primary">Scan Outgoings</div>
                    <div id="qol-outgoing-copy" class="qol-rp-action-btn qol-rp-action-secondary" style="display:none !important;">Copy</div>
                    <div id="qol-outgoing-clear" class="qol-rp-action-btn qol-rp-action-danger" style="display:none !important;">Clear</div>
                </div>
                <div class="qol-rp-status-line">
                    <span id="qol-outgoing-status" data-tone="neutral">Ready.</span>
                    <span id="qol-outgoing-result-count">0 movements</span>
                </div>
                <div id="qol-outgoing-table-target" class="qol-rp-table-wrapper"></div>
            </div>
        `;

        const view = target.querySelector(
            '#qol-rally-outgoing-view'
        );

        view.querySelectorAll(
            '[data-qol-outgoing-type]'
        ).forEach((control) => {
            const type = control.getAttribute(
                'data-qol-outgoing-type'
            );

            control.checked =
                selectedTypes[type] === true;

            const toggle = () => {
                if (outgoingScanning) {
                    return;
                }

                control.checked =
                    !control.checked;
                updateOutgoingPicker(view);
            };

            control.addEventListener('click', toggle);
            control.addEventListener(
                'keydown',
                (event) => {
                    if (
                        event.key === 'Enter' ||
                        event.key === ' '
                    ) {
                        event.preventDefault();
                        toggle();
                    }
                }
            );
        });

        view.querySelector(
            '#qol-outgoing-scan'
        ).addEventListener(
            'click',
            () => scanOutgoings(view)
        );

        view.querySelector(
            '#qol-outgoing-copy'
        ).addEventListener(
            'click',
            async () => {
                const output = outgoingResults
                    .map((movement) => {
                        return `${movement.type} to ${movement.target} at ${movement.targetVillage} in ${movement.remaining} at ${movement.landing}`;
                    })
                    .join('\n');

                try {
                    await navigator.clipboard
                        .writeText(output);
                    setOutgoingStatus(
                        view,
                        `Copied ${outgoingResults.length} outgoing movements.`,
                        'success'
                    );
                } catch (_) {
                    setOutgoingStatus(
                        view,
                        'Could not copy the outgoing results.',
                        'error'
                    );
                }
            }
        );

        view.querySelector(
            '#qol-outgoing-clear'
        ).addEventListener(
            'click',
            () => {
                if (outgoingScanning) {
                    return;
                }

                outgoingResults = [];
                renderOutgoingResults(view);
                setOutgoingStatus(
                    view,
                    'Ready.',
                    'neutral'
                );
                view.querySelector(
                    '#qol-outgoing-scan'
                ).textContent =
                    'Scan Outgoings';
            }
        );

        updateOutgoingPicker(view);
        renderOutgoingResults(view);
    }

    function getActiveTab() {
        try {
            const storedValue =
                localStorage.getItem(
                    ACTIVE_TAB_STORAGE_KEY
                );

            if (
                storedValue === 'resources' ||
                storedValue === 'incomings' ||
                storedValue === 'outgoings'
            ) {
                return storedValue;
            }
        } catch (_) {
            // Use the default tab.
        }

        return 'incomings';
    }

    function activateTab(tabName) {
        const panel =
            document.getElementById(PANEL_ID);

        if (!panel) {
            return;
        }

        panel
            .querySelectorAll('[data-qol-rally-tab]')
            .forEach((tab) => {
                const isActive =
                    tab.getAttribute(
                        'data-qol-rally-tab'
                    ) === tabName;

                tab.classList.toggle(
                    'active',
                    isActive
                );
                tab.setAttribute(
                    'aria-selected',
                    isActive ? 'true' : 'false'
                );
            });

        panel
            .querySelectorAll('[data-qol-rally-panel]')
            .forEach((tabPanel) => {
                const isActive =
                    tabPanel.getAttribute(
                        'data-qol-rally-panel'
                    ) === tabName;

                tabPanel.classList.toggle(
                    'active',
                    isActive
                );
                tabPanel.hidden = !isActive;
            });

        try {
            localStorage.setItem(
                ACTIVE_TAB_STORAGE_KEY,
                tabName
            );
        } catch (_) {
            // Tab persistence is optional.
        }
    }

    function updateMovementPickerState(picker) {
        if (!picker) {
            return;
        }

        const selectedTypes = {};

        picker
            .querySelectorAll(
                '[data-qol-rally-movement-type]'
            )
            .forEach((checkbox) => {
                checkbox.querySelector(
                    '.qol-rally-checkbox'
                )
                    ?.classList.toggle(
                        'checked',
                        checkbox.checked === true
                    );
                checkbox.setAttribute(
                    'aria-checked',
                    checkbox.checked ? 'true' : 'false'
                );
                selectedTypes[
                    checkbox.getAttribute(
                        'data-qol-rally-movement-type'
                    )
                ] = checkbox.checked === true;
            });

        saveMovementTypes(selectedTypes);

        const hasSelection =
            Object.values(selectedTypes)
                .some(Boolean);

        const parseButton =
            document.getElementById(
                'qol-btn-merge'
            );

        const warning =
            picker.querySelector(
                '.qol-rally-movement-warning'
            );

        parseButton?.classList.toggle(
            'qol-action-disabled',
            !hasSelection
        );
        parseButton?.setAttribute(
            'aria-disabled',
            hasSelection ? 'false' : 'true'
        );
        warning?.classList.toggle(
            'visible',
            !hasSelection
        );
    }

    function mountMovementPicker(body) {
        if (
            !body ||
            body.querySelector(
                '.qol-rally-movement-picker'
            )
        ) {
            return;
        }

        const selectedTypes =
            readMovementTypes();
        const picker =
            document.createElement('div');

        picker.className =
            'qol-rally-movement-picker';
        picker.innerHTML = `
            <span class="qol-rally-movement-picker-title">
                Scan for
            </span>
            ${[
                ['attack', 'Attack'],
                ['siege', 'Siege'],
                ['raid', 'Raid'],
                ['reinforcement', 'Reinforcements']
            ].map(([type, label]) => `
                <div
                    class="qol-rally-movement-option"
                    data-qol-rally-movement-type="${type}"
                    role="checkbox"
                    aria-checked="${selectedTypes[type] ? 'true' : 'false'}"
                    tabindex="0"
                >
                    <span class="qol-rally-checkbox${selectedTypes[type] ? ' checked' : ''}" aria-hidden="true"></span>
                    <span>${label}</span>
                </div>
            `).join('')}
            <span class="qol-rally-movement-warning">
                Select at least one type.
            </span>
        `;

        const controls =
            body.querySelector(
                '.qol-rp-controls'
            );

        body.insertBefore(
            picker,
            controls || null
        );

        picker
            .querySelectorAll(
                '[data-qol-rally-movement-type]'
            )
            .forEach((control) => {
                const type = control.getAttribute(
                    'data-qol-rally-movement-type'
                );

                control.checked =
                    selectedTypes[type] === true;

                const toggleControl = () => {
                    control.checked =
                        !control.checked;

                    updateMovementPickerState(
                        picker
                    );
                };

                control.addEventListener(
                    'click',
                    toggleControl
                );
                control.addEventListener(
                    'keydown',
                    (event) => {
                        if (
                            event.key === 'Enter' ||
                            event.key === ' '
                        ) {
                            event.preventDefault();
                            toggleControl();
                        }
                    }
                );
            });

        updateMovementPickerState(
            picker
        );

        const parseButton =
            body.querySelector(
                '#qol-btn-merge'
            );

        if (
            parseButton &&
            !parseButton.dataset
                .qolMovementGuard
        ) {
            parseButton.dataset
                .qolMovementGuard = 'true';

            parseButton.addEventListener(
                'click',
                (event) => {
                    const hasSelection =
                        Array.from(
                            picker.querySelectorAll(
                                '[data-qol-rally-movement-type]'
                            )
                        ).some(
                            checkbox =>
                                checkbox.checked
                        );

                    if (!hasSelection) {
                        event.preventDefault();
                        event.stopImmediatePropagation();

                        const status =
                            document.getElementById(
                                'qol-merge-status'
                            );

                        if (status) {
                            status.textContent =
                                'Select at least one incoming movement type.';
                            status.dataset.tone =
                                'error';
                        }
                    }
                },
                true
            );
        }

        updateMovementPickerState(picker);
    }

    function adoptLegacyViews() {
        const panel =
            document.getElementById(PANEL_ID);

        if (!panel) {
            return;
        }

        const mappings = [
            {
                legacyPanelId:
                    'qol-rp-action-bar',
                bodySelector:
                    '.qol-rp-body',
                targetSelector:
                    '[data-qol-rally-panel="incomings"]',
                prepare:
                    mountMovementPicker
            },
            {
                legacyPanelId:
                    'qol-ir-action-bar',
                bodySelector:
                    '.qol-ir-body',
                targetSelector:
                    '[data-qol-rally-panel="resources"]'
            }
        ];

        mappings.forEach((mapping) => {
            const legacyPanel =
                document.getElementById(
                    mapping.legacyPanelId
                );
            const target =
                panel.querySelector(
                    mapping.targetSelector
                );

            legacyPanel?.style.setProperty(
                'display',
                'none',
                'important'
            );

            if (!target) {
                return;
            }

            let body =
                target.querySelector(
                    mapping.bodySelector
                );

            if (!body && legacyPanel) {
                body =
                    legacyPanel.querySelector(
                        mapping.bodySelector
                    );

                if (body) {
                    target
                        .querySelector(
                            '.qol-rally-loading'
                        )
                        ?.remove();
                    target.appendChild(body);
                }
            }

            if (body && mapping.prepare) {
                mapping.prepare(body);
            }
        });

        mountOutgoingView(
            panel.querySelector(
                '[data-qol-rally-panel="outgoings"]'
            )
        );

        [
            'qol-wm-toggle-btn',
            'qol-ir-toggle-btn'
        ].forEach((id) => {
            document
                .getElementById(id)
                ?.style.setProperty(
                    'display',
                    'none',
                    'important'
                );
        });
    }

    function makeDraggable(element, handle) {
        handle.addEventListener(
            'pointerdown',
            (event) => {
                if (
                    event.button !== 0 ||
                    event.target.closest(
                        '.qol-rally-scanner-close'
                    )
                ) {
                    return;
                }

                event.preventDefault();

                const rectangle =
                    element.getBoundingClientRect();
                const offsetX =
                    event.clientX - rectangle.left;
                const offsetY =
                    event.clientY - rectangle.top;

                function handlePointerMove(
                    moveEvent
                ) {
                    const maximumLeft =
                        Math.max(
                            10,
                            window.innerWidth -
                                element.offsetWidth -
                                10
                        );
                    const maximumTop =
                        Math.max(
                            10,
                            window.innerHeight -
                                element.offsetHeight -
                                10
                        );
                    const left =
                        Math.max(
                            10,
                            Math.min(
                                moveEvent.clientX -
                                    offsetX,
                                maximumLeft
                            )
                        );
                    const top =
                        Math.max(
                            10,
                            Math.min(
                                moveEvent.clientY -
                                    offsetY,
                                maximumTop
                            )
                        );

                    element.style.setProperty(
                        'left',
                        `${left}px`,
                        'important'
                    );
                    element.style.setProperty(
                        'top',
                        `${top}px`,
                        'important'
                    );
                }

                function handlePointerUp() {
                    window.removeEventListener(
                        'pointermove',
                        handlePointerMove,
                        true
                    );
                    window.removeEventListener(
                        'pointerup',
                        handlePointerUp,
                        true
                    );
                }

                window.addEventListener(
                    'pointermove',
                    handlePointerMove,
                    true
                );
                window.addEventListener(
                    'pointerup',
                    handlePointerUp,
                    true
                );
            }
        );
    }

    function positionPanelUnderButton(panel) {
        const button =
            document.getElementById(TOGGLE_ID);

        if (!button) {
            return;
        }

        const rectangle =
            button.getBoundingClientRect();
        const width =
            panel.offsetWidth || 900;
        const height =
            panel.offsetHeight || 540;
        const maximumLeft =
            Math.max(
                10,
                window.innerWidth - width - 10
            );
        const maximumTop =
            Math.max(
                10,
                window.innerHeight - height - 10
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

        panel.style.setProperty(
            'left',
            `${left}px`,
            'important'
        );
        panel.style.setProperty(
            'top',
            `${top}px`,
            'important'
        );
        panel.style.setProperty(
            'right',
            'auto',
            'important'
        );
        panel.style.setProperty(
            'bottom',
            'auto',
            'important'
        );
    }

    function mountPanel() {
        let panel =
            document.getElementById(PANEL_ID);

        if (panel) {
            return panel;
        }

        panel =
            document.createElement('div');
        panel.id = PANEL_ID;
        panel.setAttribute(
            'role',
            'dialog'
        );
        panel.setAttribute(
            'aria-label',
            'Rally Point Scanner'
        );
        panel.innerHTML = `
            <div class="qol-rally-scanner-header">
                <span class="qol-rally-scanner-title">
                    <span class="qol-rally-scanner-mark">⚔</span>
                    Rally Point Scanner
                </span>
                <span
                    class="qol-rally-scanner-close"
                    role="button"
                    tabindex="0"
                    aria-label="Close Rally Point Scanner"
                >&times;</span>
            </div>
            <div
                class="qol-rally-tabs"
                role="tablist"
                aria-label="Rally Point scan types"
            >
                <div
                    class="qol-rally-tab"
                    data-qol-rally-tab="incomings"
                    role="tab"
                    tabindex="0"
                >Incomings</div>
                <div
                    class="qol-rally-tab"
                    data-qol-rally-tab="outgoings"
                    role="tab"
                    tabindex="0"
                >Outgoings</div>
                <div
                    class="qol-rally-tab"
                    data-qol-rally-tab="resources"
                    role="tab"
                    tabindex="0"
                >Resources</div>
            </div>
            <div class="qol-rally-scanner-content">
                <section
                    class="qol-rally-tab-panel"
                    data-qol-rally-panel="outgoings"
                    role="tabpanel"
                >
                    <div class="qol-rally-loading">
                        Loading outgoing scanner...
                    </div>
                </section>
                <section
                    class="qol-rally-tab-panel"
                    data-qol-rally-panel="incomings"
                    role="tabpanel"
                >
                    <div class="qol-rally-loading">
                        Loading incoming scanner...
                    </div>
                </section>
                <section
                    class="qol-rally-tab-panel"
                    data-qol-rally-panel="resources"
                    role="tabpanel"
                >
                    <div class="qol-rally-loading">
                        Loading resource scanner...
                    </div>
                </section>
            </div>
        `;

        document.body.appendChild(panel);

        const header =
            panel.querySelector(
                '.qol-rally-scanner-header'
            );
        const closeButton =
            panel.querySelector(
                '.qol-rally-scanner-close'
            );

        makeDraggable(panel, header);

        panel
            .querySelectorAll(
                '[data-qol-rally-tab]'
            )
            .forEach((tab) => {
                const selectTab = () => {
                    activateTab(
                        tab.getAttribute(
                            'data-qol-rally-tab'
                        )
                    );
                };

                tab.addEventListener(
                    'click',
                    selectTab
                );
                tab.addEventListener(
                    'keydown',
                    (event) => {
                        if (
                            event.key === 'Enter' ||
                            event.key === ' '
                        ) {
                            event.preventDefault();
                            selectTab();
                        }
                    }
                );
            });

        const closePanel = () => {
            panel.style.setProperty(
                'display',
                'none',
                'important'
            );
        };

        closeButton.addEventListener(
            'click',
            closePanel
        );
        closeButton.addEventListener(
            'keydown',
            (event) => {
                if (
                    event.key === 'Enter' ||
                    event.key === ' '
                ) {
                    event.preventDefault();
                    closePanel();
                }
            }
        );

        activateTab(getActiveTab());

        return panel;
    }

    function mountToggleButton() {
        let button =
            document.getElementById(TOGGLE_ID);

        if (button) {
            return button;
        }

        button =
            document.createElement('div');
        button.id = TOGGLE_ID;
        button.setAttribute(
            'title',
            'Rally Point Scanner'
        );
        button.setAttribute(
            'role',
            'button'
        );
        button.setAttribute(
            'tabindex',
            '0'
        );
        button.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4l7 7"></path>
                <path d="M13 13l7 7"></path>
                <path d="M14 4h6v6"></path>
                <path d="M20 4l-8 8"></path>
                <path d="M4 20l5-5"></path>
            </svg>
        `;

        const togglePanel = (event) => {
            event?.preventDefault();
            event?.stopPropagation();

            const panel =
                document.getElementById(PANEL_ID);

            if (!panel) {
                return;
            }

            const isHidden =
                window
                    .getComputedStyle(panel)
                    .display === 'none';

            if (isHidden) {
                window.dispatchEvent(
                    new CustomEvent(
                        'qol_close_others',
                        {
                            detail: {
                                source:
                                    'rallyScanner'
                            }
                        }
                    )
                );

                adoptLegacyViews();
                positionPanelUnderButton(panel);
                panel.style.setProperty(
                    'display',
                    'flex',
                    'important'
                );
            } else {
                panel.style.setProperty(
                    'display',
                    'none',
                    'important'
                );
            }
        };

        button.addEventListener(
            'click',
            togglePanel
        );
        button.addEventListener(
            'keydown',
            (event) => {
                if (
                    event.key === 'Enter' ||
                    event.key === ' '
                ) {
                    togglePanel(event);
                }
            }
        );

        document.body.appendChild(button);

        return button;
    }

    function destroyUI() {
        hideScanLock();

        document
            .getElementById(PANEL_ID)
            ?.remove();
        document
            .getElementById(TOGGLE_ID)
            ?.remove();
    }

    function ensureUI() {
        if (!document.body) {
            return;
        }

        injectStyles();

        if (!isEnabled()) {
            destroyUI();
            return;
        }

        mountPanel();
        mountToggleButton();
        adoptLegacyViews();

        if (
            typeof window
                .qolRepositionAllButtons ===
            'function'
        ) {
            window.qolRepositionAllButtons();
        }
    }

    window.APES?.scanners?.register({
        id: 'rally.outgoings',
        label: 'Outgoing Movements',
        description: 'Scans all outgoing Rally Point pages and movement types.',
        scope: 'village',
        modes: ['full'],
        enabled: isEnabled,
        scan: context => scanOutgoings(null, {
            external: true,
            onProgress: context?.onProgress,
            selectedTypes: context?.selectedTypes
        })
    });

    window.addEventListener(
        'qol_close_others',
        (event) => {
            if (
                event.detail?.source ===
                'rallyScanner'
            ) {
                return;
            }

            document
                .getElementById(PANEL_ID)
                ?.style.setProperty(
                    'display',
                    'none',
                    'important'
                );
        }
    );

    window.addEventListener(
        'qol_setting_changed',
        (event) => {
            if (
                event.detail?.key !==
                FEATURE_KEY
            ) {
                return;
            }

            if (event.detail.enabled) {
                window.setTimeout(
                    ensureUI,
                    0
                );
            } else {
                destroyUI();
            }
        }
    );

    document.addEventListener(
        'keydown',
        (event) => {
            if (event.key !== 'Escape') {
                return;
            }

            document
                .getElementById(PANEL_ID)
                ?.style.setProperty(
                    'display',
                    'none',
                    'important'
                );
        },
        true
    );

    window.addEventListener(
        'resize',
        () => {
            const panel =
                document.getElementById(PANEL_ID);

            if (
                panel &&
                window
                    .getComputedStyle(panel)
                    .display !== 'none'
            ) {
                positionPanelUnderButton(panel);
            }
        }
    );

    if (
        document.readyState === 'loading'
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

initUnifiedRallyPointScanner();
