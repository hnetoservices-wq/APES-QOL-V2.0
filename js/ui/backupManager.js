/**
 * APES QoL v2 — Backup & Device Transfer Manager
 *
 * Creates a portable JSON backup of APES-owned persistent data.
 * - localStorage: current Travian server/origin only (browser security boundary).
 * - chrome.storage.local: all APES-owned extension data available to the extension.
 * - sessionStorage is intentionally excluded because it is temporary.
 *
 * Imports merge with existing APES data and overwrite matching APES keys only.
 */
(() => {
    'use strict';

    const OVERLAY_ID = 'apes-backup-manager-overlay';
    const STYLE_ID = 'apes-backup-manager-styles';
    const LAUNCHER_CLASS = 'qol-backup-manager-btn';
    const FILE_INPUT_ID = 'apes-backup-file-input';
    const FORMAT = 'APES_QOL_BACKUP';
    const SCHEMA_VERSION = 1;
    const PREFIXES = ['qol_', 'apes_', 'apes:', 'restos_qol_'];

    let pendingImport = null;
    let launcherObserver = null;

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

    function formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(2)} MB`;
    }

    function byteSize(value) {
        let text = '';
        try { text = JSON.stringify(value); } catch (_) { text = String(value ?? ''); }
        return new TextEncoder().encode(text).length;
    }

    function currentVersion() {
        try {
            const manifest = chrome.runtime?.getManifest?.();
            return manifest?.version_name || manifest?.version || 'unknown';
        } catch (_) {
            return 'unknown';
        }
    }

    function collectCurrentLocalStorage() {
        const data = {};
        try {
            for (let index = 0; index < localStorage.length; index += 1) {
                const key = localStorage.key(index);
                if (!key || !isApesKey(key)) continue;
                data[key] = localStorage.getItem(key);
            }
        } catch (error) {
            console.warn('[APES Backup] localStorage read failed.', error);
        }
        return data;
    }

    function collectExtensionStorage() {
        return new Promise(resolve => {
            if (!globalThis.chrome?.storage?.local?.get) {
                resolve({});
                return;
            }
            chrome.storage.local.get(null, stored => {
                if (chrome.runtime?.lastError) {
                    console.warn('[APES Backup] Extension storage read failed.', chrome.runtime.lastError);
                    resolve({});
                    return;
                }
                resolve(Object.fromEntries(
                    Object.entries(stored || {}).filter(([key]) => isApesKey(key))
                ));
            });
        });
    }

    async function createBackupPayload() {
        const localData = collectCurrentLocalStorage();
        const extensionData = await collectExtensionStorage();
        return {
            format: FORMAT,
            schemaVersion: SCHEMA_VERSION,
            exportedAt: Date.now(),
            extensionVersion: currentVersion(),
            source: {
                hostname: location.hostname,
                origin: location.origin
            },
            notes: {
                localStorageScope: 'current Travian server/origin',
                extensionStorageScope: 'all APES-owned chrome.storage.local keys',
                sessionStorageIncluded: false
            },
            localStorage: localData,
            extensionStorage: extensionData
        };
    }

    function backupSummary(payload) {
        const localCount = Object.keys(payload?.localStorage || {}).length;
        const extensionCount = Object.keys(payload?.extensionStorage || {}).length;
        const bytes = byteSize(payload);
        return {
            localCount,
            extensionCount,
            totalCount: localCount + extensionCount,
            bytes
        };
    }

    function backupFilename(payload) {
        const date = new Date(payload.exportedAt || Date.now());
        const day = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
        const server = String(payload?.source?.hostname || 'server')
            .replace(/[^a-z0-9.-]+/gi, '_');
        return `APES-QoL-${server}-${day}.json`;
    }

    async function exportBackup() {
        setStatus('Collecting persistent APES data…', 'working');
        try {
            const payload = await createBackupPayload();
            const summary = backupSummary(payload);
            const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: 'application/json;charset=utf-8'
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = backupFilename(payload);
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setStatus(
                `Exported ${summary.totalCount} persistent APES entries (${formatBytes(summary.bytes)}).`,
                'success'
            );
            updateStats(payload);
        } catch (error) {
            console.error('[APES Backup] Export failed.', error);
            setStatus('Backup export failed. Please try again.', 'error');
        }
    }

    function validateObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value);
    }

    function sanitizeBackupObject(value) {
        if (!validateObject(value)) return {};
        return Object.fromEntries(
            Object.entries(value).filter(([key]) => isApesKey(key))
        );
    }

    function validateBackup(payload) {
        if (!validateObject(payload)) throw new Error('Backup file is not a JSON object.');
        if (payload.format !== FORMAT) throw new Error('This is not an APES QoL backup file.');
        if (Number(payload.schemaVersion) !== SCHEMA_VERSION) {
            throw new Error(`Unsupported APES backup schema: ${payload.schemaVersion ?? 'unknown'}.`);
        }
        if (!validateObject(payload.localStorage) || !validateObject(payload.extensionStorage)) {
            throw new Error('Backup storage sections are missing or invalid.');
        }

        const cleanPayload = {
            ...payload,
            localStorage: sanitizeBackupObject(payload.localStorage),
            extensionStorage: sanitizeBackupObject(payload.extensionStorage)
        };
        const summary = backupSummary(cleanPayload);
        if (!summary.totalCount) throw new Error('The backup contains no APES data.');
        return cleanPayload;
    }

    function resetImport() {
        pendingImport = null;
        const button = document.getElementById('apes-backup-import');
        if (button) {
            button.textContent = 'Import APES Data';
            button.classList.remove('confirm');
        }
        const input = document.getElementById(FILE_INPUT_ID);
        if (input) input.value = '';
    }

    async function readSelectedBackup(file) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        return validateBackup(parsed);
    }

    async function chooseImportFile(file) {
        resetImport();
        if (!file) return;
        try {
            const payload = await readSelectedBackup(file);
            pendingImport = payload;
            const summary = backupSummary(payload);
            const sourceHost = String(payload?.source?.hostname || 'unknown server');
            const sameServer = sourceHost === location.hostname;
            const importedLocal = sameServer ? summary.localCount : 0;
            const skippedLocal = sameServer ? 0 : summary.localCount;
            const button = document.getElementById('apes-backup-import');
            if (button) {
                button.textContent = `Confirm Import (${importedLocal + summary.extensionCount})`;
                button.classList.add('confirm');
            }
            const date = Number(payload.exportedAt)
                ? new Date(Number(payload.exportedAt)).toLocaleString()
                : 'unknown date';
            const serverNote = sameServer
                ? `${summary.localCount} current-server entries + ${summary.extensionCount} extension entries will be merged.`
                : `${summary.extensionCount} extension entries will be merged. ${skippedLocal} local entries are for ${sourceHost} and will be skipped here; import this file while visiting that server to restore them.`;
            setStatus(
                `Backup ready · ${date} · ${serverNote} Click Confirm Import to continue.`,
                'warning'
            );
        } catch (error) {
            console.warn('[APES Backup] Invalid import file.', error);
            resetImport();
            setStatus(error?.message || 'The selected backup file is invalid.', 'error');
        }
    }

    function setExtensionStorage(values) {
        return new Promise((resolve, reject) => {
            const keys = Object.keys(values || {});
            if (!keys.length) {
                resolve();
                return;
            }
            if (!globalThis.chrome?.storage?.local?.set) {
                reject(new Error('Extension storage is unavailable.'));
                return;
            }
            chrome.storage.local.set(values, () => {
                if (chrome.runtime?.lastError) reject(chrome.runtime.lastError);
                else resolve();
            });
        });
    }

    async function importPendingBackup() {
        if (!pendingImport) {
            document.getElementById(FILE_INPUT_ID)?.click();
            return;
        }

        const payload = pendingImport;
        const sourceHost = String(payload?.source?.hostname || '');
        const sameServer = sourceHost === location.hostname;
        const localData = sameServer ? payload.localStorage : {};
        const extensionData = payload.extensionStorage || {};
        const localEntries = Object.entries(localData).filter(([key]) => isApesKey(key));
        const extensionEntries = Object.entries(extensionData).filter(([key]) => isApesKey(key));
        const total = localEntries.length + extensionEntries.length;

        if (!total) {
            resetImport();
            setStatus('Nothing in this backup can be restored on the current server.', 'error');
            return;
        }

        const button = document.getElementById('apes-backup-import');
        button?.classList.add('disabled');
        if (button) button.textContent = 'Importing…';
        setStatus('Merging APES backup data…', 'working');

        try {
            localEntries.forEach(([key, value]) => {
                localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
            });
            await setExtensionStorage(Object.fromEntries(extensionEntries));
            window.dispatchEvent(new CustomEvent('qol_backup_imported', {
                detail: {
                    sourceHostname: sourceHost,
                    localEntries: localEntries.length,
                    extensionEntries: extensionEntries.length
                }
            }));
            setStatus(`Imported ${total} APES entries. Reloading…`, 'success');
            setTimeout(() => location.reload(), 900);
        } catch (error) {
            console.error('[APES Backup] Import failed.', error);
            button?.classList.remove('disabled');
            if (button) button.textContent = `Confirm Import (${total})`;
            setStatus('Import failed before completion. Existing data was not cleared.', 'error');
        }
    }

    function setStatus(message, tone = 'neutral') {
        const element = document.querySelector(`#${OVERLAY_ID} .apes-backup-status`);
        if (!element) return;
        element.textContent = message;
        element.dataset.tone = tone;
    }

    function updateStats(payload = null) {
        const overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) return;
        const local = payload?.localStorage || collectCurrentLocalStorage();
        const extension = payload?.extensionStorage || null;
        const localCount = Object.keys(local).length;
        overlay.querySelector('[data-backup-stat="local"] strong').textContent = localCount.toLocaleString();
        overlay.querySelector('[data-backup-stat="local"] small').textContent = formatBytes(byteSize(local));
        if (extension) {
            overlay.querySelector('[data-backup-stat="extension"] strong').textContent = Object.keys(extension).length.toLocaleString();
            overlay.querySelector('[data-backup-stat="extension"] small').textContent = formatBytes(byteSize(extension));
        }
    }

    async function refreshStats() {
        const extension = await collectExtensionStorage();
        updateStats({
            localStorage: collectCurrentLocalStorage(),
            extensionStorage: extension
        });
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${OVERLAY_ID},#${OVERLAY_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
#${OVERLAY_ID}{position:fixed!important;inset:0!important;z-index:2147483646!important;display:none!important;align-items:center!important;justify-content:center!important;padding:18px!important;background:rgba(18,16,13,.7)!important;backdrop-filter:blur(2px)!important}
#${OVERLAY_ID}.open{display:flex!important}
#${OVERLAY_ID} .apes-backup-dialog{display:flex!important;flex-direction:column!important;width:min(620px,calc(100vw - 36px))!important;max-height:min(620px,calc(100vh - 36px))!important;overflow:hidden!important;border:2px solid var(--qol-border)!important;border-radius:6px!important;background:#f6f2ea!important;box-shadow:0 18px 52px rgba(0,0,0,.54)!important;color:#4d3d2a!important}
#${OVERLAY_ID} .apes-backup-head{display:flex!important;align-items:center!important;justify-content:space-between!important;min-height:42px!important;padding:8px 12px!important;border-bottom:1px solid var(--qol-accent-outline)!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-dark))!important;color:#fffaf0!important}#${OVERLAY_ID} .apes-backup-head strong{font-size:13px!important}#${OVERLAY_ID} .apes-backup-close{display:flex!important;align-items:center!important;justify-content:center!important;width:24px!important;height:24px!important;border-radius:4px!important;background:rgba(0,0,0,.22)!important;color:#fff!important;font-size:19px!important;cursor:pointer!important}
#${OVERLAY_ID} .apes-backup-body{display:flex!important;flex-direction:column!important;gap:10px!important;padding:12px!important;overflow:auto!important}#${OVERLAY_ID} .apes-backup-intro{padding:9px 10px!important;border:1px solid #d5c5aa!important;border-radius:4px!important;background:#fff7e7!important;color:#665137!important;font-size:9px!important;line-height:1.5!important}#${OVERLAY_ID} .apes-backup-intro strong{color:#4d3923!important}
#${OVERLAY_ID} .apes-backup-stats{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}#${OVERLAY_ID} .apes-backup-stat{padding:9px!important;border:1px solid #d7c9b5!important;border-radius:4px!important;background:#fff!important}#${OVERLAY_ID} .apes-backup-stat span{display:block!important;color:#7f6d55!important;font-size:8px!important;font-weight:bold!important;text-transform:uppercase!important}#${OVERLAY_ID} .apes-backup-stat strong{display:block!important;margin-top:3px!important;color:#4c3822!important;font-size:17px!important}#${OVERLAY_ID} .apes-backup-stat small{display:block!important;margin-top:2px!important;color:#8b7962!important;font-size:8px!important}
#${OVERLAY_ID} .apes-backup-transfer{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}#${OVERLAY_ID} .apes-backup-card{display:flex!important;flex-direction:column!important;gap:6px!important;padding:10px!important;border:1px solid #d5c6af!important;border-radius:4px!important;background:#fff!important}#${OVERLAY_ID} .apes-backup-card strong{color:#4b3822!important;font-size:10px!important}#${OVERLAY_ID} .apes-backup-card span{min-height:30px!important;color:#7b6951!important;font-size:8.5px!important;line-height:1.4!important}
#${OVERLAY_ID} .apes-backup-action,.${LAUNCHER_CLASS}{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:28px!important;padding:5px 10px!important;border:1px solid var(--qol-action-border)!important;border-radius:4px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:9px!important;font-weight:bold!important;cursor:pointer!important;user-select:none!important;white-space:nowrap!important}#${OVERLAY_ID} .apes-backup-action.secondary{border-color:#9d8768!important;background:linear-gradient(to bottom,#fffdf8,#e6dac8)!important;color:#5b472f!important}#${OVERLAY_ID} .apes-backup-action.confirm{border-color:#8a6b2a!important;background:linear-gradient(to bottom,#c59638,#8b6829)!important}#${OVERLAY_ID} .apes-backup-action.disabled{opacity:.5!important;pointer-events:none!important}
#${OVERLAY_ID} .apes-backup-status{min-height:34px!important;padding:8px 9px!important;border:1px solid #ddd0bd!important;border-radius:4px!important;background:#eee7dc!important;color:#725f47!important;font-size:8.5px!important;line-height:1.4!important}#${OVERLAY_ID} .apes-backup-status[data-tone="success"]{border-color:#9ab57d!important;background:#edf6e6!important;color:#426725!important}#${OVERLAY_ID} .apes-backup-status[data-tone="warning"]{border-color:#c6a45c!important;background:#fff3d5!important;color:#785618!important}#${OVERLAY_ID} .apes-backup-status[data-tone="error"]{border-color:#c2877f!important;background:#fae9e6!important;color:#8c3029!important}#${OVERLAY_ID} .apes-backup-status[data-tone="working"]{color:#856323!important}
#${OVERLAY_ID} .apes-backup-foot{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;padding:8px 12px!important;border-top:1px solid #d6c8b5!important;background:#eee6da!important;color:#7b6b56!important;font-size:8px!important}#${OVERLAY_ID} .apes-backup-foot .apes-backup-action{min-width:72px!important}
.${LAUNCHER_CLASS}{min-height:24px!important;padding:3px 9px!important;border-color:#7b704d!important;background:linear-gradient(to bottom,#f8f2e7,#dfd2bd)!important;color:#55412c!important;font-size:9px!important}.qol-footer-left .${LAUNCHER_CLASS}{margin:0!important}
@media(max-width:560px){#${OVERLAY_ID} .apes-backup-stats,#${OVERLAY_ID} .apes-backup-transfer{grid-template-columns:1fr!important}}
`;
        document.head.appendChild(style);
    }

    function closeManager() {
        resetImport();
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
            <div class="apes-backup-dialog" role="dialog" aria-modal="true" aria-labelledby="apes-backup-title">
                <div class="apes-backup-head"><strong id="apes-backup-title">APES Backup &amp; Device Transfer</strong><div class="apes-backup-close" role="button" tabindex="0">&times;</div></div>
                <div class="apes-backup-body">
                    <div class="apes-backup-intro"><strong>Portable APES data backup.</strong> Export saves persistent APES data from this Travian server plus APES extension storage. Import merges the backup into the current device and overwrites matching APES keys only. Temporary session data and Travian account/game data are never included.</div>
                    <div class="apes-backup-stats">
                        <div class="apes-backup-stat" data-backup-stat="local"><span>This server · local storage</span><strong>—</strong><small>Calculating…</small></div>
                        <div class="apes-backup-stat" data-backup-stat="extension"><span>Extension storage</span><strong>—</strong><small>Calculating…</small></div>
                    </div>
                    <div class="apes-backup-transfer">
                        <div class="apes-backup-card"><strong>Export APES Data</strong><span>Create a JSON backup you can keep or move to another browser/device.</span><div id="apes-backup-export" class="apes-backup-action" role="button" tabindex="0">Export APES Data</div></div>
                        <div class="apes-backup-card"><strong>Import APES Data</strong><span>Select an APES backup. You will see what can be restored before confirming.</span><div id="apes-backup-import" class="apes-backup-action secondary" role="button" tabindex="0">Import APES Data</div><input id="${FILE_INPUT_ID}" type="file" accept="application/json,.json" hidden></div>
                    </div>
                    <div class="apes-backup-status" data-tone="neutral">Ready. For full local restoration on another device, open the same Travian server before importing.</div>
                </div>
                <div class="apes-backup-foot"><span>Backup format v${SCHEMA_VERSION} · APES ${escapeHtml(currentVersion())}</span><div class="apes-backup-action secondary apes-backup-close-button" role="button" tabindex="0">Close</div></div>
            </div>`;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.closest('.apes-backup-close,.apes-backup-close-button')) {
                closeManager();
                return;
            }
            if (event.target.closest('#apes-backup-export')) {
                void exportBackup();
                return;
            }
            if (event.target.closest('#apes-backup-import')) {
                void importPendingBackup();
            }
        });
        overlay.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const control = event.target.closest('[role="button"]');
            if (!control) return;
            event.preventDefault();
            control.click();
        });
        overlay.querySelector(`#${FILE_INPUT_ID}`).addEventListener('change', event => {
            const file = event.target.files?.[0] || null;
            void chooseImportFile(file);
        });
        return overlay;
    }

    async function openManager() {
        const overlay = mount();
        resetImport();
        window.dispatchEvent(new CustomEvent('qol_close_others', {
            detail: { source: 'backupManager' }
        }));
        document.getElementById('qol-modal-overlay')?.style.setProperty('display', 'none', 'important');
        document.getElementById('apes-storage-manager-overlay')?.classList.remove('open');
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        setStatus('Ready. For full local restoration on another device, open the same Travian server before importing.', 'neutral');
        await refreshStats();
    }

    function ensureLauncher() {
        const footer = document.querySelector('#qol-modal .qol-footer-left');
        if (!footer) return false;
        let button = footer.querySelector(`.${LAUNCHER_CLASS}`);
        if (!button) {
            button = document.createElement('div');
            button.className = LAUNCHER_CLASS;
            button.setAttribute('role', 'button');
            button.setAttribute('tabindex', '0');
            button.title = 'Export or import APES QoL data';
            button.textContent = 'Backup & Restore';
            footer.insertBefore(button, footer.querySelector('.qol-clear-cache-btn') || null);
        }
        if (button.dataset.qolBackupBound !== 'true') {
            button.dataset.qolBackupBound = 'true';
            const activate = event => {
                event.preventDefault();
                event.stopPropagation();
                void openManager();
            };
            button.addEventListener('click', activate);
            button.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') activate(event);
            });
        }
        return true;
    }

    function init() {
        injectStyles();
        ensureLauncher();
        if (!launcherObserver) {
            launcherObserver = new MutationObserver(() => ensureLauncher());
            launcherObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (!document.getElementById(OVERLAY_ID)?.classList.contains('open')) return;
        closeManager();
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);

    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source !== 'backupManager') closeManager();
    });

    window.APES_BACKUP = Object.freeze({
        export: exportBackup,
        open: openManager
    });

    document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', init, { once: true })
        : init();
})();
