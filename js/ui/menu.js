/**
 * APES QoL Extension
 * Unified Settings Menu + Responsive Toolbar
 */

const QOL_DEFAULT_DISABLED_FEATURES = new Set([
    'cpManager',
    'oasisScanner',
    'reportArchive',
    'watchlist'
]);

window.isQolEnabled = function(key) {
    try {
        const storedValue = localStorage.getItem(`qol_${key}`);
        if (storedValue !== null) return storedValue !== 'false';
        return !QOL_DEFAULT_DISABLED_FEATURES.has(key);
    } catch (_) {
        return !QOL_DEFAULT_DISABLED_FEATURES.has(key);
    }
};

window.getQolTheme = function() {
    return 'default';
};

window.applyQolTheme = function() {
    document.body?.removeAttribute('data-qol-theme');
};

const QOL_MENU_STYLE_ID = 'qol-menu-styles';
const QOL_TOOLBAR_DROPDOWN_ID = 'qol-toolbar-dropdown';
const QOL_BUTTON_SIZE = 30;
const QOL_BUTTON_GAP = 6;
const QOL_MAX_EXPANDED_TOOLBAR_ITEMS = 5;

const BASIC_FEATURES = [
    {
        id: 'qol-chk-auction-house-scanner',
        key: 'auctionHouseScanner',
        name: 'Auction House Scanner',
        icon: '⚖',
        description: 'Filters the Auction House and gathers matching listings from every page into one view.'
    },
    {
        id: 'qol-chk-checklists',
        key: 'checklists',
        name: 'Checklists',
        icon: '✓',
        description: 'Provides built-in and custom checklists for daily tasks, reminders and personal game goals.'
    },
    {
        id: 'qol-chk-building-alarm',
        key: 'buildingAlarm',
        name: 'Building Alarm',
        icon: '◷',
        description: 'Sounds a ding when a construction enters the free five-minute instant-finish window.'
    },
    {
        id: 'qol-chk-chat-silencer',
        key: 'chatSilencer',
        name: 'Chat Silencer',
        icon: '◉',
        description: 'Hides chat notification bubbles to keep the game screen clear of visual clutter.'
    },
    {
        id: 'qol-chk-igm-enhanced',
        key: 'igmEnhanced',
        name: 'IGM Enhancer',
        icon: '✉',
        description: 'Adds folders, filters and organization tools to in-game conversations.'
    },
    {
        id: 'qol-chk-resource-capacity-timer',
        key: 'resourceCapacityTimer',
        name: 'Resource Capacity Timer',
        icon: '⏱',
        description: 'Shows how long current production will take to fill storage, or how long negative production will take to empty it.'
    },
    {
        id: 'qol-chk-rally-parser',
        key: 'rallyPointParser',
        name: 'Rally Point Scanner',
        icon: '⚔',
        description: 'Scans attacks, sieges, raids, reinforcements and incoming resources from one tabbed window.'
    },
    {
        id: 'qol-chk-npc-calc',
        key: 'npcCalculator',
        name: 'NPC Calculator',
        icon: '◇',
        description: 'Calculates the resource distribution needed to train troops while minimizing NPC gold cost.'
    },
    {
        id: 'qol-chk-send-troops',
        key: 'sendTroopsEnhanced',
        name: 'Send Button Enhancer',
        icon: '➤',
        description: 'Keeps Continue, Back and Send fixed at the top while preparing multiple troop movements.'
    }
];

const ADVANCED_FEATURES = [
    {
        id: 'qol-chk-distance-calculator',
        key: 'distanceCalculator',
        name: 'Distance & Arrival Calculator',
        icon: '↗',
        description: 'Calculates route distance, travel duration, exact send times and server-time arrival for troops and merchants.'
    },
    {
        id: 'qol-chk-cp-manager',
        key: 'cpManager',
        name: 'CP Manager',
        icon: 'CP',
        description: 'Scans and plans Culture Points, expansion slots, Town Halls, celebrations and Artworks.'
    },
    {
        id: 'qol-chk-oasis-scanner',
        key: 'oasisScanner',
        name: 'Oasis Scanner',
        icon: '⌖',
        description: 'Records scanned oases, croppers and Natars and builds useful coordinate lists.'
    },
    {
        id: 'qol-chk-report-archive',
        key: 'reportArchive',
        name: 'Report Archive',
        icon: '▰',
        description: 'Preserves important reports in custom folders after the original game reports disappear.'
    },
    {
        id: 'qol-chk-watchlist',
        key: 'watchlist',
        name: 'Watchlists',
        icon: '◎',
        description: 'Saves and organizes players for quick access to profiles, hero data and tracking information.'
    }
];

const COSMETIC_FEATURES = [
    {
        id: 'qol-chk-visual-tribe-skins',
        key: 'visualTribeSkins',
        name: 'Visual Tribe Skin',
        icon: '♜',
        description: 'Changes village building artwork to the selected Roman, Teuton or Gaul style without affecting gameplay.'
    }
];

const KEYBINDS = [
    { keys: ['W', 'A', 'S', 'D'], label: 'Map Navigation (2x Speed)', fixed: true },
    { keys: ['1'], label: 'Village View', id: 'qol-chk-village', key: 'keybind_village' },
    { keys: ['2'], label: 'Resource Fields', id: 'qol-chk-resources', key: 'keybind_resources' },
    { keys: ['3'], label: 'World Map', id: 'qol-chk-map', key: 'keybind_map' },
    { keys: ['Q', '←'], label: 'Previous Village', id: 'qol-chk-previous-village', key: 'keybind_previousVillage' },
    { keys: ['E', '→'], label: 'Next Village', id: 'qol-chk-next-village', key: 'keybind_nextVillage' },
    { keys: ['T'], label: 'Rally Point', id: 'qol-chk-rally', key: 'keybind_rallyPoint' },
    { keys: ['R'], label: 'Send Troops to Hovered Tile', fixed: true },
    { keys: ['C'], label: 'Open Chat Window', id: 'qol-chk-convos', key: 'keybind_conversations' },
    { keys: ['F'], label: 'Reports', id: 'qol-chk-reports', key: 'keybind_reports' },
    { keys: ['V'], label: 'Villages Overview', id: 'qol-chk-overview', key: 'keybind_villagesOverview' },
    { keys: ['G'], label: 'Command Palette', id: 'qol-chk-command-palette', key: 'keybind_commandPalette' }
];

