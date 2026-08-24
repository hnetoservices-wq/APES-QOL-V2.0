/**
 * APES QoL Extension
 * Module: Village Overview Dashboard
 *
 * First iteration:
 * - Opens a persistent, draggable and resizable village overview window.
 * - Scans every village only when the user selects Scan Now.
 * - Waits for the village identity and resource bar to settle before recording.
 * - Shows stored resources, capacities and hourly production for each village.
 * - Restores the exact starting route after the scan.
 */
(() => {
    'use strict';

    const FEATURE_KEY = 'villageDashboard';
    const PANEL_ID = 'qol-village-dashboard-panel';
    const TOGGLE_ID = 'qol-village-dashboard-toggle-btn';
    const STYLE_ID = 'qol-village-dashboard-styles';
    const OVERLAY_ID = 'qol-village-dashboard-scan-overlay';
    const MAX_VILLAGES = 100;
    const SNAPSHOT_TIMEOUT = 7000;
    const SETTLE_DELAY = 650;
    const CACHE_KEY = `qol_village_dashboard_${window.location.hostname}`;
    const MODE_KEY = 'qol_village_dashboard_scan_mode';
    const RALLY_SCANNERS = Object.freeze([
        'rally.incomings',
        'rally.outgoings',
        'rally.resources'
    ]);

    const RESOURCES = Object.freeze([
        { key: 'wood', label: 'Wood', short: 'W' },
        { key: 'clay', label: 'Clay', short: 'C' },
        { key: 'iron', label: 'Iron', short: 'I' },
        { key: 'crop', label: 'Crop', short: 'Cr' }
    ]);

    let panel = null;
    let toggleButton = null;
    let isScanning = false;
    let scanData = null;
    let selectedMode = localStorage.getItem(MODE_KEY) === 'full'
        ? 'full'
        : 'quick';

    const sleep = milliseconds => new Promise(resolve => {
        window.setTimeout(resolve, milliseconds);
    });

    function isEnabled() {
        return typeof window.isQolEnabled === 'function'
            ? window.isQolEnabled(FEATURE_KEY) === true
            : localStorage.getItem(`qol_${FEATURE_KEY}`) === 'true';
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function normalizeNumericText(value) {
        return String(value ?? '')
            .replace(/\u2212/g, '-')
            .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
            .replace(/\s+/g, '')
            .trim();
    }

    function parseInteger(value, signed = false) {
        const text = normalizeNumericText(value);
        if (!text) return null;

        const compact = text.match(/^([+-]?)(\d+(?:[.,]\d+)?)([kKmM])$/);
        if (compact) {
            const sign = compact[1] === '-' ? -1 : 1;
            const number = Number.parseFloat(compact[2].replace(',', '.'));
            const multiplier = compact[3].toLowerCase() === 'm' ? 1000000 : 1000;
            const result = Math.round(sign * number * multiplier);
            return Number.isFinite(result) ? (signed ? result : Math.abs(result)) : null;
        }

        const negative = text.startsWith('-');
        const digits = text.replace(/[^0-9]/g, '');
        if (!digits) return null;

        const number = Number.parseInt(digits, 10);
        if (!Number.isFinite(number)) return null;
        return signed && negative ? -number : number;
    }

    function directText(element) {
        if (!element) return '';
        return Array.from(element.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent || '')
            .join(' ')
            .trim();
    }

    function formatNumber(value) {
        return Number.isFinite(value) ? value.toLocaleString('en-US') : '-';
    }

    function formatProduction(value) {
        if (!Number.isFinite(value)) return '-';
        const sign = value > 0 ? '+' : '';
        return `${sign}${formatNumber(value)}/h`;
    }

    function formatCompactDuration(totalSeconds) {
        if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '-';
        if (totalSeconds < 60) return '<1m';
        const minutes = Math.ceil(totalSeconds / 60);
        const days = Math.floor(minutes / 1440);
        const hours = Math.floor((minutes % 1440) / 60);
        const remainder = minutes % 60;
        if (days) return hours ? `${days}d ${hours}h` : `${days}d`;
        if (hours) return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
        return `${remainder}m`;
    }

    function getCapacityState(value) {
        if (value.production > 0) {
            if (value.current >= value.capacity) return { label: 'Full', tone: 'danger' };
            return {
                label: `Full ${formatCompactDuration((value.capacity - value.current) / value.production * 3600)}`,
                tone: 'warning'
            };
        }
        if (value.production < 0) {
            if (value.current <= 0) return { label: 'Empty', tone: 'danger' };
            return {
                label: `Empty ${formatCompactDuration(value.current / Math.abs(value.production) * 3600)}`,
                tone: 'danger'
            };
        }
        return { label: 'Stable', tone: 'neutral' };
    }

    function getVillageId() {
        return (window.location.hash || '')
            .match(/(?:^|\/)villId:([^/]+)/)?.[1] || null;
    }

    function getVillageName() {
        const selectors = [
            '.currentVillageName.dropdown .selectedItem .villageEntry',
            '#villageList .currentVillageName .selectedItem .villageEntry',
            '.currentVillageName .villageEntry',
            '#villageList .selectedItem .villageEntry',
            '.villageEntry.active',
            '.active .villageEntry'
        ];

        for (const selector of selectors) {
            const value = document.querySelector(selector)?.textContent
                ?.replace(/[\r\n]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            if (value) return value;
        }

        return 'Current village';
    }

    function getVillageIdentity() {
        const id = getVillageId();
        return id ? `id:${id}` : `name:${getVillageName().toLowerCase()}`;
    }

    function readResource(resource) {
        const stock = document.querySelector(
            `#resourceBar .stockContainer.${resource.key}`
        );
        const progress = stock?.querySelector('.progressbar');
        const amount = progress?.querySelector('.values .amount.wrapper');
        const capacity = progress?.querySelector('.values .capacity');
        const block = stock?.closest('[ng-repeat]') || stock?.parentElement;
        const production = block?.querySelector('.production .value');

        if (!progress || !production) return null;

        const currentValue = parseInteger(progress.getAttribute('value'))
            ?? parseInteger(amount?.textContent);
        const capacityValue = parseInteger(progress.getAttribute('max-value'))
            ?? parseInteger(capacity?.textContent);
        const productionValue = parseInteger(directText(production), true);

        if (![currentValue, capacityValue, productionValue].every(Number.isFinite)) {
            return null;
        }

        return {
            current: currentValue,
            capacity: capacityValue,
            production: productionValue
        };
    }

    async function readSharedResources() {
        const provider = window.APES?.scanners?.get('resources.capacity');
        if (provider?.enabled()) {
            const result = await window.APES.scanners.run('resources.capacity', {
                source: 'villageDashboard'
            });
            if (result?.resources) return result.resources;
        }

        const resources = {};
        for (const resource of RESOURCES) {
            const data = readResource(resource);
            if (!data) return null;
            resources[resource.key] = data;
        }
        return resources;
    }

    async function readVillageSnapshot() {
        const resources = await readSharedResources();
        if (!resources) return null;

        return {
            identity: getVillageIdentity(),
            villageId: getVillageId(),
            villageName: getVillageName(),
            resources,
            readAt: Date.now()
        };
    }

    function snapshotSignature(snapshot) {
        if (!snapshot) return '';
        return [
            snapshot.identity,
            ...RESOURCES.flatMap(resource => {
                const data = snapshot.resources[resource.key];
                return [data.current, data.capacity, data.production];
            })
        ].join('|');
    }

    async function waitForSettledSnapshot(previousIdentity = null) {
        const started = performance.now();
        let identityChangedAt = previousIdentity ? null : started;
        let lastSignature = '';
        let stableSamples = 0;

        while (performance.now() - started < SNAPSHOT_TIMEOUT) {
            await sleep(120);

            const identity = getVillageIdentity();
            if (previousIdentity && identity === previousIdentity) continue;
            if (identityChangedAt === null) identityChangedAt = performance.now();
            if (performance.now() - identityChangedAt < SETTLE_DELAY) continue;

            let snapshot = null;
            try {
                snapshot = await readVillageSnapshot();
            } catch (_) {
                snapshot = null;
            }
            if (!snapshot || snapshot.identity !== identity) {
                stableSamples = 0;
                lastSignature = '';
                continue;
            }

            const signature = snapshotSignature(snapshot);
            if (signature === lastSignature) {
                stableSamples += 1;
            } else {
                lastSignature = signature;
                stableSamples = 1;
            }

            if (stableSamples >= 3) return snapshot;
        }

        return null;
    }

    function findNextVillageButton() {
        const candidates = Array.from(document.querySelectorAll(
            '#villageList .navigation.next, ' +
            '.currentVillageName.dropdown a.navigation.next.clickable'
        ));

        return candidates.find(button => {
            if (button.matches('.disabled,[disabled]') ||
                button.closest('.disabled,[disabled]')) return false;
            const style = getComputedStyle(button);
            const rect = button.getBoundingClientRect();
            return style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                rect.width > 0 && rect.height > 0;
        }) || null;
    }

    function activateNextVillage() {
        const button = findNextVillageButton();
        if (!button) return false;

        const rect = button.getBoundingClientRect();
        const options = {
            view: window,
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
        };

        if (typeof PointerEvent === 'function') {
            button.dispatchEvent(new PointerEvent('pointerdown', {
                ...options,
                buttons: 1,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
            button.dispatchEvent(new PointerEvent('pointerup', {
                ...options,
                buttons: 0,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
        }

        button.dispatchEvent(new MouseEvent('mousedown', {
            ...options,
            buttons: 1
        }));
        button.dispatchEvent(new MouseEvent('mouseup', options));
        button.dispatchEvent(new MouseEvent('click', options));
        return true;
    }

    function showScanOverlay(mode = 'quick') {
        removeScanOverlay();
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.innerHTML = `
            <div class="qol-vd-overlay-title">${mode === 'full' ? 'Full' : 'Quick'} Village Scan</div>
            <div class="qol-vd-overlay-status">Preparing the first village...</div>
            <div class="qol-vd-overlay-note">${mode === 'full' ? 'This can take several minutes because every enabled Rally Point page is verified.' : 'Please wait while APES verifies village resources and Culture Points.'}</div>
        `;
        document.body.appendChild(overlay);
    }

    function updateScanStatus(message) {
        const status = document.querySelector(`#${OVERLAY_ID} .qol-vd-overlay-status`);
        if (status) status.textContent = message;
        const panelStatus = panel?.querySelector('.qol-vd-status');
        if (panelStatus) panelStatus.textContent = message;
    }

    function removeScanOverlay() {
        document.getElementById(OVERLAY_ID)?.remove();
    }

    function setScanButtonState(disabled) {
        const button = panel?.querySelector('.qol-vd-scan-btn');
        if (!button) return;
        button.classList.toggle('is-disabled', disabled);
        button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        button.textContent = disabled ? 'Scanning...' : 'Scan Now';
        panel?.querySelector('.qol-vd-mode-picker')
            ?.classList.toggle('is-disabled', disabled);
    }

    function saveSnapshot(data) {
        scanData = data;
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch (error) {
            console.warn('[APES Village Dashboard] Snapshot could not be saved.', error);
        }
    }

    function loadSnapshot() {
        try {
            const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            if ([1, 2].includes(parsed?.schema) && Array.isArray(parsed.villages)) {
                scanData = parsed;
            }
        } catch (error) {
            console.warn('[APES Village Dashboard] Saved snapshot is invalid.', error);
        }
    }

    function totalsFor(data) {
        const totals = Object.fromEntries(RESOURCES.map(resource => [
            resource.key,
            { current: 0, capacity: 0, production: 0 }
        ]));

        data.villages.forEach(village => {
            RESOURCES.forEach(resource => {
                const value = village.resources[resource.key];
                if (!value) return;
                totals[resource.key].current += value.current;
                totals[resource.key].capacity += value.capacity;
                totals[resource.key].production += value.production;
            });
        });

        return totals;
    }

    function resourceCard(resource, value) {
        const percent = value.capacity > 0
            ? Math.min(100, Math.max(0, value.current / value.capacity * 100))
            : 0;

        return `
            <div class="qol-vd-summary-card ${resource.key}">
                <div class="qol-vd-summary-heading">
                    <span class="qol-vd-resource-mark">${escapeHtml(resource.short)}</span>
                    <span>${escapeHtml(resource.label)}</span>
                </div>
                <strong>${formatNumber(value.current)} <small>/ ${formatNumber(value.capacity)}</small></strong>
                <span class="qol-vd-production ${value.production < 0 ? 'negative' : 'positive'}">${formatProduction(value.production)}</span>
                <div class="qol-vd-meter"><span style="width:${percent.toFixed(1)}%"></span></div>
            </div>
        `;
    }

    function resourceCell(value) {
        const tone = value.production < 0 ? 'negative' : 'positive';
        const capacityState = getCapacityState(value);
        return `
            <td title="Capacity: ${formatNumber(value.capacity)}">
                <strong>${formatNumber(value.current)}</strong>
                <span class="qol-vd-cell-production ${tone}">${formatProduction(value.production)}</span>
                <span class="qol-vd-cell-eta ${capacityState.tone}">${escapeHtml(capacityState.label)}</span>
            </td>
        `;
    }

    function scannerAvailable(id) {
        const provider = window.APES?.scanners?.get(id);
        return Boolean(provider && provider.enabled());
    }

    function rallyTotals(data) {
        return data.villages.reduce((totals, village) => {
            const rally = village.rally || {};
            totals.incomings += rally.incomings?.length || 0;
            totals.outgoings += rally.outgoings?.length || 0;
            totals.shipments += rally.resources?.length || 0;
            (rally.resources || []).forEach(shipment => {
                RESOURCES.forEach(resource => {
                    totals.resources[resource.key] += Number(shipment[resource.key] || 0);
                });
            });
            totals.errors += rally.errors?.length || 0;
            return totals;
        }, {
            incomings: 0,
            outgoings: 0,
            shipments: 0,
            errors: 0,
            resources: { wood: 0, clay: 0, iron: 0, crop: 0 }
        });
    }

    function renderIntelligence(data) {
        const sections = [];

        if (data.cp) {
            const remaining = Math.max(0, Number(data.cp.target || 0) - Number(data.cp.current || 0));
            sections.push(`
                <div class="qol-vd-intelligence-card cp">
                    <div class="qol-vd-intelligence-title"><span>Culture Points</span><span>${formatNumber(data.cp.cpPerDay)} / day</span></div>
                    <strong>${formatNumber(data.cp.current)} / ${formatNumber(data.cp.target)} CP</strong>
                    <span>${formatNumber(remaining)} remaining · ${escapeHtml(data.cp.prediction?.text || 'Prediction unavailable')}</span>
                </div>
            `);
        } else if (data.modules?.cp && data.modules.cp !== 'not-requested') {
            sections.push(`
                <div class="qol-vd-intelligence-card muted">
                    <div class="qol-vd-intelligence-title"><span>Culture Points</span></div>
                    <strong>${data.modules.cp === 'disabled' ? 'CP Manager disabled' : 'CP scan unavailable'}</strong>
                    <span>Enable CP Manager to include its account scan.</span>
                </div>
            `);
        }

        if (data.scanMode === 'full') {
            if (data.modules?.rally === 'disabled') {
                sections.push(`
                    <div class="qol-vd-intelligence-card muted">
                        <div class="qol-vd-intelligence-title"><span>Rally Point</span></div>
                        <strong>Rally Point Scanner disabled</strong>
                        <span>Enable it to include per-village movements and deliveries.</span>
                    </div>
                `);
            } else {
                const rally = rallyTotals(data);
                sections.push(`
                    <div class="qol-vd-intelligence-card rally">
                        <div class="qol-vd-intelligence-title"><span>Rally Point</span><span>${rally.errors ? `${rally.errors} scan issue${rally.errors === 1 ? '' : 's'}` : 'All enabled scans completed'}</span></div>
                        <strong>${rally.incomings} incoming · ${rally.outgoings} outgoing · ${rally.shipments} deliveries</strong>
                        <span>Incoming resources: W ${formatNumber(rally.resources.wood)} · C ${formatNumber(rally.resources.clay)} · I ${formatNumber(rally.resources.iron)} · Cr ${formatNumber(rally.resources.crop)}</span>
                    </div>
                `);
            }
        }

        return sections.length
            ? `<div class="qol-vd-intelligence">${sections.join('')}</div>`
            : '';
    }

    function activityCell(village) {
        if (!village.rally) {
            return '<td class="qol-vd-activity"><span class="qol-vd-badge muted">Not scanned</span></td>';
        }
        const rally = village.rally;
        const incomings = rally.incomings || [];
        const hostile = incomings.filter(movement => /attack|siege|raid/i.test(movement.type || ''));
        const reinforcements = incomings.filter(movement => /reinforcement|support/i.test(movement.type || ''));
        const outgoings = rally.outgoings || [];
        const shipments = rally.resources || [];
        const badges = [];

        if (hostile.length) badges.push(`<span class="qol-vd-badge danger">${hostile.length} hostile</span>`);
        if (reinforcements.length) badges.push(`<span class="qol-vd-badge support">${reinforcements.length} support</span>`);
        if (outgoings.length) badges.push(`<span class="qol-vd-badge outgoing">${outgoings.length} outgoing</span>`);
        if (shipments.length) badges.push(`<span class="qol-vd-badge merchant">${shipments.length} deliver${shipments.length === 1 ? 'y' : 'ies'}</span>`);
        if (rally.errors?.length) badges.push(`<span class="qol-vd-badge error">Scan issue</span>`);

        return `<td class="qol-vd-activity">${badges.join('') || '<span class="qol-vd-badge clear">Clear</span>'}</td>`;
    }

    function renderSnapshot() {
        const content = panel?.querySelector('.qol-vd-content');
        const status = panel?.querySelector('.qol-vd-status');
        if (!content || !status) return;

        if (!scanData?.villages?.length) {
            content.innerHTML = `
                <div class="qol-vd-empty">
                    <strong>No village snapshot yet.</strong>
                    <span>Select Scan Now to visit every village and build the overview.</span>
                </div>
            `;
            status.textContent = 'Ready to scan.';
            status.dataset.tone = 'neutral';
            return;
        }

        const totals = totalsFor(scanData);
        const cards = RESOURCES.map(resource =>
            resourceCard(resource, totals[resource.key])
        ).join('');
        const rows = scanData.villages.map(village => `
            <tr>
                <td class="qol-vd-village-cell">
                    <span class="qol-vd-village-link" role="button" tabindex="0"
                        data-village-id="${escapeHtml(village.villageId || '')}"
                        title="Open ${escapeHtml(village.villageName)}">
                        ${escapeHtml(village.villageName)}
                    </span>
                </td>
                ${RESOURCES.map(resource =>
                    resourceCell(village.resources[resource.key])
                ).join('')}
                ${activityCell(village)}
            </tr>
        `).join('');

        const scannedAt = new Date(scanData.scannedAt);
        content.innerHTML = `
            <div class="qol-vd-summary">${cards}</div>
            ${renderIntelligence(scanData)}
            <div class="qol-vd-table-wrap">
                <table class="qol-vd-table">
                    <thead>
                        <tr>
                            <th>Village</th>
                            ${RESOURCES.map(resource => `<th>${escapeHtml(resource.label)}</th>`).join('')}
                            <th>Activity</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <div class="qol-vd-snapshot-meta">
                ${escapeHtml(scanData.scanMode === 'full' ? 'Full' : 'Quick')} snapshot taken ${escapeHtml(scannedAt.toLocaleString())}. Resource cells show stored amount, production and capacity timing; hover for capacity.
            </div>
        `;

        const moduleFailures = Object.values(scanData.modules || {})
            .filter(value => value === 'failed' || value === 'partial').length;
        status.textContent = scanData.complete && moduleFailures === 0
            ? `${scanData.scanMode === 'full' ? 'Full' : 'Quick'} scan complete. ${scanData.villages.length} ${scanData.villages.length === 1 ? 'village' : 'villages'} recorded.`
            : `Saved ${scanData.villages.length} villages, but the scan may be incomplete.`;
        status.dataset.tone = scanData.complete && moduleFailures === 0 ? 'success' : 'error';

        content.querySelectorAll('.qol-vd-village-link').forEach(link => {
            const openVillage = event => {
                if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                const id = link.dataset.villageId;
                if (!id) return;
                window.location.hash = `#/page:village/villId:${id}`;
            };
            link.addEventListener('click', openVillage);
            link.addEventListener('keydown', openVillage);
        });
    }

    function updateModeControls() {
        panel?.querySelectorAll('[data-qol-vd-mode]').forEach(control => {
            const active = control.dataset.qolVdMode === selectedMode;
            control.classList.toggle('active', active);
            control.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        const explanation = panel?.querySelector('.qol-vd-mode-explanation');
        if (explanation) {
            explanation.textContent = selectedMode === 'full'
                ? 'Full: resources, capacity timing, CP, and every enabled Rally Point scanner for every village.'
                : 'Quick: resources, capacity timing, and the enabled CP account scan.';
        }
    }

    function setScanMode(mode) {
        selectedMode = mode === 'full' ? 'full' : 'quick';
        try { localStorage.setItem(MODE_KEY, selectedMode); } catch (_) {}
        updateModeControls();
    }

    async function navigateToVillage(village) {
        if (!village?.villageId) throw new Error(`No village ID was recorded for ${village?.villageName || 'this village'}.`);
        window.location.hash = `#/page:village/villId:${village.villageId}`;

        const started = performance.now();
        while (performance.now() - started < 7000) {
            if (getVillageIdentity() === village.identity) {
                const snapshot = await waitForSettledSnapshot();
                if (snapshot?.identity === village.identity) return snapshot;
            }
            await sleep(120);
        }
        throw new Error(`${village.villageName} did not finish loading.`);
    }

    async function scanCpModule(data) {
        if (!scannerAvailable('cp.account')) {
            data.modules.cp = 'disabled';
            return;
        }

        updateScanStatus('CP phase: preparing the account Culture Point scan...');
        try {
            data.cp = await window.APES.scanners.run('cp.account', {
                source: 'villageDashboard',
                onProgress: message => updateScanStatus(`CP phase: ${message}`)
            });
            if (!data.cp) {
                throw new Error('The Culture Point scanner was already busy or returned no result.');
            }
            data.modules.cp = 'complete';
        } catch (error) {
            console.error('[APES Village Dashboard] CP module failed.', error);
            data.modules.cp = 'failed';
            data.moduleErrors.push(`Culture Points: ${error?.message || 'scan failed'}`);
        }
    }

    async function scanRallyModules(data) {
        const providers = RALLY_SCANNERS
            .map(id => window.APES?.scanners?.get(id))
            .filter(provider => provider?.enabled());

        if (!providers.length) {
            data.modules.rally = 'disabled';
            return;
        }

        let failedScans = 0;
        for (let villageIndex = 0; villageIndex < data.villages.length; villageIndex += 1) {
            const village = data.villages[villageIndex];
            village.rally = {
                incomings: [],
                outgoings: [],
                resources: [],
                errors: []
            };

            updateScanStatus(`Rally Point phase: opening ${village.villageName} (${villageIndex + 1}/${data.villages.length})...`);
            try {
                await navigateToVillage(village);
            } catch (error) {
                failedScans += providers.length;
                village.rally.errors.push(error?.message || 'Village could not be opened.');
                continue;
            }

            for (const provider of providers) {
                const label = `${village.villageName}: ${provider.label}`;
                updateScanStatus(`Rally Point phase: ${label}...`);
                try {
                    const result = await window.APES.scanners.run(provider.id, {
                        source: 'villageDashboard',
                        village,
                        onProgress: message => updateScanStatus(`${label} — ${message}`)
                    });
                    const resultKey = provider.id === 'rally.incomings'
                        ? 'incomings'
                        : provider.id === 'rally.outgoings'
                            ? 'outgoings'
                            : 'resources';
                    village.rally[resultKey] = Array.isArray(result) ? result : [];
                } catch (error) {
                    failedScans += 1;
                    const message = `${provider.label}: ${error?.message || 'scan failed'}`;
                    village.rally.errors.push(message);
                    data.moduleErrors.push(`${village.villageName} — ${message}`);
                    console.error(`[APES Village Dashboard] ${label} failed.`, error);
                }
            }
        }

        data.modules.rally = failedScans === 0 ? 'complete' : 'partial';
    }

    async function scanVillages() {
        if (isScanning || !isEnabled()) return;

        isScanning = true;
        const scanMode = selectedMode;
        const originalHash = window.location.hash || '';
        const villages = [];
        const visited = new Set();
        let complete = false;
        let startingIdentity = null;

        setScanButtonState(true);
        showScanOverlay(scanMode);
        updateScanStatus('Waiting for the current village resource bar...');

        try {
            let snapshot = await waitForSettledSnapshot();
            if (!snapshot) {
                throw new Error('The current village resource bar did not become ready.');
            }

            startingIdentity = snapshot.identity;

            for (let index = 0; index < MAX_VILLAGES; index += 1) {
                if (visited.has(snapshot.identity)) {
                    complete = snapshot.identity === startingIdentity;
                    break;
                }

                visited.add(snapshot.identity);
                villages.push(snapshot);
                updateScanStatus(
                    `Recorded ${snapshot.villageName}. ${villages.length} ${villages.length === 1 ? 'village' : 'villages'} scanned...`
                );

                const previousIdentity = snapshot.identity;
                if (!activateNextVillage()) {
                    complete = villages.length === 1;
                    break;
                }

                const nextSnapshot = await waitForSettledSnapshot(previousIdentity);
                if (!nextSnapshot) {
                    throw new Error(`The next village did not finish loading after ${snapshot.villageName}.`);
                }

                if (nextSnapshot.identity === startingIdentity) {
                    complete = true;
                    break;
                }

                snapshot = nextSnapshot;
            }

            const data = {
                schema: 2,
                host: window.location.hostname,
                scannedAt: Date.now(),
                scanMode,
                complete,
                villages,
                cp: null,
                modules: {
                    resources: complete ? 'complete' : 'partial',
                    cp: 'not-requested',
                    rally: 'not-requested'
                },
                moduleErrors: []
            };

            await scanCpModule(data);
            if (scanMode === 'full') await scanRallyModules(data);

            saveSnapshot(data);
            renderSnapshot();
        } catch (error) {
            console.error('[APES Village Dashboard] Scan failed.', error);
            const status = panel?.querySelector('.qol-vd-status');
            if (status) {
                status.textContent = error?.message || 'The village scan could not be completed.';
                status.dataset.tone = 'error';
            }
        } finally {
            if (window.location.hash !== originalHash) {
                window.location.hash = originalHash;
                const restoreStarted = performance.now();
                while (startingIdentity &&
                    getVillageIdentity() !== startingIdentity &&
                    performance.now() - restoreStarted < 5000) {
                    await sleep(120);
                }
                await sleep(250);
            }
            removeScanOverlay();
            setScanButtonState(false);
            isScanning = false;
            window.setTimeout(() => window.qolRepositionAllButtons?.(), 100);
        }
    }

    function makeDraggable(element, handle) {
        if (!element || !handle || handle.dataset.qolDragBound === 'true') return;
        handle.dataset.qolDragBound = 'true';

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('.qol-vd-close')) return;
            const rect = element.getBoundingClientRect();
            dragging = true;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            element.dataset.userPositioned = 'true';
            handle.setPointerCapture?.(event.pointerId);
            event.preventDefault();
        });

        handle.addEventListener('pointermove', event => {
            if (!dragging) return;
            const maxLeft = Math.max(8, window.innerWidth - element.offsetWidth - 8);
            const maxTop = Math.max(8, window.innerHeight - element.offsetHeight - 8);
            const left = Math.max(8, Math.min(event.clientX - offsetX, maxLeft));
            const top = Math.max(8, Math.min(event.clientY - offsetY, maxTop));
            element.style.setProperty('left', `${left}px`, 'important');
            element.style.setProperty('top', `${top}px`, 'important');
            element.style.setProperty('right', 'auto', 'important');
            element.style.setProperty('bottom', 'auto', 'important');
        });

        const stop = event => {
            dragging = false;
            try { handle.releasePointerCapture?.(event.pointerId); } catch (_) {}
        };
        handle.addEventListener('pointerup', stop);
        handle.addEventListener('pointercancel', stop);
    }

    function positionPanel() {
        if (!panel || panel.dataset.userPositioned === 'true') return;
        const rect = toggleButton?.getBoundingClientRect();
        const width = panel.offsetWidth || 900;
        const height = panel.offsetHeight || 560;
        const left = rect
            ? Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
            : Math.max(8, (window.innerWidth - width) / 2);
        const top = rect
            ? Math.max(8, Math.min(rect.bottom + 18, window.innerHeight - height - 8))
            : Math.max(8, (window.innerHeight - height) / 2);
        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
    }

    function openPanel() {
        if (!isEnabled()) return;
        mountPanel();
        window.dispatchEvent(new CustomEvent('qol_close_others', {
            detail: { source: 'villageDashboard' }
        }));
        renderSnapshot();
        panel.style.setProperty('display', 'flex', 'important');
        requestAnimationFrame(positionPanel);
    }

    function closePanel() {
        panel?.style.setProperty('display', 'none', 'important');
    }

    function togglePanel() {
        if (!panel || getComputedStyle(panel).display === 'none') {
            openPanel();
        } else {
            closePanel();
        }
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${TOGGLE_ID}{display:none;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;margin:0!important;padding:0!important;border:2px solid #7d6342!important;border-radius:50%!important;background:#ebdcb9!important;box-shadow:0 2px 4px rgba(0,0,0,.22)!important;cursor:pointer!important;box-sizing:border-box!important;user-select:none!important}
            #${TOGGLE_ID}:hover{transform:scale(1.08)!important;background:#f7f5f0!important}
            #${TOGGLE_ID} svg{width:17px!important;height:17px!important;fill:none!important;stroke:#7d6342!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important;pointer-events:none!important}

            #${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${PANEL_ID}{position:fixed!important;display:none;flex-direction:column!important;width:min(900px,94vw)!important;height:min(570px,84vh)!important;min-width:560px!important;min-height:360px!important;margin:0!important;padding:0!important;border:3px solid #634d31!important;border-radius:7px!important;background:#f7f5f0!important;color:#332719!important;box-shadow:0 18px 48px rgba(0,0,0,.5)!important;overflow:hidden!important;resize:both!important;z-index:1000000!important}
            #${PANEL_ID} .qol-vd-header{display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 auto!important;min-height:40px!important;padding:7px 10px 7px 12px!important;background:linear-gradient(to bottom,#6d5436,#4f3b24)!important;color:#fffaf0!important;cursor:move!important;user-select:none!important}
            #${PANEL_ID} .qol-vd-title{display:flex!important;align-items:center!important;gap:8px!important;font-size:13px!important;font-weight:bold!important}
            #${PANEL_ID} .qol-vd-title svg{width:17px!important;height:17px!important;fill:none!important;stroke:#f8ead0!important;stroke-width:1.8!important}
            #${PANEL_ID} .qol-vd-close{display:flex!important;align-items:center!important;justify-content:center!important;width:26px!important;height:26px!important;border-radius:4px!important;background:rgba(0,0,0,.18)!important;color:white!important;font-size:21px!important;line-height:1!important;cursor:pointer!important}
            #${PANEL_ID} .qol-vd-close:hover{background:rgba(255,255,255,.15)!important}
            #${PANEL_ID} .qol-vd-body{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;min-height:0!important;padding:10px!important;gap:8px!important;overflow:hidden!important}
            #${PANEL_ID} .qol-vd-intro{flex:0 0 auto!important;padding:8px 10px!important;border:1px solid #dec9a7!important;border-radius:4px!important;background:#fff8eb!important;color:#5a4328!important;font-size:10px!important;line-height:15px!important}
            #${PANEL_ID} .qol-vd-scan-config{display:flex!important;align-items:center!important;gap:9px!important;flex:0 0 auto!important}
            #${PANEL_ID} .qol-vd-mode-picker{display:inline-flex!important;padding:2px!important;border:1px solid #9e8767!important;border-radius:5px!important;background:#e8dece!important}
            #${PANEL_ID} .qol-vd-mode-picker.is-disabled{opacity:.6!important;pointer-events:none!important}
            #${PANEL_ID} .qol-vd-mode{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:58px!important;height:24px!important;padding:0 9px!important;border-radius:3px!important;color:#6e5a40!important;font-size:9px!important;font-weight:bold!important;cursor:pointer!important;user-select:none!important}
            #${PANEL_ID} .qol-vd-mode.active{background:#634d31!important;color:#fff!important;box-shadow:0 1px 2px rgba(0,0,0,.24)!important}
            #${PANEL_ID} .qol-vd-mode-explanation{min-width:0!important;color:#7b6a55!important;font-size:9px!important;line-height:13px!important}
            #${PANEL_ID} .qol-vd-controls{display:flex!important;align-items:center!important;gap:8px!important;flex:0 0 auto!important}
            #${PANEL_ID} .qol-vd-action{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:138px!important;height:30px!important;padding:0 14px!important;border:1px solid #4a351f!important;border-radius:4px!important;background:linear-gradient(to bottom,#765b39,#513a22)!important;color:#fff!important;font-size:10px!important;font-weight:bold!important;cursor:pointer!important;user-select:none!important;box-shadow:0 1px 2px rgba(0,0,0,.25)!important}
            #${PANEL_ID} .qol-vd-action:hover{filter:brightness(1.1)!important}
            #${PANEL_ID} .qol-vd-action.is-disabled{opacity:.6!important;pointer-events:none!important;cursor:wait!important}
            #${PANEL_ID} .qol-vd-status{min-width:0!important;color:#695b49!important;font-size:10px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
            #${PANEL_ID} .qol-vd-status[data-tone="success"]{color:#3e761d!important;font-weight:bold!important}
            #${PANEL_ID} .qol-vd-status[data-tone="error"]{color:#a52b24!important;font-weight:bold!important}
            #${PANEL_ID} .qol-vd-content{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;min-height:0!important;gap:8px!important;overflow:hidden!important}
            #${PANEL_ID} .qol-vd-empty{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:7px!important;flex:1 1 auto!important;min-height:180px!important;border:1px dashed #cbb99f!important;border-radius:5px!important;background:#fff!important;color:#7b6a55!important;font-size:11px!important;text-align:center!important}
            #${PANEL_ID} .qol-vd-empty strong{color:#4f3b24!important;font-size:13px!important}
            #${PANEL_ID} .qol-vd-summary{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important;flex:0 0 auto!important}
            #${PANEL_ID} .qol-vd-summary-card{display:grid!important;grid-template-columns:1fr auto!important;gap:3px 8px!important;padding:8px!important;border:1px solid #d9cbb7!important;border-radius:5px!important;background:#fff!important;overflow:hidden!important}
            #${PANEL_ID} .qol-vd-summary-heading{display:flex!important;align-items:center!important;gap:5px!important;color:#69553b!important;font-size:9px!important;font-weight:bold!important;text-transform:uppercase!important}
            #${PANEL_ID} .qol-vd-resource-mark{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:19px!important;height:19px!important;border-radius:50%!important;background:#866640!important;color:#fff!important;font-size:8px!important;text-transform:none!important}
            #${PANEL_ID} .qol-vd-summary-card.wood .qol-vd-resource-mark{background:#8a6336!important}
            #${PANEL_ID} .qol-vd-summary-card.clay .qol-vd-resource-mark{background:#b55a43!important}
            #${PANEL_ID} .qol-vd-summary-card.iron .qol-vd-resource-mark{background:#687a87!important}
            #${PANEL_ID} .qol-vd-summary-card.crop .qol-vd-resource-mark{background:#b4912f!important}
            #${PANEL_ID} .qol-vd-summary-card strong{grid-column:1/2!important;color:#3f2e1c!important;font-size:13px!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-vd-summary-card strong small{color:#8a7b68!important;font-size:9px!important;font-weight:normal!important}
            #${PANEL_ID} .qol-vd-production{grid-column:2!important;grid-row:2!important;align-self:center!important;color:#4c7b2b!important;font-size:9px!important;font-weight:bold!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-vd-production.negative{color:#b12d26!important}
            #${PANEL_ID} .qol-vd-meter{grid-column:1/3!important;height:3px!important;border-radius:2px!important;background:#eee5d8!important;overflow:hidden!important}
            #${PANEL_ID} .qol-vd-meter span{display:block!important;height:100%!important;background:#a58656!important}
            #${PANEL_ID} .qol-vd-intelligence{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important;flex:0 0 auto!important}
            #${PANEL_ID} .qol-vd-intelligence-card{display:flex!important;flex-direction:column!important;gap:3px!important;padding:7px 9px!important;border:1px solid #d4c2a5!important;border-left:4px solid #957344!important;border-radius:4px!important;background:#fffaf0!important;min-width:0!important}
            #${PANEL_ID} .qol-vd-intelligence-card.rally{border-left-color:#9b4b3c!important}
            #${PANEL_ID} .qol-vd-intelligence-card.muted{border-left-color:#a89b88!important;background:#f2eee7!important;color:#827563!important}
            #${PANEL_ID} .qol-vd-intelligence-title{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;color:#705638!important;font-size:8px!important;font-weight:bold!important;text-transform:uppercase!important}
            #${PANEL_ID} .qol-vd-intelligence-card strong{color:#3d2b19!important;font-size:11px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
            #${PANEL_ID} .qol-vd-intelligence-card>span{color:#756651!important;font-size:8px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
            #${PANEL_ID} .qol-vd-table-wrap{flex:1 1 auto!important;min-height:0!important;border:1px solid #cdbda6!important;background:white!important;overflow:auto!important}
            #${PANEL_ID} .qol-vd-table{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:10px!important}
            #${PANEL_ID} .qol-vd-table th{position:sticky!important;top:0!important;z-index:2!important;height:31px!important;padding:6px 8px!important;border-bottom:1px solid #b9a68b!important;background:#e9dfcc!important;color:#503b23!important;font-size:9px!important;text-align:right!important;text-transform:uppercase!important;letter-spacing:.2px!important}
            #${PANEL_ID} .qol-vd-table th:first-child{width:18%!important;text-align:left!important}
            #${PANEL_ID} .qol-vd-table th:last-child{width:22%!important;text-align:left!important}
            #${PANEL_ID} .qol-vd-table td{height:48px!important;padding:6px 8px!important;border-bottom:1px solid #e2d9cc!important;color:#332719!important;text-align:right!important;vertical-align:middle!important}
            #${PANEL_ID} .qol-vd-table tbody tr:nth-child(even) td{background:#faf8f4!important}
            #${PANEL_ID} .qol-vd-table tbody tr:hover td{background:#fff4df!important}
            #${PANEL_ID} .qol-vd-table td:first-child{text-align:left!important}
            #${PANEL_ID} .qol-vd-table td strong{display:block!important;font-size:10px!important}
            #${PANEL_ID} .qol-vd-cell-production{display:block!important;margin-top:2px!important;font-size:8px!important;font-weight:bold!important}
            #${PANEL_ID} .qol-vd-cell-production.positive{color:#4c7b2b!important}
            #${PANEL_ID} .qol-vd-cell-production.negative{color:#b12d26!important}
            #${PANEL_ID} .qol-vd-cell-eta{display:block!important;margin-top:2px!important;color:#8b7251!important;font-size:8px!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-vd-cell-eta.danger{color:#b12d26!important;font-weight:bold!important}
            #${PANEL_ID} .qol-vd-activity{text-align:left!important}
            #${PANEL_ID} .qol-vd-badge{display:inline-flex!important;align-items:center!important;margin:1px 2px 1px 0!important;padding:2px 5px!important;border:1px solid #c7b79f!important;border-radius:9px!important;background:#f3eee6!important;color:#705d45!important;font-size:8px!important;font-weight:bold!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-vd-badge.danger,#${PANEL_ID} .qol-vd-badge.error{border-color:#d28d87!important;background:#fee9e7!important;color:#a12821!important}
            #${PANEL_ID} .qol-vd-badge.support{border-color:#9dc691!important;background:#edf8e9!important;color:#3d732e!important}
            #${PANEL_ID} .qol-vd-badge.outgoing{border-color:#9bb6d1!important;background:#ebf4fc!important;color:#36668f!important}
            #${PANEL_ID} .qol-vd-badge.merchant{border-color:#d3b56b!important;background:#fff6d9!important;color:#83621b!important}
            #${PANEL_ID} .qol-vd-badge.clear{border-color:#adc5a4!important;background:#f0f7ed!important;color:#56764c!important}
            #${PANEL_ID} .qol-vd-badge.muted{color:#8c8173!important;font-weight:normal!important}
            #${PANEL_ID} .qol-vd-village-link{display:inline-block!important;max-width:100%!important;color:#76511d!important;font-weight:bold!important;text-decoration:underline!important;text-decoration-color:#c6a46c!important;text-underline-offset:2px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;cursor:pointer!important}
            #${PANEL_ID} .qol-vd-village-link:hover{color:#a76d12!important}
            #${PANEL_ID} .qol-vd-snapshot-meta{flex:0 0 auto!important;color:#81715c!important;font-size:9px!important;font-style:italic!important}

            #${OVERLAY_ID}{position:fixed!important;inset:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:8px!important;background:rgba(0,0,0,.72)!important;color:#fff!important;text-align:center!important;cursor:wait!important;user-select:none!important;pointer-events:auto!important;z-index:2147483646!important;font-family:Arial,Helvetica,sans-serif!important}
            #${OVERLAY_ID} .qol-vd-overlay-title{font-size:16px!important;font-weight:bold!important}
            #${OVERLAY_ID} .qol-vd-overlay-status{max-width:min(560px,84vw)!important;color:#f0e5d4!important;font-size:12px!important;line-height:17px!important}
            #${OVERLAY_ID} .qol-vd-overlay-note{color:#bbb!important;font-size:10px!important}

            @media(max-width:700px){#${PANEL_ID}{min-width:0!important;width:94vw!important}#${PANEL_ID} .qol-vd-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}#${PANEL_ID} .qol-vd-intelligence{grid-template-columns:1fr!important}}
        `;
        document.head.appendChild(style);
    }

    function mountPanel() {
        if (panel?.isConnected) return panel;

        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="qol-vd-header">
                <div class="qol-vd-title">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V9l8-6 8 6v11M2 20h20M8 20v-6h8v6M7 9h10"/></svg>
                    <span>Village Overview Dashboard</span>
                </div>
                <span class="qol-vd-close" role="button" tabindex="0" aria-label="Close">&times;</span>
            </div>
            <div class="qol-vd-body">
                <div class="qol-vd-intro">Create one coordinated account snapshot. APES uses the same resource, CP and Rally Point collectors as their standalone features, then returns you to the exact place where the scan began.</div>
                <div class="qol-vd-scan-config">
                    <div class="qol-vd-mode-picker" aria-label="Scan depth">
                        <div class="qol-vd-mode" data-qol-vd-mode="quick" role="button" tabindex="0">Quick</div>
                        <div class="qol-vd-mode" data-qol-vd-mode="full" role="button" tabindex="0">Full</div>
                    </div>
                    <span class="qol-vd-mode-explanation"></span>
                </div>
                <div class="qol-vd-controls">
                    <div class="qol-vd-action qol-vd-scan-btn" role="button" tabindex="0">Scan Now</div>
                    <div class="qol-vd-status" data-tone="neutral">Ready to scan.</div>
                </div>
                <div class="qol-vd-content"></div>
            </div>
        `;
        document.body.appendChild(panel);

        makeDraggable(panel, panel.querySelector('.qol-vd-header'));
        panel.querySelector('.qol-vd-close').addEventListener('click', closePanel);
        panel.querySelectorAll('[data-qol-vd-mode]').forEach(control => {
            const chooseMode = event => {
                if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                if (!isScanning) setScanMode(control.dataset.qolVdMode);
            };
            control.addEventListener('click', chooseMode);
            control.addEventListener('keydown', chooseMode);
        });
        panel.querySelector('.qol-vd-scan-btn').addEventListener('click', () => {
            if (!isScanning) void scanVillages();
        });
        panel.querySelector('.qol-vd-scan-btn').addEventListener('keydown', event => {
            if ((event.key === 'Enter' || event.key === ' ') && !isScanning) {
                event.preventDefault();
                void scanVillages();
            }
        });
        updateModeControls();
        renderSnapshot();
        return panel;
    }

    function mountToggleButton() {
        if (toggleButton?.isConnected) return toggleButton;

        toggleButton = document.createElement('div');
        toggleButton.id = TOGGLE_ID;
        toggleButton.title = 'Village Overview Dashboard';
        toggleButton.setAttribute('role', 'button');
        toggleButton.setAttribute('tabindex', '0');
        toggleButton.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20V9l8-6 8 6v11M2 20h20M8 20v-6h8v6M7 9h10"/>
            </svg>
        `;
        toggleButton.addEventListener('click', event => {
            event.stopPropagation();
            togglePanel();
        });
        toggleButton.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                togglePanel();
            }
        });
        document.body.appendChild(toggleButton);
        window.qolRepositionAllButtons?.();
        return toggleButton;
    }

    function removeUi() {
        if (isScanning) return;
        panel?.remove();
        toggleButton?.remove();
        panel = null;
        toggleButton = null;
        window.qolRepositionAllButtons?.();
    }

    function initialize() {
        injectStyles();
        loadSnapshot();
        if (!isEnabled()) {
            removeUi();
            return;
        }
        mountToggleButton();
        mountPanel();
    }

    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source !== 'villageDashboard') closePanel();
    });

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== FEATURE_KEY) return;
        if (event.detail.enabled) initialize();
        else removeUi();
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !isScanning) closePanel();
    });

    window.addEventListener('resize', () => {
        if (panel && getComputedStyle(panel).display !== 'none') positionPanel();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }

    console.log('[APES Village Dashboard] Initialized.');
})();
