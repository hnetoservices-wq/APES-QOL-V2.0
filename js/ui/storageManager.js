/**
 * APES QoL v2 Storage Cleanup Manager.
 * Inventories and selectively removes APES-owned saved data.
 */

(() => {
    'use strict';

    const OVERLAY_ID = 'apes-storage-manager-overlay';
    const STYLE_ID = 'apes-storage-manager-styles';
    const PREFIXES = ['qol_', 'apes_', 'apes:', 'restos_qol_'];
    const CONFIRM_MS = 5000;

    const CATEGORIES = [
        ['watchlists', 'Watchlists', 'Saved players, tabs, villages and notes.',
            key => key.startsWith('qol_watchlist_')],
        ['reports', 'Report Archive', 'Archived report folders and report copies.',
            key => key.startsWith('qol_report_archive_')],
        ['checklists', 'Checklists', 'Custom checklists and completed-step progress.',
            key => key === 'qol_custom_checklists' || key === 'qol_checklist_progress'],
        ['alarms', 'Building Alarms', 'Active and instant-finish-ready alarms.',
            key => key === 'qol_building_alarms'],
        ['igm', 'IGM Organization', 'Conversation folders and message tags.',
            key => key === 'qol_conversation_tags' || key === 'qol_custom_chat_tags'],
        ['oasis', 'Oasis Scanner', 'Scanned tiles, croppers, oases and tag-team data.',
            key => key.startsWith('qol_oasis_') || key.startsWith('qol_cropper_') || key.startsWith('qol_tile_')],
        ['society', 'Secret Society Scanner', 'Saved Secret Society member scans.',
            key => key.startsWith('apes_secret_society_scans')],
        ['visual', 'Visual Asset Cache', 'Cached tribe-skin asset catalogue.',
            key => key.startsWith('apes_visual_tribe_skin_assets')],
        ['villageDashboard', 'Village Dashboard', 'Latest per-village resource overview snapshot.',
            key => key.startsWith('qol_village_dashboard_')],
        ['preferences', 'Preferences', 'Feature toggles, keybinds and interface choices.',
            key => key.startsWith('qol_') || key.includes('skin_selection') || key.includes(':global:'), true],
        ['other', 'Other APES Data', 'Other APES-owned data and legacy caches.',
            () => true]
    ].map(([id, name, description, match, protectedData = false]) => ({
        id, name, description, match, protectedData
    }));

    let inventory = [];
    let selected = new Set();
    let pendingSignature = '';
    let confirmTimer = null;

    const escapeHtml = value => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    function isApesKey(key) {
        const value = String(key || '').toLowerCase();
        return PREFIXES.some(prefix => value.startsWith(prefix));
    }

    function isCurrentServerExtensionKey(key) {
        const value = String(key || '').toLowerCase();
        const hostname = location.hostname.toLowerCase();
        const world = hostname.split('.')[0];
        if (!isApesKey(value)) return false;
        if (value.includes(hostname)) return true;
        if (value.startsWith('apes:v2:')) return value.includes(`:${hostname}:`);
        return value.split(/[_:.-]+/).includes(world);
    }

    function categoryFor(key) {
        const value = String(key || '').toLowerCase();
        return CATEGORIES.find(category => category.match(value)) || CATEGORIES.at(-1);
    }

    function sizeOf(key, value) {
        let serialized;
        try {
            serialized = typeof value === 'string' ? value : JSON.stringify(value);
        } catch (_error) {
            serialized = String(value);
        }
        return new TextEncoder().encode(String(key) + String(serialized ?? '')).length;
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(2)} MB`;
    }

    function readWebStorage(storage, source) {
        const entries = [];
        for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index);
            if (!key || !isApesKey(key)) continue;
            const value = storage.getItem(key);
            entries.push({
                source, key, value,
                bytes: sizeOf(key, value),
                categoryId: categoryFor(key).id
            });
        }
        return entries;
    }

    function readExtensionStorage() {
        return new Promise(resolve => {
            if (!globalThis.chrome?.storage?.local?.get) {
                resolve([]);
                return;
            }
            chrome.storage.local.get(null, stored => {
                if (chrome.runtime?.lastError) {
                    console.warn('[APES Storage Manager] Storage read failed.', chrome.runtime.lastError);
                    resolve([]);
                    return;
                }
                resolve(Object.entries(stored || {})
                    .filter(([key]) => isCurrentServerExtensionKey(key))
                    .map(([key, value]) => ({
                        source: 'extension', key, value,
                        bytes: sizeOf(key, value),
                        categoryId: categoryFor(key).id
                    })));
            });
        });
    }

    async function collectInventory() {
        const entries = [];
        try { entries.push(...readWebStorage(localStorage, 'local')); } catch (error) {
            console.warn('[APES Storage Manager] localStorage unavailable.', error);
        }
        try { entries.push(...readWebStorage(sessionStorage, 'session')); } catch (error) {
            console.warn('[APES Storage Manager] sessionStorage unavailable.', error);
        }
        entries.push(...await readExtensionStorage());
        inventory = entries;
    }

    const sourceName = source => ({
        local: 'Game storage', session: 'Session', extension: 'Extension'
    })[source] || source;

    function categorySummary(category) {
        const entries = inventory.filter(entry => entry.categoryId === category.id);
        const sources = new Map();
        entries.forEach(entry => sources.set(entry.source, (sources.get(entry.source) || 0) + 1));
        return {
            ...category,
            entries,
            bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
            sourceText: Array.from(sources, ([source, count]) => `${sourceName(source)}: ${count}`).join(' · ')
        };
    }

    function resetConfirmation() {
        pendingSignature = '';
        if (confirmTimer) clearTimeout(confirmTimer);
        confirmTimer = null;
        const button = document.getElementById('apes-storage-clear-selected');
        if (button) button.textContent = 'Clear Selected';
    }

    function updateSelection() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) return;
        overlay.querySelectorAll('[data-storage-category]').forEach(row => {
            const checked = selected.has(row.dataset.storageCategory);
            row.classList.toggle('selected', checked);
            row.querySelector('.apes-storage-checkbox')
                ?.setAttribute('aria-checked', String(checked));
        });
        const entries = inventory.filter(entry => selected.has(entry.categoryId));
        const bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
        const status = overlay.querySelector('.apes-storage-selection');
        const clear = overlay.querySelector('#apes-storage-clear-selected');
        status.textContent = entries.length
            ? `${entries.length} entries · ${formatBytes(bytes)} selected`
            : 'Nothing selected';
        clear.classList.toggle('disabled', !entries.length);
        clear.setAttribute('aria-disabled', String(!entries.length));
        resetConfirmation();
    }

    function renderInventory() {
        const overlay = document.getElementById(OVERLAY_ID);
        const totalBytes = inventory.reduce((sum, entry) => sum + entry.bytes, 0);
        overlay.querySelector('.apes-storage-total').innerHTML =
            `<strong>${formatBytes(totalBytes)}</strong> across ${inventory.length} saved ${inventory.length === 1 ? 'entry' : 'entries'}`;
        const summaries = CATEGORIES.map(categorySummary)
            .filter(summary => summary.entries.length || summary.id === 'preferences');
        overlay.querySelector('.apes-storage-list').innerHTML = summaries.map(summary => {
            const keys = summary.entries.map(entry => `<code>${escapeHtml(entry.key)}</code>`).join('');
            return `
                <div class="apes-storage-row" data-storage-category="${summary.id}">
                    <div class="apes-storage-checkbox" role="checkbox" tabindex="0" aria-checked="false"><span>✓</span></div>
                    <div class="apes-storage-copy">
                        <div class="apes-storage-title"><strong>${escapeHtml(summary.name)}</strong>${summary.protectedData ? '<em>Protected</em>' : ''}</div>
                        <span>${escapeHtml(summary.description)}</span>
                        <small>${escapeHtml(summary.sourceText || 'No saved entries')}</small>
                        <div class="apes-storage-keys">${keys || '<i>No saved keys</i>'}</div>
                    </div>
                    <div class="apes-storage-usage">
                        <strong>${formatBytes(summary.bytes)}</strong>
                        <span>${summary.entries.length} ${summary.entries.length === 1 ? 'entry' : 'entries'}</span>
                        <div class="apes-storage-details" role="button" tabindex="0">Details</div>
                    </div>
                </div>`;
        }).join('');
        updateSelection();
    }

    async function refresh() {
        const status = document.querySelector(`#${OVERLAY_ID} .apes-storage-status`);
        if (status) status.textContent = 'Calculating storage usage...';
        await collectInventory();
        selected = new Set(Array.from(selected).filter(id => inventory.some(entry => entry.categoryId === id)));
        renderInventory();
        if (status) status.textContent = `Current server: ${location.hostname}`;
    }

    function removeExtensionKeys(keys) {
        return new Promise((resolve, reject) => {
            if (!keys.length) return resolve();
            chrome.storage.local.remove(keys, () => {
                if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
                else resolve();
            });
        });
    }

    async function clearSelected() {
        const entries = inventory.filter(entry => selected.has(entry.categoryId));
        if (!entries.length) return;
        const signature = Array.from(selected).sort().join('|');
        const button = document.getElementById('apes-storage-clear-selected');
        if (pendingSignature !== signature) {
            pendingSignature = signature;
            button.textContent = `Confirm Clear (${entries.length})`;
            confirmTimer = setTimeout(resetConfirmation, CONFIRM_MS);
            return;
        }
        resetConfirmation();
        button.classList.add('disabled');
        button.textContent = 'Clearing...';
        const extensionKeys = [];
        entries.forEach(entry => {
            if (entry.source === 'local') localStorage.removeItem(entry.key);
            else if (entry.source === 'session') sessionStorage.removeItem(entry.key);
            else extensionKeys.push(entry.key);
        });
        await removeExtensionKeys(extensionKeys);
        window.dispatchEvent(new CustomEvent('qol_cache_cleared', {
            detail: { hostname: location.hostname, clearedEntries: entries.length, categories: Array.from(selected) }
        }));
        document.querySelector(`#${OVERLAY_ID} .apes-storage-status`).textContent =
            `${entries.length} entries removed. Reloading...`;
        setTimeout(() => location.reload(), 700);
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${OVERLAY_ID},#${OVERLAY_ID} *{box-sizing:border-box!important;font-family:Arial,sans-serif!important;text-shadow:none!important}
            #${OVERLAY_ID}{position:fixed!important;inset:0!important;z-index:2147483646!important;display:none!important;align-items:center!important;justify-content:center!important;padding:18px!important;background:rgba(18,16,13,.66)!important;backdrop-filter:blur(2px)!important}
            #${OVERLAY_ID}.open{display:flex!important}
            .apes-storage-dialog{display:flex!important;flex-direction:column!important;width:min(760px,calc(100vw - 36px))!important;max-height:min(680px,calc(100vh - 36px))!important;overflow:hidden!important;border:2px solid #5c452a!important;border-radius:6px!important;background:#f5f2eb!important;box-shadow:0 18px 52px rgba(0,0,0,.54)!important;color:#4d3d2a!important}
            .apes-storage-header{display:flex!important;align-items:center!important;justify-content:space-between!important;min-height:42px!important;padding:8px 12px!important;border-bottom:1px solid #3c2b18!important;background:linear-gradient(to bottom,#6c5234,#4d3923)!important;color:#fffaf0!important}.apes-storage-header strong{font-size:13px!important}.apes-storage-close{display:flex!important;align-items:center!important;justify-content:center!important;width:24px!important;height:24px!important;border-radius:4px!important;background:rgba(30,20,12,.42)!important;color:#fff!important;font-size:18px!important;cursor:pointer!important}
            .apes-storage-summary{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;padding:10px 12px!important;border-bottom:1px solid #d5c8b5!important;background:#eee6d8!important}.apes-storage-total{color:#6c5a42!important;font-size:10px!important}.apes-storage-total strong{color:#4f6e25!important;font-size:14px!important}
            .apes-storage-refresh,.apes-storage-details,.apes-storage-action{display:inline-flex!important;align-items:center!important;justify-content:center!important;border:1px solid #9d8768!important;border-radius:4px!important;background:linear-gradient(to bottom,#fffdf8,#e6dac8)!important;color:#5b472f!important;font-size:9px!important;font-weight:700!important;cursor:pointer!important}.apes-storage-refresh{min-height:26px!important;padding:4px 10px!important}
            .apes-storage-list{flex:1 1 auto!important;min-height:0!important;padding:8px!important;overflow-y:auto!important}.apes-storage-row{display:grid!important;grid-template-columns:26px minmax(0,1fr) 105px!important;gap:9px!important;align-items:center!important;margin-bottom:6px!important;padding:9px!important;border:1px solid #d5c7b1!important;border-radius:5px!important;background:#fffdf8!important}.apes-storage-row.selected{border-color:#9b6e36!important;background:#f4ead7!important;box-shadow:inset 3px 0 0 #9b6e36!important}
            .apes-storage-checkbox{display:flex!important;align-items:center!important;justify-content:center!important;width:18px!important;height:18px!important;border:1px solid #9c876a!important;border-radius:3px!important;background:#fff!important;color:transparent!important;cursor:pointer!important}.apes-storage-row.selected .apes-storage-checkbox{border-color:#5d782e!important;background:#6f9137!important;color:#fff!important}.apes-storage-checkbox span{color:inherit!important;font-size:12px!important;font-weight:800!important}
            .apes-storage-copy{display:flex!important;flex-direction:column!important;min-width:0!important;gap:3px!important}.apes-storage-title{display:flex!important;align-items:center!important;gap:7px!important}.apes-storage-title strong{color:#493720!important;font-size:11px!important}.apes-storage-title em{padding:1px 5px!important;border:1px solid #b18c59!important;border-radius:8px!important;background:#f3dfb6!important;color:#765126!important;font-size:7px!important;font-style:normal!important;font-weight:700!important;text-transform:uppercase!important}.apes-storage-copy>span{color:#79674e!important;font-size:9px!important}.apes-storage-copy small{color:#9a876d!important;font-size:8px!important}
            .apes-storage-keys{display:none!important;flex-wrap:wrap!important;gap:4px!important;margin-top:5px!important}.apes-storage-row.show-details .apes-storage-keys{display:flex!important}.apes-storage-keys code{max-width:100%!important;padding:2px 4px!important;overflow:hidden!important;border-radius:3px!important;background:#eee7da!important;color:#6b5942!important;font-family:monospace!important;font-size:7px!important;text-overflow:ellipsis!important;white-space:nowrap!important}
            .apes-storage-usage{display:flex!important;align-items:flex-end!important;flex-direction:column!important;gap:3px!important;color:#89775d!important;text-align:right!important}.apes-storage-usage strong{color:#5c472f!important;font-size:11px!important}.apes-storage-usage span{font-size:8px!important}.apes-storage-details{min-height:20px!important;padding:2px 7px!important}
            .apes-storage-footer{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;min-height:44px!important;padding:8px 12px!important;border-top:1px solid #d5c8b5!important;background:#eee6da!important}.apes-storage-footer-copy{display:flex!important;flex-direction:column!important;gap:2px!important;color:#7e6d55!important;font-size:8px!important}.apes-storage-selection{color:#5d4b34!important;font-size:9px!important;font-weight:700!important}.apes-storage-footer-actions{display:flex!important;gap:7px!important}.apes-storage-action{min-height:27px!important;padding:4px 11px!important}#apes-storage-clear-selected{border-color:#934d38!important;background:linear-gradient(to bottom,#a95b43,#823d2d)!important;color:#fff!important}.apes-storage-action.disabled{opacity:.48!important;pointer-events:none!important}
            @media(max-width:580px){.apes-storage-row{grid-template-columns:24px minmax(0,1fr)!important}.apes-storage-usage{grid-column:2!important;align-items:flex-start!important;flex-direction:row!important}}
        `;
        document.head.appendChild(style);
    }

    function closeManager() {
        resetConfirmation();
        const overlay = document.getElementById(OVERLAY_ID);
        overlay?.classList.remove('open');
        overlay?.setAttribute('aria-hidden', 'true');
    }

    function mount() {
        let overlay = document.getElementById(OVERLAY_ID);
        if (overlay) return overlay;
        injectStyles();
        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="apes-storage-dialog" role="dialog" aria-modal="true" aria-labelledby="apes-storage-title">
                <div class="apes-storage-header"><strong id="apes-storage-title">Storage Cleanup Manager</strong><div class="apes-storage-close" role="button" tabindex="0">&times;</div></div>
                <div class="apes-storage-summary"><div class="apes-storage-total">Calculating storage usage...</div><div class="apes-storage-refresh" role="button" tabindex="0">Refresh</div></div>
                <div class="apes-storage-list"></div>
                <div class="apes-storage-footer"><div class="apes-storage-footer-copy"><span class="apes-storage-selection">Nothing selected</span><span class="apes-storage-status">Current server: ${escapeHtml(location.hostname)}</span></div><div class="apes-storage-footer-actions"><div class="apes-storage-action apes-storage-cancel" role="button" tabindex="0">Close</div><div id="apes-storage-clear-selected" class="apes-storage-action disabled" role="button" tabindex="0" aria-disabled="true">Clear Selected</div></div></div>
            </div>`;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.closest('.apes-storage-close,.apes-storage-cancel')) return closeManager();
            if (event.target.closest('.apes-storage-refresh')) return void refresh();
            const details = event.target.closest('.apes-storage-details');
            if (details) {
                details.closest('.apes-storage-row')?.classList.toggle('show-details');
                details.textContent = details.textContent === 'Details' ? 'Hide' : 'Details';
                return;
            }
            const checkbox = event.target.closest('.apes-storage-checkbox');
            if (checkbox) {
                const id = checkbox.closest('[data-storage-category]')?.dataset.storageCategory;
                if (id) selected.has(id) ? selected.delete(id) : selected.add(id);
                updateSelection();
                return;
            }
            const clear = event.target.closest('#apes-storage-clear-selected');
            if (clear && clear.getAttribute('aria-disabled') !== 'true') {
                void clearSelected().catch(error => {
                    console.error('[APES Storage Manager] Cleanup failed.', error);
                    overlay.querySelector('.apes-storage-status').textContent = 'Cleanup failed. Please try again.';
                    clear.classList.remove('disabled');
                    clear.textContent = 'Try Again';
                });
            }
        });
        overlay.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const control = event.target.closest('[role="button"],[role="checkbox"]');
            if (control) { event.preventDefault(); control.click(); }
        });
        return overlay;
    }

    async function openManager() {
        const overlay = mount();
        selected.clear();
        resetConfirmation();
        window.dispatchEvent(new CustomEvent('qol_close_others', { detail: { source: 'storageManager' } }));
        document.getElementById('qol-modal-overlay')?.style.setProperty('display', 'none', 'important');
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        await refresh();
    }

    function labelLauncher() {
        const button = document.querySelector(
            '#qol-modal .qol-clear-cache-btn'
        );

        if (!button) {
            return false;
        }

        if (button.textContent.trim() !== 'Manage Storage') {
            button.textContent = 'Manage Storage';
        }

        if (
            button.title !==
            'Review and selectively remove APES saved data'
        ) {
            button.title =
                'Review and selectively remove APES saved data';
        }

        return true;
    }

    function init() {
        document.addEventListener('click', event => {
            if (!event.target.closest('#qol-modal .qol-clear-cache-btn')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            void openManager();
        }, true);
        document.addEventListener('keydown', event => {
            if (
                event.key !== 'Enter' &&
                event.key !== ' '
            ) {
                return;
            }
            if (!event.target.closest('#qol-modal .qol-clear-cache-btn')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            void openManager();
        }, true);
        if (!labelLauncher()) {
            const launcherObserver = new MutationObserver(() => {
                if (labelLauncher()) {
                    launcherObserver.disconnect();
                }
            });

            launcherObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && document.getElementById(OVERLAY_ID)?.classList.contains('open')) {
            closeManager();
            event.stopImmediatePropagation();
        }
    }, true);
    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source !== 'storageManager') closeManager();
    });
    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})();