const TOOLBAR_ITEMS = [
    { id: 'qol-help-toggle-btn', label: 'Help', key: 'help' },
    { id: 'qol-rally-point-toggle-btn', label: 'Rally Point Scanner', key: 'rallyPointParser' },
    { id: 'qol-watchlist-toggle', label: 'Watchlists', key: 'watchlist' },
    { id: 'qol-checklist-toggle-btn', label: 'Checklists', key: 'checklists' },
    { id: 'qol-npc-calc-toggle-btn', label: 'NPC Calculator', key: 'npcCalculator' },
    { id: 'qol-distance-calc-toggle-btn', label: 'Distance & Arrival Calculator', key: 'distanceCalculator' },
    { id: 'qol-oasis-toggle-btn', label: 'Oasis Scanner', key: 'oasisScanner' },
    { id: 'qol-report-archive-toggle', label: 'Report Archive', key: 'reportArchive' },
    { id: 'qol-cp-toggle-btn', label: 'CP Manager', key: 'cpManager' },
    { id: 'qol-tribe-skins-toggle-btn', label: 'Visual Tribe Skin', key: 'visualTribeSkins' }
];

const menuConfigMap = Object.fromEntries([
    ...BASIC_FEATURES.map(feature => [feature.id, feature.key]),
    ...ADVANCED_FEATURES.map(feature => [feature.id, feature.key]),
    ...COSMETIC_FEATURES.map(feature => [feature.id, feature.key]),
    ...KEYBINDS.filter(item => !item.fixed).map(item => [item.id, item.key])
]);

const QOL_STORAGE_PREFIXES = ['qol_', 'apes_', 'restos_qol_'];
const QOL_PREFERENCE_STORAGE_KEYS = new Set(
    Object.values(menuConfigMap).map(key => `qol_${key}`)
);

let autoDismissActive = true;
let isRepositionScheduled = false;
let toolbarCollapsed = false;

setTimeout(() => {
    autoDismissActive = false;
}, 3000);

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function featureCardHtml(feature) {
    return `
        <article class="qol-feature-card" data-feature-key="${escapeHtml(feature.key)}">
            <span class="qol-feature-icon" aria-hidden="true">${escapeHtml(feature.icon)}</span>
            <div class="qol-feature-copy">
                <h3 class="qol-feature-name">${escapeHtml(feature.name)}</h3>
                <p class="qol-feature-desc">${escapeHtml(feature.description)}</p>
            </div>
            <label class="qol-switch" title="Toggle ${escapeHtml(feature.name)}">
                <input type="checkbox" id="${escapeHtml(feature.id)}" class="qol-checkbox">
                <span class="qol-switch-track" aria-hidden="true"></span>
                <span class="qol-visually-hidden">Toggle ${escapeHtml(feature.name)}</span>
            </label>
        </article>
    `;
}

function keybindHtml(item) {
    const keys = item.keys.map(key => `<span class="qol-kbd">${escapeHtml(key)}</span>`).join('');
    const state = item.fixed
        ? '<span class="qol-fixed-state">Fixed</span>'
        : `
            <label class="qol-switch" title="Toggle ${escapeHtml(item.label)} shortcut">
                <input type="checkbox" id="${escapeHtml(item.id)}" class="qol-checkbox">
                <span class="qol-switch-track" aria-hidden="true"></span>
                <span class="qol-visually-hidden">Toggle ${escapeHtml(item.label)} shortcut</span>
            </label>
        `;

    return `
        <div class="qol-keybind-item">
            <div class="qol-key-combo">${keys}</div>
            <span class="qol-keybind-action">${escapeHtml(item.label)}</span>
            ${state}
        </div>
    `;
}

