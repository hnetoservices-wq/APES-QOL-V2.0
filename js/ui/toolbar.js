/**
 * APES QoL v2 — Responsive Toolbar
 *
 * One container owns all visible toolbar geometry.
 *
 * Feature modules may continue creating their historical toolbar buttons and
 * attaching their existing click handlers. Those buttons are moved into a
 * hidden action depot before the browser paints. The visible toolbar uses
 * stable proxy controls that trigger the original buttons.
 *
 * This makes legacy per-feature left/top/right/display writes harmless: they
 * only affect hidden source buttons and can no longer cause visible overlap,
 * gaps or flicker.
 */
(() => {
    'use strict';

    const HOST_ID = 'qol-responsive-toolbar';
    const DEPOT_ID = 'qol-toolbar-source-depot';
    const MENU_ID = 'qol-responsive-toolbar-menu';
    const PROXY_PREFIX = 'qol-toolbar-proxy--';
    const COG_SOURCE_ID = 'qol-cog-btn';
    const MAX_EXPANDED_TOOLS = 8;

    const NORMAL_SIZE = 30;
    const NORMAL_GAP = 6;
    const COMPACT_SIZE = 28;
    const COMPACT_GAP = 4;
    const VIEWPORT_GUTTER = 8;
    const VILLAGE_GAP = 20;

    const ITEMS = Object.freeze([
        { id: 'qol-help-toggle-btn', label: 'Help', key: 'help' },
        { id: 'qol-rally-point-toggle-btn', label: 'Rally Point Scanner', key: 'rallyPointParser' },
        { id: 'qol-watchlist-toggle', label: 'Watchlists', key: 'watchlist' },
        { id: 'qol-checklist-toggle-btn', label: 'Checklists', key: 'checklists' },
        { id: 'qol-building-alarm-toggle-btn', label: 'Building Alarms', key: 'buildingAlarm' },
        { id: 'qol-npc-calc-toggle-btn', label: 'NPC Calculator', key: 'npcCalculator' },
        { id: 'qol-resource-planner-toggle-btn', label: 'Resource Upgrade Planner', key: 'resourceUpgradePlanner' },
        { id: 'qol-distance-calc-toggle-btn', label: 'Distance & Arrival Calculator', key: 'distanceCalculator' },
        { id: 'qol-oasis-toggle-btn', label: 'Oasis Scanner', key: 'oasisScanner' },
        { id: 'qol-report-archive-toggle', label: 'Report Archive', key: 'reportArchive' },
        { id: 'qol-cp-toggle-btn', label: 'CP Manager', key: 'cpManager' },
        { id: 'qol-ss-scanner-toggle-btn', label: 'Secret Society Scanner', key: 'secretSocietyScanner' },
        { id: 'qol-tribe-skins-toggle-btn', label: 'Visual Tribe Skin', key: 'visualTribeSkins' }
    ]);

    const ALL_SOURCE_IDS = Object.freeze([COG_SOURCE_ID, ...ITEMS.map(item => item.id)]);

    let syncScheduled = false;
    let toolbarCollapsed = false;
    let toolbarMode = 'normal';
    let observedVillageList = null;
    let resizeObserver = null;

    function enabled(key) {
        if (typeof window.isQolEnabled === 'function') {
            return window.isQolEnabled(key) === true;
        }
        try {
            return localStorage.getItem(`qol_${key}`) !== 'false';
        } catch (_) {
            return true;
        }
    }

    function ensureStyles() {
        if (document.getElementById('qol-responsive-toolbar-styles')) return;

        const style = document.createElement('style');
        style.id = 'qol-responsive-toolbar-styles';
        style.textContent = `
            #${DEPOT_ID}{display:none!important;position:absolute!important;width:0!important;height:0!important;overflow:hidden!important;pointer-events:none!important}

            #${HOST_ID},#${HOST_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${HOST_ID}{
                --qol-toolbar-size:${NORMAL_SIZE}px;
                --qol-toolbar-gap:${NORMAL_GAP}px;
                position:fixed!important;
                display:none!important;
                align-items:center!important;
                justify-content:flex-start!important;
                gap:var(--qol-toolbar-gap)!important;
                width:max-content!important;
                height:var(--qol-toolbar-size)!important;
                margin:0!important;
                padding:0!important;
                overflow:visible!important;
                z-index:9999!important;
                isolation:isolate!important;
                user-select:none!important;
                contain:layout style!important;
            }
            #${HOST_ID}.qol-toolbar-compact{
                --qol-toolbar-size:${COMPACT_SIZE}px;
                --qol-toolbar-gap:${COMPACT_GAP}px;
            }
            #${HOST_ID}.qol-toolbar-collapsed-host .qol-toolbar-feature-proxy{display:none!important}

            #${HOST_ID} .qol-toolbar-proxy{
                position:relative!important;
                inset:auto!important;
                left:auto!important;
                right:auto!important;
                top:auto!important;
                bottom:auto!important;
                flex:0 0 var(--qol-toolbar-size)!important;
                display:flex!important;
                align-items:center!important;
                justify-content:center!important;
                width:var(--qol-toolbar-size)!important;
                min-width:var(--qol-toolbar-size)!important;
                max-width:var(--qol-toolbar-size)!important;
                height:var(--qol-toolbar-size)!important;
                min-height:var(--qol-toolbar-size)!important;
                max-height:var(--qol-toolbar-size)!important;
                margin:0!important;
                padding:0!important;
                border:2px solid var(--qol-accent)!important;
                border-radius:50%!important;
                outline:0!important;
                background:var(--qol-accent-soft)!important;
                color:var(--qol-accent)!important;
                box-shadow:0 2px 4px rgba(0,0,0,.22)!important;
                cursor:pointer!important;
                opacity:1!important;
                visibility:visible!important;
                transform:none!important;
                transition:transform .10s ease,background-color .10s ease,box-shadow .10s ease!important;
            }
            #${HOST_ID} .qol-toolbar-proxy:hover,
            #${HOST_ID} .qol-toolbar-proxy:focus-visible{
                background:#f7f5f0!important;
                box-shadow:0 2px 5px rgba(0,0,0,.28),0 0 0 2px color-mix(in srgb,var(--qol-accent) 20%,transparent)!important;
                transform:scale(1.07)!important;
            }
            #${HOST_ID} .qol-toolbar-proxy svg{
                display:block!important;
                width:17px!important;
                max-width:17px!important;
                height:17px!important;
                max-height:17px!important;
                margin:0!important;
                pointer-events:none!important;
            }
            #${HOST_ID}.qol-toolbar-compact .qol-toolbar-proxy svg{
                width:15px!important;
                max-width:15px!important;
                height:15px!important;
                max-height:15px!important;
            }
            #${HOST_ID} .qol-toolbar-proxy > i,
            #${HOST_ID} .qol-toolbar-proxy > span{
                pointer-events:none!important;
            }
            #${HOST_ID} .qol-toolbar-proxy img{
                max-width:18px!important;
                max-height:18px!important;
                pointer-events:none!important;
            }
            #${HOST_ID} .qol-toolbar-proxy.qol-toolbar-text-icon{
                color:var(--qol-accent-ink)!important;
                font-size:10px!important;
                font-weight:800!important;
                line-height:1!important;
            }
            #${HOST_ID} .qol-toolbar-cog-proxy svg{
                fill:var(--qol-accent)!important;
                stroke:none!important;
            }
            #${HOST_ID}.qol-toolbar-collapsed-host .qol-toolbar-cog-proxy::after{
                content:'▾'!important;
                position:absolute!important;
                right:-3px!important;
                bottom:-4px!important;
                display:flex!important;
                align-items:center!important;
                justify-content:center!important;
                width:12px!important;
                height:12px!important;
                border:1px solid var(--qol-accent)!important;
                border-radius:50%!important;
                background:#f7f5f0!important;
                color:var(--qol-accent-ink)!important;
                font-size:8px!important;
                line-height:1!important;
            }

            #${MENU_ID},#${MENU_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${MENU_ID}{
                position:fixed!important;
                display:none!important;
                flex-direction:column!important;
                min-width:230px!important;
                max-width:min(310px,90vw)!important;
                max-height:min(540px,80vh)!important;
                overflow-y:auto!important;
                padding:5px!important;
                border:2px solid var(--qol-border)!important;
                border-radius:5px!important;
                background:#f7f5f0!important;
                box-shadow:0 10px 26px rgba(0,0,0,.38)!important;
                z-index:1000002!important;
            }
            #${MENU_ID}.qol-open{display:flex!important}
            #${MENU_ID} .qol-responsive-toolbar-title{
                padding:6px 8px!important;
                color:#806b50!important;
                font-size:9px!important;
                font-weight:700!important;
                text-transform:uppercase!important;
                letter-spacing:.35px!important;
            }
            #${MENU_ID} .qol-responsive-toolbar-item{
                display:flex!important;
                align-items:center!important;
                justify-content:space-between!important;
                gap:10px!important;
                min-height:31px!important;
                padding:6px 8px!important;
                border-radius:3px!important;
                color:#4b3822!important;
                font-size:10px!important;
                font-weight:700!important;
                cursor:pointer!important;
            }
            #${MENU_ID} .qol-responsive-toolbar-item:hover,
            #${MENU_ID} .qol-responsive-toolbar-item:focus-visible{background:#ebdfcb!important;outline:none!important}
            #${MENU_ID} .qol-responsive-toolbar-item.settings{
                margin-top:4px!important;
                padding-top:9px!important;
                border-top:1px solid #d7c9b4!important;
                border-radius:0 0 3px 3px!important;
            }
            #${MENU_ID} .qol-responsive-toolbar-arrow{color:#967d5b!important;font-size:11px!important}
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function ensureDepot() {
        let depot = document.getElementById(DEPOT_ID);
        if (!depot) {
            depot = document.createElement('div');
            depot.id = DEPOT_ID;
            depot.setAttribute('aria-hidden', 'true');
            document.body.appendChild(depot);
        }
        return depot;
    }

    function ensureHost() {
        let host = document.getElementById(HOST_ID);
        if (!host) {
            host = document.createElement('div');
            host.id = HOST_ID;
            host.setAttribute('role', 'toolbar');
            host.setAttribute('aria-label', 'APES QoL toolbar');
            document.body.appendChild(host);
        }
        return host;
    }

    function ensureMenu() {
        let menu = document.getElementById(MENU_ID);
        if (!menu) {
            menu = document.createElement('div');
            menu.id = MENU_ID;
            menu.setAttribute('role', 'menu');
            document.body.appendChild(menu);
        }
        return menu;
    }

    function sourceFor(id) {
        return document.getElementById(id);
    }

    function captureSources() {
        const depot = ensureDepot();
        ALL_SOURCE_IDS.forEach(id => {
            const source = sourceFor(id);
            if (!source || source.parentElement === depot) return;
            if (source.closest(`#${HOST_ID},#${MENU_ID}`)) return;
            depot.appendChild(source);
        });
    }

    function triggerSource(id) {
        const source = sourceFor(id);
        if (!source) return false;
        source.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0
        }));
        return true;
    }

    function proxyId(sourceId) {
        return `${PROXY_PREFIX}${sourceId}`;
    }

    function copySvgPresentation(source, proxy) {
        const sourceSvg = source?.querySelector('svg');
        const proxySvg = proxy?.querySelector('svg');
        if (!sourceSvg || !proxySvg) return;

        try {
            const computed = getComputedStyle(sourceSvg);
            ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'].forEach(property => {
                const value = computed.getPropertyValue(property);
                if (value) proxySvg.style.setProperty(property, value, 'important');
            });
        } catch (_) {}
    }

    function ensureProxy(host, source, sourceId, label, extraClass = '') {
        const id = proxyId(sourceId);
        let proxy = document.getElementById(id);
        if (!proxy) {
            proxy = document.createElement('div');
            proxy.id = id;
            proxy.className = `qol-toolbar-proxy ${extraClass}`.trim();
            proxy.setAttribute('role', 'button');
            proxy.setAttribute('tabindex', '0');
            proxy.dataset.qolSourceId = sourceId;

            const activate = event => {
                event.preventDefault();
                event.stopPropagation();
                activateProxy(proxy);
            };
            proxy.addEventListener('click', activate);
            proxy.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') activate(event);
            });
            host.appendChild(proxy);
        }

        const markup = source?.innerHTML || '';
        if (proxy.dataset.qolMarkup !== markup) {
            proxy.innerHTML = markup;
            proxy.dataset.qolMarkup = markup;
            copySvgPresentation(source, proxy);
        }

        proxy.title = source?.title || label;
        proxy.setAttribute('aria-label', source?.getAttribute('aria-label') || label);
        proxy.classList.toggle('qol-toolbar-text-icon', !proxy.querySelector('svg,i,img'));
        return proxy;
    }

    function activeItems() {
        return ITEMS.filter(item => {
            if (!enabled(item.key)) return false;
            return Boolean(sourceFor(item.id));
        });
    }

    function widthFor(toolCount, size, gap) {
        // Cog + N feature buttons, with a gap only between controls.
        const controls = 1 + toolCount;
        return controls * size + Math.max(0, controls - 1) * gap;
    }

    function resolveLayout(villageRect, toolCount) {
        if (toolCount > MAX_EXPANDED_TOOLS) {
            return { collapsed: true, mode: 'normal', width: NORMAL_SIZE };
        }

        const start = villageRect.right + VILLAGE_GAP;
        const normalWidth = widthFor(toolCount, NORMAL_SIZE, NORMAL_GAP);
        if (start + normalWidth <= window.innerWidth - VIEWPORT_GUTTER) {
            return { collapsed: false, mode: 'normal', width: normalWidth };
        }

        const compactWidth = widthFor(toolCount, COMPACT_SIZE, COMPACT_GAP);
        if (start + compactWidth <= window.innerWidth - VIEWPORT_GUTTER) {
            return { collapsed: false, mode: 'compact', width: compactWidth };
        }

        return { collapsed: true, mode: 'normal', width: NORMAL_SIZE };
    }

    function setCompatibilityState(collapsed) {
        toolbarCollapsed = collapsed;
        window.qolToolbarCollapsed = collapsed;
        document.body?.classList.toggle('qol-toolbar-collapsed', collapsed);

        // Keep menu.js's historical dropdown closed. This toolbar owns its
        // own overflow menu and never needs the old per-button dropdown.
        document.getElementById('qol-toolbar-dropdown')?.classList.remove('qol-open');
    }

    function closeMenu() {
        document.getElementById(MENU_ID)?.classList.remove('qol-open');
    }

    function positionMenu(menu) {
        const host = document.getElementById(HOST_ID);
        if (!host) return;
        const rect = host.getBoundingClientRect();
        const width = menu.offsetWidth || 240;
        const left = Math.max(VIEWPORT_GUTTER, Math.min(
            rect.left,
            window.innerWidth - width - VIEWPORT_GUTTER
        ));
        const below = rect.bottom + 8;
        const menuHeight = menu.offsetHeight || 320;
        const top = below + menuHeight <= window.innerHeight - VIEWPORT_GUTTER
            ? below
            : Math.max(VIEWPORT_GUTTER, rect.top - menuHeight - 8);

        menu.style.setProperty('left', `${Math.round(left)}px`, 'important');
        menu.style.setProperty('top', `${Math.round(top)}px`, 'important');
    }

    function openOverflowMenu() {
        const menu = ensureMenu();
        const items = activeItems();
        menu.innerHTML = `
            <div class="qol-responsive-toolbar-title">Enabled APES tools</div>
            ${items.map(item => `
                <div class="qol-responsive-toolbar-item" data-qol-source-id="${item.id}" role="menuitem" tabindex="0">
                    <span>${item.label}</span><span class="qol-responsive-toolbar-arrow">›</span>
                </div>
            `).join('')}
            <div class="qol-responsive-toolbar-item settings" data-qol-settings="true" role="menuitem" tabindex="0">
                <span>APES QoL Settings</span><span class="qol-responsive-toolbar-arrow">⚙</span>
            </div>
        `;

        menu.querySelectorAll('[data-qol-source-id]').forEach(entry => {
            const activate = event => {
                event.preventDefault();
                event.stopPropagation();
                closeMenu();
                triggerSource(entry.dataset.qolSourceId);
            };
            entry.addEventListener('click', activate);
            entry.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') activate(event);
            });
        });

        const settings = menu.querySelector('[data-qol-settings="true"]');
        const openSettings = event => {
            event.preventDefault();
            event.stopPropagation();
            closeMenu();
            triggerSource(COG_SOURCE_ID);
        };
        settings?.addEventListener('click', openSettings);
        settings?.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') openSettings(event);
        });

        menu.classList.add('qol-open');
        requestAnimationFrame(() => positionMenu(menu));
    }

    function toggleOverflowMenu() {
        const menu = ensureMenu();
        if (menu.classList.contains('qol-open')) closeMenu();
        else openOverflowMenu();
    }

    function activateProxy(proxy) {
        const sourceId = proxy.dataset.qolSourceId;
        if (sourceId === COG_SOURCE_ID && toolbarCollapsed) {
            toggleOverflowMenu();
            return;
        }
        triggerSource(sourceId);
    }

    function syncProxies(host, items) {
        const cogSource = sourceFor(COG_SOURCE_ID);
        if (!cogSource) return false;

        const cog = ensureProxy(host, cogSource, COG_SOURCE_ID, 'APES QoL Settings', 'qol-toolbar-cog-proxy');
        host.appendChild(cog);

        const wanted = new Set([proxyId(COG_SOURCE_ID)]);
        items.forEach(item => {
            const source = sourceFor(item.id);
            if (!source) return;
            const proxy = ensureProxy(host, source, item.id, item.label, 'qol-toolbar-feature-proxy');
            host.appendChild(proxy);
            wanted.add(proxy.id);
        });

        [...host.querySelectorAll('.qol-toolbar-proxy')].forEach(proxy => {
            if (!wanted.has(proxy.id)) proxy.remove();
        });
        return true;
    }

    function syncVillageResizeObserver(villageList) {
        if (observedVillageList === villageList) return;
        resizeObserver?.disconnect();
        observedVillageList = villageList || null;

        if (!villageList || typeof ResizeObserver !== 'function') return;
        resizeObserver = new ResizeObserver(scheduleSync);
        resizeObserver.observe(villageList);
    }

    function hideToolbar(host) {
        host.style.setProperty('display', 'none', 'important');
        setCompatibilityState(false);
        closeMenu();
    }

    function syncToolbar() {
        syncScheduled = false;
        ensureStyles();
        captureSources();

        const host = ensureHost();
        const villageList = document.getElementById('villageList');
        syncVillageResizeObserver(villageList);

        const rect = villageList?.getBoundingClientRect();
        if (!villageList || !rect || rect.width <= 0 || rect.height <= 0) {
            hideToolbar(host);
            return;
        }

        const items = activeItems();
        if (!syncProxies(host, items)) {
            hideToolbar(host);
            return;
        }

        const layout = resolveLayout(rect, items.length);
        toolbarMode = layout.mode;
        setCompatibilityState(layout.collapsed);

        host.classList.toggle('qol-toolbar-collapsed-host', layout.collapsed);
        host.classList.toggle('qol-toolbar-compact', layout.mode === 'compact');
        host.style.setProperty('--qol-toolbar-size', `${layout.mode === 'compact' ? COMPACT_SIZE : NORMAL_SIZE}px`, 'important');
        host.style.setProperty('--qol-toolbar-gap', `${layout.mode === 'compact' ? COMPACT_GAP : NORMAL_GAP}px`, 'important');

        const left = Math.max(
            VIEWPORT_GUTTER,
            Math.min(rect.right + VILLAGE_GAP, window.innerWidth - layout.width - VIEWPORT_GUTTER)
        );
        const size = layout.mode === 'compact' ? COMPACT_SIZE : NORMAL_SIZE;
        const top = Math.max(
            VIEWPORT_GUTTER,
            Math.min(rect.top + 4, window.innerHeight - size - VIEWPORT_GUTTER)
        );

        host.style.setProperty('left', `${Math.round(left)}px`, 'important');
        host.style.setProperty('top', `${Math.round(top)}px`, 'important');
        host.style.setProperty('display', 'flex', 'important');

        const cog = document.getElementById(proxyId(COG_SOURCE_ID));
        if (cog) {
            cog.title = layout.collapsed
                ? `APES QoL tools (${items.length})`
                : 'APES QoL Settings';
            cog.setAttribute('aria-label', cog.title);
        }

        if (!layout.collapsed) closeMenu();
        else if (document.getElementById(MENU_ID)?.classList.contains('qol-open')) {
            requestAnimationFrame(() => positionMenu(document.getElementById(MENU_ID)));
        }
    }

    function scheduleSync() {
        if (syncScheduled) return;
        syncScheduled = true;
        requestAnimationFrame(syncToolbar);
    }

    function captureAndSchedule() {
        // Move recognized source buttons to the hidden depot immediately in
        // the MutationObserver microtask, before the next browser paint.
        captureSources();
        scheduleSync();
    }

    function init() {
        ensureStyles();
        ensureDepot();
        ensureHost();
        ensureMenu();
        captureSources();

        // Replace the historical public reposition hook. Feature modules may
        // request a refresh, but no feature receives authority over geometry.
        window.qolRepositionAllButtons = scheduleSync;
        window.qolRefreshToolbar = scheduleSync;

        const observer = new MutationObserver(captureAndSchedule);
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        window.addEventListener('resize', scheduleSync, { passive: true });
        window.addEventListener('scroll', scheduleSync, { passive: true });
        window.addEventListener('hashchange', scheduleSync);
        window.addEventListener('qol_setting_changed', scheduleSync);
        window.addEventListener('qol_theme_changed', scheduleSync);

        document.addEventListener('click', event => {
            const menu = document.getElementById(MENU_ID);
            if (!menu?.classList.contains('qol-open')) return;
            if (event.target.closest(`#${MENU_ID},#${HOST_ID}`)) return;
            closeMenu();
        }, true);

        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            const menu = document.getElementById(MENU_ID);
            if (!menu?.classList.contains('qol-open')) return;
            closeMenu();
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);

        syncToolbar();
        window.setTimeout(scheduleSync, 100);
        window.setTimeout(scheduleSync, 500);
        window.setTimeout(scheduleSync, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
