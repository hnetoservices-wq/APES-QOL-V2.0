/**
 * APES QoL Extension
 * Module: Resource Capacity Timer
 */
(function initResourceCapacityTimer() {
    'use strict';

    const FEATURE_KEY = 'resourceCapacityTimer';
    const STYLE_ID = 'qol-resource-capacity-timer-styles';
    const TIMER_CLASS = 'qol-resource-capacity-eta';
    const ENABLED_BODY_CLASS = 'qol-resource-capacity-timer-enabled';
    const REFRESH_MS = 1000;

    const RESOURCES = [
        { key: 'wood', name: 'Wood', storage: 'warehouse' },
        { key: 'clay', name: 'Clay', storage: 'warehouse' },
        { key: 'iron', name: 'Iron', storage: 'warehouse' },
        { key: 'crop', name: 'Crop', storage: 'granary' }
    ];

    let intervalId = null;

    function isEnabled() {
        return typeof window.isQolEnabled === 'function'
            ? window.isQolEnabled(FEATURE_KEY)
            : localStorage.getItem(`qol_${FEATURE_KEY}`) !== 'false';
    }

    function normalizeNumericText(value) {
        return String(value ?? '')
            .replace(/\u2212/g, '-')
            .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
            .replace(/\s+/g, '')
            .trim();
    }

    function parseSignedInteger(value) {
        const text = normalizeNumericText(value);
        if (!text) return null;

        const compactMatch = text.match(/^([+-]?)(\d+(?:[.,]\d+)?)([kKmM])$/);
        if (compactMatch) {
            const sign = compactMatch[1] === '-' ? -1 : 1;
            const number = Number.parseFloat(compactMatch[2].replace(',', '.'));
            const multiplier = compactMatch[3].toLowerCase() === 'm' ? 1000000 : 1000;
            const result = sign * number * multiplier;
            return Number.isFinite(result) ? Math.round(result) : null;
        }

        const negative = /^-/.test(text);
        const digits = text.replace(/[^0-9]/g, '');
        if (!digits) return null;

        const number = Number.parseInt(digits, 10);
        return Number.isFinite(number) ? (negative ? -number : number) : null;
    }

    function parseUnsignedInteger(value) {
        const number = parseSignedInteger(value);
        return Number.isFinite(number) ? Math.abs(number) : null;
    }

    function directText(element) {
        if (!element) return '';
        return Array.from(element.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent || '')
            .join(' ')
            .trim();
    }

    function formatCompactDuration(totalSeconds) {
        if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '-';
        if (totalSeconds < 60) return '<1m';

        const totalMinutes = Math.ceil(totalSeconds / 60);
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;

        if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
        if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
        return `${minutes}m`;
    }

    function formatLongDuration(totalSeconds) {
        if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return 'unknown';
        if (totalSeconds < 60) return 'less than 1 minute';

        const totalMinutes = Math.ceil(totalSeconds / 60);
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;
        const parts = [];

        if (days) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
        if (hours) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
        if (minutes) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);

        return parts.join(', ') || 'less than 1 minute';
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #resourceBar .production:has(.${TIMER_CLASS}) {
                min-height: 27px !important;
                padding: 1px 0 2px !important;
                box-sizing: border-box !important;
            }

            #resourceBar .production .value:has(.${TIMER_CLASS}) {
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 0 !important;
                min-height: 24px !important;
                line-height: 11px !important;
            }

            #resourceBar .${TIMER_CLASS} {
                display: block !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                font-family: inherit !important;
                font-size: inherit !important;
                font-weight: inherit !important;
                font-style: inherit !important;
                line-height: 11px !important;
                letter-spacing: inherit !important;
                color: inherit !important;
                text-align: center !important;
                white-space: nowrap !important;
                pointer-events: none !important;
            }

            /*
             * Travian's movement strip protrudes above #tileInformation.
             * A 14px offset only cleared the tooltip box, not the attached
             * attack strip. 30px gives the complete native tooltip assembly
             * enough room below the two-line resource HUD while leaving the
             * game's own horizontal positioning and centering untouched.
             */
            body.${ENABLED_BODY_CLASS} #tileInformation {
                padding-top: 32px !important;
            }
        `;
        document.head.appendChild(style);
    }

    function removeTimers() {
        document.querySelectorAll(`#resourceBar .${TIMER_CLASS}`).forEach(element => element.remove());
    }

    function setEnabledLayout(enabled) {
        document.body?.classList.toggle(ENABLED_BODY_CLASS, Boolean(enabled));
    }

    function readResource(resource) {
        const stock = document.querySelector(`#resourceBar .stockContainer.${resource.key}`);
        if (!stock) return null;

        const progressbar = stock.querySelector('.progressbar');
        const amountNode = progressbar?.querySelector('.values .amount.wrapper');
        const capacityNode = progressbar?.querySelector('.values .capacity');
        const block = stock.closest('[ng-repeat]') || stock.parentElement;
        const productionNode = block?.querySelector('.production .value');

        if (!progressbar || !productionNode) return null;

        const current = parseUnsignedInteger(progressbar.getAttribute('value'))
            ?? parseUnsignedInteger(amountNode?.textContent);
        const capacity = parseUnsignedInteger(progressbar.getAttribute('max-value'))
            ?? parseUnsignedInteger(capacityNode?.textContent);
        const production = parseSignedInteger(directText(productionNode));

        if (!Number.isFinite(current) || !Number.isFinite(capacity) || !Number.isFinite(production)) {
            return null;
        }

        return {
            ...resource,
            current,
            capacity,
            production,
            productionNode
        };
    }

    function calculateState(data) {
        const { current, capacity, production } = data;

        if (production > 0) {
            if (current >= capacity) {
                return {
                    label: 'Full',
                    title: `${data.name}: ${data.storage} is full.`
                };
            }

            const remaining = Math.max(0, capacity - current);
            const seconds = (remaining / production) * 3600;
            const targetDate = new Date(Date.now() + (seconds * 1000));

            return {
                label: `Full ${formatCompactDuration(seconds)}`,
                title: `${data.name}: ${data.storage} full in ${formatLongDuration(seconds)} at the current ${production.toLocaleString('en-US')}/h production. Estimated: ${targetDate.toLocaleString()}.`
            };
        }

        if (production < 0) {
            if (current <= 0) {
                return {
                    label: 'Empty',
                    title: `${data.name}: storage is empty.`
                };
            }

            const seconds = (current / Math.abs(production)) * 3600;
            const targetDate = new Date(Date.now() + (seconds * 1000));

            return {
                label: `Empty ${formatCompactDuration(seconds)}`,
                title: `${data.name}: empty in ${formatLongDuration(seconds)} at the current ${production.toLocaleString('en-US')}/h production. Estimated: ${targetDate.toLocaleString()}.`
            };
        }

        return {
            label: 'Stable',
            title: `${data.name}: production is 0/h, so the stored amount is stable.`
        };
    }

    function renderResource(data) {
        let timer = data.productionNode.querySelector(`.${TIMER_CLASS}`);
        if (!timer) {
            timer = document.createElement('span');
            timer.className = TIMER_CLASS;
            timer.setAttribute('aria-hidden', 'true');
            data.productionNode.appendChild(timer);
        }

        const state = calculateState(data);
        timer.textContent = state.label;
        timer.title = state.title;
    }

    function refresh() {
        const enabled = isEnabled();
        setEnabledLayout(enabled);

        if (!enabled) {
            removeTimers();
            return;
        }

        injectStyles();
        RESOURCES.forEach(resource => {
            const data = readResource(resource);
            if (data) renderResource(data);
        });
    }

    function readResourceSnapshot() {
        const resources = {};

        for (const resource of RESOURCES) {
            const data = readResource(resource);
            if (!data) return null;
            resources[resource.key] = {
                current: data.current,
                capacity: data.capacity,
                production: data.production
            };
        }

        return { resources, readAt: Date.now() };
    }

    window.APES?.scanners?.register({
        id: 'resources.capacity',
        label: 'Resources and Capacity',
        description: 'Reads current storage, capacity, production, and capacity timing inputs.',
        scope: 'village',
        modes: ['quick', 'full'],
        enabled: () => true,
        scan: () => {
            const snapshot = readResourceSnapshot();
            if (!snapshot) throw new Error('The current village resource bar is not ready.');
            return snapshot;
        }
    });

    function start() {
        refresh();
        if (intervalId === null) intervalId = window.setInterval(refresh, REFRESH_MS);
    }

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== FEATURE_KEY) return;
        if (!event.detail.enabled) {
            removeTimers();
            setEnabledLayout(false);
        }
        refresh();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    console.log('[APES Resource Capacity Timer] Initialized.');
})();