function injectQolMenuStyles() {
    if (document.getElementById(QOL_MENU_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = QOL_MENU_STYLE_ID;
    style.textContent = `
        #qol-cog-btn{position:fixed!important;width:30px!important;height:30px!important;display:none;align-items:center!important;justify-content:center!important;margin:0!important;padding:0!important;border:2px solid #7d6342!important;border-radius:50%!important;background:#ebdcb9!important;box-shadow:0 2px 4px rgba(0,0,0,.22)!important;cursor:pointer!important;user-select:none!important;box-sizing:border-box!important;z-index:9999!important}
        #qol-cog-btn:hover{transform:scale(1.08)!important;background:#f7f5f0!important}
        #qol-cog-btn svg{width:16px!important;height:16px!important;fill:#7d6342!important;pointer-events:none!important}
        body.qol-toolbar-collapsed #qol-cog-btn::after{content:'▾'!important;position:absolute!important;right:-3px!important;bottom:-4px!important;display:flex!important;align-items:center!important;justify-content:center!important;width:12px!important;height:12px!important;border:1px solid #7d6342!important;border-radius:50%!important;background:#f7f5f0!important;color:#6a5034!important;font-size:8px!important;line-height:1!important}

        body.qol-toolbar-collapsed #qol-help-toggle-btn,
        body.qol-toolbar-collapsed #qol-rally-point-toggle-btn,
        body.qol-toolbar-collapsed #qol-watchlist-toggle,
        body.qol-toolbar-collapsed #qol-checklist-toggle-btn,
        body.qol-toolbar-collapsed #qol-npc-calc-toggle-btn,
        body.qol-toolbar-collapsed #qol-distance-calc-toggle-btn,
        body.qol-toolbar-collapsed #qol-oasis-toggle-btn,
        body.qol-toolbar-collapsed #qol-report-archive-toggle,
        body.qol-toolbar-collapsed #qol-cp-toggle-btn,
        body.qol-toolbar-collapsed #qol-tribe-skins-toggle-btn{visibility:hidden!important;opacity:0!important;pointer-events:none!important}

        #${QOL_TOOLBAR_DROPDOWN_ID}{position:fixed!important;display:none!important;flex-direction:column!important;min-width:220px!important;max-width:min(300px,88vw)!important;max-height:min(520px,80vh)!important;overflow-y:auto!important;padding:5px!important;border:2px solid #634d31!important;border-radius:5px!important;background:#f7f5f0!important;box-shadow:0 10px 26px rgba(0,0,0,.38)!important;z-index:1000001!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important}
        #${QOL_TOOLBAR_DROPDOWN_ID}.qol-open{display:flex!important}
        #${QOL_TOOLBAR_DROPDOWN_ID} .qol-toolbar-menu-title{padding:6px 8px!important;color:#806b50!important;font-size:9px!important;font-weight:bold!important;text-transform:uppercase!important;letter-spacing:.35px!important}
        #${QOL_TOOLBAR_DROPDOWN_ID} .qol-toolbar-menu-item{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;min-height:30px!important;padding:6px 8px!important;border-radius:3px!important;color:#4b3822!important;font-size:10px!important;font-weight:bold!important;cursor:pointer!important;user-select:none!important}
        #${QOL_TOOLBAR_DROPDOWN_ID} .qol-toolbar-menu-item:hover{background:#ebdfcb!important}
        #${QOL_TOOLBAR_DROPDOWN_ID} .qol-toolbar-menu-item.settings{margin-top:4px!important;border-top:1px solid #d7c9b4!important;border-radius:0 0 3px 3px!important;padding-top:9px!important}
        #${QOL_TOOLBAR_DROPDOWN_ID} .qol-toolbar-menu-arrow{color:#967d5b!important;font-size:11px!important}

        #qol-modal-overlay{position:fixed!important;inset:0!important;display:none;align-items:center!important;justify-content:center!important;padding:24px!important;background:rgba(18,16,13,.76)!important;box-sizing:border-box!important;z-index:1000000!important}
        #qol-modal,#qol-modal *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
        #qol-modal{display:flex!important;flex-direction:column!important;width:min(920px,94vw)!important;max-height:min(860px,92vh)!important;margin:0!important;padding:0!important;border:3px solid #634d31!important;border-radius:7px!important;background:#f7f5f0!important;color:#332719!important;box-shadow:0 24px 64px rgba(0,0,0,.52)!important;overflow:hidden!important}
        #qol-modal .qol-modal-header{display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 auto!important;min-height:66px!important;padding:10px 12px 10px 14px!important;border-bottom:1px solid #3f2d19!important;background:linear-gradient(to bottom,#6d5436,#4f3b24)!important;color:#f8f0df!important}
        #qol-modal .qol-modal-title-group{display:flex!important;align-items:center!important;gap:11px!important;min-width:0!important}
        #qol-modal .qol-brand-mark{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:40px!important;height:40px!important;border:1px solid rgba(255,255,255,.2)!important;border-radius:8px!important;background:rgba(24,15,8,.24)!important;font-size:23px!important}
        #qol-modal .qol-title-copy{display:flex!important;flex-direction:column!important;gap:2px!important;min-width:0!important}
        #qol-modal .qol-title-line{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important}
        #qol-modal .qol-modal-title{color:#fffaf0!important;font-size:15px!important;font-weight:700!important}
        #qol-modal .qol-version-badge{display:inline-flex!important;align-items:center!important;padding:1px 7px!important;border:1px solid rgba(255,255,255,.2)!important;border-radius:10px!important;background:rgba(0,0,0,.18)!important;color:#e9dcc3!important;font-size:9px!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.45px!important}
        #qol-modal .qol-modal-subtitle{color:#d7c8ad!important;font-size:10px!important;line-height:15px!important}
        #qol-modal .qol-modal-close{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;border-radius:5px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;font-size:23px!important;font-weight:bold!important;cursor:pointer!important}
        #qol-modal .qol-modal-close:hover{background:rgba(255,255,255,.15)!important}
        #qol-modal .qol-modal-body{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;min-height:0!important;padding:16px!important;background:#f7f5f0!important;overflow-y:auto!important}
        #qol-modal .qol-keybind-heading{order:1!important}
        #qol-modal .qol-keybind-grid{order:2!important}
        #qol-modal .qol-basic-heading{order:3!important}
        #qol-modal #qol-basic-feature-grid{order:4!important}
        #qol-modal .qol-advanced-heading{order:5!important}
        #qol-modal #qol-advanced-feature-grid{order:6!important}
        #qol-modal .qol-cosmetic-heading{order:7!important}
        #qol-modal #qol-cosmetic-feature-grid{order:8!important}
        #qol-modal .qol-section-heading{display:flex!important;align-items:flex-end!important;justify-content:space-between!important;gap:14px!important;margin:0 0 9px!important}
        #qol-modal .qol-section-heading:not(:first-child){margin-top:20px!important}
        #qol-modal .qol-section-title-group{display:flex!important;flex-direction:column!important;gap:2px!important;min-width:0!important}
        #qol-modal .qol-section-title{margin:0!important;color:#4f3b24!important;font-size:13px!important;font-weight:700!important;line-height:18px!important}
        #qol-modal .qol-section-caption{color:#7a6a55!important;font-size:10px!important;line-height:15px!important}
        #qol-modal .qol-section-count{flex:0 0 auto!important;padding:2px 8px!important;border:1px solid #d4c2a5!important;border-radius:10px!important;background:#fffaf0!important;color:#6d5436!important;font-size:9px!important;font-weight:700!important;text-transform:uppercase!important}

        #qol-modal .qol-keybind-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important}
        #qol-modal .qol-keybind-item{display:grid!important;grid-template-columns:minmax(56px,auto) minmax(0,1fr) 40px!important;align-items:center!important;gap:8px!important;min-height:48px!important;padding:7px 8px!important;border:1px solid #d9cebd!important;border-radius:4px!important;background:#fff!important}
        #qol-modal .qol-keybind-item:hover{border-color:#baa88c!important;background:#fffaf0!important}
        #qol-modal .qol-key-combo{display:flex!important;align-items:center!important;flex-wrap:wrap!important;gap:3px!important;min-width:0!important}
        #qol-modal .qol-kbd{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:23px!important;height:23px!important;padding:0 5px!important;border:1px solid #9c8668!important;border-bottom-width:2px!important;border-radius:4px!important;background:linear-gradient(to bottom,#fffefb,#eee5d7)!important;color:#4c3822!important;font-family:Consolas,Monaco,monospace!important;font-size:10px!important;font-weight:700!important}
        #qol-modal .qol-keybind-action{min-width:0!important;color:#554733!important;font-size:9.5px!important;font-weight:600!important;line-height:1.35!important}
        #qol-modal .qol-fixed-state{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:40px!important;min-height:19px!important;padding:1px 5px!important;border:1px solid #d0c4b1!important;border-radius:9px!important;background:#f1ece3!important;color:#81725e!important;font-size:8px!important;font-weight:700!important;text-transform:uppercase!important}

        #qol-modal .qol-feature-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}
        #qol-modal .qol-feature-card{position:relative!important;display:grid!important;grid-template-columns:34px minmax(0,1fr) 40px!important;align-items:start!important;gap:9px!important;min-height:88px!important;padding:11px!important;border:1px solid #d6cab8!important;border-radius:5px!important;background:#fff!important;box-shadow:0 1px 2px rgba(72,51,29,.06)!important}
        #qol-modal .qol-feature-card:hover{border-color:#b9a589!important;box-shadow:0 4px 12px rgba(72,51,29,.1)!important}
        #qol-modal .qol-feature-icon{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:34px!important;height:34px!important;border:1px solid #d7c7ad!important;border-radius:6px!important;background:linear-gradient(to bottom,#fffaf0,#eee5d6)!important;color:#654c30!important;font-size:15px!important;font-weight:700!important}
        #qol-modal .qol-feature-copy{display:flex!important;flex-direction:column!important;gap:3px!important;min-width:0!important}
        #qol-modal .qol-feature-name{margin:0!important;color:#3f3020!important;font-size:11px!important;font-weight:700!important;line-height:16px!important}
        #qol-modal .qol-feature-desc{margin:0!important;color:#746653!important;font-size:9.5px!important;line-height:1.42!important}

        #qol-modal .qol-switch{position:relative!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;align-self:start!important;width:40px!important;height:24px!important;margin:4px 0 0!important;cursor:pointer!important;user-select:none!important}
        #qol-modal .qol-keybind-item .qol-switch{margin-top:0!important}
        #qol-modal .qol-checkbox{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}
        #qol-modal .qol-switch-track{position:relative!important;display:block!important;width:36px!important;height:20px!important;border:1px solid #a9977c!important;border-radius:12px!important;background:#d8cdbb!important;box-shadow:inset 0 1px 2px rgba(73,53,32,.16)!important}
        #qol-modal .qol-switch-track::after{content:''!important;position:absolute!important;top:2px!important;left:2px!important;width:14px!important;height:14px!important;border-radius:50%!important;background:#fff!important;box-shadow:0 1px 3px rgba(45,30,16,.32)!important;transition:transform .16s ease!important}
        #qol-modal .qol-checkbox:checked + .qol-switch-track{border-color:#4f6e25!important;background:#6f9b34!important}
        #qol-modal .qol-checkbox:checked + .qol-switch-track::after{transform:translateX(16px)!important}

        #qol-modal .qol-modal-footer{display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 auto!important;min-height:36px!important;padding:7px 14px!important;border-top:1px solid #d8ccba!important;background:#eee8dc!important;color:#71634f!important;font-size:9px!important}
        #qol-modal .qol-footer-left{display:inline-flex!important;align-items:center!important;gap:10px!important;flex-wrap:wrap!important}
        #qol-modal .qol-save-note{display:inline-flex!important;align-items:center!important;gap:6px!important}
        #qol-modal .qol-save-dot{width:7px!important;height:7px!important;border-radius:50%!important;background:#6f9b34!important}
        #qol-modal .qol-footer-hint{color:#8b7a62!important}
        #qol-modal .qol-clear-cache-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:24px!important;padding:3px 9px!important;border:1px solid #9d8768!important;border-radius:4px!important;background:#fffdf8!important;color:#5b472f!important;font-size:9px!important;font-weight:700!important;cursor:pointer!important}
        #qol-modal .qol-clear-cache-btn:hover{border-color:#765b39!important;background:#eee4d4!important}

        #qol-modal-overlay .qol-cache-dialog-layer{position:fixed!important;inset:0!important;display:none!important;align-items:center!important;justify-content:center!important;padding:24px!important;background:rgba(18,16,13,.62)!important;z-index:1000002!important}
        #qol-modal-overlay .qol-cache-dialog-layer.qol-open{display:flex!important}
        #qol-modal-overlay .qol-cache-dialog{width:min(430px,92vw)!important;border:2px solid #634d31!important;border-radius:6px!important;background:#f7f5f0!important;box-shadow:0 18px 48px rgba(0,0,0,.46)!important;overflow:hidden!important}
        #qol-modal-overlay .qol-cache-dialog-header{padding:12px 14px!important;border-bottom:1px solid #3f2d19!important;background:linear-gradient(to bottom,#6d5436,#4f3b24)!important;color:#fffaf0!important;font-size:13px!important;font-weight:700!important}
        #qol-modal-overlay .qol-cache-dialog-body{padding:14px!important;color:#665744!important;font-size:10px!important;line-height:1.55!important}
        #qol-modal-overlay .qol-cache-dialog-status{min-height:16px!important;margin-top:8px!important;color:#8f3f2f!important;font-size:9px!important;font-weight:700!important}
        #qol-modal-overlay .qol-cache-dialog-actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:8px!important;padding:10px 14px!important;border-top:1px solid #d8ccba!important;background:#eee8dc!important}
        #qol-modal-overlay .qol-cache-dialog-action{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:28px!important;padding:5px 12px!important;border:1px solid #aa987b!important;border-radius:4px!important;background:#fffaf0!important;color:#5e4a33!important;font-size:9px!important;font-weight:700!important;cursor:pointer!important}
        #qol-modal-overlay .qol-cache-dialog-action.qol-danger{border-color:#9c5438!important;background:#9b4d36!important;color:#fff!important}
        #qol-modal-overlay .qol-cache-dialog-action[aria-disabled="true"]{opacity:.58!important;pointer-events:none!important;cursor:wait!important}

        #qol-modal .qol-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;border:0!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important}

        @media(max-width:820px){#qol-modal-overlay{padding:12px!important}#qol-modal{width:96vw!important;max-height:94vh!important}#qol-modal .qol-feature-grid{grid-template-columns:1fr!important}#qol-modal .qol-keybind-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
        @media(max-width:560px){#qol-modal .qol-brand-mark,#qol-modal .qol-modal-subtitle,#qol-modal .qol-footer-hint{display:none!important}#qol-modal .qol-modal-body{padding:11px!important}#qol-modal .qol-keybind-grid{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(style);
}

function cleanWelcomeScreenUrl() {
    if (!autoDismissActive) return;
    const url = window.location.href;
    if (!url.includes('window:welcomeScreen')) return;

    const cleanUrl = url
        .replace(/([;&?])window:welcomeScreen([;&?]?)/g, (match, p1, p2) => {
            if (p1 === '?' || p1 === '&') return p1 === '?' && p2 === '&' ? '?' : '';
            return ';';
        })
        .replace(/;#/g, '#')
        .replace(/;+/g, ';')
        .replace(/;$/, '')
        .replace(/#$/, '');

    if (cleanUrl !== url) window.history.replaceState(null, '', cleanUrl);
}

function dismissWelcomeScreenDOM() {
    if (!autoDismissActive) return false;

    const candidates = document.querySelectorAll('.dialog,.modal,.window,.popup,header,h1,h2,h3,h4,[class*="welcome"]');
    for (const element of candidates) {
        if (!element.textContent?.includes('Welcome back')) continue;
        const container = element.closest('.dialog,.modal,.window,.popup,div') || element.parentElement;
        const close = container?.querySelector('.close,.closeWindow,.button.close,[clickable*="close"],button,a.clickable,.x,i');
        if (!close) continue;
        close.click();
        autoDismissActive = false;
        return true;
    }
    return false;
}

function bindMenuControls(modalContainer) {
    Object.entries(menuConfigMap).forEach(([elementId, storageKey]) => {
        const checkbox = modalContainer.querySelector(`#${elementId}`);
        if (!checkbox || checkbox.dataset.qolMenuBound === 'true') return;

        checkbox.checked = window.isQolEnabled(storageKey);
        checkbox.dataset.qolMenuBound = 'true';
        checkbox.addEventListener('change', event => {
            const enabled = Boolean(event.target.checked);
            try {
                localStorage.setItem(`qol_${storageKey}`, String(enabled));
            } catch (error) {
                console.warn('[QoL] Storage write failed:', error);
            }

            window.dispatchEvent(new CustomEvent('qol_setting_changed', {
                detail: { key: storageKey, enabled }
            }));

            scheduleReposition();
        });
    });
}

