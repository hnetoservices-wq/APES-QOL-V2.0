/**
 * APES QoL — Secret Society Scanner
 * Collects the paginated Secret Society member list into one local APES view.
 */
(() => {
    'use strict';

    const FEATURE_KEY = 'secretSocietyScanner';
    const STORAGE_KEY = 'apes_secret_society_scans_v1';
    const BUTTON_ID = 'qol-ss-scanner-toggle-btn';
    const PANEL_ID = 'qol-ss-scanner-panel';
    const NATIVE_SCAN_ID = 'qol-ss-native-scan';
    const DIALOG_ID = 'qol-ss-dialog';
    const MAX_PAGES = 100;
    let scanInProgress = false;
    let memberSort = { key: 'rank', direction: 'asc' };
    let observer = null;

    function enabled() {
        return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY);
    }

    function serverKey() {
        return location.hostname.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    }

    function loadScans() {
        try {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return Array.isArray(all[serverKey()]) ? all[serverKey()] : [];
        } catch (_) {
            return [];
        }
    }

    function saveScans(scans) {
        try {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            all[serverKey()] = scans;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch (_) {
            // The scanner remains usable for the current page if storage is unavailable.
        }
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function cleanText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function injectStyles() {
        if (document.getElementById('qol-ss-scanner-styles')) return;
        const style = document.createElement('style');
        style.id = 'qol-ss-scanner-styles';
        style.textContent = [
            '#' + BUTTON_ID + '{position:fixed!important;display:none;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;margin:0!important;padding:0!important;box-sizing:border-box!important;border:2px solid var(--qol-accent)!important;border-radius:50%!important;background:var(--qol-accent-soft)!important;box-shadow:0 2px 4px rgba(0,0,0,.2)!important;cursor:pointer!important;user-select:none!important;transition:transform .2s ease,background-color .2s ease!important}',
            '#' + BUTTON_ID + ':hover{transform:scale(1.1)!important;background:#f7f5f0!important}',
            '#' + BUTTON_ID + ' svg{width:16px!important;height:16px!important;fill:none!important;stroke:var(--qol-accent)!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important;pointer-events:none!important}',
            '#' + PANEL_ID + '{position:fixed!important;right:18px!important;top:76px!important;z-index:1000002!important;display:none!important;width:680px!important;max-width:calc(100vw - 36px)!important;max-height:calc(100vh - 100px)!important;overflow:hidden!important;border:3px solid var(--qol-border)!important;border-radius:7px!important;background:#f7f5f0!important;box-shadow:0 16px 42px rgba(0,0,0,.5)!important;color:#432f1d!important;font-family:Arial,Helvetica,sans-serif!important}',
            '#' + PANEL_ID + '.qol-ss-open{display:flex!important;flex-direction:column!important}',
            '#' + PANEL_ID + ' *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}',
            '.qol-ss-head{display:flex!important;align-items:center!important;justify-content:space-between!important;min-height:43px!important;padding:0 12px!important;background:linear-gradient(var(--qol-accent-mid),var(--qol-accent-deep))!important;color:#fffaf0!important;font-size:14px!important;font-weight:700!important}',
            '.qol-ss-close{width:24px!important;height:24px!important;display:flex!important;align-items:center!important;justify-content:center!important;border-radius:4px!important;background:rgba(0,0,0,.2)!important;cursor:pointer!important;font-size:19px!important}',
            '.qol-ss-body{padding:12px!important;overflow:auto!important}',
            '.qol-ss-tabs{display:flex!important;gap:5px!important;overflow-x:auto!important;margin:0 0 10px!important;padding-bottom:2px!important}',
            '.qol-ss-tab,.qol-ss-action{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:28px!important;padding:5px 10px!important;border:1px solid #a9906d!important;border-radius:4px!important;background:linear-gradient(#fffaf0,#e8d6b6)!important;color:#4d351d!important;font-size:10px!important;font-weight:700!important;cursor:pointer!important;white-space:nowrap!important}',
            '.qol-ss-tab.qol-active,.qol-ss-action{border-color:#564021!important;background:linear-gradient(var(--qol-accent),var(--qol-accent-gradient-end))!important;color:#fff8e9!important}',
            '.qol-ss-toolbar{display:flex!important;align-items:center!important;gap:7px!important;margin-bottom:9px!important}',
            '.qol-ss-search{flex:1!important;min-width:0!important;height:29px!important;padding:5px 8px!important;border:1px solid #bca789!important;border-radius:4px!important;background:#fff!important;color:#422f1e!important;font-size:11px!important}',
            '.qol-ss-summary{margin:0 0 8px!important;color:#735a3b!important;font-size:10px!important}',
            '.qol-ss-empty{padding:28px 16px!important;border:1px dashed #c8b490!important;border-radius:5px!important;background:#fffaf0!important;color:#6e573b!important;text-align:center!important;font-size:12px!important;line-height:1.45!important}',
            '.qol-ss-table-wrap{border:1px solid #cdbb9d!important;border-radius:4px!important;overflow:auto!important;background:#fff!important}',
            '.qol-ss-table{width:100%!important;border-collapse:collapse!important;font-size:10px!important}',
            '.qol-ss-table th{position:sticky!important;top:0!important;padding:7px 6px!important;background:#e5d4b8!important;color:#533b22!important;text-align:left!important;font-size:9px!important;text-transform:uppercase!important;z-index:1!important}',
            '.qol-ss-sort{cursor:pointer!important;user-select:none!important}.qol-ss-sort:hover{background:#d7c29d!important}.qol-ss-sort::after{content:""!important;margin-left:4px!important}.qol-ss-sort.qol-sort-asc::after{content:"▲"!important}.qol-ss-sort.qol-sort-desc::after{content:"▼"!important}',
            '#' + DIALOG_ID + '{position:fixed!important;inset:0!important;z-index:1000005!important;display:flex!important;align-items:center!important;justify-content:center!important;background:rgba(20,16,11,.56)!important}',
            '.qol-ss-dialog-card{width:390px!important;max-width:calc(100vw - 36px)!important;border:3px solid var(--qol-border)!important;border-radius:7px!important;background:#f7f5f0!important;box-shadow:0 16px 42px rgba(0,0,0,.5)!important;color:#432f1d!important;font-family:Arial,Helvetica,sans-serif!important}',
            '.qol-ss-dialog-title{padding:12px!important;background:linear-gradient(var(--qol-accent-mid),var(--qol-accent-deep))!important;color:#fffaf0!important;font-weight:700!important;font-size:14px!important}',
            '.qol-ss-dialog-message{padding:16px 14px!important;font-size:12px!important;line-height:1.45!important}',
            '.qol-ss-dialog-actions{display:flex!important;justify-content:flex-end!important;padding:0 14px 14px!important}',
            '.qol-ss-table td{padding:7px 6px!important;border-top:1px solid #eadfce!important;color:#4d3824!important;white-space:nowrap!important}',
            '.qol-ss-table tr:hover td{background:#fff8e7!important}',
            '.qol-ss-native-scan{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:25px!important;margin:7px 0!important;padding:4px 10px!important;border:1px solid #725634!important;border-radius:4px!important;background:linear-gradient(#f7efd9,#d9c59e)!important;color:var(--qol-accent-dark)!important;font:700 10px Arial,sans-serif!important;cursor:pointer!important}',
            '.qol-ss-native-scan.qol-ss-working{opacity:.65!important;cursor:wait!important}'
        ].join('');
        document.head.appendChild(style);
    }

    function isSecretSocietiesTabActive() {
        return /tab:SecretSociety/i.test(location.hash || '');
    }

    function getSocietyRoot() {
        if (!isSecretSocietiesTabActive()) return null;
        return document.querySelector('.loadedTab.tabSecretSociety.activeTab .secretSociety, .loadedTab.tabSecretSociety.currentTab .secretSociety, .secretSociety.defaultWindow, .loadedTab.tabSecretSociety.activeTab, .loadedTab.tabSecretSociety.currentTab');
    }

    function getSocietyId(root) {
        const routeMatch = String(location.hash || '').match(/(?:societyId|ssId|groupId):([0-9]+)/i);
        if (routeMatch) return routeMatch[1];

        const activeTab = root?.querySelector('dynamic-tabulation[active-tab]');
        if (activeTab?.getAttribute('active-tab')) return activeTab.getAttribute('active-tab');

        const actionText = root?.querySelector('[clickable*="societyId"]')?.getAttribute('clickable') || '';
        return actionText.match(/societyId['"]?\s*:\s*([0-9]+)/i)?.[1] || '';
    }

    function getMembersTable(root) {
        return root?.querySelector('table.memberList') || document.querySelector('.loadedTab.tabSecretSociety.activeTab table.memberList, .loadedTab.tabSecretSociety.currentTab table.memberList') || null;
    }

    function getSocietyName(root) {
        const activeTab = root?.querySelector('.dynamicTabulation .tab.active .content span');
        const heading = root?.querySelector('h6.headerWithIcon');
        return cleanText(activeTab?.textContent || heading?.childNodes?.[2]?.textContent || heading?.textContent) || 'Secret Society';
    }

    function extractMembers(root) {
        const table = getMembersTable(root);
        if (!table) return [];
        return Array.from(table.querySelectorAll('tbody tr')).map(row => {
            const cells = Array.from(row.querySelectorAll('td')).map(cell => cleanText(cell.textContent));
            const playerCell = row.querySelector('[playername],[player-name],.playerColumn,.name .playerLink');
            const name = row.getAttribute('player-name') || playerCell?.getAttribute('player-name') || playerCell?.getAttribute('playername') || cleanText(playerCell?.textContent) || cells[1] || 'Unknown';
            const playerId = row.getAttribute('player-id') || playerCell?.getAttribute('player-id') || playerCell?.getAttribute('playerid') || '';
            return {
                rank: cells[0] || '',
                name,
                playerId,
                villages: cells[2] || '',
                population: cells[3] || '',
                resourcesSent: cells[4] || '',
                troopsLostInDefense: cells[5] || '',
                troopsCurrentlyProvided: cells[6] || '',
                values: cells
            };
        }).filter(member => member.name && member.name !== 'Unknown');
    }

    function currentPage(root) {
        const routePage = String(location.hash || '').match(/\/cp:(\d+)\b/i);
        if (routePage) return Number(routePage[1]);

        const page = root?.querySelector('.tg-pagination .number.disabled, .tg-pagination .number.active, .tg-pagination [aria-current="page"]');
        const value = Number(cleanText(page?.textContent));
        return Number.isFinite(value) && value > 0 ? value : 1;
    }

    function totalPages(root) {
        const pages = Array.from(root?.querySelectorAll('.tg-pagination .number') || [])
            .map(item => Number(cleanText(item.textContent)))
            .filter(value => Number.isFinite(value) && value > 0);
        return Math.max(1, ...pages);
    }

    function pageRoute(page) {
        const hash = String(location.hash || '');
        return /\/cp:\d+\b/i.test(hash)
            ? hash.replace(/\/cp:\d+\b/i, '/cp:' + page)
            : hash.replace(/\/?$/, '') + '/cp:' + page;
    }

    async function openPage(page, root) {
        if (currentPage(root) === page) return root;
        const before = pageSignature(root);
        const nextRoute = pageRoute(page);
        if (location.hash !== nextRoute) location.hash = nextRoute;

        const startedAt = Date.now();
        while (Date.now() - startedAt < 5500) {
            await new Promise(resolve => setTimeout(resolve, 100));
            const activeRoot = getSocietyRoot();
            if (activeRoot && getMembersTable(activeRoot) && pageSignature(activeRoot) !== before) return activeRoot;
        }
        return null;
    }

    function pageSignature(root) {
        return extractMembers(root).map(member => member.playerId || member.name).join('|');
    }

    function nextButton(root) {
        return root.querySelector('.tg-pagination .nextPage:not(.disabled)');
    }

    function waitForChange(root, before, timeout = 4500) {
        return new Promise(resolve => {
            const start = Date.now();
            const timer = setInterval(() => {
                if (pageSignature(root) !== before || Date.now() - start >= timeout) {
                    clearInterval(timer);
                    setTimeout(resolve, 130);
                }
            }, 90);
        });
    }

    function clickPage(root, number) {
        const page = Array.from(root.querySelectorAll('.tg-pagination .number')).find(item => cleanText(item.textContent) === String(number) && !item.classList.contains('disabled'));
        page?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }

    function scanButtonState(text, working) {
        const button = document.getElementById(NATIVE_SCAN_ID);
        if (!button) return;
        button.textContent = text;
        button.classList.toggle('qol-ss-working', Boolean(working));
    }

    async function scanCurrentSociety() {
        let root = getSocietyRoot();
        if (!root || scanInProgress) return;
        scanInProgress = true;
        const lock = showUpdateLock('Preparing Secret Society scan…');

        try {
            // Always start from page 1. The game exposes the page as /cp:N in the route.
            root = await openPage(1, root);
            if (!root) throw new Error('Could not open page 1');

            const societyName = getSocietyName(root);
            const societyId = getSocietyId(root);
            const expectedPages = totalPages(root);
            const members = new Map();

            for (let page = 1; page <= expectedPages; page += 1) {
                lock.textContent = 'Scanning Secret Society… page ' + page + ' of ' + expectedPages;
                scanButtonState('Scanning page ' + page + ' of ' + expectedPages + '…', true);

                if (currentPage(root) !== page) throw new Error('Expected page ' + page);
                extractMembers(root).forEach(member => members.set(member.playerId || member.name, member));

                if (page === expectedPages) break;
                const next = nextButton(root);
                if (!next) throw new Error('Last page was not reached');

                const before = pageSignature(root);
                next.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                await waitForChange(root, before);
                root = getSocietyRoot();
                if (!root || pageSignature(root) === before || currentPage(root) !== page + 1) {
                    throw new Error('Page ' + (page + 1) + ' did not load');
                }
            }

            if (currentPage(root) !== expectedPages) throw new Error('Scan stopped before the final page');

            const scan = {
                id: societyId || societyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'secret-society',
                societyId,
                route: pageRoute(1),
                name: societyName,
                scannedAt: Date.now(),
                members: Array.from(members.values()).sort((a, b) => Number.parseInt(a.rank, 10) - Number.parseInt(b.rank, 10))
            };
            const scans = loadScans();
            const index = scans.findIndex(item => item.id === scan.id);
            if (index >= 0) scans[index] = scan;
            else scans.push(scan);
            saveScans(scans);
            renderPanel(scan.id);
            scanButtonState('Scan complete · ' + scan.members.length + ' members', false);
            lock.textContent = 'Scan complete · ' + scan.members.length + ' members';
            setTimeout(() => lock.remove(), 700);
        } catch (_) {
            scanButtonState('Scan error · scan again', false);
            lock.textContent = 'Scan incomplete. Please scan again.';
            setTimeout(() => lock.remove(), 1800);
        } finally {
            scanInProgress = false;
            setTimeout(() => scanButtonState('Scan Secret Society', false), 1800);
        }
    }

    function injectNativeScanButton() {
        const existing = document.getElementById(NATIVE_SCAN_ID);
        if (!enabled()) {
            existing?.remove();
            return;
        }

        const root = getSocietyRoot();
        const table = root && getMembersTable(root);
        if (!root || !table) {
            existing?.remove();
            return;
        }
        if (existing) return;
        const button = document.createElement('div');
        button.id = NATIVE_SCAN_ID;
        button.className = 'qol-ss-native-scan';
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.textContent = 'Scan Secret Society';
        const activate = event => {
            event.preventDefault();
            scanCurrentSociety();
        };
        button.addEventListener('click', activate);
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
        // The Society member table is inside a pagination wrapper, unlike Kingdom's statistics table.
        // Insert at that wrapper so the button is always visibly above the Society member list.
        const anchor = table.closest('[pagination], .paginated, .contentBox, .windowContent') || table;
        anchor.before(button);
    }

    function showUpdateLock(message) {
        let lock = document.getElementById('qol-ss-update-lock');
        if (!lock) {
            lock = document.createElement('div');
            lock.id = 'qol-ss-update-lock';
            lock.style.cssText = 'position:fixed!important;inset:0!important;z-index:1000003!important;display:flex!important;align-items:center!important;justify-content:center!important;background:rgba(20,16,11,.52)!important;color:#fffaf0!important;font:700 13px Arial,sans-serif!important;text-align:center!important';
            document.body.appendChild(lock);
        }
        lock.textContent = message;
        return lock;
    }

    function waitForSecretSociety(timeout = 8000) {
        return new Promise(resolve => {
            const startedAt = Date.now();
            const timer = setInterval(() => {
                const root = getSocietyRoot();
                if ((root && getMembersTable(root)) || Date.now() - startedAt >= timeout) {
                    clearInterval(timer);
                    resolve(root);
                }
            }, 100);
        });
    }

    async function updateStoredSociety(scan) {
        if (!scan) return;
        const lock = showUpdateLock('Opening Secret Society…');
        try {
            if (scan.route && location.hash !== scan.route) location.hash = scan.route;
            const root = await waitForSecretSociety();
            if (!root) {
                lock.textContent = 'Could not open this Secret Society.';
                setTimeout(() => lock.remove(), 1600);
                return;
            }
            lock.textContent = 'Scanning Secret Society…';
            await scanCurrentSociety();
        } finally {
            lock.remove();
        }
    }

    const MEMBER_COLUMNS = [
        { key: 'rank', label: '#' }, { key: 'name', label: 'Player' }, { key: 'villages', label: 'Villages' },
        { key: 'population', label: 'Population' }, { key: 'resourcesSent', label: 'Resources Sent' },
        { key: 'troopsLostInDefense', label: 'Troops Lost in Defense' }, { key: 'troopsCurrentlyProvided', label: 'Troops Currently Provided' }
    ];
    function numericValue(value) {
        const parsed = Number(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
    }
    function sortedMembers(members) {
        const multiplier = memberSort.direction === 'asc' ? 1 : -1;
        return members.slice().sort((left, right) => {
            const a = numericValue(left[memberSort.key]), b = numericValue(right[memberSort.key]);
            if (a != null && b != null) return (a - b) * multiplier;
            return String(left[memberSort.key] || '').localeCompare(String(right[memberSort.key] || ''), undefined, { numeric: true, sensitivity: 'base' }) * multiplier;
        });
    }
    function showScannerDialog(title, message) {
        document.getElementById(DIALOG_ID)?.remove();
        const dialog = document.createElement('div');
        dialog.id = DIALOG_ID;
        dialog.innerHTML = '<div class="qol-ss-dialog-card" role="dialog" aria-modal="true"><div class="qol-ss-dialog-title">' + escapeHtml(title) + '</div><div class="qol-ss-dialog-message">' + escapeHtml(message) + '</div><div class="qol-ss-dialog-actions"><div class="qol-ss-action" role="button" tabindex="0">OK</div></div></div>';
        const close = () => dialog.remove();
        const ok = dialog.querySelector('.qol-ss-action');
        ok.addEventListener('click', close);
        ok.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') close(); });
        document.body.appendChild(dialog); ok.focus();
    }
    function deleteStoredScans() {
        try {
            const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            delete all[serverKey()];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch (_) {
            localStorage.removeItem(STORAGE_KEY);
        }
        renderPanel();
    }

    function confirmDeleteStoredScans() {
        document.getElementById(DIALOG_ID)?.remove();
        const dialog = document.createElement('div');
        dialog.id = DIALOG_ID;
        dialog.innerHTML = '<div class="qol-ss-dialog-card" role="dialog" aria-modal="true"><div class="qol-ss-dialog-title">Delete Secret Society data?</div><div class="qol-ss-dialog-message">This removes every Secret Society list saved by APES on this game server. It cannot be undone.</div><div class="qol-ss-dialog-actions"><div class="qol-ss-tab" data-ss-cancel role="button" tabindex="0">Cancel</div><div class="qol-ss-action" data-ss-confirm-delete role="button" tabindex="0">Delete data</div></div></div>';
        const close = () => dialog.remove();
        const cancel = dialog.querySelector('[data-ss-cancel]');
        const confirm = dialog.querySelector('[data-ss-confirm-delete]');
        cancel.addEventListener('click', close);
        confirm.addEventListener('click', () => { deleteStoredScans(); close(); });
        document.body.appendChild(dialog);
        cancel.focus();
    }
    function exportScanCsv(scan) {
        if (!scan) return;
        const quote = value => '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
        const rows = [MEMBER_COLUMNS.map(column => quote(column.label)).join(','), ...sortedMembers(scan.members).map(member => MEMBER_COLUMNS.map(column => quote(member[column.key])).join(','))];
        const blob = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        const safeName = String(scan.name || 'secret-society').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '');
        link.href = url; link.download = 'APES-Secret-Society-' + safeName + '.csv'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    function renderPanel(selectedId) {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const scans = loadScans();
        const selected = scans.find(scan => scan.id === selectedId) || scans[0];
        const tabs = scans.map(scan => '<div class="qol-ss-tab' + (scan.id === selected?.id ? ' qol-active' : '') + '" data-ss-tab="' + escapeHtml(scan.id) + '" role="button" tabindex="0">' + escapeHtml(scan.name) + '</div>').join('');

        if (!selected) {
            panel.querySelector('.qol-ss-body').innerHTML = '<div class="qol-ss-empty">No Secret Society scanned yet.<br>Open a Secret Society, then use <strong>Scan Secret Society</strong> above its member list.</div>';
            return;
        }

        const body = panel.querySelector('.qol-ss-body');
        body.innerHTML = '<div class="qol-ss-tabs">' + tabs + '</div><div class="qol-ss-toolbar"><input class="qol-ss-search" type="search" placeholder="Search members…" aria-label="Search Secret Society members"><div class="qol-ss-action" data-ss-export role="button" tabindex="0">Export CSV</div><div class="qol-ss-action" data-ss-refresh role="button" tabindex="0">Update</div><div class="qol-ss-tab" data-ss-delete role="button" tabindex="0">Delete SS Data</div></div><p class="qol-ss-summary">' + selected.members.length + ' members · scanned ' + new Date(selected.scannedAt).toLocaleString() + '</p><div class="qol-ss-table-wrap"><table class="qol-ss-table"><thead><tr>' + MEMBER_COLUMNS.map(column => '<th class="qol-ss-sort' + (memberSort.key === column.key ? ' qol-sort-' + memberSort.direction : '') + '" data-ss-sort="' + column.key + '" role="button" tabindex="0">' + column.label + '</th>').join('') + '</tr></thead><tbody></tbody></table></div>';

        const renderRows = () => {
            const query = cleanText(body.querySelector('.qol-ss-search')?.value).toLowerCase();
            const rows = sortedMembers(selected.members.filter(member => Object.values(member).join(' ').toLowerCase().includes(query))).map(member => '<tr><td>' + escapeHtml(member.rank) + '</td><td>' + escapeHtml(member.name) + '</td><td>' + escapeHtml(member.villages) + '</td><td>' + escapeHtml(member.population) + '</td><td>' + escapeHtml(member.resourcesSent) + '</td><td>' + escapeHtml(member.troopsLostInDefense) + '</td><td>' + escapeHtml(member.troopsCurrentlyProvided) + '</td></tr>').join('');
            body.querySelector('tbody').innerHTML = rows || '<tr><td colspan="7">No matching members.</td></tr>';
        };
        renderRows();
        body.querySelector('.qol-ss-search').addEventListener('input', renderRows);
        body.querySelectorAll('[data-ss-tab]').forEach(tab => tab.addEventListener('click', () => renderPanel(tab.dataset.ssTab)));
        body.querySelector('[data-ss-refresh]').addEventListener('click', () => updateStoredSociety(selected));
        body.querySelector('[data-ss-export]').addEventListener('click', () => exportScanCsv(selected));
        body.querySelector('[data-ss-delete]').addEventListener('click', confirmDeleteStoredScans);
        body.querySelectorAll('[data-ss-sort]').forEach(header => {
            const sort = () => {
                const key = header.dataset.ssSort;
                memberSort = { key, direction: memberSort.key === key && memberSort.direction === 'asc' ? 'desc' : 'asc' };
                renderPanel(selected.id);
            };
            header.addEventListener('click', sort);
            header.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') sort(); });
        });
    }

    function injectPanel() {
        injectStyles();
        let button = document.getElementById(BUTTON_ID);
        if (!button) {
            button = document.createElement('div');
            button.id = BUTTON_ID;
            button.title = 'Secret Society Scanner';
            button.setAttribute('role', 'button');
            button.setAttribute('tabindex', '0');
            button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20h12"></path><path d="M8 20v-4h8v4"></path><path d="M7 5h10v5c0 3-2.2 5-5 5s-5-2-5-5z"></path><path d="M9 5V3h6v2"></path><path d="M9 9h6"></path></svg>';
            const toggle = event => {
                event.preventDefault();
                event.stopPropagation();
                const panel = document.getElementById(PANEL_ID);
                panel.classList.toggle('qol-ss-open');
                if (panel.classList.contains('qol-ss-open')) renderPanel();
            };
            button.addEventListener('click', toggle);
            button.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') toggle(event);
            });
            document.body.appendChild(button);
        }

        if (!document.getElementById(PANEL_ID)) {
            const panel = document.createElement('div');
            panel.id = PANEL_ID;
            panel.innerHTML = '<div class="qol-ss-head"><span>Secret Society Scanner</span><div class="qol-ss-close" role="button" tabindex="0">×</div></div><div class="qol-ss-body"></div>';
            panel.querySelector('.qol-ss-close').addEventListener('click', () => panel.classList.remove('qol-ss-open'));
            document.body.appendChild(panel);
        }
        renderPanel();
        window.qolRepositionAllButtons?.();
    }

    function start() {
        if (!enabled()) return;
        injectPanel();
        injectNativeScanButton();
        if (!observer) {
            observer = new MutationObserver(() => {
                if (!enabled()) return;
                injectNativeScanButton();
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }
    }

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        document.getElementById(PANEL_ID)?.classList.remove('qol-ss-open');
    });

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== FEATURE_KEY) return;
        if (event.detail.enabled) {
            document.getElementById(PANEL_ID)?.style.removeProperty('display');
            start();
        } else {
            document.getElementById(PANEL_ID)?.classList.remove('qol-ss-open');
            document.getElementById(PANEL_ID)?.style.setProperty('display', 'none', 'important');
        }
    });

    const begin = () => start();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, { once: true });
    else begin();
})();