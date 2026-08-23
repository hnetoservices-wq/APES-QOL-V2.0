/**
 * APES QoL Extension
 * Auction House Scanner
 *
 * Adds item selectors directly to Travian's Auction House Buy tab and gathers
 * every matching listing from all native pages into one consolidated block.
 */

(function() {
    'use strict';

    const FEATURE_KEY = 'auctionHouseScanner';
    const STYLE_ID = 'qol-auction-house-scanner-styles';
    const PANEL_ID = 'qol-auction-scanner-panel';
    const TYPE_SELECT_ID = 'qol-auction-type-select';
    const ITEM_SELECT_ID = 'qol-auction-item-select';
    const SCAN_BUTTON_ID = 'qol-auction-scan-btn';
    const STATUS_ID = 'qol-auction-scan-status';
    const INTERACTION_LOCK_ID = 'qol-auction-interaction-lock';
    const RESULTS_ID = 'qol-auction-consolidated-results';
    const RESULTS_TITLE_ID = 'qol-auction-results-title';
    const RESULTS_COUNT_ID = 'qol-auction-results-count';
    const RESULTS_BODY_ID = 'qol-auction-results-body';
    const EMPTY_ID = 'qol-auction-empty';
    const NATIVE_SCROLL_CLASS = 'qol-auction-native-scroll';
    const NATIVE_VISIBLE_ROWS = 6;
    const MAX_PAGES_TO_SCAN = 500;
    const PAGE_CHANGE_TIMEOUT = 5000;
    const PAGE_SETTLE_TIME = 350;
    const PAGE_POLL_INTERVAL = 75;

    const CATEGORY_CONFIG = {
        helmets: {
            label: 'Helmets',
            filterSelector: '.item_category_helmet_small_flat_black',
            items: [
                'Helmet of Regeneration',
                'Helmet of Health',
                'Helmet of Healing',
                'Helmet of the Gladiator',
                'Helmet of the Tribune',
                'Helmet of the Consul',
                'Helmet of the Horseman',
                'Helmet of the Cavalry',
                'Helmet of the Heavy Cavalry',
                'Helmet of the Mercenary',
                'Helmet of the Warrior',
                'Helmet of the Archon'
            ]
        },
        armors: {
            label: 'Armors',
            filterSelector: '.item_category_body_small_flat_black',
            items: [
                'Armor of Regeneration',
                'Armor of Health',
                'Armor of Healing',
                'Light Scale Armor',
                'Scale Armor',
                'Heavy Scale Armor',
                'Light Breast-plate Armor',
                'Breast-plate Armor',
                'Heavy Breast-plate Armor',
                'Light Chainmail',
                'Chainmail',
                'Heavy Chainmail'
            ]
        },
        leftHand: {
            label: 'Left-hand items',
            filterSelector: '.item_category_leftHand_small_flat_black',
            items: [
                'Small Map',
                'Map',
                'Large Map',
                'Small Pennant',
                'Pennant',
                'Great Pennant',
                'Small Standard',
                'Standard',
                'Great Standard',
                'Small Spy-glass',
                'Spy-glass',
                'Great Spy-glass',
                'Pouch of the Thief',
                'Bag of the Thief',
                'Sack of the Thief',
                'Small Shield',
                'Shield',
                'Large Shield',
                'Small Horn of the Natarian',
                'Horn of the Natarian',
                'Huge Horn of the Natarian'
            ]
        },
        rightHand: {
            label: 'Right-hand weapons',
            filterSelector: '.item_category_rightHand_small_flat_black',
            groups: [
                {
                    label: 'Romans',
                    items: [
                        'Short Sword of the Legionnaire',
                        'Sword of the Legionnaire',
                        'Long Sword of the Legionnaire',
                        'Short Sword of the Praetorian',
                        'Sword of the Praetorian',
                        'Long Sword of the Praetorian',
                        'Short Sword of the Imperian',
                        'Sword of the Imperian',
                        'Long Sword of the Imperian',
                        'Short Sword of the Imperatoris',
                        'Sword of the Imperatoris',
                        'Long Sword of the Imperatoris',
                        'Light Lance of the Caesaris',
                        'Lance of the Caesaris',
                        'Heavy Lance of the Caesaris'
                    ]
                },
                {
                    label: 'Teutons',
                    items: [
                        'Club of the Clubswinger',
                        'Mace of the Clubswinger',
                        'Morning Star of the Clubswinger',
                        'Spear of the Spearfighter',
                        'Spike of the Spearfighter',
                        'Lance of the Spearfighter',
                        'Hatchet of the Axeman',
                        'Axe of the Axeman',
                        'Battle Axe of the Axeman',
                        'Light Hammer of the Paladin',
                        'Hammer of the Paladin',
                        'Heavy Hammer of the Paladin',
                        'Short Sword of the Teutonic Knight',
                        'Sword of the Teutonic Knight',
                        'Long Sword of the Teutonic Knight'
                    ]
                },
                {
                    label: 'Gauls',
                    items: [
                        'Spear of the Phalanx',
                        'Pike of the Phalanx',
                        'Lance of the Phalanx',
                        'Short Sword of the Swordsman',
                        'Sword of the Swordsman',
                        'Long Sword of the Swordsman',
                        'Short Bow of the Theutates',
                        'Bow of the Theutates',
                        'Long Bow of the Theutates',
                        'Walking-Staff of the Druidrider',
                        'Staff of the Druidrider',
                        'Fighting-Staff of the Druidrider',
                        'Light Lance of the Haeduan',
                        'Lance of the Haeduan',
                        'Heavy Lance of the Haeduan'
                    ]
                }
            ]
        },
        boots: {
            label: 'Boots',
            filterSelector: '.item_category_shoes_small_flat_black',
            items: [
                'Boots of Knowledge',
                'Boots of Enlightenment',
                'Boots of Wisdom',
                'Boots of the Mercenary',
                'Boots of the Warrior',
                'Boots of the Archon',
                'Small Spurs',
                'Spurs',
                'Nasty Spurs',
                'Boots of the Chicken'
            ]
        },
        mounts: {
            label: 'Mounts',
            filterSelector: '.item_category_horse_small_flat_black',
            items: [
                'Gelding',
                'Thoroughbred',
                'Warhorse'
            ]
        },
        consumables: {
            label: 'Consumables',
            items: [
                'Ointment',
                'Scroll',
                'Bucket',
                'Book of Wisdom',
                'Artwork',
                'Small Bandage',
                'Bandage',
                'Cage'
            ],
            itemFilterSelectors: {
                Ointment: '.item_category_ointment_small_flat_black',
                Scroll: '.item_category_scroll_small_flat_black',
                'Bucket': '.item_category_bucket_small_flat_black',
                'Book of Wisdom': '.item_category_bookOfWisdom_small_flat_black',
                Artwork: '.item_category_artwork_small_flat_black',
                'Small Bandage': '.item_category_smallBandage_small_flat_black',
                Bandage: '.item_category_bandage_small_flat_black',
                Cage: '.item_category_cage_small_flat_black'
            }
        }
    };

    let scanToken = 0;
    let ensureTimer = null;
    let observer = null;
    let selectedCategory = '';
    let selectedItem = '';
    let isBusy = false;
    let hasScanned = false;
    let results = [];
    let sortKey = '';
    let sortDirection = 'asc';

    function isFeatureEnabled() {
        if (typeof window.isQolEnabled === 'function') {
            return window.isQolEnabled(FEATURE_KEY);
        }

        try {
            return localStorage.getItem(`qol_${FEATURE_KEY}`) !== 'false';
        } catch (error) {
            return true;
        }
    }

    function normalizeItemName(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/gi, '')
            .toLowerCase();
    }

    function parseInteger(value) {
        const parsed = Number.parseInt(
            String(value || '').replace(/[^0-9-]+/g, ''),
            10
        );

        return Number.isFinite(parsed) ? parsed : 0;
    }

    function delay(milliseconds) {
        return new Promise(resolve => {
            setTimeout(resolve, milliseconds);
        });
    }

    function findAuctionRoot() {
        return document.querySelector(
            '.tabContentBuy.currentTab .auction.buy'
        ) || document.querySelector(
            '.tabContentBuy.activeTab .auction.buy'
        ) || document.querySelector(
            '.auction.buy'
        );
    }

    function getNativeAuctionTable(auctionRoot) {
        if (!auctionRoot) {
            return null;
        }

        return Array.from(
            auctionRoot.querySelectorAll('table')
        ).find(table => {
            return !table.closest(`#${PANEL_ID}`) &&
                Boolean(table.querySelector('tbody'));
        }) || null;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${PANEL_ID},
            #${PANEL_ID} * {
                box-sizing: border-box !important;
                font-family: Arial, Helvetica, sans-serif !important;
                text-shadow: none !important;
            }

            #${PANEL_ID} {
                display: block !important;
                width: 100% !important;
                margin: 0 0 12px !important;
                border: 1px solid #b7a487 !important;
                border-radius: 5px !important;
                background: #f7f5f0 !important;
                color: #3f3020 !important;
                box-shadow:
                    0 2px 7px rgba(64, 44, 23, 0.13),
                    inset 0 1px 0 rgba(255, 255, 255, 0.7) !important;
                overflow: hidden !important;
            }

            #${PANEL_ID} .qol-auction-controls {
                display: grid !important;
                grid-template-columns:
                    minmax(135px, 0.8fr)
                    minmax(220px, 1.5fr)
                    auto !important;
                align-items: end !important;
                gap: 8px !important;
                padding: 10px !important;
                background: linear-gradient(
                    to bottom,
                    #f8f4eb,
                    #e8dfd1
                ) !important;
            }

            #${PANEL_ID} .qol-auction-field {
                display: flex !important;
                flex-direction: column !important;
                min-width: 0 !important;
                gap: 3px !important;
            }

            #${PANEL_ID} .qol-auction-label {
                color: #6c5b45 !important;
                font-size: 9px !important;
                font-weight: 700 !important;
                line-height: 12px !important;
                letter-spacing: 0.2px !important;
                text-transform: uppercase !important;
            }

            #${PANEL_ID} select {
                display: block !important;
                width: 100% !important;
                height: 30px !important;
                margin: 0 !important;
                padding: 4px 27px 4px 7px !important;
                border: 1px solid #9f8a6b !important;
                border-radius: 3px !important;
                background: #fffdf8 !important;
                color: #443421 !important;
                box-shadow: inset 0 1px 2px rgba(75, 54, 31, 0.1) !important;
                font-size: 10.5px !important;
                cursor: pointer !important;
            }

            #${PANEL_ID} select:focus {
                border-color: #718f26 !important;
                outline: 2px solid rgba(128, 166, 36, 0.2) !important;
            }

            #${PANEL_ID} select:disabled {
                color: #9b8e7b !important;
                background: #eee9df !important;
                cursor: default !important;
                opacity: 0.78 !important;
            }

            #${PANEL_ID} .qol-auction-action-btn {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                height: 28px !important;
                margin: 0 !important;
                padding: 5px 11px !important;
                border: 1px solid #523d24 !important;
                border-radius: 3px !important;
                background: linear-gradient(
                    to bottom,
                    #7d6342,
                    #543f26
                ) !important;
                color: #ffffff !important;
                font-size: 11px !important;
                font-weight: bold !important;
                line-height: 16px !important;
                white-space: nowrap !important;
                cursor: pointer !important;
                user-select: none !important;
                box-sizing: border-box !important;
            }

            #${PANEL_ID} .qol-auction-action-btn:not(.disabled):hover {
                filter: brightness(1.08) !important;
            }

            #${PANEL_ID} .qol-auction-action-btn:focus-visible {
                outline: 2px solid #8e6f45 !important;
                outline-offset: 2px !important;
            }

            #${PANEL_ID} .qol-auction-action-btn.disabled {
                opacity: 0.45 !important;
                cursor: default !important;
                pointer-events: none !important;
            }

            #${SCAN_BUTTON_ID} {
                min-width: 126px !important;
            }

            #${STATUS_ID} {
                display: none !important;
                min-height: 28px !important;
                padding: 6px 10px !important;
                border-top: 1px solid #d7cab6 !important;
                background: #fffdf8 !important;
                color: #6e604c !important;
                font-size: 9.5px !important;
                line-height: 15px !important;
            }

            #${STATUS_ID}[data-visible="true"] {
                display: block !important;
            }

            #${STATUS_ID}[data-state="scanning"] {
                color: #6d5436 !important;
            }

            #${STATUS_ID}[data-state="success"] {
                color: #53771c !important;
                font-weight: 700 !important;
            }

            #${STATUS_ID}[data-state="empty"],
            #${STATUS_ID}[data-state="error"] {
                color: #9b3f2f !important;
                font-weight: 700 !important;
            }

            #${RESULTS_ID} {
                display: none !important;
                border-top: 1px solid #b7a487 !important;
                background: #fff !important;
            }

            #${RESULTS_ID}[data-visible="true"] {
                display: block !important;
            }

            #${PANEL_ID} .qol-auction-results-header {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                min-height: 34px !important;
                gap: 10px !important;
                padding: 6px 9px !important;
                background: linear-gradient(
                    to bottom,
                    #6d5436,
                    #4f3b24
                ) !important;
                color: #fffaf0 !important;
            }

            #${RESULTS_TITLE_ID} {
                min-width: 0 !important;
                overflow: hidden !important;
                font-size: 10.5px !important;
                font-weight: 700 !important;
                line-height: 16px !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }

            #${RESULTS_COUNT_ID} {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                flex: 0 0 auto !important;
                min-width: 68px !important;
                min-height: 20px !important;
                padding: 2px 8px !important;
                border: 1px solid rgba(255, 255, 255, 0.22) !important;
                border-radius: 10px !important;
                background: rgba(0, 0, 0, 0.16) !important;
                color: #fffaf0 !important;
                font-size: 8.5px !important;
                font-weight: 700 !important;
                text-transform: uppercase !important;
            }

            #${PANEL_ID} .qol-auction-results-scroll {
                width: 100% !important;
                max-height: 142px !important;
                overflow-x: hidden !important;
                overflow-y: auto !important;
                scrollbar-color: #aa987b #eee8dc !important;
                scrollbar-width: thin !important;
            }

            #${PANEL_ID} .qol-auction-results-table {
                width: 100% !important;
                min-width: 0 !important;
                max-width: 100% !important;
                margin: 0 !important;
                border-collapse: collapse !important;
                border-spacing: 0 !important;
                table-layout: fixed !important;
            }

            #${PANEL_ID} .qol-auction-results-table th {
                position: sticky !important;
                top: 0 !important;
                z-index: 1 !important;
                height: 28px !important;
                padding: 5px 4px !important;
                border-right: 1px solid #cfc0aa !important;
                border-bottom: 1px solid #bda98d !important;
                background: linear-gradient(
                    to bottom,
                    #eee6d9,
                    #dfd3c1
                ) !important;
                color: #58442b !important;
                font-size: 8.5px !important;
                font-weight: 700 !important;
                line-height: 13px !important;
                text-align: left !important;
                text-transform: uppercase !important;
                white-space: nowrap !important;
                overflow: hidden !important;
            }

            #${PANEL_ID} .qol-auction-results-table th[data-sort-key] {
                cursor: pointer !important;
                user-select: none !important;
            }

            #${PANEL_ID} .qol-auction-results-table th[data-sort-key]:hover {
                background: linear-gradient(
                    to bottom,
                    #f6efe4,
                    #e8dbc8
                ) !important;
            }

            #${PANEL_ID} .qol-auction-results-table th[data-sort-key]:focus-visible {
                outline: 2px solid #718f26 !important;
                outline-offset: -2px !important;
            }

            #${PANEL_ID} .qol-auction-sort-label {
                display: inline-flex !important;
                align-items: center !important;
                max-width: 100% !important;
                gap: 2px !important;
            }

            #${PANEL_ID} .qol-auction-sort-indicator {
                color: #8d7a60 !important;
                font-size: 8px !important;
                line-height: 1 !important;
            }

            #${PANEL_ID} .qol-auction-results-table th[aria-sort="ascending"]
                .qol-auction-sort-indicator,
            #${PANEL_ID} .qol-auction-results-table th[aria-sort="descending"]
                .qol-auction-sort-indicator {
                color: #58751f !important;
            }

            #${PANEL_ID} .qol-auction-results-table td {
                height: 38px !important;
                padding: 3px 4px !important;
                border-right: 1px solid #e6ded2 !important;
                border-bottom: 1px solid #ddd3c5 !important;
                background: #fff !important;
                color: #4e402e !important;
                font-size: 9.5px !important;
                line-height: 14px !important;
                vertical-align: middle !important;
            }

            #${PANEL_ID} .qol-auction-results-table tr:nth-child(even) td {
                background: #fcfaf6 !important;
            }

            #${PANEL_ID} .qol-auction-results-table tr:hover td {
                background: #fff7e8 !important;
            }

            #${PANEL_ID} .qol-auction-item-cell {
                display: flex !important;
                align-items: center !important;
                min-width: 0 !important;
                gap: 5px !important;
            }

            #${PANEL_ID} .qol-auction-item-icon {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                flex: 0 0 30px !important;
                width: 30px !important;
                height: 30px !important;
                pointer-events: none !important;
            }

            #${PANEL_ID} .qol-auction-item-copy {
                display: flex !important;
                flex-direction: column !important;
                min-width: 0 !important;
            }

            #${PANEL_ID} .qol-auction-item-name {
                overflow: hidden !important;
                color: #3f3020 !important;
                font-size: 9.5px !important;
                font-weight: 700 !important;
                text-overflow: ellipsis !important;
                white-space: nowrap !important;
            }

            #${PANEL_ID} .qol-auction-price {
                display: inline-flex !important;
                align-items: center !important;
                gap: 3px !important;
                color: #493722 !important;
                font-weight: 700 !important;
                white-space: nowrap !important;
            }

            #${PANEL_ID} .qol-auction-time {
                color: #5d4e3b !important;
                font-variant-numeric: tabular-nums !important;
                white-space: nowrap !important;
            }

            #${PANEL_ID} .qol-auction-time[data-expired="true"] {
                color: #a14938 !important;
                font-weight: 700 !important;
            }

            #${PANEL_ID} .qol-auction-view-button {
                width: 100% !important;
                min-width: 0 !important;
                height: 24px !important;
                padding: 0 5px !important;
                font-size: 9px !important;
            }

            .auction.buy .${NATIVE_SCROLL_CLASS} {
                width: 100% !important;
                overflow-x: hidden !important;
                overflow-y: auto !important;
                scrollbar-color: #aa987b #eee8dc !important;
                scrollbar-width: thin !important;
            }

            .auction.buy .${NATIVE_SCROLL_CLASS} > table {
                width: 100% !important;
                margin: 0 !important;
            }

            .auction.buy .${NATIVE_SCROLL_CLASS} > table > thead > tr > th {
                position: sticky !important;
                top: 0 !important;
                z-index: 4 !important;
            }

            #${EMPTY_ID} {
                display: none !important;
                padding: 13px 10px !important;
                color: #8b7b65 !important;
                font-size: 9.5px !important;
                font-style: italic !important;
                line-height: 15px !important;
                text-align: center !important;
            }

            #${EMPTY_ID}[data-visible="true"] {
                display: block !important;
            }

            .auction.buy table tbody tr.qol-auction-native-highlight {
                position: relative !important;
                z-index: 3 !important;
                outline: 3px solid #6f9622 !important;
                outline-offset: -2px !important;
                animation:
                    qolAuctionNativeRowPulse
                    0.7s ease-in-out
                    5 alternate !important;
            }

            .auction.buy table tbody tr.qol-auction-native-highlight > td {
                border-top-color: #6f9622 !important;
                border-bottom-color: #6f9622 !important;
                background-color: #f6df82 !important;
                background-image: none !important;
                box-shadow:
                    inset 0 3px 0 rgba(255, 255, 255, 0.58),
                    inset 0 -3px 0 rgba(111, 150, 34, 0.24) !important;
            }

            .auction.buy table tbody tr.qol-auction-native-highlight > td:first-child {
                border-left-color: #6f9622 !important;
            }

            .auction.buy table tbody tr.qol-auction-native-highlight > td:last-child {
                border-right-color: #6f9622 !important;
            }

            @keyframes qolAuctionNativeRowPulse {
                from {
                    filter: brightness(1);
                }

                to {
                    filter: brightness(1.18);
                }
            }

            @media (max-width: 620px) {
                #${PANEL_ID} .qol-auction-controls {
                    grid-template-columns: 1fr 1fr !important;
                }

                #${SCAN_BUTTON_ID} {
                    grid-column: 1 / -1 !important;
                    width: 100% !important;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function createPlaceholderOption(label) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = label;

        return option;
    }

    function getAllItemsForCategory(category) {
        if (!category) {
            return [];
        }

        if (Array.isArray(category.items)) {
            return category.items;
        }

        if (!Array.isArray(category.groups)) {
            return [];
        }

        return category.groups.flatMap(group => {
            return group.items;
        });
    }

    function populateCategorySelect(select) {
        select.replaceChildren(
            createPlaceholderOption('Type of item')
        );

        Object.entries(CATEGORY_CONFIG).forEach(
            ([categoryKey, category]) => {
                const option = document.createElement('option');
                option.value = categoryKey;
                option.textContent = category.label;
                select.appendChild(option);
            }
        );

        select.value = selectedCategory;
    }

    function appendItemOption(parent, itemName) {
        const option = document.createElement('option');
        option.value = itemName;
        option.textContent = itemName;
        parent.appendChild(option);
    }

    function populateItemSelect(categoryKey, select) {
        const category = CATEGORY_CONFIG[categoryKey];

        select.replaceChildren(
            createPlaceholderOption('Item name')
        );

        if (!category) {
            select.disabled = true;
            select.value = '';
            return;
        }

        if (Array.isArray(category.groups)) {
            category.groups.forEach(group => {
                const optgroup = document.createElement('optgroup');
                optgroup.label = group.label;

                group.items.forEach(itemName => {
                    appendItemOption(optgroup, itemName);
                });

                select.appendChild(optgroup);
            });
        } else {
            category.items.forEach(itemName => {
                appendItemOption(select, itemName);
            });
        }

        const itemExists = getAllItemsForCategory(category).includes(
            selectedItem
        );

        select.disabled = false;
        select.value = itemExists ? selectedItem : '';

        if (!itemExists) {
            selectedItem = '';
        }
    }

    function createPanel() {
        const panel = document.createElement('section');
        panel.id = PANEL_ID;
        panel.setAttribute('aria-label', 'APES Auction House item finder');

        panel.innerHTML = `
            <div class="qol-auction-controls">
                <label class="qol-auction-field">
                    <span class="qol-auction-label">Type of item</span>
                    <select
                        id="${TYPE_SELECT_ID}"
                        aria-label="Type of item"
                    ></select>
                </label>

                <label class="qol-auction-field">
                    <span class="qol-auction-label">Item name</span>
                    <select
                        id="${ITEM_SELECT_ID}"
                        aria-label="Item name"
                        disabled
                    ></select>
                </label>

                <div
                    id="${SCAN_BUTTON_ID}"
                    class="qol-auction-action-btn"
                    role="button"
                    tabindex="0"
                    aria-disabled="false"
                >
                    Find all copies
                </div>
            </div>

            <div
                id="${STATUS_ID}"
                role="status"
                aria-live="polite"
            ></div>

            <div id="${RESULTS_ID}">
                <div class="qol-auction-results-header">
                    <span id="${RESULTS_TITLE_ID}">
                        Matching listings
                    </span>

                    <span id="${RESULTS_COUNT_ID}">
                        0 listings
                    </span>
                </div>

                <div class="qol-auction-results-scroll">
                    <table class="qol-auction-results-table">
                        <colgroup>
                            <col style="width: 42%;">
                            <col style="width: 7%;">
                            <col style="width: 13%;">
                            <col style="width: 8%;">
                            <col style="width: 16%;">
                            <col style="width: 14%;">
                        </colgroup>

                        <thead>
                            <tr>
                                <th
                                    data-sort-key="item"
                                    role="button"
                                    tabindex="0"
                                    aria-sort="none"
                                    title="Sort by item name"
                                >
                                    <span class="qol-auction-sort-label">
                                        Item
                                        <span
                                            class="qol-auction-sort-indicator"
                                            aria-hidden="true"
                                        >↕</span>
                                    </span>
                                </th>
                                <th
                                    data-sort-key="quantity"
                                    role="button"
                                    tabindex="0"
                                    aria-sort="none"
                                    title="Sort by quantity"
                                >
                                    <span class="qol-auction-sort-label">
                                        Qty.
                                        <span
                                            class="qol-auction-sort-indicator"
                                            aria-hidden="true"
                                        >↕</span>
                                    </span>
                                </th>
                                <th
                                    data-sort-key="remaining"
                                    role="button"
                                    tabindex="0"
                                    aria-sort="none"
                                    title="Sort by remaining time"
                                >
                                    <span class="qol-auction-sort-label">
                                        Remaining
                                        <span
                                            class="qol-auction-sort-indicator"
                                            aria-hidden="true"
                                        >↕</span>
                                    </span>
                                </th>
                                <th
                                    data-sort-key="bids"
                                    role="button"
                                    tabindex="0"
                                    aria-sort="none"
                                    title="Sort by number of bids"
                                >
                                    <span class="qol-auction-sort-label">
                                        Bids
                                        <span
                                            class="qol-auction-sort-indicator"
                                            aria-hidden="true"
                                        >↕</span>
                                    </span>
                                </th>
                                <th
                                    data-sort-key="price"
                                    role="button"
                                    tabindex="0"
                                    aria-sort="none"
                                    title="Sort by price"
                                >
                                    <span class="qol-auction-sort-label">
                                        Price
                                        <span
                                            class="qol-auction-sort-indicator"
                                            aria-hidden="true"
                                        >↕</span>
                                    </span>
                                </th>
                                <th>View</th>
                            </tr>
                        </thead>

                        <tbody id="${RESULTS_BODY_ID}"></tbody>
                    </table>

                    <div id="${EMPTY_ID}">
                        No matching listings were found.
                    </div>
                </div>
            </div>
        `;

        const typeSelect = panel.querySelector(`#${TYPE_SELECT_ID}`);
        const itemSelect = panel.querySelector(`#${ITEM_SELECT_ID}`);
        const scanButton = panel.querySelector(`#${SCAN_BUTTON_ID}`);

        populateCategorySelect(typeSelect);
        populateItemSelect(selectedCategory, itemSelect);

        typeSelect.addEventListener('change', () => {
            handleTypeSelection(typeSelect, itemSelect);
        });

        itemSelect.addEventListener('change', () => {
            handleItemSelection(typeSelect, itemSelect);
        });

        panel.querySelectorAll('th[data-sort-key]').forEach(header => {
            const applySort = () => {
                handleSortSelection(header.dataset.sortKey);
            };

            header.addEventListener('click', applySort);
            header.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                    return;
                }

                event.preventDefault();
                applySort();
            });
        });

        scanButton.addEventListener('click', startScan);
        scanButton.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            event.preventDefault();
            startScan();
        });

        return panel;
    }

    function handleTypeSelection(typeSelect, itemSelect) {
        cancelActiveOperation();
        selectedCategory = typeSelect.value;
        selectedItem = '';
        clearResults();
        populateItemSelect(selectedCategory, itemSelect);

        if (!selectedCategory) {
            setStatus('', '');
            return;
        }

        setStatus(
            'Choose the exact item, then click Find all copies.',
            ''
        );
    }

    function handleItemSelection(typeSelect, itemSelect) {
        cancelActiveOperation();
        selectedCategory = typeSelect.value;
        selectedItem = itemSelect.value;
        clearResults();

        if (!selectedItem) {
            setStatus('Choose the exact item.', '');
            return;
        }

        if (!CATEGORY_CONFIG[selectedCategory]) {
            setStatus('Choose an item type first.', 'error');
            return;
        }

        setStatus(
            `Ready to find every ${selectedItem} listing.`,
            ''
        );
    }

    function ensurePanel() {
        if (!isFeatureEnabled()) {
            removePanel();
            return;
        }

        injectStyles();

        const auctionRoot = findAuctionRoot();

        if (!auctionRoot) {
            removePanel();
            return;
        }

        const nativeTable = getNativeAuctionTable(auctionRoot);

        if (!nativeTable || !nativeTable.parentElement) {
            return;
        }

        const nativeScroll = ensureNativeAuctionScroll(
            auctionRoot,
            nativeTable
        );
        const existingPanel = document.getElementById(PANEL_ID);

        if (existingPanel && auctionRoot.contains(existingPanel)) {
            return;
        }

        if (existingPanel) {
            existingPanel.remove();
        }

        const panel = createPanel();
        nativeScroll.parentElement.insertBefore(panel, nativeScroll);
        renderResults();
        setBusy(isBusy);
    }

    function setNativeAuctionScrollHeight(auctionRoot, nativeTable, wrapper) {
        if (!auctionRoot || !nativeTable || !wrapper) {
            return;
        }

        const rows = getAuctionRows(auctionRoot);

        if (rows.length <= NATIVE_VISIBLE_ROWS) {
            wrapper.style.removeProperty('max-height');
            return;
        }

        const headerHeight = nativeTable.tHead ?
            nativeTable.tHead.getBoundingClientRect().height :
            0;
        const visibleRowsHeight = rows
            .slice(0, NATIVE_VISIBLE_ROWS)
            .reduce((height, row) => {
                return height + row.getBoundingClientRect().height;
            }, 0);
        const maximumHeight = Math.ceil(
            headerHeight + visibleRowsHeight + 1
        );

        if (maximumHeight > 1) {
            wrapper.style.maxHeight = `${maximumHeight}px`;
        }
    }

    function ensureNativeAuctionScroll(auctionRoot, nativeTable) {
        let wrapper = nativeTable.closest(`.${NATIVE_SCROLL_CLASS}`);

        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = NATIVE_SCROLL_CLASS;
            nativeTable.parentElement.insertBefore(wrapper, nativeTable);
            wrapper.appendChild(nativeTable);
        }

        requestAnimationFrame(() => {
            setNativeAuctionScrollHeight(
                auctionRoot,
                nativeTable,
                wrapper
            );
        });

        return wrapper;
    }

    function restoreNativeAuctionTables() {
        document.querySelectorAll(`.${NATIVE_SCROLL_CLASS}`).forEach(
            wrapper => {
                const parent = wrapper.parentElement;

                if (!parent) {
                    return;
                }

                while (wrapper.firstChild) {
                    parent.insertBefore(wrapper.firstChild, wrapper);
                }

                wrapper.remove();
            }
        );
    }

    function queueEnsurePanel() {
        if (ensureTimer) {
            return;
        }

        ensureTimer = setTimeout(() => {
            ensureTimer = null;
            ensurePanel();
        }, 80);
    }

    function removePanel() {
        const panel = document.getElementById(PANEL_ID);

        if (panel) {
            panel.remove();
        }

        restoreNativeAuctionTables();
    }

    function setStatus(message, state) {
        const status = document.getElementById(STATUS_ID);

        if (!status) {
            return;
        }

        status.textContent = message;
        status.dataset.state = state || '';
        status.dataset.visible = String(Boolean(message));
    }

    function setInteractionLock(locked) {
        const existingLock = document.getElementById(INTERACTION_LOCK_ID);

        if (!locked) {
            if (existingLock) {
                existingLock.remove();
            }

            return;
        }

        if (existingLock) {
            return;
        }

        const lock = document.createElement('div');
        lock.id = INTERACTION_LOCK_ID;
        lock.setAttribute('aria-hidden', 'true');
        lock.title = 'APES Auction Scanner is working…';
        Object.assign(lock.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '2147483646',
            background: 'transparent',
            cursor: 'wait',
            pointerEvents: 'auto'
        });

        ['pointerdown', 'pointermove', 'pointerup', 'mousemove',
            'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu',
            'wheel'].forEach(eventName => {
            lock.addEventListener(eventName, event => {
                event.preventDefault();
                event.stopPropagation();
            }, { passive: false });
        });

        document.body.appendChild(lock);
    }

    function setBusy(busy) {
        isBusy = busy;
        setInteractionLock(busy);

        const panel = document.getElementById(PANEL_ID);

        if (!panel) {
            return;
        }

        const typeSelect = panel.querySelector(`#${TYPE_SELECT_ID}`);
        const itemSelect = panel.querySelector(`#${ITEM_SELECT_ID}`);
        const scanButton = panel.querySelector(`#${SCAN_BUTTON_ID}`);

        if (typeSelect) {
            typeSelect.disabled = busy;
        }

        if (itemSelect) {
            itemSelect.disabled = busy || !selectedCategory;
        }

        if (scanButton) {
            scanButton.classList.toggle('disabled', busy);
            scanButton.setAttribute('aria-disabled', String(busy));
            scanButton.tabIndex = busy ? -1 : 0;
            scanButton.textContent = busy ? 'Scanning…' : 'Find all copies';
        }

        panel.querySelectorAll('.qol-auction-view-button').forEach(button => {
            button.classList.toggle('disabled', busy);
            button.setAttribute('aria-disabled', String(busy));
            button.tabIndex = busy ? -1 : 0;
        });
    }

    function cancelActiveOperation() {
        scanToken += 1;
        setBusy(false);
    }

    function clearResults() {
        results = [];
        hasScanned = false;
        renderResults();
    }

    function handleSortSelection(nextSortKey) {
        if (!nextSortKey) {
            return;
        }

        if (sortKey === nextSortKey) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortKey = nextSortKey;
            sortDirection = 'asc';
        }

        renderResults();
    }

    function getSortValue(result, key) {
        switch (key) {
            case 'item':
                return normalizeItemName(result.itemName);
            case 'quantity':
                return parseInteger(result.quantity);
            case 'remaining':
                return result.endTime || Number.MAX_SAFE_INTEGER;
            case 'bids':
                return result.bids;
            case 'price':
                return result.price;
            default:
                return 0;
        }
    }

    function getSortedResults() {
        if (!sortKey) {
            return results.slice();
        }

        const directionMultiplier = sortDirection === 'asc' ? 1 : -1;

        return results.slice().sort((first, second) => {
            const firstValue = getSortValue(first, sortKey);
            const secondValue = getSortValue(second, sortKey);
            let comparison = 0;

            if (
                typeof firstValue === 'string' ||
                typeof secondValue === 'string'
            ) {
                comparison = String(firstValue).localeCompare(
                    String(secondValue),
                    undefined,
                    {
                        numeric: true,
                        sensitivity: 'base'
                    }
                );
            } else {
                comparison = firstValue - secondValue;
            }

            if (!comparison) {
                comparison = String(first.auctionId).localeCompare(
                    String(second.auctionId),
                    undefined,
                    { numeric: true }
                );
            }

            return comparison * directionMultiplier;
        });
    }

    function updateSortHeaders() {
        document.querySelectorAll(
            `#${PANEL_ID} th[data-sort-key]`
        ).forEach(header => {
            const isActiveSort = header.dataset.sortKey === sortKey;
            const indicator = header.querySelector(
                '.qol-auction-sort-indicator'
            );

            header.setAttribute(
                'aria-sort',
                isActiveSort ? (
                    sortDirection === 'asc' ? 'ascending' : 'descending'
                ) : 'none'
            );

            if (indicator) {
                indicator.textContent = isActiveSort ? (
                    sortDirection === 'asc' ? '▲' : '▼'
                ) : '↕';
            }
        });
    }

    function getSelectedFilterSelector(category, itemName) {
        if (category.itemFilterSelectors) {
            return category.itemFilterSelectors[itemName] || '';
        }

        return category.filterSelector || '';
    }

    function findNativeFilterButton(auctionRoot, selector) {
        if (!selector) {
            return null;
        }

        const icon = auctionRoot.querySelector(`.filterBar ${selector}`);

        return icon ? icon.closest('a.filter') : null;
    }

    function isNativeFilterActive(category, itemName, selector = '') {
        const auctionRoot = findAuctionRoot();
        const selectedSelector = selector || getSelectedFilterSelector(
            category,
            itemName
        );
        const filterButton = auctionRoot ? findNativeFilterButton(
            auctionRoot,
            selectedSelector
        ) : null;

        return Boolean(
            filterButton && filterButton.classList.contains('active')
        );
    }

    function getAuctionRows(auctionRoot) {
        const table = getNativeAuctionTable(auctionRoot);

        if (!table) {
            return [];
        }

        return Array.from(
            table.querySelectorAll(':scope > tbody > tr')
        ).filter(row => {
            if (row.classList.contains('ng-hide')) {
                return false;
            }

            if (row.hidden) {
                return false;
            }

            if (row.getAttribute('aria-hidden') === 'true') {
                return false;
            }

            return Boolean(row.querySelector('td'));
        });
    }

    function getRowItemName(row) {
        const cells = row.querySelectorAll(':scope > td');

        if (cells.length < 2) {
            return '';
        }

        const translatedName = cells[1].querySelector('span[translate]');

        return (translatedName || cells[1]).textContent.trim();
    }

    function getRowItemIcon(row) {
        return row.querySelector(
            'td.item i.heroItem[auction-id], ' +
            'td.item i.heroItem'
        );
    }

    function getCurrentPageNumber(auctionRoot) {
        const disabledNumbers = Array.from(
            auctionRoot.querySelectorAll(
                '.tg-pagination li.number.disabled a'
            )
        );

        const currentPage = disabledNumbers.find(link => {
            return /^\d+$/.test(link.textContent.trim());
        });

        const pageNumber = currentPage ? Number.parseInt(
            currentPage.textContent.trim(),
            10
        ) : Number.NaN;

        return Number.isFinite(pageNumber) ? pageNumber : 1;
    }

    function getAuctionRowsSignature(auctionRoot) {
        if (!auctionRoot) {
            return 'missing';
        }

        return getAuctionRows(auctionRoot).map(row => {
            const icon = getRowItemIcon(row);
            const auctionId = icon ? (
                icon.getAttribute('auction-id') || ''
            ) : '';

            return `${auctionId}:${normalizeItemName(getRowItemName(row))}`;
        }).join('|');
    }

    function isDisabledControl(control) {
        if (!control) {
            return true;
        }

        if (control.classList.contains('disabled')) {
            return true;
        }

        const icon = control.querySelector('i');

        return Boolean(icon && icon.classList.contains('disabled'));
    }

    async function waitForCondition(test, timeout) {
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeout) {
            if (test()) {
                return true;
            }

            await delay(75);
        }

        return false;
    }

    async function waitForAuctionRows(
        previousRowsSignature,
        token,
        options = {}
    ) {
        const {
            requireChange = true,
            allowEmpty = false,
            timeout = PAGE_CHANGE_TIMEOUT,
            previousPage = null
        } = options;
        const startedAt = Date.now();
        let readySince = 0;

        while (Date.now() - startedAt < timeout) {
            if (token !== scanToken) {
                return true;
            }

            const auctionRoot = findAuctionRoot();

            if (auctionRoot) {
                const rows = getAuctionRows(auctionRoot);
                const rowsSignature = getAuctionRowsSignature(auctionRoot);
                const rowsReady = rows.length > 0 && rows.every(row => {
                    const icon = getRowItemIcon(row);

                    return Boolean(
                        icon && icon.getAttribute('auction-id')
                    );
                });
                const tableReady = rowsReady ||
                    (allowEmpty && rows.length === 0);
                const pageChanged = Number.isFinite(previousPage) ?
                    getCurrentPageNumber(auctionRoot) !== previousPage :
                    rowsSignature !== previousRowsSignature;
                const isCandidate = (!requireChange || pageChanged) &&
                    tableReady;

                /*
                 * Moving the pointer makes Travian add and remove tooltip DOM.
                 * Its row markup can briefly change while a page is loading,
                 * so waiting for an unchanged row signature stalled navigation.
                 * The native page number is stable and is the reliable signal.
                 */
                if (isCandidate) {
                    if (!readySince) {
                        readySince = Date.now();
                    } else if (Date.now() - readySince >= PAGE_SETTLE_TIME) {
                        return true;
                    }
                } else {
                    readySince = 0;
                }
            }

            await delay(PAGE_POLL_INTERVAL);
        }

        return false;
    }

    async function clickPaginationControl(
        control,
        previousRowsSignature,
        token
    ) {
        if (!control || isDisabledControl(control)) {
            return false;
        }

        const auctionRoot = findAuctionRoot();
        const previousPage = auctionRoot ?
            getCurrentPageNumber(auctionRoot) :
            null;

        control.click();

        return waitForAuctionRows(
            previousRowsSignature,
            token,
            {
                requireChange: true,
                allowEmpty: false,
                previousPage
            }
        );
    }

    async function applyNativeCategoryFilter(
        category,
        itemName,
        token
    ) {
        const auctionRoot = findAuctionRoot();

        if (!auctionRoot) {
            throw new Error('Auction House Buy tab is not available.');
        }

        const selector = getSelectedFilterSelector(category, itemName);

        if (!selector) {
            throw new Error('Choose a specific item first.');
        }

        const filterButton = findNativeFilterButton(
            auctionRoot,
            selector
        );

        if (!filterButton) {
            throw new Error('The selected Travian item filter was not found.');
        }

        if (filterButton.classList.contains('active')) {
            const rowsReady = await waitForAuctionRows('', token, {
                requireChange: false,
                allowEmpty: true,
                timeout: 1200
            });

            if (token !== scanToken) {
                return '';
            }

            if (
                !rowsReady ||
                !isNativeFilterActive(category, itemName, selector)
            ) {
                throw new Error(
                    'Travian did not finish applying the selected item filter.'
                );
            }

            return selector;
        }

        const previousRowsSignature = getAuctionRowsSignature(auctionRoot);
        filterButton.click();
        await delay(180);

        if (token !== scanToken) {
            return '';
        }

        const filterActivated = await waitForCondition(() => {
            if (token !== scanToken) {
                return true;
            }

            const currentRoot = findAuctionRoot();
            const currentButton = currentRoot ? findNativeFilterButton(
                currentRoot,
                selector
            ) : null;

            return Boolean(
                currentButton && currentButton.classList.contains('active')
            );
        }, 1600);

        if (token === scanToken && !filterActivated) {
            throw new Error('The selected Travian item type did not activate.');
        }

        if (token !== scanToken) {
            return '';
        }

        let rowsReady = await waitForAuctionRows(
            previousRowsSignature,
            token,
            {
                requireChange: true,
                allowEmpty: true
            }
        );

        if (!rowsReady && token === scanToken) {
            rowsReady = await waitForAuctionRows('', token, {
                requireChange: false,
                allowEmpty: true,
                timeout: 1500
            });
        }

        if (token !== scanToken) {
            return '';
        }

        if (
            !rowsReady ||
            !isNativeFilterActive(category, itemName, selector)
        ) {
            throw new Error(
                'Travian did not finish applying the selected item filter.'
            );
        }

        return selector;
    }

    async function moveToFirstPage(token) {
        const auctionRoot = findAuctionRoot();

        if (!auctionRoot) {
            return;
        }

        const firstPage = auctionRoot.querySelector(
            '.tg-pagination .firstPage'
        );

        if (!firstPage || isDisabledControl(firstPage)) {
            return;
        }

        await clickPaginationControl(
            firstPage,
            getAuctionRowsSignature(auctionRoot),
            token
        );
    }

    function getQuantityText(descriptionCell, itemName) {
        if (!descriptionCell) {
            return '1';
        }

        const fullText = descriptionCell.textContent
            .replace(/\s+/g, ' ')
            .trim();

        if (!fullText) {
            return '1';
        }

        const itemPosition = fullText.toLowerCase().indexOf(
            itemName.toLowerCase()
        );

        const remainder = itemPosition >= 0 ? (
            fullText.slice(0, itemPosition) +
            fullText.slice(itemPosition + itemName.length)
        ).trim() : '';

        const quantityMatch = remainder.match(/\d[\d.,]*/);

        return quantityMatch ? quantityMatch[0] : '1';
    }

    function readAuctionRow(row, pageNumber) {
        const cells = row.querySelectorAll(':scope > td');
        const icon = getRowItemIcon(row);
        const auctionId = icon ? icon.getAttribute('auction-id') : '';

        if (!auctionId || cells.length < 5) {
            return null;
        }

        const itemName = getRowItemName(row);
        const countdown = row.querySelector('[countdown]');
        const endSeconds = countdown ? parseInteger(
            countdown.getAttribute('countdown')
        ) : 0;

        return {
            auctionId,
            pageNumber,
            itemName,
            quantity: getQuantityText(cells[1], itemName),
            endTime: endSeconds > 0 ? endSeconds * 1000 : 0,
            remainingText: countdown ? countdown.textContent.trim() : '',
            bids: parseInteger(cells[3] ? cells[3].textContent : ''),
            price: parseInteger(
                row.querySelector('td.price')?.textContent ||
                (cells[4] ? cells[4].textContent : '')
            ),
            itemClasses: Array.from(icon.classList).filter(className => {
                return className === 'heroItem' ||
                    className.startsWith('item_category_');
            })
        };
    }

    function formatNumber(value) {
        if (!Number.isFinite(value)) {
            return '—';
        }

        return new Intl.NumberFormat().format(value);
    }

    function formatRemainingTime(result) {
        if (!result.endTime) {
            return result.remainingText || 'Unknown';
        }

        const totalSeconds = Math.max(
            0,
            Math.floor((result.endTime - Date.now()) / 1000)
        );

        if (!totalSeconds) {
            return 'Ended';
        }

        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const clock = [hours, minutes, seconds]
            .map(value => String(value).padStart(2, '0'))
            .join(':');

        return days ? `${days}d ${clock}` : clock;
    }

    function createResultRow(result) {
        const row = document.createElement('tr');
        row.dataset.auctionId = result.auctionId;

        const itemCell = document.createElement('td');
        const itemWrapper = document.createElement('div');
        const iconWrapper = document.createElement('span');
        const icon = document.createElement('i');
        const itemCopy = document.createElement('span');
        const itemName = document.createElement('span');

        itemWrapper.className = 'qol-auction-item-cell';
        iconWrapper.className = 'qol-auction-item-icon';
        icon.className = result.itemClasses.join(' ');
        itemCopy.className = 'qol-auction-item-copy';
        itemName.className = 'qol-auction-item-name';
        itemName.textContent = result.itemName;

        iconWrapper.appendChild(icon);
        itemCopy.appendChild(itemName);
        itemWrapper.append(iconWrapper, itemCopy);
        itemCell.appendChild(itemWrapper);

        const quantityCell = document.createElement('td');
        quantityCell.textContent = result.quantity;

        const timeCell = document.createElement('td');
        timeCell.className = 'qol-auction-time';
        timeCell.dataset.end = String(result.endTime || 0);
        timeCell.textContent = formatRemainingTime(result);
        timeCell.dataset.expired = String(timeCell.textContent === 'Ended');

        const bidsCell = document.createElement('td');
        bidsCell.textContent = formatNumber(result.bids);

        const priceCell = document.createElement('td');
        const price = document.createElement('span');
        const silver = document.createElement('i');
        price.className = 'qol-auction-price';
        silver.className = 'unit_silver_small_illu';
        price.append(
            document.createTextNode(formatNumber(result.price)),
            silver
        );
        priceCell.appendChild(price);

        const actionCell = document.createElement('td');
        const viewButton = document.createElement('div');
        viewButton.className =
            'qol-auction-action-btn qol-auction-view-button';
        viewButton.setAttribute('role', 'button');
        viewButton.setAttribute('tabindex', isBusy ? '-1' : '0');
        viewButton.setAttribute('aria-disabled', String(isBusy));
        viewButton.textContent = 'View';
        viewButton.classList.toggle('disabled', isBusy);
        viewButton.addEventListener('click', () => {
            openNativeAuction(result);
        });
        viewButton.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }

            event.preventDefault();
            openNativeAuction(result);
        });
        actionCell.appendChild(viewButton);

        row.append(
            itemCell,
            quantityCell,
            timeCell,
            bidsCell,
            priceCell,
            actionCell
        );

        return row;
    }

    function renderResults() {
        const resultsElement = document.getElementById(RESULTS_ID);
        const titleElement = document.getElementById(RESULTS_TITLE_ID);
        const countElement = document.getElementById(RESULTS_COUNT_ID);
        const bodyElement = document.getElementById(RESULTS_BODY_ID);
        const emptyElement = document.getElementById(EMPTY_ID);

        if (
            !resultsElement ||
            !titleElement ||
            !countElement ||
            !bodyElement ||
            !emptyElement
        ) {
            return;
        }

        bodyElement.replaceChildren(
            ...getSortedResults().map(createResultRow)
        );

        updateSortHeaders();

        resultsElement.dataset.visible = String(hasScanned);
        titleElement.textContent = selectedItem ?
            `All ${selectedItem} listings` :
            'Matching listings';
        countElement.textContent = `${results.length} ${
            results.length === 1 ? 'listing' : 'listings'
        }`;
        emptyElement.dataset.visible = String(
            hasScanned && results.length === 0
        );
    }

    function updateRemainingTimes() {
        document.querySelectorAll(
            `#${PANEL_ID} .qol-auction-time[data-end]`
        ).forEach(element => {
            const result = {
                endTime: Number(element.dataset.end),
                remainingText: element.textContent
            };
            const remainingTime = formatRemainingTime(result);
            element.textContent = remainingTime;
            element.dataset.expired = String(remainingTime === 'Ended');
        });
    }

    async function scanAuctionPages(
        category,
        itemName,
        filterSelector,
        token
    ) {
        const wantedName = normalizeItemName(itemName);
        const visitedSignatures = new Set();
        const foundListings = new Map();
        let pagesScanned = 0;

        if (!isNativeFilterActive(category, itemName, filterSelector)) {
            throw new Error(
                'The selected Travian item filter is not active. Scan stopped.'
            );
        }

        await moveToFirstPage(token);

        for (
            let pageCount = 0;
            pageCount < MAX_PAGES_TO_SCAN;
            pageCount += 1
        ) {
            if (token !== scanToken || !isFeatureEnabled()) {
                return {
                    cancelled: true,
                    pagesScanned
                };
            }

            const auctionRoot = findAuctionRoot();

            if (!auctionRoot) {
                throw new Error('Auction House closed during the scan.');
            }

            if (!isNativeFilterActive(
                category,
                itemName,
                filterSelector
            )) {
                throw new Error(
                    'Travian changed the selected item filter. Scan stopped.'
                );
            }

            const signature = getAuctionRowsSignature(auctionRoot);

            if (visitedSignatures.has(signature)) {
                break;
            }

            visitedSignatures.add(signature);
            pagesScanned += 1;

            const pageNumber = getCurrentPageNumber(auctionRoot);
            const matchingListings = getAuctionRows(auctionRoot)
                .filter(row => {
                    return normalizeItemName(getRowItemName(row)) === wantedName;
                })
                .map(row => {
                    return readAuctionRow(row, pageNumber);
                })
                .filter(Boolean);

            matchingListings.forEach(listing => {
                if (!foundListings.has(listing.auctionId)) {
                    foundListings.set(listing.auctionId, listing);
                }
            });

            results = Array.from(foundListings.values());
            hasScanned = true;
            renderResults();

            setStatus(
                `Scanned page ${pageNumber}. Found ${foundListings.size} ${
                    foundListings.size === 1 ? 'copy' : 'copies'
                } so far…`,
                'scanning'
            );

            const nextPage = auctionRoot.querySelector(
                '.tg-pagination .nextPage'
            );

            if (!nextPage || isDisabledControl(nextPage)) {
                break;
            }

            const pageChanged = await clickPaginationControl(
                nextPage,
                signature,
                token
            );

            if (token !== scanToken) {
                return {
                    cancelled: true,
                    pagesScanned
                };
            }

            if (!pageChanged) {
                throw new Error(
                    'The Auction House did not load the next page.'
                );
            }
        }

        results = Array.from(foundListings.values());
        hasScanned = true;
        renderResults();
        await moveToFirstPage(token);

        return {
            cancelled: token !== scanToken,
            pagesScanned
        };
    }

    async function startScan() {
        if (isBusy) {
            return;
        }

        const typeSelect = document.getElementById(TYPE_SELECT_ID);
        const itemSelect = document.getElementById(ITEM_SELECT_ID);

        if (!typeSelect || !itemSelect) {
            return;
        }

        selectedCategory = typeSelect.value;
        selectedItem = itemSelect.value;

        if (!selectedCategory) {
            setStatus('Choose an item type first.', 'error');
            typeSelect.focus();
            return;
        }

        if (!selectedItem) {
            setStatus('Choose an exact item first.', 'error');
            itemSelect.focus();
            return;
        }

        const category = CATEGORY_CONFIG[selectedCategory];

        cancelActiveOperation();
        results = [];
        hasScanned = false;
        renderResults();

        const token = scanToken;
        setBusy(true);
        setStatus(
            `Opening ${category.label.toLowerCase()}…`,
            'scanning'
        );

        try {
            const appliedFilterSelector = await applyNativeCategoryFilter(
                category,
                selectedItem,
                token
            );

            if (token !== scanToken) {
                return;
            }

            if (!isNativeFilterActive(
                category,
                selectedItem,
                appliedFilterSelector
            )) {
                throw new Error(
                    'The selected Travian item filter is not active. ' +
                    'Scan was not started.'
                );
            }

            const outcome = await scanAuctionPages(
                category,
                selectedItem,
                appliedFilterSelector,
                token
            );

            if (token !== scanToken || outcome.cancelled) {
                return;
            }

            const pageWord = outcome.pagesScanned === 1 ?
                'page' :
                'pages';

            if (!results.length) {
                setStatus(
                    `No ${selectedItem} is currently listed across ${
                        outcome.pagesScanned
                    } ${pageWord}.`,
                    'empty'
                );
            } else {
                setStatus(
                    `Found ${results.length} ${
                        results.length === 1 ? 'copy' : 'copies'
                    } across ${outcome.pagesScanned} ${pageWord}. ` +
                    'They are all displayed together above Travian\'s table.',
                    'success'
                );
            }
        } catch (error) {
            if (token === scanToken) {
                console.error('[APES Auction House Scanner]', error);
                setStatus(
                    error?.message ||
                    'The scan could not finish. Reopen the Buy tab and try again.',
                    'error'
                );
            }
        } finally {
            if (token === scanToken) {
                setBusy(false);
            }
        }
    }

    function findAuctionRowById(auctionRoot, auctionId) {
        return getAuctionRows(auctionRoot).find(row => {
            const icon = getRowItemIcon(row);

            return icon &&
                icon.getAttribute('auction-id') === String(auctionId);
        }) || null;
    }

    function clearNativeAuctionHighlights(auctionRoot = findAuctionRoot()) {
        if (!auctionRoot) {
            return;
        }

        auctionRoot.querySelectorAll(
            'tr.qol-auction-native-highlight'
        ).forEach(row => {
            row.classList.remove('qol-auction-native-highlight');
        });
    }

    async function openNativeAuction(result) {
        if (isBusy) {
            return;
        }

        const category = CATEGORY_CONFIG[selectedCategory];

        if (!category || !findAuctionRoot()) {
            setStatus(
                'The Auction House is no longer open. Reopen its Buy tab.',
                'error'
            );
            return;
        }

        cancelActiveOperation();

        const token = scanToken;
        setBusy(true);
        setStatus(
            `Opening auction #${result.auctionId}…`,
            'scanning'
        );

        try {
            await applyNativeCategoryFilter(
                category,
                selectedItem,
                token
            );

            if (token !== scanToken) {
                return;
            }

            await moveToFirstPage(token);

            const visitedSignatures = new Set();

            for (
                let pageCount = 0;
                pageCount < MAX_PAGES_TO_SCAN;
                pageCount += 1
            ) {
                if (token !== scanToken) {
                    return;
                }

                const auctionRoot = findAuctionRoot();

                if (!auctionRoot) {
                    throw new Error('The Auction House closed.');
                }

                const signature = getAuctionRowsSignature(auctionRoot);

                if (visitedSignatures.has(signature)) {
                    break;
                }

                visitedSignatures.add(signature);

                const nativeRow = findAuctionRowById(
                    auctionRoot,
                    result.auctionId
                );

                if (nativeRow) {
                    clearNativeAuctionHighlights(auctionRoot);
                    void nativeRow.offsetWidth;
                    nativeRow.classList.add('qol-auction-native-highlight');
                    nativeRow.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'nearest'
                    });

                    const focusTarget = nativeRow.querySelector(
                        'input.priceInput:not(:disabled)'
                    ) || nativeRow.querySelector(
                        '.bidButtonCol button:not(.disabled)'
                    );

                    if (focusTarget) {
                        setTimeout(() => {
                            focusTarget.focus();
                        }, 360);
                    }

                    setTimeout(() => {
                        nativeRow.classList.remove(
                            'qol-auction-native-highlight'
                        );
                    }, 7000);

                    setStatus(
                        'The selected auction is highlighted in bright ' +
                        'yellow in Travian\'s table below.',
                        'success'
                    );
                    return;
                }

                const nextPage = auctionRoot.querySelector(
                    '.tg-pagination .nextPage'
                );

                if (!nextPage || isDisabledControl(nextPage)) {
                    break;
                }

                setStatus(
                    `Looking for auction #${result.auctionId} on page ${
                        getCurrentPageNumber(auctionRoot) + 1
                    }…`,
                    'scanning'
                );

                const pageChanged = await clickPaginationControl(
                    nextPage,
                    signature,
                    token
                );

                if (!pageChanged) {
                    throw new Error('Travian did not load the next page.');
                }
            }

            setStatus(
                `Auction #${result.auctionId} is no longer available. ` +
                'Run a new scan.',
                'error'
            );
        } catch (error) {
            if (token === scanToken) {
                console.error('[APES Auction House Scanner]', error);
                setStatus(
                    error?.message ||
                    'The native auction could not be opened.',
                    'error'
                );
            }
        } finally {
            if (token === scanToken) {
                setBusy(false);
            }
        }
    }

    function handleSettingChange(event) {
        if (!event.detail || event.detail.key !== FEATURE_KEY) {
            return;
        }

        cancelActiveOperation();
        clearResults();

        if (event.detail.enabled) {
            queueEnsurePanel();
        } else {
            removePanel();
        }
    }

    function init() {
        injectStyles();
        ensurePanel();

        observer = new MutationObserver(queueEnsurePanel);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        window.addEventListener(
            'qol_setting_changed',
            handleSettingChange
        );
        window.addEventListener('hashchange', queueEnsurePanel);
        window.addEventListener('popstate', queueEnsurePanel);

        setInterval(updateRemainingTimes, 1000);

        console.log(
            '[APES Auction House Scanner] In-window item finder initialized.'
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, {
            once: true
        });
    } else {
        init();
    }
})();