function isQolStorageKey(key) {
    const normalized = String(key || '').toLowerCase();
    return QOL_STORAGE_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

function isQolPreferenceStorageKey(key) {
    return QOL_PREFERENCE_STORAGE_KEYS.has(key) || /^qol_keybind_/i.test(key);
}

function clearQolWebStorage(storage) {
    if (!storage) return 0;
    const keys = [];
    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key && isQolStorageKey(key) && !isQolPreferenceStorageKey(key)) keys.push(key);
    }
    keys.forEach(key => storage.removeItem(key));
    return keys.length;
}

function isCurrentServerQolExtensionKey(key) {
    if (!isQolStorageKey(key)) return false;
    const normalized = String(key).toLowerCase();
    const hostname = window.location.hostname.toLowerCase();
    const worldCode = hostname.split('.')[0];
    if (normalized.includes(hostname)) return true;
    const escaped = worldCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[_:.-])${escaped}([_:.-]|$)`, 'i').test(normalized);
}

function clearQolExtensionStorage() {
    return new Promise(resolve => {
        if (typeof chrome === 'undefined' || !chrome.storage?.local?.get || !chrome.storage?.local?.remove) {
            resolve(0);
            return;
        }

        chrome.storage.local.get(null, storedItems => {
            if (chrome.runtime?.lastError) {
                console.warn('[QoL] Extension cache read failed:', chrome.runtime.lastError);
                resolve(0);
                return;
            }

            const keys = Object.keys(storedItems || {}).filter(isCurrentServerQolExtensionKey);
            if (!keys.length) {
                resolve(0);
                return;
            }

            chrome.storage.local.remove(keys, () => {
                if (chrome.runtime?.lastError) {
                    console.warn('[QoL] Extension cache removal failed:', chrome.runtime.lastError);
                    resolve(0);
                    return;
                }
                resolve(keys.length);
            });
        });
    });
}

async function clearQolCacheForCurrentServer() {
    let total = 0;
    try { total += clearQolWebStorage(localStorage); } catch (error) { console.warn('[QoL] Local cache removal failed:', error); }
    try { total += clearQolWebStorage(sessionStorage); } catch (error) { console.warn('[QoL] Session cache removal failed:', error); }
    total += await clearQolExtensionStorage();
    window.dispatchEvent(new CustomEvent('qol_cache_cleared', {
        detail: { hostname: window.location.hostname, clearedEntries: total }
    }));
    return total;
}

function mountToolbarDropdown() {
    let dropdown = document.getElementById(QOL_TOOLBAR_DROPDOWN_ID);
    if (dropdown) return dropdown;
    dropdown = document.createElement('div');
    dropdown.id = QOL_TOOLBAR_DROPDOWN_ID;
    document.body.appendChild(dropdown);
    return dropdown;
}

function closeToolbarDropdown() {
    document.getElementById(QOL_TOOLBAR_DROPDOWN_ID)?.classList.remove('qol-open');
}

function openFullSettings() {
    closeToolbarDropdown();
    const overlay = document.getElementById('qol-modal-overlay');
    if (!overlay) return;
    window.dispatchEvent(new CustomEvent('qol_close_others', { detail: { source: 'menu' } }));
    overlay.style.setProperty('display', 'flex', 'important');
}

function getEnabledToolbarItems() {
    return TOOLBAR_ITEMS.filter(item => {
        if (!window.isQolEnabled(item.key)) return false;
        const element = document.getElementById(item.id);
        return Boolean(element?.isConnected);
    });
}

function positionToolbarDropdown(dropdown) {
    const cog = document.getElementById('qol-cog-btn');
    if (!cog) return;
    const rect = cog.getBoundingClientRect();
    const width = dropdown.offsetWidth || 240;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = Math.min(window.innerHeight - 8, rect.bottom + 8);
    dropdown.style.setProperty('left', `${left}px`, 'important');
    dropdown.style.setProperty('top', `${top}px`, 'important');
}

function toggleToolbarDropdown() {
    const dropdown = mountToolbarDropdown();
    if (dropdown.classList.contains('qol-open')) {
        closeToolbarDropdown();
        return;
    }

    const items = getEnabledToolbarItems();
    dropdown.innerHTML = `
        <div class="qol-toolbar-menu-title">Enabled APES tools</div>
        ${items.map(item => `
            <div class="qol-toolbar-menu-item" data-toolbar-id="${escapeHtml(item.id)}" role="button" tabindex="0">
                <span>${escapeHtml(item.label)}</span><span class="qol-toolbar-menu-arrow">›</span>
            </div>
        `).join('')}
        <div class="qol-toolbar-menu-item settings" data-open-settings="true" role="button" tabindex="0">
            <span>APES QoL Settings</span><span class="qol-toolbar-menu-arrow">⚙</span>
        </div>
    `;

    dropdown.querySelectorAll('[data-toolbar-id]').forEach(entry => {
        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            const target = document.getElementById(entry.dataset.toolbarId);
            closeToolbarDropdown();
            target?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        };
        entry.addEventListener('click', activate);
        entry.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
    });

    const settings = dropdown.querySelector('[data-open-settings="true"]');
    settings?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        openFullSettings();
    });
    settings?.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            openFullSettings();
        }
    });

    dropdown.classList.add('qol-open');
    requestAnimationFrame(() => positionToolbarDropdown(dropdown));
}

function setToolbarCollapsed(collapsed) {
    toolbarCollapsed = collapsed;
    window.qolToolbarCollapsed = collapsed;
    document.body?.classList.toggle('qol-toolbar-collapsed', collapsed);
    if (!collapsed) closeToolbarDropdown();
}

function shouldCollapseToolbar(villageRect, enabledCount) {
    if (enabledCount > QOL_MAX_EXPANDED_TOOLBAR_ITEMS) return true;

    const start = villageRect.right + 20;
    const requiredWidth = QOL_BUTTON_SIZE + enabledCount * (QOL_BUTTON_SIZE + QOL_BUTTON_GAP);

    const safeRight = Math.min(
        window.innerWidth - 16,
        Math.max(start + QOL_BUTTON_SIZE, window.innerWidth * 0.53)
    );

    return start + requiredWidth > safeRight;
}

function scheduleReposition() {
    if (isRepositionScheduled) return;
    isRepositionScheduled = true;
    requestAnimationFrame(() => {
        window.qolRepositionAllButtons?.();
        isRepositionScheduled = false;
    });
}

window.qolRepositionAllButtons = function() {
    const villageList = document.getElementById('villageList');
    const cog = document.getElementById('qol-cog-btn');
    const allIds = ['qol-cog-btn', ...TOOLBAR_ITEMS.map(item => item.id)];

    if (!villageList) {
        allIds.forEach(id => document.getElementById(id)?.style.setProperty('display', 'none', 'important'));
        setToolbarCollapsed(false);
        return;
    }

    const rect = villageList.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        allIds.forEach(id => document.getElementById(id)?.style.setProperty('display', 'none', 'important'));
        setToolbarCollapsed(false);
        return;
    }

    const enabledItems = getEnabledToolbarItems();
    const collapse = shouldCollapseToolbar(rect, enabledItems.length);
    setToolbarCollapsed(collapse);

    let left = rect.right + 20;
    const top = rect.top + 4;

    if (cog) {
        Object.entries({
            position: 'fixed', left: `${left}px`, top: `${top}px`, width: '30px', height: '30px', display: 'flex', 'z-index': '9999'
        }).forEach(([property, value]) => cog.style.setProperty(property, value, 'important'));
    }

    left += QOL_BUTTON_SIZE + QOL_BUTTON_GAP;

    enabledItems.forEach(item => {
        const button = document.getElementById(item.id);
        if (!button) return;
        Object.entries({
            position: 'fixed', left: `${left}px`, top: `${top}px`, width: '30px', height: '30px', display: 'flex', 'z-index': '9999'
        }).forEach(([property, value]) => button.style.setProperty(property, value, 'important'));
        left += QOL_BUTTON_SIZE + QOL_BUTTON_GAP;
    });

    TOOLBAR_ITEMS.filter(item => !enabledItems.includes(item)).forEach(item => {
        const button = document.getElementById(item.id);
        if (button && !window.isQolEnabled(item.key)) button.style.setProperty('display', 'none', 'important');
    });

    if (collapse) {
        const dropdown = document.getElementById(QOL_TOOLBAR_DROPDOWN_ID);
        if (dropdown?.classList.contains('qol-open')) requestAnimationFrame(() => positionToolbarDropdown(dropdown));
    }
};

function buildSettingsMarkup() {
    return `
        <div id="qol-modal" role="dialog" aria-modal="true" aria-labelledby="qol-menu-title">
            <div class="qol-modal-header">
                <div class="qol-modal-title-group">
                    <span class="qol-brand-mark" aria-hidden="true">🦧</span>
                    <div class="qol-title-copy">
                        <div class="qol-title-line">
                            <span class="qol-modal-title" id="qol-menu-title">APES QoL Settings</span>
                            <span class="qol-version-badge">v1.3</span>
                        </div>
                        <span class="qol-modal-subtitle">Choose the tools and shortcuts that fit the way you play.</span>
                    </div>
                </div>
                <div class="qol-modal-close" role="button" tabindex="0" aria-label="Close settings">&times;</div>
            </div>

            <div class="qol-modal-body">
                <div class="qol-section-heading qol-keybind-heading">
                    <div class="qol-section-title-group">
                        <h2 class="qol-section-title">Keybinds</h2>
                        <span class="qol-section-caption">Keyboard shortcuts and a short description of what each one does.</span>
                    </div>
                    <span class="qol-section-count">${KEYBINDS.length} shortcuts</span>
                </div>
                <div class="qol-keybind-grid">${KEYBINDS.map(keybindHtml).join('')}</div>

                <div class="qol-section-heading qol-advanced-heading">
                    <div class="qol-section-title-group">
                        <h2 class="qol-section-title">Advanced Features</h2>
                        <span class="qol-section-caption">Larger APES tools for scanning, planning, archiving and long-term tracking.</span>
                    </div>
                    <span class="qol-section-count" id="qol-advanced-feature-count">${ADVANCED_FEATURES.length} tools</span>
                </div>
                <div class="qol-feature-grid" id="qol-advanced-feature-grid">${ADVANCED_FEATURES.map(featureCardHtml).join('')}</div>

                <div class="qol-section-heading qol-basic-heading">
                    <div class="qol-section-title-group">
                        <h2 class="qol-section-title">Basic Features</h2>
                        <span class="qol-section-caption">Everyday quality-of-life improvements that work quietly alongside normal play.</span>
                    </div>
                    <span class="qol-section-count">${BASIC_FEATURES.length} tools</span>
                </div>
                <div class="qol-feature-grid" id="qol-basic-feature-grid">${BASIC_FEATURES.map(featureCardHtml).join('')}</div>

                <div class="qol-section-heading qol-cosmetic-heading">
                    <div class="qol-section-title-group">
                        <h2 class="qol-section-title">Cosmetic Features</h2>
                        <span class="qol-section-caption">Optional visual changes that alter presentation without changing gameplay.</span>
                    </div>
                    <span class="qol-section-count">${COSMETIC_FEATURES.length} ${COSMETIC_FEATURES.length === 1 ? 'tool' : 'tools'}</span>
                </div>
                <div class="qol-feature-grid" id="qol-cosmetic-feature-grid">${COSMETIC_FEATURES.map(featureCardHtml).join('')}</div>
            </div>

            <div class="qol-modal-footer">
                <div class="qol-footer-left">
                    <span class="qol-save-note"><span class="qol-save-dot" aria-hidden="true"></span>Changes are saved automatically</span>
                    <div class="qol-clear-cache-btn" role="button" tabindex="0">Manage Storage</div>
                </div>
                <span class="qol-footer-hint">Press Esc or click outside to close</span>
            </div>
        </div>

        <div class="qol-cache-dialog-layer" aria-hidden="true">
            <div class="qol-cache-dialog" role="alertdialog" aria-modal="true" aria-labelledby="qol-cache-dialog-title">
                <div class="qol-cache-dialog-header" id="qol-cache-dialog-title">Clear APES Cache?</div>
                <div class="qol-cache-dialog-body">
                    This removes APES data saved for <strong>${escapeHtml(window.location.hostname)}</strong>, including data left behind by an older round on the same server address.
                    <br><br>
                    Saved watchlists, checklist data, scanner results and archived reports for this server may be deleted. <strong>This cannot be undone.</strong>
                    <br><br>
                    Feature and keybind preferences will be kept. The page will reload when the cache has been cleared.
                    <div class="qol-cache-dialog-status" aria-live="polite"></div>
                </div>
                <div class="qol-cache-dialog-actions">
                    <div class="qol-cache-dialog-action qol-cache-cancel" role="button" tabindex="0">Cancel</div>
                    <div class="qol-cache-dialog-action qol-danger qol-cache-confirm" role="button" tabindex="0">Clear &amp; Reload</div>
                </div>
            </div>
        </div>
    `;
}

function setupQolMenu() {
    injectQolMenuStyles();

    let cog = document.getElementById('qol-cog-btn');
    if (!cog) {
        cog = document.createElement('div');
        cog.id = 'qol-cog-btn';
        cog.title = 'APES QoL';
        cog.setAttribute('role', 'button');
        cog.setAttribute('tabindex', '0');
        cog.setAttribute('aria-label', 'Open APES QoL');
        cog.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.63 3.6-3.6 3.6z"/>
            </svg>
        `;
        document.body.appendChild(cog);
    }

    let overlay = document.getElementById('qol-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'qol-modal-overlay';
        overlay.innerHTML = buildSettingsMarkup();
        document.body.appendChild(overlay);
        bindMenuControls(overlay);
        bindMenuShell(overlay);
    } else {
        bindMenuControls(overlay);
    }

    if (cog.dataset.qolMenuBound !== 'true') {
        cog.dataset.qolMenuBound = 'true';
        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            if (toolbarCollapsed) toggleToolbarDropdown();
            else openFullSettings();
        };
        cog.addEventListener('click', activate);
        cog.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
    }

    mountToolbarDropdown();
    scheduleReposition();
}

