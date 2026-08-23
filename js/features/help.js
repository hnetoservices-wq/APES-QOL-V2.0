(function() {
    let helpContainer = null;
    let helpToggleBtn = null;
    const FEATURE_KEY = 'help';

    const TUTORIAL_OPTIONS = [
        { value: '', label: '-- Select a feature tutorial... --' },
        { value: 'npcCalculator', label: 'NPC Merchant & Troop Calculator' },
        { value: 'rallyPoint', label: 'Rally Point Parser & Wave Enhancers' },
        { value: 'incomingResources', label: 'Incoming Resources Tracker' },
        { value: 'watchlistChecklists', label: 'Watchlist & Checklists' },
        { value: 'igmChat', label: 'IGM Enhancer & Chat Silencer' },
        { value: 'keybindsQueue', label: 'Building Queue Enhanced & Keybinds' }
    ];

    const TUTORIALS = {
        npcCalculator: {
            title: 'NPC Merchant & Troop Calculator',
            purpose: 'Instantly calculate how many troops you can train with your village resources, factoring in tribe unit costs, Great Stables and Great Barracks, and Fealty cost reduction.',
            steps: [
                'Click the <b>NPC Calculator</b> button on the top toolbar to open the window.',
                'Select your <b>Tribe</b> from the top dropdown menu.',
                'Set your <b>Fealty Level</b> (1 to 20) to factor in your respective cost reduction.',
                'In the table, choose a unit from the <b>Unit</b> dropdown for each row.',
                'Toggle the <b>GS/GB</b> checkbox if training in Great Stables or Great Barracks.',
                'View <b>Max Trainable</b>: Row 1 calculates based on Total Village Resources. Row 2+ calculates based on Remaining Resources left after preceding rows.',
                'Enter desired troops in <b>I want to train</b>.',
                'Check <b>NPC Resource Distribution</b> to see exact Wood, Clay, Iron, and Crop required for your NPC distribution.'
            ]
        },
        rallyPoint: {
            title: 'Rally Point Parser & Send Troops Enhancer',
            purpose: 'Scan incoming village attacks and sieges into standard Travian Kingdom text formats for quick sharing.',
            steps: [
                'Open <b>Rally Point Parser:</b> Click the <b>Parse Incoming Attacks</b> button. The feature will open your RP and scan incoming attacks and sieges, producing "TK format" text ready to copy to kingdom chats/discord.',
                '<b>Send Troops Enhancer:</b> When sending attack waves, the enhancer pins "Continue", "Back", and "Send" buttons to the top of your attack window so control buttons stay stationary during multiple wave spamming.'
            ]
        },
        incomingResources: {
            title: 'Incoming Resources Tracker',
            purpose: 'Track all incoming resources arriving at your active village from raids, merchant trades, and treasure deliveries.',
            steps: [
                'Click the <b>Incoming Resources</b> button (📦) on the toolbar.',
                'The tracker aggregates all incoming movements arriving at your village.',
                'Displays total incoming Wood, Clay, Iron, and Crop along with arrival time counts to help plan building upgrades and avoid overflow.'
            ]
        },
        watchlistChecklists: {
            title: 'Watchlist & Checklists',
            purpose: 'Pin key players for quick stat tracking and follow step-by-step game progression checklists.',
            steps: [
                '<b>Watchlist:</b> Click the Watchlist toolbar button. Create a new Watchlist Tab by clicking "+ Add Tab", or edit the name of the default tab by double clicking it.',
                'Open the player profile of the player you want to track.',
                'To add target players or allies, keep the player profile open and click "Add Profile to Watchlist".',
                '<b>Checklists:</b> Click the Checklists toolbar button. You can follow default checklists and guides, or create your own. Progress saves automatically as you check off items.'
            ]
        },
        igmChat: {
            title: 'IGM Enhancer & Chat Silencer',
            purpose: 'Organize in-game messages and suppress floating chat popups for clean gameplay.',
            steps: [
                '<b>IGM Enhancer:</b> Open your In-Game Messages (IGM) to use custom message folders and filters to categorize alliance messages, reports, and private chats.',
                '<b>Chat Silencer:</b> Toggle Chat Silencer in the APES QoL settings menu to suppress floating chat notification bubbles during battles.'
            ]
        },
        keybindsQueue: {
            title: 'Building Queue Enhanced & Keybinds',
            purpose: 'Pan the map rapidly with WASD and view exact wall-clock finish times for building and troop queues.',
            steps: [
                '<b>Building Queue Finish Clocks:</b> Hover your cursor over any active queue item to view its exact finish timestamp.',
                '<b>WASD Map Movement:</b> Use W, A, S, D keys on the map page for fast 2x map panning.',
                '<b>Hotkeys: Keybinds for village switching, to send troops on map mouse hover, and instant window navigation. Check APES QoL Menu to see the keybinds and/or to disable/enable them.'
            ]
        }
    };

    function isEnabled() {
        return typeof window.isQolEnabled === 'function' ? window.isQolEnabled(FEATURE_KEY) : true;
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

            function onPointerMove(moveEvent) {
                const newWidth = startWidth + (moveEvent.clientX - startX);
                const newHeight = startHeight + (moveEvent.clientY - startY);
                element.style.width = Math.max(380, newWidth) + 'px';
                element.style.height = Math.max(300, newHeight) + 'px';
            }

            function onPointerUp() {
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);
            }

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        });
    }

    function makeDraggable(element, handle) {
        handle.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.qol-help-close')) return;
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

    function createCustomSelect(containerEl, options, onChange) {
        const trigger = document.createElement('div');
        trigger.className = 'qol-help-select-trigger';
        trigger.style.cssText = `
            width: 100% !important;
            box-sizing: border-box !important;
            padding: 8px 12px !important;
            border: 1px solid #7d6342 !important;
            border-radius: 4px !important;
            background: #ffffff !important;
            font-weight: bold !important;
            color: #332211 !important;
            cursor: pointer !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            user-select: none !important;
            font-size: 12px !important;
        `;

        let selectedVal = options[0] ? options[0].value : '';
        let selectedLabel = options[0] ? options[0].label : '-- Select a feature tutorial... --';

        trigger.innerHTML = `
            <span>${selectedLabel}</span>
            <span style="font-size:10px; color:#7d6342;">▼</span>
        `;

        containerEl.appendChild(trigger);

        let menuEl = null;

        function closeMenu() {
            if (menuEl) {
                menuEl.remove();
                menuEl = null;
            }
        }

        function toggleMenu() {
            if (menuEl) {
                closeMenu();
                return;
            }

            document.querySelectorAll('.qol-help-select-menu').forEach(m => m.remove());

            const rect = trigger.getBoundingClientRect();
            menuEl = document.createElement('div');
            menuEl.className = 'qol-help-select-menu';
            menuEl.style.cssText = `
                position: fixed !important;
                top: ${rect.bottom + 2}px !important;
                left: ${rect.left}px !important;
                width: ${rect.width}px !important;
                max-height: 220px !important;
                overflow-y: auto !important;
                background: #ffffff !important;
                border: 1px solid #7d6342 !important;
                border-radius: 4px !important;
                box-shadow: 0 6px 16px rgba(0,0,0,0.3) !important;
                z-index: 99999999 !important;
                box-sizing: border-box !important;
            `;

            options.forEach(opt => {
                const item = document.createElement('div');
                item.style.cssText = `
                    padding: 8px 12px !important;
                    font-size: 12px !important;
                    font-weight: bold !important;
                    cursor: pointer !important;
                    border-bottom: 1px solid rgba(0,0,0,0.05) !important;
                    color: #111111 !important;
                    background-color: ${opt.value === selectedVal ? '#f5eee6' : '#ffffff'} !important;
                `;
                item.className = 'qol-help-select-item';
                item.textContent = opt.label;

                item.addEventListener('mouseenter', () => {
                    item.style.setProperty('background-color', '#e8decb', 'important');
                    item.style.setProperty('color', '#111111', 'important');
                });
                item.addEventListener('mouseleave', () => {
                    item.style.setProperty('background-color', (opt.value === selectedVal) ? '#f5eee6' : '#ffffff', 'important');
                    item.style.setProperty('color', '#111111', 'important');
                });

                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedVal = opt.value;
                    selectedLabel = opt.label;
                    trigger.querySelector('span').textContent = selectedLabel;
                    closeMenu();
                    if (typeof onChange === 'function') onChange(selectedVal);
                });

                menuEl.appendChild(item);
            });

            document.body.appendChild(menuEl);
        }

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMenu();
        });

        document.addEventListener('click', closeMenu);

        return {
            getValue: () => selectedVal,
            setValue: (val) => {
                const found = options.find(o => o.value === val);
                if (found) {
                    selectedVal = found.value;
                    selectedLabel = found.label;
                    trigger.querySelector('span').textContent = selectedLabel;
                }
            },
            destroy: () => closeMenu()
        };
    }

    function renderTutorial(featureKey) {
        const contentEl = helpContainer.querySelector('#qol-help-tutorial-content');
        if (!contentEl) return;

        if (!featureKey || !TUTORIALS[featureKey]) {
            contentEl.innerHTML = `
                <div style="color:#888; text-align:center; padding-top:30px; font-size:12px;">
                    Select a feature from the dropdown menu above to view its tutorial guide.
                </div>
            `;
            return;
        }

        const data = TUTORIALS[featureKey];
        let html = `
            <div style="font-size:14px; font-weight:bold; color:#4a3821; border-bottom:1px solid #d4c2a5; padding-bottom:4px; margin-bottom:8px;">
                ${data.title}
            </div>
            <div style="font-size:12px; color:#555; font-style:italic; margin-bottom:10px; background:#fbf9f5; padding:6px 8px; border-left:3px solid #7d6342; border-radius:2px;">
                ${data.purpose}
            </div>
            <div style="font-weight:bold; font-size:12px; color:#332211; margin-bottom:6px;">How to use:</div>
            <ol style="margin:0 0 0 18px; padding:0; font-size:12px; color:#332211;">
        `;

        data.steps.forEach(step => {
            html += `<li style="margin-bottom:6px;">${step}</li>`;
        });

        html += `</ol>`;
        contentEl.innerHTML = html;
    }

    function buildUI() {
        if (document.getElementById('qol-help-toggle-btn')) return;

        // Button
        helpToggleBtn = document.createElement('div');
        helpToggleBtn.id = 'qol-help-toggle-btn';
        helpToggleBtn.title = 'APES QoL Help';
        helpToggleBtn.innerHTML = `
            <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
        `;

        helpToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = window.getComputedStyle(helpContainer).display === 'none';
            if (isHidden) {
                window.dispatchEvent(new CustomEvent('qol_close_others', { detail: { source: 'help' } }));

                const cogBtn = document.getElementById('qol-cog-btn');
                if (cogBtn) {
                    const rect = cogBtn.getBoundingClientRect();
                    helpContainer.style.setProperty('position', 'fixed', 'important');
                    helpContainer.style.setProperty('top', (rect.bottom + 20) + 'px', 'important');
                    helpContainer.style.setProperty('left', rect.left + 'px', 'important');
                    helpContainer.style.setProperty('transform', 'none', 'important');
                }
                helpContainer.style.setProperty('display', 'flex', 'important');
            } else {
                helpContainer.style.setProperty('display', 'none', 'important');
            }
        });

        document.body.appendChild(helpToggleBtn);
        if (typeof window.qolRepositionAllButtons === 'function') window.qolRepositionAllButtons();

        // Window
        helpContainer = document.createElement('div');
        helpContainer.id = 'qol-help-container';
        helpContainer.style.cssText = `
            display: none !important;
            position: fixed !important;
            z-index: 999999 !important;
            background: #f7f5f0 !important;
            border: 3px solid #634d31 !important;
            border-radius: 4px !important;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;
            flex-direction: column !important;
            font-family: Arial, sans-serif !important;
            box-sizing: border-box !important;
            min-width: 480px !important;
            min-height: 320px !important;
            width: 560px;
            height: 420px;
            max-width: 95vw !important;
            max-height: 90vh !important;
            overflow: hidden !important;
            resize: both !important;
        `;

        helpContainer.innerHTML = `
            <div class="qol-help-header" style="background:#4a3821; color:#ebdcb9; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; font-weight:bold; border-bottom:2px solid #7d6342; cursor:move; user-select:none;">
                <span style="font-size:14px;">🦧 APES QoL Help 🦧</span>
                <span class="qol-help-close" style="cursor:pointer; font-size:18px; color:#ebdcb9; font-weight:bold;">&times;</span>
            </div>
            <div class="qol-help-body-content" style="padding:12px; overflow-y:auto; color:#332211; font-size:12px; line-height:1.5; flex:1; display:flex; flex-direction:column; gap:10px;">
                
                <div style="font-size:12px; font-weight:bold; color:#6d5436; background:#fff6e5; padding:8px 10px; border-radius:4px; border:1px solid #d4c2a5;">
                    Need help figuring out how a feature works? Select the feature below!
                </div>

                <div id="qol-help-select-wrapper"></div>

                <div id="qol-help-tutorial-content" style="flex:1; background:#fff; border:1px solid #d4c2a5; border-radius:4px; padding:12px; overflow-y:auto; min-height:180px;">
                    <div style="color:#888; text-align:center; padding-top:40px; font-size:12px;">
                        Select a feature from the dropdown menu above to view its tutorial guide.
                    </div>
                </div>

            </div>
        `;
        document.body.appendChild(helpContainer);

        const headerEl = helpContainer.querySelector('.qol-help-header');
        makeDraggable(helpContainer, headerEl);
        makeResizable(helpContainer);

        const selectWrapper = helpContainer.querySelector('#qol-help-select-wrapper');
        createCustomSelect(selectWrapper, TUTORIAL_OPTIONS, (selectedKey) => {
            renderTutorial(selectedKey);
        });

        helpContainer.querySelector('.qol-help-close').addEventListener('click', () => {
            helpContainer.style.setProperty('display', 'none', 'important');
        });
    }

    function init() {
        if (isEnabled()) {
            buildUI();
        } else {
            if (helpContainer) helpContainer.remove();
            if (helpToggleBtn) helpToggleBtn.remove();
            helpContainer = null; helpToggleBtn = null;
        }
    }

    window.addEventListener('qol_close_others', (e) => {
        if (e.detail && e.detail.source !== 'help') {
            if (helpContainer) helpContainer.style.setProperty('display', 'none', 'important');
            document.querySelectorAll('.qol-help-select-menu').forEach(m => m.remove());
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && helpContainer && window.getComputedStyle(helpContainer).display !== 'none') {
            helpContainer.style.setProperty('display', 'none', 'important');
            document.querySelectorAll('.qol-help-select-menu').forEach(m => m.remove());
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();