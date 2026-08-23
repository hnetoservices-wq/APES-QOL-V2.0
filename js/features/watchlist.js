/**
 * Travian QoL Extension
 * Module: Watchlist
 */

(function() {
    let watchlistContainer = null;
    let watchlistToggleBtn = null;
    let profileCheckInterval = null;

    let watchlistTabs = [];
    let activeTabId = 'tab_1';

    function getStorageKey() {
        return 'qol_watchlist_' + window.location.hostname;
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function navigateToGameRoute(route) {
        let currentHash = window.location.hash || '#/';
        let baseHash = currentHash.split(/\/window:|\/playerId:|\/profileTab:/)[0];

        if (!baseHash || baseHash === '#') {
            baseHash = '#/';
        }

        if (baseHash.endsWith('/')) {
            baseHash = baseHash.slice(0, -1);
        }

        let cleanRoute = route.startsWith('/') ? route.slice(1) : route;
        let targetHash = baseHash + '/' + cleanRoute;

        if (window.location.hash.includes('/window:') || window.location.hash.includes('/playerId:')) {
            window.location.hash = baseHash;
            setTimeout(() => {
                window.location.hash = targetHash;
            }, 50);
        } else {
            window.location.hash = targetHash;
        }
    }

    function loadWatchlist() {
        try {
            const stored = localStorage.getItem(getStorageKey());
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    watchlistTabs = parsed;
                    activeTabId = watchlistTabs[0].id;
                    return;
                }
            }
        } catch (e) {
            console.error('QoL Watchlist: Failed to load stored data', e);
        }

        watchlistTabs = [
            { id: 'tab_1', name: 'Tab 1', entries: [] }
        ];
        activeTabId = 'tab_1';
    }

    function saveWatchlist() {
        try {
            localStorage.setItem(getStorageKey(), JSON.stringify(watchlistTabs));
        } catch (e) {
            console.error('QoL Watchlist: Failed to save data', e);
        }
    }

    function isWatchlistEnabled() {
        return window.isQolEnabled && window.isQolEnabled('watchlist');
    }

    function injectStyles() {
        if (document.getElementById('qol-watchlist-styles')) return;

        const style = document.createElement('style');
        style.id = 'qol-watchlist-styles';
        style.textContent = `
            #qol-watchlist-toggle {
                position: fixed !important;
                width: 30px !important;
                height: 30px !important;
                background-color: #ebdcb9 !important;
                border: 2px solid #7d6342 !important;
                border-radius: 50% !important;
                display: none;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                z-index: 9998 !important;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
                box-sizing: border-box !important;
                padding: 0 !important;
                transition: transform 0.2s ease, background-color 0.2s !important;
            }
            #qol-watchlist-toggle:hover {
                transform: scale(1.1) !important;
                background-color: #f7f5f0 !important;
            }
            #qol-watchlist-toggle svg {
                width: 16px !important;
                height: 16px !important;
                pointer-events: none !important;
            }

            .qol-wl-profile-btn {
                background-color: #7d6342 !important;
                background: linear-gradient(to bottom, #7d6342, #543f26) !important;
                color: #ffffff !important;
                padding: 3px 8px !important;
                border-radius: 4px !important;
                font-size: 11px !important;
                font-weight: bold !important;
                cursor: pointer !important;
                user-select: none !important;
                text-align: center !important;
                white-space: nowrap !important;
                box-sizing: border-box !important;
                border: 1px solid #42311c !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2) !important;
                display: inline-flex !important;
                align-items: center !important;
                gap: 4px !important;
                font-family: Arial, sans-serif !important;
                line-height: 1.2 !important;
                height: auto !important;
                margin-left: 8px !important;
                vertical-align: middle !important;
            }
            .qol-wl-profile-btn:hover {
                background-color: #543f26 !important;
                background: linear-gradient(to bottom, #8d7352, #644f36) !important;
            }

            .qol-wl-dropdown-menu {
                position: fixed !important;
                background-color: #ffffff !important;
                border: 2px solid #634d31 !important;
                border-radius: 4px !important;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
                z-index: 100001 !important;
                min-width: 160px !important;
                padding: 4px 0 !important;
                font-family: Arial, sans-serif !important;
                font-size: 11px !important;
                color: #333 !important;
            }
            .qol-wl-dropdown-item {
                padding: 6px 12px !important;
                cursor: pointer !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                color: #333 !important;
                gap: 10px !important;
                transition: background-color 0.15s !important;
            }
            .qol-wl-dropdown-item:hover {
                background-color: #f0e6d2 !important;
                color: #000 !important;
            }

            #qol-watchlist-container {
                position: fixed !important;
                pointer-events: auto !important;
                width: 820px;
                min-width: 450px !important;
                max-width: 95vw !important;
                height: 380px;
                min-height: 200px !important;
                max-height: 90vh !important;
                                background-color: #ffffff !important;
                border: 3px solid #634d31 !important;
                border-radius: 4px !important;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
                z-index: 9999 !important;
                display: none;
                font-family: Arial, sans-serif !important;
                color: #333 !important;
                font-size: 11px !important;
                box-sizing: border-box !important;
            }

            
            .qol-wl-header {
                background: linear-gradient(to bottom, #6d5436, #543f26) !important;
                color: #f7f5f0 !important;
                padding: 5px 10px !important;
                font-weight: bold !important;
                font-size: 13px !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                cursor: move !important;
                user-select: none !important;
                touch-action: none !important;
                height: 31px !important;
                box-sizing: border-box !important;
            }
            .qol-wl-close {
                cursor: pointer !important;
                color: #ffffff !important;
                font-size: 20px !important;
                font-weight: bold !important;
                line-height: 1 !important;
                padding: 0 4px !important;
                background-color: rgba(0, 0, 0, 0.2) !important;
                border-radius: 3px !important;
                transition: background-color 0.2s, color 0.2s !important;
            }
            .qol-wl-close:hover {
                color: #ffcccc !important;
                background-color: rgba(255, 255, 255, 0.2) !important;
            }

            .qol-wl-body {
                padding: 10px !important;
                background-color: #f7f5f0 !important;
                display: flex !important;
                flex-direction: column !important;
                height: calc(100% - 31px) !important;
                box-sizing: border-box !important;
            }

            .qol-wl-tutorial {
                font-size: 10.5px !important;
                color: #555 !important;
                margin-bottom: 6px !important;
                font-style: italic !important;
                line-height: 1.2 !important;
            }

            .qol-wl-toast {
                position: absolute !important;
                top: 10px !important;
                right: 45px !important;
                padding: 5px 10px !important;
                border-radius: 4px !important;
                font-size: 11px !important;
                font-weight: bold !important;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;
                z-index: 10 !important;
                opacity: 1 !important;
                transition: opacity 1s ease !important;
                pointer-events: none !important;
                max-width: 300px !important;
                text-align: center !important;
            }

            .qol-wl-controls {
                display: flex !important;
                gap: 10px !important;
                margin-bottom: 8px !important;
            }

            .qol-wl-tabs {
                display: flex !important;
                gap: 2px !important;
                margin-bottom: 8px !important;
                border-bottom: 2px solid #ccc !important;
            }
            .qol-wl-tab {
                padding: 4px 8px !important;
                background-color: #e0e0e0 !important;
                border: 1px solid #ccc !important;
                border-bottom: none !important;
                cursor: pointer !important;
                font-size: 11px !important;
                color: #333 !important;
                display: flex !important;
                align-items: center !important;
                gap: 5px !important;
                user-select: none !important;
            }
            .qol-wl-tab.active {
                background: linear-gradient(to bottom, #6d5436, #543f26) !important;
                color: #ffffff !important;
                border-color: #43321e !important;
                font-weight: bold !important;
            }
            .qol-wl-tab.active .qol-wl-tab-close {
                color: #e0d0c0 !important;
            }
            .qol-wl-tab.active .qol-wl-tab-close:hover {
                color: #ff9999 !important;
            }
            .qol-wl-tab-close {
                font-size: 14px !important;
                color: #777 !important;
                font-weight: bold !important;
                line-height: 1 !important;
                padding: 0 2px !important;
            }
            .qol-wl-tab-close:hover {
                color: #c00 !important;
            }
            .qol-wl-tab-add {
                background: linear-gradient(to bottom, #6d5436, #543f26) !important;
                color: #f7f5f0 !important;
                font-weight: bold !important;
                border: 1px solid #42311c !important;
                border-bottom: none !important;
            }
            .qol-wl-tab-add:hover {
                background: linear-gradient(to bottom, #7d6342, #543f26) !important;
            }

            .qol-wl-status {
                font-size: 10.5px !important;
                color: #555 !important;
                margin-bottom: 6px !important;
            }

            .qol-wl-table-scroll-container {
                flex: 1 1 auto !important;
                max-height: none !important;
                overflow-y: auto !important;
                border: 1px solid #dcdcdc !important;
                background-color: white !important;
            }
            .qol-wl-table {
                width: 100% !important;
                border-collapse: collapse !important;
                background-color: white !important;
                font-size: 11px !important;
            }
            .qol-wl-table th, .qol-wl-table td {
                border: 1px solid #dcdcdc !important;
                padding: 4px 6px !important;
                text-align: left !important;
                vertical-align: middle !important;
            }
            .qol-wl-table th {
                position: sticky !important;
                top: 0 !important;
                z-index: 2 !important;
                background-color: #f0f0f0 !important;
                font-weight: normal !important;
                color: #333 !important;
                font-size: 10.5px !important;
            }
            .qol-wl-table td a.qol-route-link {
                color: #005580 !important;
                text-decoration: none !important;
                font-weight: bold !important;
                cursor: pointer !important;
            }
            .qol-wl-table td a.qol-route-link:hover {
                text-decoration: underline !important;
            }

            #qol-watchlist-container select.qol-wl-select {
                display: inline-block !important;
                visibility: visible !important;
                opacity: 1 !important;
                appearance: menulist !important;
                -webkit-appearance: menulist !important;
                -moz-appearance: menulist !important;
                background-color: #ffffff !important;
                color: #333333 !important;
                border: 1px solid #aaa !important;
                border-radius: 3px !important;
                padding: 2px 4px !important;
                font-size: 10.5px !important;
                height: 22px !important;
                width: 100% !important;
                max-width: 140px !important;
                box-sizing: border-box !important;
            }
            #qol-watchlist-container select.qol-wl-select option {
                background-color: #ffffff !important;
                color: #333333 !important;
            }

            .qol-wl-del-entry {
                color: #a00 !important;
                font-weight: bold !important;
                font-size: 16px !important;
                cursor: pointer !important;
                line-height: 1 !important;
                display: inline-block !important;
                padding: 0 4px !important;
            }
            .qol-wl-del-entry:hover {
                color: #f00 !important;
            }

            .qol-modal-overlay {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background-color: rgba(0, 0, 0, 0.6) !important;
                z-index: 100000 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-family: Arial, sans-serif !important;
            }
            .qol-modal-box {
                background-color: #f7f5f0 !important;
                border: 3px solid #634d31 !important;
                border-radius: 4px !important;
                width: 320px !important;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
                overflow: hidden !important;
            }
            .qol-modal-header {
                background: linear-gradient(to bottom, #6d5436, #543f26) !important;
                color: #f7f5f0 !important;
                padding: 6px 10px !important;
                font-weight: bold !important;
                font-size: 12px !important;
            }
            .qol-modal-body {
                padding: 12px !important;
                font-size: 11px !important;
                color: #333 !important;
            }
            .qol-modal-input {
                width: 100% !important;
                box-sizing: border-box !important;
                padding: 4px 6px !important;
                margin-top: 8px !important;
                border: 1px solid #aaa !important;
                border-radius: 3px !important;
                font-size: 11px !important;
                background: #fff !important;
                color: #333 !important;
            }
            .qol-modal-footer {
                padding: 8px 12px !important;
                background-color: #efece6 !important;
                display: flex !important;
                justify-content: flex-end !important;
                gap: 6px !important;
                border-top: 1px solid #ddd !important;
            }
            .qol-modal-btn {
                background: linear-gradient(to bottom, #82be30, #679f22) !important;
                color: #ffffff !important;
                padding: 5px 14px !important;
                border-radius: 3px !important;
                font-size: 11px !important;
                font-weight: bold !important;
                cursor: pointer !important;
                border: 1px solid #487315 !important;
                text-align: center !important;
                user-select: none !important;
                box-sizing: border-box !important;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2) !important;
            }
            .qol-modal-btn:hover {
                background: linear-gradient(to bottom, #8ecb36, #71ab26) !important;
            }
            .qol-modal-btn-secondary {
                background: linear-gradient(to bottom, #82be30, #679f22) !important;
                color: #ffffff !important;
                border: 1px solid #487315 !important;
            }
            .qol-modal-btn-secondary:hover {
                background: linear-gradient(to bottom, #8ecb36, #71ab26) !important;
            }
            .qol-modal-danger {
                background: linear-gradient(to bottom, #d9534f, #c9302c) !important;
                border: 1px solid #ac2925 !important;
            }
            .qol-modal-danger:hover {
                background: linear-gradient(to bottom, #e4605d, #d43f3a) !important;
            }
        `;
        document.head.appendChild(style);
    }

    function makeDraggable(element, handle) {
        handle.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.qol-wl-close')) return;
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const startY = e.clientY;
            const rect = element.getBoundingClientRect();
            const initialLeft = rect.left;
            const initialTop = rect.top;

            element.style.transform = 'none';
            element.style.left = initialLeft + 'px';
            element.style.top = initialTop + 'px';
            element.style.right = 'auto';
            element.style.bottom = 'auto';

            try {
                handle.setPointerCapture(e.pointerId);
            } catch (err) {}

            function onPointerMove(moveEvent) {
                moveEvent.preventDefault();
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                element.style.left = (initialLeft + dx) + 'px';
                element.style.top = (initialTop + dy) + 'px';
            }

            function onPointerUp(upEvent) {
                try {
                    handle.releasePointerCapture(upEvent.pointerId);
                } catch (err) {}
                handle.removeEventListener('pointermove', onPointerMove);
                handle.removeEventListener('pointerup', onPointerUp);
            }

            handle.addEventListener('pointermove', onPointerMove);
            handle.addEventListener('pointerup', onPointerUp);
        });
    }

        function makeResizable(element) {
        if (element.querySelector('.qol-resize-handle')) return;
        const handle = document.createElement('div');
        handle.className = 'qol-resize-handle';
        element.appendChild(handle);

        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const startWidth = element.offsetWidth;
            const startHeight = element.offsetHeight;
            const startX = e.clientX;
            const startY = e.clientY;

            try {
                handle.setPointerCapture(e.pointerId);
            } catch (err) {}

            function onPointerMove(moveEvent) {
                moveEvent.preventDefault();
                const newWidth = Math.max(400, startWidth + (moveEvent.clientX - startX));
                const newHeight = Math.max(200, startHeight + (moveEvent.clientY - startY));
                element.style.setProperty('width', newWidth + 'px', 'important');
                element.style.setProperty('height', newHeight + 'px', 'important');
            }

            function onPointerUp(upEvent) {
                try {
                    handle.releasePointerCapture(upEvent.pointerId);
                } catch (err) {}
                handle.removeEventListener('pointermove', onPointerMove);
                handle.removeEventListener('pointerup', onPointerUp);
            }

            handle.addEventListener('pointermove', onPointerMove);
            handle.addEventListener('pointerup', onPointerUp);
        });
    }

    function showToast(message, type = 'success') {
        if (!watchlistContainer) return;
        const existingToast = watchlistContainer.querySelector('.qol-wl-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = 'qol-wl-toast';

        if (type === 'success') {
            toast.style.backgroundColor = '#2e7d32';
            toast.style.color = '#ffffff';
        } else if (type === 'warning' || type === 'info') {
            toast.style.backgroundColor = '#fbc02d';
            toast.style.color = '#333333';
        } else if (type === 'error' || type === 'danger') {
            toast.style.backgroundColor = '#c62828';
            toast.style.color = '#ffffff';
        }

        toast.textContent = message;
        watchlistContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
            }, 1000);
        }, 2000);
    }

    function showCustomPrompt(title, message, defaultValue, callback) {
        const overlay = document.createElement('div');
        overlay.className = 'qol-modal-overlay';
        overlay.innerHTML = `
            <div class="qol-modal-box">
                <div class="qol-modal-header">${title}</div>
                <div class="qol-modal-body">
                    <div>${message}</div>
                    <input type="text" class="qol-modal-input" value="${defaultValue || ''}" maxlength="20" />
                </div>
                <div class="qol-modal-footer">
                    <div class="qol-modal-btn qol-modal-btn-secondary qol-modal-cancel">Cancel</div>
                    <div class="qol-modal-btn qol-modal-confirm">Save</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('.qol-modal-input');
        input.focus();
        input.select();

        const close = (val) => {
            overlay.remove();
            if (callback) callback(val);
        };

        overlay.querySelector('.qol-modal-confirm').addEventListener('click', () => {
            close(input.value);
        });

        overlay.querySelector('.qol-modal-cancel').addEventListener('click', () => {
            close(null);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                close(input.value);
            } else if (e.key === 'Escape') {
                close(null);
            }
        });
    }

    function showCustomConfirm(title, message, callback) {
        const overlay = document.createElement('div');
        overlay.className = 'qol-modal-overlay';
        overlay.innerHTML = `
            <div class="qol-modal-box">
                <div class="qol-modal-header">${title}</div>
                <div class="qol-modal-body">
                    <div>${message}</div>
                </div>
                <div class="qol-modal-footer">
                    <div class="qol-modal-btn qol-modal-btn-secondary qol-modal-cancel">Cancel</div>
                    <div class="qol-modal-btn qol-modal-confirm qol-modal-danger">Delete</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = (val) => {
            overlay.remove();
            if (callback) callback(val);
        };

        overlay.querySelector('.qol-modal-confirm').addEventListener('click', () => {
            close(true);
        });

        overlay.querySelector('.qol-modal-cancel').addEventListener('click', () => {
            close(false);
        });

        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                close(false);
            }
        });
    }

    function scrapeOpenProfileData(playerId) {
        const nameElement = document.querySelector('div.content[ng-if="!kingdomProfile"]') || 
                            document.querySelector('.playerProfile .playerName') ||
                            document.querySelector('.playerName');
        const playerName = nameElement ? nameElement.textContent.trim() : 'Unknown';

        let population = 'N/A';
        let tribe = 'N/A';

        const infoDivs = document.querySelectorAll('.contentBoxBody > div, .playerProfile div, div.content div');
        infoDivs.forEach(div => {
            const descSpan = div.querySelector('.desc');
            const dataSpan = div.querySelector('.data');
            if (descSpan && dataSpan) {
                const descText = descSpan.textContent.trim();
                const dataText = dataSpan.textContent.trim();
                if (descText.toLowerCase().includes('population')) {
                    population = dataText;
                } else if (descText.toLowerCase().includes('tribe')) {
                    tribe = dataText;
                }
            }
        });

        const villageRows = document.querySelectorAll('.playerVillages tr[ng-repeat*="village"]');
        const villages = [];
        let capital = null;

        villageRows.forEach((row, index) => {
            const nameTd = row.querySelector('td.name');
            const link = row.querySelector('a.villageLink') || row.querySelector('a[href*="village"]') || row.querySelector('a');
            const coordTd = row.querySelector('td.coordinates') || row.querySelector('.coordinateWrapper') || row.querySelector('.coordinates');
            
            // Explicitly check for capital icon inside row
            const isCapital = row.querySelector('i.village_main_small_flat_black, .icon-capital, .icon-main-village, [ng-if*="isMainVillage"], [ng-if*="isCapital"]') !== null;

            // Extract Name
            let name = '';
            if (link && (link.getAttribute('villagename') || link.textContent.trim())) {
                name = link.getAttribute('villagename') || link.textContent.trim();
            } else if (nameTd) {
                name = nameTd.textContent.trim();
            } else {
                name = `Village ${index + 1}`;
            }

            // Extract ID
            let villageId = '';
            if (link) {
                villageId = link.getAttribute('villageid') || link.getAttribute('data-villageid') || '';
            }
            if (!villageId) {
                villageId = `vil_${Date.now()}_${index}`;
            }

            // Extract Coords (X, Y)
            let x = '', y = '', coordsFormatted = '';
            if (coordTd) {
                x = coordTd.getAttribute('x') || '';
                y = coordTd.getAttribute('y') || '';

                if (!x || !y) {
                    const xSpan = coordTd.querySelector('.coordinateX');
                    const ySpan = coordTd.querySelector('.coordinateY');
                    if (xSpan && ySpan) {
                        x = xSpan.textContent.replace(/[^\d-]/g, '');
                        y = ySpan.textContent.replace(/[^\d-]/g, '');
                    }
                }

                if (!x || !y) {
                    // Match numbers separated by pipe, handling hidden unicode characters
                    const match = coordTd.textContent.match(/(-?\d+)\s*\|\s*(-?\d+)/);
                    if (match) {
                        x = match[1];
                        y = match[2];
                    }
                }
            }

            if (x && y) {
                coordsFormatted = `(${x}|${y})`;
            }

            const villageObj = {
                id: villageId,
                name: name,
                x: x,
                y: y,
                coords: coordsFormatted,
                isCapital: isCapital
            };

            villages.push(villageObj);

            if (isCapital) {
                capital = villageObj;
            }
        });

        // Ensure capital assignment logic
        if (!capital && villages.length > 0) {
            capital = villages[0];
            capital.isCapital = true;
        } else if (capital) {
            // Make sure only the capital has isCapital = true if multiple or explicit
            villages.forEach(v => {
                v.isCapital = (v === capital);
            });
        }

        return {
            playerId: playerId,
            playerName: playerName,
            population: population,
            tribe: tribe,
            villages: villages,
            capital: capital
        };
    }

    function openWatchlistMenu(tabId) {
        if (tabId) {
            activeTabId = tabId;
        }
        renderTabsUI();
        renderTableUI();

        if (watchlistContainer) {
            const isHidden = window.getComputedStyle(watchlistContainer).display === 'none';
            if (isHidden) {
                const irBar = document.getElementById('qol-ir-action-bar');
                if (irBar) irBar.style.setProperty('display', 'none', 'important');
                const rpBar = document.getElementById('qol-rp-action-bar');
                if (rpBar) rpBar.style.setProperty('display', 'none', 'important');

                const cogBtn = document.getElementById('qol-cog-btn');
                if (cogBtn) {
                    const rect = cogBtn.getBoundingClientRect();
                    watchlistContainer.style.setProperty('position', 'fixed', 'important');
                    watchlistContainer.style.setProperty('top', (rect.bottom + 20) + 'px', 'important');
                    watchlistContainer.style.setProperty('left', rect.left + 'px', 'important');
                    watchlistContainer.style.setProperty('transform', 'none', 'important');
                }
            }
            watchlistContainer.style.display = 'block';
        }
    }

    function addProfileToSpecificTab(tabId) {
        const targetTab = watchlistTabs.find(t => t.id === tabId);
        if (!targetTab) return;

        const currentUrl = window.location.href;
        const profileRegex = /playerId:(\d+)/;
        const match = currentUrl.match(profileRegex);

        if (!match) {
            showToast("No player profile detected. Please open a player's profile first.", "error");
            return;
        }

        const playerId = match[1];

        if (targetTab.entries.some(entry => entry.playerId === playerId)) {
            showToast(`This player is already in "${targetTab.name}".`, "warning");
            openWatchlistMenu(targetTab.id);
            return;
        }

        if (targetTab.entries.length >= 15) {
            showToast(`Maximum limit of 15 players reached for "${targetTab.name}".`, "error");
            return;
        }

        const scrapedData = scrapeOpenProfileData(playerId);

        if (scrapedData.playerName && scrapedData.villages.length > 0) {
            targetTab.entries.push({
                id: 'entry_' + Date.now(),
                playerId: scrapedData.playerId,
                playerName: scrapedData.playerName,
                population: scrapedData.population || 'N/A',
                capital: scrapedData.capital,
                villages: scrapedData.villages,
                selected2ndId: '',
                selected2ndCoords: '',
                selected2ndX: '',
                selected2ndY: '',
                notes: ''
            });

            saveWatchlist();
            showToast(`Added ${scrapedData.playerName} to "${targetTab.name}"`, "success");
            openWatchlistMenu(targetTab.id);
        } else {
            showToast("Error: Profile detected, but could not parse villages or player name.", "error");
        }
    }

    function toggleWatchlistDropdown(btn) {
        const existingMenu = document.querySelector('.qol-wl-dropdown-menu');
        if (existingMenu) {
            existingMenu.remove();
            return;
        }

        const rect = btn.getBoundingClientRect();
        const menu = document.createElement('div');
        menu.className = 'qol-wl-dropdown-menu';
        menu.style.cssText = `
            position: fixed !important;
            top: ${rect.bottom + 4}px !important;
            left: ${rect.left}px !important;
            background-color: #ffffff !important;
            border: 2px solid #634d31 !important;
            border-radius: 4px !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
            z-index: 100001 !important;
            min-width: 160px !important;
            padding: 4px 0 !important;
            font-family: Arial, sans-serif !important;
            font-size: 11px !important;
            color: #333 !important;
        `;

        watchlistTabs.forEach(tab => {
            const item = document.createElement('div');
            item.className = 'qol-wl-dropdown-item';
            item.innerHTML = `<span>${tab.name}</span> <span style="font-size:10px; color:#777;">(${tab.entries.length}/15)</span>`;

            item.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.remove();
                addProfileToSpecificTab(tab.id);
            });

            menu.appendChild(item);
        });

        document.body.appendChild(menu);

        const closeHandler = (e) => {
            if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeHandler);
        }, 10);
    }

    function injectProfileWatchlistButton() {
        if (!isWatchlistEnabled()) return;

        // Remove any watchlist buttons that were injected into non-player
        // description panels by older versions of the feature.
        document.querySelectorAll('.qol-wl-profile-wrapper').forEach(wrapper => {
            if (!wrapper.closest('.contentBox.playerDescription')) {
                wrapper.remove();
            }
        });

        // Only the player's profile description should get the watchlist button.
        const header = document.querySelector(
            '.contentBox.playerDescription > .contentBoxHeader'
        );

        if (!header) return;
        if (header.querySelector('.qol-wl-profile-wrapper')) return;

        const wrapper = document.createElement('span');
        wrapper.className = 'qol-wl-profile-wrapper';
        wrapper.style.cssText = 'display: inline-flex; align-items: center; vertical-align: middle; position: relative;';

        const btn = document.createElement('div');
        btn.className = 'qol-wl-profile-btn';
        btn.innerHTML = `<span>Add Profile to Watchlist</span> <span style="font-size:9px;">▼</span>`;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleWatchlistDropdown(btn);
        });

        wrapper.appendChild(btn);

        const editIcon = header.querySelector('.action_edit_small_flat_black, .headerButton');
        if (editIcon) {
            header.insertBefore(wrapper, editIcon);
        } else {
            header.appendChild(wrapper);
        }
    }

    async function updateCurrentWatchlist() {
        const activeTab = watchlistTabs.find(t => t.id === activeTabId);
        if (!activeTab || activeTab.entries.length === 0) {
            showToast("No players in the current tab to update.", "warning");
            return;
        }

        const entries = activeTab.entries;
        const total = entries.length;
        const originalHash = window.location.hash;

        const overlay = document.createElement('div');
        overlay.id = 'qol-watchlist-overlay';
        overlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            background-color: rgba(0, 0, 0, 0.7) !important;
            z-index: 99999 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            color: white !important;
            font-family: Arial, sans-serif !important;
            font-size: 15px !important;
            font-weight: bold !important;
            flex-direction: column !important;
            gap: 8px !important;
        `;
        overlay.innerHTML = `
            <div>Updating Watchlist... (<span id="qol-update-progress">0</span> / ${total})</div>
            <div style="font-size: 11px; font-weight: normal; color: #ccc;">Please wait, this may take a few seconds...</div>
        `;
        document.body.appendChild(overlay);

        const progressEl = document.getElementById('qol-update-progress');

        for (let i = 0; i < total; i++) {
            const entry = entries[i];
            if (progressEl) progressEl.textContent = (i + 1).toString();

            navigateToGameRoute(`playerId:${entry.playerId}/profileTab:playerProfile/window:profile`);
            await delay(1200);

            const scrapedData = scrapeOpenProfileData(entry.playerId);
            if (scrapedData && scrapedData.playerName && scrapedData.playerName !== 'Unknown' && scrapedData.villages.length > 0) {
                entry.playerName = scrapedData.playerName;
                entry.population = scrapedData.population || 'N/A';
                entry.capital = scrapedData.capital;
                entry.villages = scrapedData.villages;

                if (entry.selected2ndId) {
                    const stillExists = entry.villages.find(v => v.id === entry.selected2ndId);
                    if (!stillExists) {
                        entry.selected2ndId = '';
                        entry.selected2ndCoords = '';
                        entry.selected2ndX = '';
                        entry.selected2ndY = '';
                    } else {
                        entry.selected2ndCoords = stillExists.coords;
                        entry.selected2ndX = stillExists.x;
                        entry.selected2ndY = stillExists.y;
                    }
                }
            }
        }

        saveWatchlist();
        renderTableUI();
        window.location.hash = originalHash;

        overlay.remove();
        showToast(`Watchlist tab "${activeTab.name}" successfully updated!`, "success");
    }

    function renderTabsUI() {
        const tabsContainer = document.querySelector('.qol-wl-tabs');
        if (!tabsContainer) return;

        tabsContainer.innerHTML = '';

        watchlistTabs.forEach(tab => {
            const tabDiv = document.createElement('div');
            tabDiv.className = `qol-wl-tab ${tab.id === activeTabId ? 'active' : ''}`;
            tabDiv.title = 'Double-click to rename tab (max 20 characters)';

            const titleSpan = document.createElement('span');
            titleSpan.textContent = tab.name;
            tabDiv.appendChild(titleSpan);

            if (watchlistTabs.length > 1) {
                const closeTabSpan = document.createElement('span');
                closeTabSpan.className = 'qol-wl-tab-close';
                closeTabSpan.innerHTML = '&times;';
                closeTabSpan.title = 'Delete Tab';
                closeTabSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showCustomConfirm('Delete Tab', `Are you sure you want to delete tab "${tab.name}"?`, (confirmed) => {
                        if (confirmed) {
                            watchlistTabs = watchlistTabs.filter(t => t.id !== tab.id);
                            if (activeTabId === tab.id) {
                                activeTabId = watchlistTabs[0].id;
                            }
                            saveWatchlist();
                            renderTabsUI();
                            renderTableUI();
                            showToast(`Tab "${tab.name}" deleted.`, "info");
                        }
                    });
                });
                tabDiv.appendChild(closeTabSpan);
            }

            tabDiv.addEventListener('click', () => {
                if (activeTabId !== tab.id) {
                    activeTabId = tab.id;
                    renderTabsUI();
                    renderTableUI();
                }
            });

            tabDiv.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                showCustomPrompt('Rename Tab', 'Enter new tab name (max 20 characters):', tab.name, (newName) => {
                    if (newName !== null && newName.trim() !== '') {
                        tab.name = newName.trim().slice(0, 20);
                        saveWatchlist();
                        renderTabsUI();
                        renderTableUI();
                        showToast(`Tab renamed to "${tab.name}".`, "success");
                    }
                });
            });

            tabsContainer.appendChild(tabDiv);
        });

        if (watchlistTabs.length < 5) {
            const addTabBtn = document.createElement('div');
            addTabBtn.className = 'qol-wl-tab qol-wl-tab-add';
            addTabBtn.innerText = '+ Add Tab';
            addTabBtn.addEventListener('click', () => {
                const newTabNumber = watchlistTabs.length + 1;
                const newTab = {
                    id: 'tab_' + Date.now(),
                    name: `Tab ${newTabNumber}`,
                    entries: []
                };
                watchlistTabs.push(newTab);
                activeTabId = newTab.id;
                saveWatchlist();
                renderTabsUI();
                renderTableUI();
                showToast(`Tab "${newTab.name}" created.`, "success");
            });
            tabsContainer.appendChild(addTabBtn);
        }
    }

    function renderTableUI() {
        const tbody = document.querySelector('#qol-wl-tbody');
        const statusEl = document.querySelector('.qol-wl-status');
        if (!tbody) return;

        const activeTab = watchlistTabs.find(t => t.id === activeTabId) || watchlistTabs[0];

        if (statusEl) {
            statusEl.textContent = `${activeTab.name} (${activeTab.entries.length}/15 Players)`;
        }

        tbody.innerHTML = '';

        if (activeTab.entries.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="8" style="text-align:center; color:#888; padding: 10px !important;">No players added yet. Open a player's profile in-game and click "Add Profile to Watchlist".</td>`;
            tbody.appendChild(tr);
            return;
        }

        activeTab.entries.forEach((entry, index) => {
            const capitalName = entry.capital ? entry.capital.name : 'N/A';
            
            const capitalCoordsLink = (entry.capital && entry.capital.coords)
                ? `<a href="javascript:void(0)" class="qol-route-link" data-route="window:sendTroops/x:${entry.capital.x}/y:${entry.capital.y}">${entry.capital.coords}</a>`
                : '-';

            const nonCapitalVillages = (entry.villages || []).filter(v => !v.isCapital);

            let selectOptions = `<option value="">Select 2nd Vil...</option>`;
            if (nonCapitalVillages.length > 0) {
                nonCapitalVillages.forEach(v => {
                    const selected = v.id === entry.selected2ndId ? 'selected' : '';
                    selectOptions += `<option value="${v.id}" data-x="${v.x}" data-y="${v.y}" data-coords="${v.coords}" ${selected}>${v.name}</option>`;
                });
            } else {
                selectOptions = `<option value="">No other vil</option>`;
            }

            let send2ndLink = '-';
            if (entry.selected2ndCoords) {
                send2ndLink = `<a href="javascript:void(0)" class="qol-route-link" data-route="window:sendTroops/x:${entry.selected2ndX}/y:${entry.selected2ndY}">${entry.selected2ndCoords}</a>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="font-weight: bold; margin-bottom: 2px;">${entry.playerName}</div>
                    <a href="javascript:void(0)" class="qol-route-link" data-route="playerId:${entry.playerId}/profileTab:playerProfile/window:profile" style="font-size: 9.5px;">Open Profile</a>
                </td>
                <td>${entry.population || 'N/A'}</td>
                <td>${capitalName}</td>
                <td>
                    <select class="qol-wl-select qol-2nd-vil-select">
                        ${selectOptions}
                    </select>
                </td>
                <td>${capitalCoordsLink}</td>
                <td class="qol-send-2nd-cell">${send2ndLink}</td>
                <td>
                    <input type="text" class="qol-wl-note-input" value="${entry.notes || ''}" placeholder="Add note..." style="width:90%; border:none; background:transparent; font-size:11px;" />
                </td>
                <td style="text-align:center;">
                    <span class="qol-wl-del-entry" title="Remove player">&times;</span>
                </td>
            `;

            const selectEl = tr.querySelector('.qol-2nd-vil-select');
            const send2ndCell = tr.querySelector('.qol-send-2nd-cell');

            selectEl.addEventListener('change', (e) => {
                const selectedOption = e.target.options[e.target.selectedIndex];
                const coords = selectedOption.getAttribute('data-coords') || '';
                const x = selectedOption.getAttribute('data-x') || '';
                const y = selectedOption.getAttribute('data-y') || '';

                entry.selected2ndId = e.target.value;
                entry.selected2ndCoords = coords;
                entry.selected2ndX = x;
                entry.selected2ndY = y;

                saveWatchlist();

                if (coords) {
                    send2ndCell.innerHTML = `<a href="javascript:void(0)" class="qol-route-link" data-route="window:sendTroops/x:${x}/y:${y}">${coords}</a>`;
                } else {
                    send2ndCell.innerHTML = '-';
                }
            });

            const noteInput = tr.querySelector('.qol-wl-note-input');
            noteInput.addEventListener('input', (e) => {
                entry.notes = e.target.value;
                saveWatchlist();
            });

            const delBtn = tr.querySelector('.qol-wl-del-entry');
            delBtn.addEventListener('click', () => {
                const removedPlayerName = entry.playerName;
                activeTab.entries.splice(index, 1);
                saveWatchlist();
                renderTableUI();
                showToast(`Removed ${removedPlayerName} from watchlist.`, "info");
            });

            tbody.appendChild(tr);
        });
    }

    function buildWatchlistUI() {
        if (document.getElementById('qol-watchlist-container')) return;

        watchlistToggleBtn = document.createElement('div');
        watchlistToggleBtn.id = 'qol-watchlist-toggle';
        watchlistToggleBtn.title = 'Toggle Player Watchlist';
        watchlistToggleBtn.innerHTML = `
            <svg viewBox="0 0 24 24" style="fill:none !important; stroke:#7d6342 !important; stroke-width:2 !important; stroke-linecap:round !important; stroke-linejoin:round !important;">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                <path d="M9 12h6"></path>
                <path d="M9 16h6"></path>
            </svg>
        `;
        
        let isOpening = false;
        watchlistToggleBtn.addEventListener('click', () => {
            if (isOpening) return;
            isOpening = true;
            
            const isHidden = window.getComputedStyle(watchlistContainer).display === 'none';
            
            if (isHidden) {
                openWatchlistMenu();
            } else {
                watchlistContainer.style.display = 'none';
            }
            
            setTimeout(() => {
                isOpening = false;
            }, 50);
        });

        document.body.appendChild(watchlistToggleBtn);

        watchlistContainer = document.createElement('div');
        watchlistContainer.id = 'qol-watchlist-container';
        watchlistContainer.style.display = 'none';
        
        watchlistContainer.innerHTML = `
            <div class="qol-wl-header">
                <span>Player Watchlist</span>
                <span class="qol-wl-close" title="Close Watchlist">&times;</span>
            </div>
            <div class="qol-wl-body">
                <div class="qol-wl-tutorial">Open a player's profile and click "Add Profile to Watchlist" next to Description.</div>
                <div class="qol-wl-controls">
                    <div id="qol-wl-update-btn" style="background-color:#543f26 !important; color:#ffffff !important; padding:4px 8px !important; border-radius:4px !important; font-size:11px !important; font-weight:bold !important; cursor:pointer !important; user-select:none !important; text-align:center !important; white-space:nowrap; box-sizing:border-box !important; border:1px solid #42311c !important; box-shadow:0 1px 3px rgba(0,0,0,0.2) !important;">Update Current Watchlist</div>
                </div>
                
                <div class="qol-wl-tabs"></div>
                <div class="qol-wl-status"></div>
                
                <div class="qol-wl-table-scroll-container">
                    <table class="qol-wl-table">
                        <thead>
                            <tr>
                                <th>Player</th>
                                <th>Population</th>
                                <th>Capital</th>
                                <th>2nd Village</th>
                                <th>Send on Capital</th>
                                <th>Send on 2nd</th>
                                <th>Notes</th>
                                <th style="width: 25px;"></th>
                            </tr>
                        </thead>
                        <tbody id="qol-wl-tbody"></tbody>
                    </table>
                </div>
            </div>
        `;

        document.body.appendChild(watchlistContainer);

        const headerEl = watchlistContainer.querySelector('.qol-wl-header');
        makeDraggable(watchlistContainer, headerEl);
        makeResizable(watchlistContainer);

        watchlistContainer.querySelector('.qol-wl-close').addEventListener('click', () => {
            watchlistContainer.style.display = 'none';
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && watchlistContainer) {
                watchlistContainer.style.display = 'none';
            }
        });

        watchlistContainer.addEventListener('click', (e) => {
            const link = e.target.closest('.qol-route-link');
            if (link) {
                e.preventDefault();
                const route = link.getAttribute('data-route');
                if (route) {
                    navigateToGameRoute(route);
                }
            }
        });

        renderTabsUI();
        renderTableUI();

        const updateBtn = watchlistContainer.querySelector('#qol-wl-update-btn');
        if (updateBtn) {
            updateBtn.addEventListener('click', updateCurrentWatchlist);
        }
    }

    function destroyWatchlistUI() {
        if (profileCheckInterval) {
            clearInterval(profileCheckInterval);
            profileCheckInterval = null;
        }
        document.querySelectorAll('.qol-wl-profile-wrapper').forEach(el => el.remove());
        document.querySelectorAll('.qol-wl-dropdown-menu').forEach(el => el.remove());

        if (watchlistContainer) {
            watchlistContainer.remove();
            watchlistContainer = null;
        }
        if (watchlistToggleBtn) {
            watchlistToggleBtn.remove();
            watchlistToggleBtn = null;
        }
    }

    function init() {
        if (isWatchlistEnabled()) {
            loadWatchlist();
            injectStyles();
            buildWatchlistUI();
            if (!profileCheckInterval) {
                profileCheckInterval = setInterval(injectProfileWatchlistButton, 500);
            }
            if (typeof window.qolRepositionAllButtons === 'function') {
                window.qolRepositionAllButtons();
            }
        } else {
            destroyWatchlistUI();
        }
    }

    window.addEventListener('qol_setting_changed', (e) => {
        if (e.detail && e.detail.key === 'watchlist') {
            if (e.detail.enabled) {
                init();
            } else {
                destroyWatchlistUI();
            }
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();