function bindMenuShell(overlay) {
    const closeModal = () => overlay.style.setProperty('display', 'none', 'important');
    const closeBtn = overlay.querySelector('.qol-modal-close');
    const cacheDialog = overlay.querySelector('.qol-cache-dialog-layer');
    const clearCacheBtn = overlay.querySelector('.qol-clear-cache-btn');
    const cancelBtn = overlay.querySelector('.qol-cache-cancel');
    const confirmBtn = overlay.querySelector('.qol-cache-confirm');
    const status = overlay.querySelector('.qol-cache-dialog-status');

    const bindAction = (element, action) => {
        if (!element) return;
        element.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            action();
        });
        element.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                action();
            }
        });
    };

    bindAction(closeBtn, closeModal);
    bindAction(clearCacheBtn, () => {
        status.textContent = '';
        confirmBtn.setAttribute('aria-disabled', 'false');
        confirmBtn.textContent = 'Clear & Reload';
        cacheDialog.classList.add('qol-open');
        cacheDialog.setAttribute('aria-hidden', 'false');
        cancelBtn.focus();
    });
    bindAction(cancelBtn, () => {
        if (confirmBtn.getAttribute('aria-disabled') === 'true') return;
        cacheDialog.classList.remove('qol-open');
        cacheDialog.setAttribute('aria-hidden', 'true');
        clearCacheBtn.focus();
    });
    bindAction(confirmBtn, async () => {
        if (confirmBtn.getAttribute('aria-disabled') === 'true') return;
        confirmBtn.setAttribute('aria-disabled', 'true');
        confirmBtn.textContent = 'Clearing...';
        status.textContent = 'Removing APES data for this server...';
        try {
            const cleared = await clearQolCacheForCurrentServer();
            status.textContent = `${cleared} saved cache ${cleared === 1 ? 'entry' : 'entries'} removed. Reloading...`;
            setTimeout(() => window.location.reload(), 650);
        } catch (error) {
            console.error('[QoL] Cache clear failed:', error);
            status.textContent = 'The cache could not be fully cleared. Please try again.';
            confirmBtn.setAttribute('aria-disabled', 'false');
            confirmBtn.textContent = 'Try Again';
        }
    });

    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeModal();
        event.stopPropagation();
    });

    cacheDialog.addEventListener('click', event => {
        if (event.target === cacheDialog && confirmBtn.getAttribute('aria-disabled') !== 'true') {
            cacheDialog.classList.remove('qol-open');
            cacheDialog.setAttribute('aria-hidden', 'true');
        }
        event.stopPropagation();
    });
}

