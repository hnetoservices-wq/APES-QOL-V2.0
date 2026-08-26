/**
 * APES QoL v2 — Resource Upgrade Planner UI integration.
 * Adds the planner to Settings, the responsive toolbar dropdown and the G wheel
 * without coupling the calculation module to the menu implementation.
 */
(() => {
    'use strict';

    const APES = window.APES;
    const FEATURE_KEY = 'resourceUpgradePlanner';
    const BUTTON_ID = 'qol-resource-planner-toggle-btn';
    const CHECKBOX_ID = 'qol-chk-resource-upgrade-planner';
    const TOOLBAR_ENTRY_ATTR = 'data-rup-toolbar-entry';
    const RADIAL_ACTION_ID = 'resources.open';
    const ITEMS_PER_RING = 8;
    const FIRST_RING_RADIUS = 150;
    const MIN_ITEM_DISTANCE = 126;
    const RING_GAP = 120;
    let scheduled = false;

    function enabled() {
        return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY) === true;
    }

    function openPlanner() {
        if (window.APES_RESOURCE_UPGRADE_PLANNER?.open) {
            return window.APES_RESOURCE_UPGRADE_PLANNER.open();
        }
        return APES?.ui?.activateById?.(BUTTON_ID);
    }

    function setEnabled(value) {
        try { localStorage.setItem(`qol_${FEATURE_KEY}`, String(Boolean(value))); } catch (_) {}
        window.dispatchEvent(new CustomEvent('qol_setting_changed', {
            detail: { key: FEATURE_KEY, enabled: Boolean(value) }
        }));
    }

    function injectSettingsCard() {
        const grid = document.getElementById('qol-advanced-feature-grid') ||
            document.getElementById('qol-basic-feature-grid');
        if (!grid) return;

        let checkbox = document.getElementById(CHECKBOX_ID);
        if (!checkbox) {
            const card = document.createElement('article');
            card.className = 'qol-feature-card';
            card.dataset.featureKey = FEATURE_KEY;
            card.innerHTML = `
                <span class="qol-feature-icon" aria-hidden="true">↥</span>
                <div class="qol-feature-copy">
                    <h3 class="qol-feature-name">Resource Upgrade Planner</h3>
                    <p class="qol-feature-desc">Calculates an efficient upgrade order for resource fields, production buildings and oases.</p>
                </div>
                <label class="qol-switch" title="Toggle Resource Upgrade Planner">
                    <input type="checkbox" id="${CHECKBOX_ID}" class="qol-checkbox">
                    <span class="qol-switch-track" aria-hidden="true"></span>
                    <span class="qol-visually-hidden">Toggle Resource Upgrade Planner</span>
                </label>
            `;
            grid.appendChild(card);
            checkbox = card.querySelector(`#${CHECKBOX_ID}`);
            checkbox.addEventListener('change', event => setEnabled(event.target.checked));

            const heading = grid.previousElementSibling;
            const count = heading?.querySelector('.qol-section-count');
            if (count && count.dataset.rupCounted !== 'true') {
                const current = Number.parseInt(count.textContent, 10);
                if (Number.isFinite(current)) count.textContent = `${current + 1} tools`;
                count.dataset.rupCounted = 'true';
            }
        }
        checkbox.checked = enabled();
    }

    function injectCollapsedToolbarEntry() {
        const dropdown = document.getElementById('qol-toolbar-dropdown');
        if (!dropdown?.classList.contains('qol-open')) return;
        const existing = dropdown.querySelector(`[${TOOLBAR_ENTRY_ATTR}]`);
        if (!enabled()) {
            existing?.remove();
            return;
        }
        if (existing) return;

        const item = document.createElement('div');
        item.className = 'qol-toolbar-menu-item';
        item.setAttribute(TOOLBAR_ENTRY_ATTR, 'true');
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.innerHTML = '<span>Resource Upgrade Planner</span><span class="qol-toolbar-menu-arrow">›</span>';
        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            dropdown.classList.remove('qol-open');
            void openPlanner();
        };
        item.addEventListener('click', activate);
        item.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });

        const settings = dropdown.querySelector('[data-open-settings="true"]');
        if (settings) dropdown.insertBefore(item, settings);
        else dropdown.appendChild(item);
    }

    function visibleToolbarControls() {
        const selectors = [
            '#qol-help-toggle-btn', '#qol-rally-point-toggle-btn', '#qol-watchlist-toggle',
            '#qol-checklist-toggle-btn', '#qol-npc-calc-toggle-btn', '#qol-distance-calc-toggle-btn',
            '#qol-oasis-toggle-btn', '#qol-report-archive-toggle', '#qol-cp-toggle-btn',
            '#qol-ss-scanner-toggle-btn', '#qol-tribe-skins-toggle-btn'
        ].join(',');
        return [...document.querySelectorAll(selectors)]
            .map(element => ({ element, rect: element.getBoundingClientRect() }))
            .filter(item => item.rect.width > 0 && item.rect.height > 0)
            .filter(item => {
                const style = getComputedStyle(item.element);
                return style.display !== 'none' && style.visibility !== 'hidden';
            });
    }

    function positionPlannerButton() {
        const button = document.getElementById(BUTTON_ID);
        if (!button) return;
        if (!enabled() || document.body?.classList.contains('qol-toolbar-collapsed')) {
            button.style.setProperty('display', 'none', 'important');
            return;
        }

        const villageList = document.getElementById('villageList');
        const villageRect = villageList?.getBoundingClientRect();
        if (!villageRect || villageRect.width <= 0 || villageRect.height <= 0) {
            button.style.setProperty('display', 'none', 'important');
            return;
        }

        const controls = visibleToolbarControls();
        const anchor = controls.length
            ? controls.reduce((rightmost, item) => item.rect.right > rightmost.rect.right ? item : rightmost)
            : null;
        const cog = document.getElementById('qol-cog-btn')?.getBoundingClientRect();
        const left = Math.round((anchor?.rect.right ?? cog?.right ?? villageRect.right + 50) + 6);
        const top = Math.round(anchor?.rect.top ?? cog?.top ?? villageRect.top + 4);
        button.style.setProperty('left', `${left}px`, 'important');
        button.style.setProperty('top', `${top}px`, 'important');
        button.style.setProperty('right', 'auto', 'important');
        button.style.setProperty('display', 'flex', 'important');
    }

    function radialIcon() {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 19h16M6 16v-5M10 16V7M14 16v-3M18 16V4"/>
                <path d="m5 8 4-4 4 3 6-5"/>
            </svg>
        `;
    }

    function getRingRadius(itemCount, ringIndex) {
        const minimum = itemCount > 1
            ? MIN_ITEM_DISTANCE / (2 * Math.sin(Math.PI / itemCount))
            : 0;
        return Math.max(FIRST_RING_RADIUS + ringIndex * RING_GAP, minimum);
    }

    function layoutRadialItems(container) {
        const items = [...container.querySelectorAll('.apes-v2-radial-item')];
        items.forEach((item, index) => {
            const ringIndex = Math.floor(index / ITEMS_PER_RING);
            const ringStart = ringIndex * ITEMS_PER_RING;
            const ringCount = Math.min(ITEMS_PER_RING, items.length - ringStart);
            const positionInRing = index - ringStart;
            const angle = -Math.PI / 2 + (Math.PI * 2 * positionInRing) / ringCount;
            const radius = getRingRadius(ringCount, ringIndex);
            item.style.setProperty('--apes-x', `${(Math.cos(angle) * radius).toFixed(2)}px`);
            item.style.setProperty('--apes-y', `${(Math.sin(angle) * radius).toFixed(2)}px`);
        });

        const rings = Math.max(1, Math.ceil(items.length / ITEMS_PER_RING));
        const lastStart = (rings - 1) * ITEMS_PER_RING;
        const lastCount = Math.max(1, Math.min(ITEMS_PER_RING, items.length - lastStart));
        const radius = getRingRadius(lastCount, rings - 1);
        container.closest('.apes-v2-radial')?.style.setProperty('--apes-radial-size', `${radius * 2 + 130}px`);
    }

    function injectRadialItem() {
        const overlay = document.getElementById('apes-v2-command-overlay');
        const container = overlay?.querySelector('.apes-v2-radial-items');
        if (!container) return;
        let item = container.querySelector(`[data-apes-action-id="${RADIAL_ACTION_ID}"]`);
        if (!enabled()) {
            if (item) {
                item.remove();
                layoutRadialItems(container);
            }
            return;
        }
        if (!item) {
            item = document.createElement('div');
            item.className = 'apes-v2-radial-item';
            item.dataset.apesActionId = RADIAL_ACTION_ID;
            item.dataset.label = 'Resource Upgrade Planner';
            item.setAttribute('role', 'button');
            item.setAttribute('tabindex', '0');
            item.title = 'Resource Upgrade Planner';
            item.innerHTML = `<span class="apes-v2-radial-icon">${radialIcon()}</span><span class="apes-v2-radial-label">Resource Upgrade Planner</span>`;
            container.appendChild(item);
        }
        layoutRadialItems(container);
    }

    function registerRadialAction() {
        if (!APES?.actions?.register) return;
        try {
            APES.actions.register({
                id: RADIAL_ACTION_ID,
                label: 'Resource Upgrade Planner',
                description: 'Open Resource Upgrade Planner.',
                keywords: ['resources', 'fields', 'production', 'upgrade', 'planner'],
                group: 'Radial menu',
                enabled,
                run: openPlanner
            });
        } catch (error) {
            console.warn('[APES Resource Planner] radial action registration failed:', error);
        }
    }

    function sync() {
        scheduled = false;
        injectSettingsCard();
        injectCollapsedToolbarEntry();
        injectRadialItem();
        positionPlannerButton();
    }

    function schedule() {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(sync);
    }

    registerRadialAction();
    const begin = () => {
        sync();
        const observer = new MutationObserver(schedule);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        window.addEventListener('resize', schedule, { passive: true });
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('hashchange', schedule);
        window.addEventListener('qol_setting_changed', schedule);
        window.setTimeout(schedule, 250);
        window.setTimeout(schedule, 1000);
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, { once: true });
    else begin();
})();
