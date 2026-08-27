/**
 * APES QoL v2 — Village Palette
 *
 * Passively remembers villages as the player visits them. Hold H outside
 * typing fields to open a radial village switcher; release H to close it.
 */

(() => {
    'use strict';

    const APES = window.APES;
    if (!APES?.ui) return;

    const OVERLAY_ID = 'apes-v2-village-overlay';
    const SETTING_KEY = 'keybind_villagePalette';
    const STORAGE_KEY = `apes_village_palette_${window.location.hostname}`;
    const HOLD_DELAY = 180;
    const ITEMS_PER_RING = 8;
    const FIRST_RING_RADIUS = 150;
    const MIN_ITEM_DISTANCE = 126;
    const RING_GAP = 120;

    let villages = loadVillages();
    let currentVillageId = '';
    let lastCapturedSignature = '';
    let holdTimer = null;
    let villageKeyHeld = false;
    let captureTimers = [];

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function loadVillages() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            if (!Array.isArray(parsed)) return [];
            return parsed
                .filter(village => /^\d+$/.test(String(village?.id || '')))
                .map(village => ({
                    id: String(village.id),
                    name: String(village.name || `Village ${village.id}`),
                    firstSeen: Number(village.firstSeen) || Date.now(),
                    lastSeen: Number(village.lastSeen) || Date.now()
                }));
        } catch (_error) {
            return [];
        }
    }

    function saveVillages() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(villages));
        } catch (error) {
            console.warn('[APES Village Palette] Could not save villages.', error);
        }
    }

    function villageIdFromUrl() {
        return String(window.location.hash || '')
            .match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
    }

    function currentVillageName() {
        const contextName = APES.context?.getVillageName?.();
        const domName = document.querySelector(
            '.currentVillageName .dropdownHead .selectedItem .villageEntry, ' +
            '#villageList .dropdownHead .selectedItem .villageEntry, ' +
            '.dropdownHead .selectedItem .villageEntry'
        )?.textContent;
        const name = String(
            contextName && contextName !== 'Unknown village'
                ? contextName
                : domName || ''
        ).replace(/\s+/g, ' ').trim();
        return name === 'Unknown village' ? '' : name;
    }

    function captureCurrentVillage() {
        const id = villageIdFromUrl();
        if (!id) return;

        currentVillageId = id;
        const name = currentVillageName();
        const signature = `${id}|${name}`;
        if (signature === lastCapturedSignature) return;
        lastCapturedSignature = signature;

        const existing = villages.find(village => village.id === id);
        if (existing) {
            if (name && existing.name !== name) existing.name = name;
            existing.lastSeen = Date.now();
        } else {
            villages.push({
                id,
                name: name || `Village ${id}`,
                firstSeen: Date.now(),
                lastSeen: Date.now()
            });
        }
        saveVillages();

        if (document.getElementById(OVERLAY_ID)?.classList.contains('open')) {
            renderRadial();
        }
    }

    function scheduleCapture() {
        captureTimers.forEach(timer => window.clearTimeout(timer));
        captureTimers = [0, 250, 700].map(delay =>
            window.setTimeout(captureCurrentVillage, delay)
        );
    }

    function sortedVillages() {
        return [...villages].sort((first, second) => {
            if (first.id === currentVillageId) return -1;
            if (second.id === currentVillageId) return 1;
            return first.name.localeCompare(second.name, undefined, {
                numeric: true,
                sensitivity: 'base'
            });
        });
    }

    function getRingRadius(itemCount, ringIndex) {
        const minimumRadius = itemCount > 1
            ? MIN_ITEM_DISTANCE / (2 * Math.sin(Math.PI / itemCount))
            : 0;
        return Math.max(FIRST_RING_RADIUS + ringIndex * RING_GAP, minimumRadius);
    }

    function getPosition(index, entries) {
        const ringIndex = Math.floor(index / ITEMS_PER_RING);
        const ringStart = ringIndex * ITEMS_PER_RING;
        const ringItems = entries.slice(ringStart, ringStart + ITEMS_PER_RING);
        const positionInRing = index - ringStart;
        const angle = -Math.PI / 2 + (Math.PI * 2 * positionInRing) / ringItems.length;
        const radius = getRingRadius(ringItems.length, ringIndex);
        return {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius
        };
    }

    function villageIcon() {
        return `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 11.5 12 4l9 7.5"></path>
                <path d="M5.5 10v10h13V10M9 20v-6h6v6"></path>
            </svg>
        `;
    }

    function mountRadial() {
        let overlay = document.getElementById(OVERLAY_ID);
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="apes-v2-radial" role="dialog" aria-modal="true" aria-label="Village wheel">
                <div class="apes-v2-radial-center">
                    <span class="apes-v2-radial-logo">APES</span>
                    <span class="apes-v2-radial-feature">
                        <strong class="apes-v2-radial-feature-name">Village Wheel</strong>
                    </span>
                </div>
                <div class="apes-v2-radial-items"></div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', event => {
            if (event.target === overlay) {
                closeRadial();
                return;
            }
            const item = event.target.closest('[data-village-id]');
            if (item) openVillage(item.dataset.villageId);
        });

        overlay.addEventListener('pointerover', event => {
            const item = event.target.closest('[data-village-id]');
            const center = overlay.querySelector('.apes-v2-radial-feature-name');
            if (item && center) center.textContent = item.dataset.label;
        });

        overlay.addEventListener('pointerout', event => {
            const item = event.target.closest('[data-village-id]');
            if (item && !item.contains(event.relatedTarget)) {
                const center = overlay.querySelector('.apes-v2-radial-feature-name');
                if (center) center.textContent = 'Village Wheel';
            }
        });

        return overlay;
    }

    function renderRadial() {
        captureCurrentVillage();
        const overlay = mountRadial();
        const radial = overlay.querySelector('.apes-v2-radial');
        const items = overlay.querySelector('.apes-v2-radial-items');
        const entries = sortedVillages();
        const rings = Math.max(1, Math.ceil(entries.length / ITEMS_PER_RING));
        const lastRingStart = (rings - 1) * ITEMS_PER_RING;
        const lastRingCount = Math.min(
            ITEMS_PER_RING,
            Math.max(1, entries.length - lastRingStart)
        );
        const furthestRadius = getRingRadius(lastRingCount, rings - 1);
        radial.style.setProperty('--apes-radial-size', `${furthestRadius * 2 + 130}px`);

        if (!entries.length) {
            items.innerHTML = '<div class="apes-v2-radial-empty">Visit a village once to add it here.</div>';
            return;
        }

        items.innerHTML = entries.map((village, index) => {
            const position = getPosition(index, entries);
            const isCurrent = village.id === currentVillageId;
            return `
                <div
                    class="apes-v2-radial-item${isCurrent ? ' current' : ''}"
                    data-village-id="${escapeHtml(village.id)}"
                    data-label="${escapeHtml(village.name)}"
                    role="button"
                    tabindex="0"
                    title="${escapeHtml(village.name)}${isCurrent ? ' · Current village' : ''}"
                    style="--apes-x:${position.x.toFixed(2)}px;--apes-y:${position.y.toFixed(2)}px;"
                >
                    <span class="apes-v2-radial-icon">${villageIcon()}</span>
                    <span class="apes-v2-radial-label">${escapeHtml(village.name)}</span>
                </div>
            `;
        }).join('');
    }

    function openVillage(villageId) {
        if (!/^\d+$/.test(String(villageId || ''))) return;
        closeRadial();
        window.location.hash = `#/page:village/villId:${villageId}`;
    }

    function openRadial() {
        renderRadial();
        APES.ui.closeOtherTools('villagePalette');
        const overlay = mountRadial();
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function closeRadial() {
        const overlay = document.getElementById(OVERLAY_ID);
        overlay?.classList.remove('open');
        overlay?.setAttribute('aria-hidden', 'true');
    }

    function enabled() {
        try {
            return localStorage.getItem(`qol_${SETTING_KEY}`) !== 'false';
        } catch (_error) {
            return true;
        }
    }

    function isVillageKey(event) {
        return event.code === 'KeyH' || String(event.key || '').toLowerCase() === 'h';
    }

    function clearHoldTimer() {
        if (holdTimer === null) return;
        window.clearTimeout(holdTimer);
        holdTimer = null;
    }

    window.addEventListener('keydown', event => {
        if (
            !isVillageKey(event) ||
            !enabled() ||
            event.ctrlKey ||
            event.altKey ||
            event.metaKey ||
            event.shiftKey ||
            APES.ui.isTypingTarget(event.target)
        ) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.repeat || villageKeyHeld) return;

        villageKeyHeld = true;
        clearHoldTimer();
        holdTimer = window.setTimeout(() => {
            holdTimer = null;
            if (villageKeyHeld) openRadial();
        }, HOLD_DELAY);
    }, true);

    window.addEventListener('keyup', event => {
        if (!isVillageKey(event) || !villageKeyHeld) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        villageKeyHeld = false;
        clearHoldTimer();
        closeRadial();
    }, true);

    window.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        villageKeyHeld = false;
        clearHoldTimer();
        closeRadial();
    }, true);

    window.addEventListener('blur', () => {
        villageKeyHeld = false;
        clearHoldTimer();
        closeRadial();
    });

    window.addEventListener('hashchange', scheduleCapture);
    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source !== 'villagePalette') closeRadial();
    });
    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key === SETTING_KEY && !event.detail.enabled) closeRadial();
    });

    window.APES_VILLAGE_PALETTE = Object.freeze({
        open: openRadial,
        close: closeRadial,
        getVillages: () => sortedVillages().map(village => ({ ...village }))
    });

    mountRadial();
    scheduleCapture();
    window.setInterval(captureCurrentVillage, 1200);
})();