function initQolUI() {
    cleanWelcomeScreenUrl();
    window.applyQolTheme();

    window.addEventListener('qol_setting_changed', scheduleReposition);
    window.addEventListener('resize', scheduleReposition);
    window.addEventListener('scroll', scheduleReposition);

    document.addEventListener('click', event => {
        const dropdown = document.getElementById(QOL_TOOLBAR_DROPDOWN_ID);
        if (!dropdown?.classList.contains('qol-open')) return;
        if (event.target.closest(`#${QOL_TOOLBAR_DROPDOWN_ID},#qol-cog-btn`)) return;
        closeToolbarDropdown();
    }, true);

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const dropdown = document.getElementById(QOL_TOOLBAR_DROPDOWN_ID);
        if (dropdown?.classList.contains('qol-open')) {
            closeToolbarDropdown();
            event.stopImmediatePropagation();
            return;
        }

        const overlay = document.getElementById('qol-modal-overlay');
        const cacheDialog = overlay?.querySelector('.qol-cache-dialog-layer');
        if (cacheDialog?.classList.contains('qol-open')) {
            const confirm = overlay.querySelector('.qol-cache-confirm');
            if (confirm?.getAttribute('aria-disabled') !== 'true') {
                cacheDialog.classList.remove('qol-open');
                cacheDialog.setAttribute('aria-hidden', 'true');
            }
            event.stopImmediatePropagation();
            return;
        }

        if (overlay && getComputedStyle(overlay).display !== 'none') {
            overlay.style.setProperty('display', 'none', 'important');
            event.stopImmediatePropagation();
        }
    }, true);

    const observer = new MutationObserver(() => {
        if (autoDismissActive) {
            cleanWelcomeScreenUrl();
            dismissWelcomeScreenDOM();
        }

        if (document.getElementById('villageList')) {
            setupQolMenu();
            scheduleReposition();
        } else {
            document.getElementById('qol-cog-btn')?.style.setProperty('display', 'none', 'important');
            closeToolbarDropdown();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    if (document.getElementById('villageList')) setupQolMenu();
}

cleanWelcomeScreenUrl();
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQolUI, { once: true });
} else {
    initQolUI();
}
