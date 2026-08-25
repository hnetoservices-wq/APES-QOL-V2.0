/**
 * APES QoL — Visual Tribe Skins
 *
 * Lets players display Village View buildings with Roman, Teuton, or Gaul
 * artwork. The selected skin is derived directly from Travian's current
 * building image URLs; no village or asset-catalogue scan is required.
 */
(() => {
    'use strict';

    const FEATURE_KEY = 'visualTribeSkins';
    const TOOLBAR_BUTTON_ID = 'qol-tribe-skins-toggle-btn';
    const PANEL_ID = 'qol-tribe-skins-panel';
    const SELECTION_KEY = 'apes_visual_tribe_skin_selection_v1';
    const SKINS = Object.freeze({
        roman: { name: 'Roman', prefix: 'r', mark: 'R' },
        teuton: { name: 'Teuton', prefix: 't', mark: 'T' },
        gaul: { name: 'Gaul', prefix: 'g', mark: 'G' }
    });

    let observer = null;
    let scheduled = false;
    let sessionSelection = readSelection();

    function enabled() {
        return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY);
    }

    function readSelection() {
        try {
            const saved = localStorage.getItem(SELECTION_KEY);
            return Object.hasOwn(SKINS, saved) ? saved : '';
        } catch (_) {
            return '';
        }
    }

    function getSelection() {
        return sessionSelection;
    }

    function saveSelection(choice) {
        if (!Object.hasOwn(SKINS, choice)) return;
        sessionSelection = choice;
        try {
            localStorage.setItem(SELECTION_KEY, choice);
        } catch (_) {
            // Keep the choice active for this page if storage is unavailable.
        }
        applySelectedSkin();
        refreshUi();
    }

    function cleanUrl(value) {
        try {
            const url = new URL(value, location.href);
            url.search = '';
            url.hash = '';
            return url.href;
        } catch (_) {
            return String(value || '').split(/[?#]/)[0];
        }
    }

    function buildingPath(value) {
        try {
            return new URL(value, location.href).pathname.match(/\/g(\d+)_([a-z])(\d+)\.png$/i);
        } catch (_) {
            return null;
        }
    }

    function findBuildingLevel(image) {
        const slotMatch = String(image.id || '').match(/buildingImage(\d+)/i);
        const slotId = slotMatch?.[1];
        const nearby = [
            image,
            image.parentElement,
            image.closest('[id*="location" i],[class*="location" i]'),
            slotId ? document.getElementById('buildingLevel' + slotId) : null,
            slotId ? document.getElementById('level' + slotId) : null
        ].filter(Boolean);

        const values = [];
        nearby.forEach(element => {
            values.push(
                element.getAttribute?.('data-level'),
                element.getAttribute?.('data-building-level'),
                element.getAttribute?.('aria-label'),
                element.getAttribute?.('title')
            );
            element.querySelectorAll?.('[data-level],[data-building-level],[class*="level" i],[id*="level" i]').forEach(child => {
                values.push(child.getAttribute('data-level'), child.getAttribute('data-building-level'), child.textContent);
            });
        });

        for (const value of values) {
            const match = String(value || '').match(/\b(?:level\s*)?([0-9]{1,2})\b/i);
            if (match) return Number(match[1]);
        }
        return null;
    }

    function originalFor(image) {
        const current = image.currentSrc || image.src;
        const original = image.dataset.qolTribeSkinOriginal || '';
        const applied = image.dataset.qolTribeSkinApplied || '';

        // Travian can reuse an image element for another building. A URL that is
        // neither our replacement nor the saved original becomes the new source.
        if (!original || (cleanUrl(current) !== cleanUrl(original) && cleanUrl(current) !== cleanUrl(applied))) {
            image.dataset.qolTribeSkinOriginal = current;
            delete image.dataset.qolTribeSkinApplied;
            delete image.dataset.qolTribeSkinFailed;
            return current;
        }
        return original;
    }

    function targetFor(image, choice) {
        const skin = SKINS[choice];
        if (!skin) return '';

        const original = originalFor(image);
        const match = buildingPath(original);
        if (!match) return '';

        const measuredLevel = findBuildingLevel(image);
        const sourceTier = Number(match[3] || 0);
        const level = Number.isInteger(measuredLevel) ? measuredLevel : sourceTier;
        const tier = Math.max(0, Math.min(20, Math.floor(level / 10) * 10));

        const target = new URL(original, location.href);
        target.pathname = target.pathname.replace(
            /_([a-z])\d+(\.png)$/i,
            '_' + skin.prefix + String(tier).padStart(2, '0') + '$2'
        );
        target.search = '';
        target.hash = '';
        return target.href;
    }

    function restoreImage(image) {
        const original = image.dataset.qolTribeSkinOriginal;
        if (!original) return;
        delete image.dataset.qolTribeSkinApplied;
        delete image.dataset.qolTribeSkinFailed;
        if (cleanUrl(image.src) !== cleanUrl(original)) image.src = original;
    }

    function restoreOriginalSkins() {
        document.querySelectorAll('img[data-qol-tribe-skin-original]').forEach(restoreImage);
    }

    function applyToImage(image, choice) {
        const target = targetFor(image, choice);
        if (!target) return;

        const failed = image.dataset.qolTribeSkinFailed;
        if (failed && cleanUrl(failed) === cleanUrl(target)) return;
        if (cleanUrl(image.src) === cleanUrl(target)) {
            image.dataset.qolTribeSkinApplied = target;
            return;
        }

        const original = image.dataset.qolTribeSkinOriginal;
        const fallback = () => {
            image.dataset.qolTribeSkinFailed = target;
            delete image.dataset.qolTribeSkinApplied;
            if (original && cleanUrl(image.src) !== cleanUrl(original)) image.src = original;
        };
        image.addEventListener('error', fallback, { once: true });
        image.dataset.qolTribeSkinApplied = target;
        image.src = target;
    }

    function applySelectedSkin() {
        if (!enabled()) {
            restoreOriginalSkins();
            return;
        }

        const choice = getSelection();
        if (!choice) {
            restoreOriginalSkins();
            return;
        }

        document.querySelectorAll('img.location[src*="/layout/images/building/thumb/"]').forEach(image => {
            applyToImage(image, choice);
        });
    }

    function refreshUi() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;

        const selected = getSelection();
        panel.querySelectorAll('[data-skin]').forEach(control => {
            const active = control.dataset.skin === selected;
            control.classList.toggle('qol-active', active);
            control.setAttribute('aria-pressed', String(active));
        });

        const current = panel.querySelector('.qol-tribe-skins-current');
        if (!current) return;
        current.textContent = selected
            ? SKINS[selected].name + ' building skin is active.'
            : 'Choose a tribe to apply its building skin.';
    }

    function injectStyles() {
        if (document.getElementById('qol-tribe-skins-styles')) return;
        const style = document.createElement('style');
        style.id = 'qol-tribe-skins-styles';
        style.textContent = `
            #${TOOLBAR_BUTTON_ID}{position:fixed!important;display:none!important;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;margin:0!important;padding:0!important;border:2px solid var(--qol-accent)!important;border-radius:50%!important;background:var(--qol-accent-soft)!important;color:var(--qol-accent-ink)!important;box-shadow:0 2px 4px rgba(0,0,0,.22)!important;cursor:pointer!important;user-select:none!important;box-sizing:border-box!important;z-index:9999!important;font:700 17px Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${TOOLBAR_BUTTON_ID}:hover{transform:scale(1.08)!important;background:#f7f5f0!important}
            #${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${PANEL_ID}{position:fixed!important;right:24px!important;top:74px!important;z-index:1000001!important;display:none!important;flex-direction:column!important;width:min(390px,calc(100vw - 32px))!important;max-height:calc(100vh - 96px)!important;border:3px solid var(--qol-border)!important;border-radius:5px!important;background:#f7f5f0!important;box-shadow:0 10px 30px rgba(0,0,0,.5)!important;overflow:hidden!important;color:#332719!important}
            #${PANEL_ID}.qol-tribe-skins-open{display:flex!important}
            #${PANEL_ID} .qol-tribe-skins-header{display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 auto!important;padding:9px 11px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-dark))!important;color:#f7f5f0!important;font-size:13px!important;font-weight:700!important}
            #${PANEL_ID} .qol-tribe-skins-close{display:flex!important;align-items:center!important;justify-content:center!important;width:22px!important;height:22px!important;border-radius:3px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;font-size:20px!important;font-weight:700!important;line-height:1!important;cursor:pointer!important}
            #${PANEL_ID} .qol-tribe-skins-close:hover{background:rgba(255,255,255,.15)!important}
            #${PANEL_ID} .qol-tribe-skins-body{display:flex!important;flex-direction:column!important;gap:11px!important;min-height:0!important;padding:13px!important;overflow:auto!important;background:#f7f5f0!important;color:#332719!important;font-size:10px!important;line-height:1.45!important}
            #${PANEL_ID} .qol-tribe-skins-copy{margin:0!important;color:#5f513f!important}
            #${PANEL_ID} .qol-tribe-skins-choice-label{margin:1px 0 -5px!important;color:#5f513f!important;font-size:10px!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.4px!important}
            #${PANEL_ID} .qol-tribe-skins-choices{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important}
            #${PANEL_ID} .qol-tribe-skins-choice{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:6px!important;min-width:0!important;min-height:82px!important;padding:9px 5px!important;border:1px solid #9c8668!important;border-radius:4px!important;background:linear-gradient(to bottom,#fff,#f0e7da)!important;color:var(--qol-text-accent)!important;cursor:pointer!important;user-select:none!important;font-size:10px!important;font-weight:700!important;text-align:center!important;box-shadow:0 1px 2px rgba(0,0,0,.12)!important}
            #${PANEL_ID} .qol-tribe-skins-choice:hover{border-color:#6e5435!important;background:#fff6e5!important;transform:translateY(-1px)!important}
            #${PANEL_ID} .qol-tribe-skins-choice:focus-visible{outline:2px solid #b9872d!important;outline-offset:2px!important}
            #${PANEL_ID} .qol-tribe-skins-mark{display:flex!important;align-items:center!important;justify-content:center!important;width:37px!important;height:37px!important;border:2px solid var(--qol-accent-hover)!important;border-radius:50%!important;background:#f8f1e5!important;color:var(--qol-accent-ink)!important;font:700 17px Georgia,serif!important}
            #${PANEL_ID} .qol-tribe-skins-choice.qol-active{border-color:#487315!important;background:linear-gradient(to bottom,#7db830,#5f941f)!important;color:#fff!important;box-shadow:0 0 0 1px rgba(72,115,21,.3),0 2px 5px rgba(0,0,0,.2)!important}
            #${PANEL_ID} .qol-tribe-skins-choice.qol-active .qol-tribe-skins-mark{border-color:#fff!important;background:#487315!important;color:#fff!important}
            #${PANEL_ID} .qol-tribe-skins-current{margin:0!important;padding:8px 9px!important;border:1px solid #d6cab8!important;border-radius:3px!important;background:#fff!important;color:#5f513f!important;font-size:9px!important;text-align:center!important}
            #${PANEL_ID} .qol-tribe-skins-note{margin:0!important;color:#89765d!important;font-size:8px!important;text-align:center!important}
            @media(max-width:430px){#${PANEL_ID} .qol-tribe-skins-choices{grid-template-columns:1fr!important}#${PANEL_ID} .qol-tribe-skins-choice{min-height:55px!important;flex-direction:row!important}}
        `;
        document.head.appendChild(style);
    }

    function activate(element, handler) {
        if (!element) return;
        element.addEventListener('click', handler);
        element.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            handler(event);
        });
    }

    function injectUi() {
        if (!enabled()) return;
        injectStyles();

        let button = document.getElementById(TOOLBAR_BUTTON_ID);
        if (!button) {
            button = document.createElement('div');
            button.id = TOOLBAR_BUTTON_ID;
            button.title = 'Visual Tribe Skin';
            button.setAttribute('role', 'button');
            button.setAttribute('tabindex', '0');
            button.setAttribute('aria-label', 'Open Visual Tribe Skin');
            button.textContent = '◈';
            activate(button, event => {
                event.preventDefault();
                event.stopPropagation();
                document.getElementById(PANEL_ID)?.classList.toggle('qol-tribe-skins-open');
            });
            document.body.appendChild(button);
        }

        let panel = document.getElementById(PANEL_ID);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = PANEL_ID;
            panel.innerHTML = `
                <div class="qol-tribe-skins-header">
                    <span>Visual Tribe Skin</span>
                    <div class="qol-tribe-skins-close" data-close role="button" tabindex="0" aria-label="Close">×</div>
                </div>
                <div class="qol-tribe-skins-body">
                    <p class="qol-tribe-skins-copy">Choose which tribe's building artwork you want to use in Village View.</p>
                    <div class="qol-tribe-skins-choice-label">Building skin</div>
                    <div class="qol-tribe-skins-choices">
                        ${Object.entries(SKINS).map(([key, skin]) => `
                            <div class="qol-tribe-skins-choice" data-skin="${key}" role="button" tabindex="0" aria-pressed="false">
                                <span class="qol-tribe-skins-mark">${skin.mark}</span>
                                <span>${skin.name}</span>
                            </div>
                        `).join('')}
                    </div>
                    <p class="qol-tribe-skins-current"></p>
                    <p class="qol-tribe-skins-note">Your choice is saved in this browser and applies automatically. No village scan is needed.</p>
                </div>
            `;
            activate(panel.querySelector('[data-close]'), () => panel.classList.remove('qol-tribe-skins-open'));
            panel.querySelectorAll('[data-skin]').forEach(control => {
                activate(control, () => saveSelection(control.dataset.skin));
            });
            document.body.appendChild(panel);
        }

        panel.style.removeProperty('display');
        refreshUi();
        applySelectedSkin();
        window.qolRepositionAllButtons?.();
    }

    function start() {
        if (!enabled()) return;
        injectUi();
        applySelectedSkin();
        if (observer) return;

        observer = new MutationObserver(mutations => {
            if (!enabled()) return;
            const affectsBuildings = mutations.some(mutation => {
                if (mutation.type === 'attributes') return mutation.target instanceof HTMLImageElement;
                return [...mutation.addedNodes].some(node =>
                    node.nodeType === Node.ELEMENT_NODE
                    && (node.matches?.('img.location') || node.querySelector?.('img.location'))
                );
            });
            if (!affectsBuildings || scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                applySelectedSkin();
            });
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src']
        });
    }

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        document.getElementById(PANEL_ID)?.classList.remove('qol-tribe-skins-open');
    });

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== FEATURE_KEY) return;
        if (event.detail.enabled) {
            start();
        } else {
            document.getElementById(PANEL_ID)?.classList.remove('qol-tribe-skins-open');
            document.getElementById(PANEL_ID)?.style.setProperty('display', 'none', 'important');
            restoreOriginalSkins();
        }
    });

    window.APES_TRIBE_SKINS = Object.freeze({
        get: getSelection,
        set: saveSelection,
        apply: applySelectedSkin,
        restore: restoreOriginalSkins
    });

    const begin = () => {
        start();
        console.info('[APES Visual Tribe Skin] Ready. No village scan required.');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', begin, { once: true });
    } else {
        begin();
    }
})();
