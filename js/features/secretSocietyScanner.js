(() => {
  'use strict';

  const FEATURE_KEY = 'secretSocietyScanner';
  const STORAGE_KEY = 'apes_secret_society_scans_v1';
  const BUTTON_ID = 'qol-ss-scanner-toggle-btn';
  const PANEL_ID = 'qol-ss-scanner-panel';
  const NATIVE_ACTION_ID = 'qol-ss-native-actions';
  const NATIVE_SCAN_ID = 'qol-ss-native-scan';
  const DIALOG_ID = 'qol-ss-dialog';
  const LOCK_ID = 'qol-ss-interaction-lock';
  const STYLE_ID = 'qol-ss-scanner-styles';
  const COMPOSER_ID = 'igmSystemNewConversation';
  const MAX_PAGES = 100;
  const PAGE_TIMEOUT = 9000;
  const COMPOSER_TIMEOUT = 11000;
  const MESSAGE_GAP = 850;
  const SNAPSHOT_HISTORY_LIMIT = 24;
  const ROLE_KEYS = ['off', 'def', 'op'];
  let scanInProgress = false;
  let messageInProgress = false;
  let memberMailInProgress = false;
  let cancelMessageRun = false;
  let memberSort = {
    key: 'rank',
    direction: 'asc'
  };
  let observer = null;
  let nativeScanRefreshQueued = false;
  const composerDrafts = new Map();
  function enabled() {
    return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY) === true;
  }
  function delay(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }
  function waitUntil(predicate, timeout, interval = 100) {
    return new Promise(resolve => {
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        let result = null;
        try {
          result = predicate();
        } catch (_) {
          result = null;
        }
        if (result || Date.now() - startedAt >= timeout) {
          window.clearInterval(timer);
          resolve(result || null);
        }
      }, interval);
    });
  }
  function serverKey() {
    return location.hostname.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  }
  function cleanText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function normalizedText(value) {
    return cleanText(value).toLocaleLowerCase();
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function memberKey(member) {
    return String(member?.playerId || normalizedText(member?.name));
  }
  function normalizeMember(member) {
    return {
      rank: cleanText(member?.rank),
      name: cleanText(member?.name),
      playerId: cleanText(member?.playerId),
      villages: cleanText(member?.villages),
      population: cleanText(member?.population),
      resourcesSent: cleanText(member?.resourcesSent),
      troopsLostInDefense: cleanText(member?.troopsLostInDefense),
      troopsCurrentlyProvided: cleanText(member?.troopsCurrentlyProvided),
      off: Boolean(member?.off),
      def: Boolean(member?.def),
      op: Boolean(member?.op),
      villageChange: nullableNumber(member?.villageChange),
      populationChange: nullableNumber(member?.populationChange),
      isNew: Boolean(member?.isNew)
    };
  }
  function summarizeMembers(members, scannedAt = Date.now()) {
    return {
      scannedAt: Number(scannedAt) || Date.now(),
      memberCount: members.length,
      villages: members.reduce((total, member) => total + (numericValue(member.villages) || 0), 0),
      population: members.reduce((total, member) => total + (numericValue(member.population) || 0), 0)
    };
  }
  function normalizeSnapshot(snapshot, fallbackMembers = [], fallbackScannedAt = Date.now()) {
    const fallback = summarizeMembers(fallbackMembers, fallbackScannedAt);
    return {
      scannedAt: Number(snapshot?.scannedAt) || fallback.scannedAt,
      memberCount: nullableNumber(snapshot?.memberCount) ?? fallback.memberCount,
      villages: nullableNumber(snapshot?.villages) ?? fallback.villages,
      population: nullableNumber(snapshot?.population) ?? fallback.population
    };
  }
  function loadScans() {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      const scans = Array.isArray(all[serverKey()]) ? all[serverKey()] : [];
      return scans.map(scan => {
        const members = Array.isArray(scan.members) ? scan.members.map(normalizeMember).filter(member => member.name) : [];
        return {
          ...scan,
          members,
          summary: normalizeSnapshot(scan.summary, members, scan.scannedAt),
          history: Array.isArray(scan.history) ? scan.history.map(snapshot => normalizeSnapshot(snapshot)).slice(-SNAPSHOT_HISTORY_LIMIT) : []
        };
      });
    } catch (_) {
      return [];
    }
  }
  function saveScans(scans) {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      all[serverKey()] = scans;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (error) {
      console.warn('[APES Secret Society] Storage write failed:', error);
    }
  }
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
            #${BUTTON_ID}{position:fixed!important;display:none;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;margin:0!important;padding:0!important;box-sizing:border-box!important;border:2px solid var(--qol-accent)!important;border-radius:50%!important;background:var(--qol-accent-soft)!important;box-shadow:0 2px 4px rgba(0,0,0,.2)!important;cursor:pointer!important;user-select:none!important;transition:transform .2s ease,background-color .2s ease!important;z-index:9999!important}
            #${BUTTON_ID}:hover{transform:scale(1.08)!important;background:#f7f5f0!important}
            #${BUTTON_ID} svg{width:17px!important;height:17px!important;fill:none!important;stroke:var(--qol-accent)!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important;pointer-events:none!important}

            #${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${PANEL_ID}{position:fixed!important;right:18px!important;top:76px!important;z-index:1000002!important;display:none;flex-direction:column!important;width:min(1080px,calc(100vw - 36px))!important;min-width:min(720px,calc(100vw - 20px))!important;height:min(610px,calc(100vh - 100px))!important;min-height:360px!important;max-width:calc(100vw - 16px)!important;max-height:calc(100vh - 16px)!important;overflow:hidden!important;resize:both!important;border:3px solid var(--qol-border)!important;border-radius:7px!important;background:#f7f5f0!important;box-shadow:0 16px 42px rgba(0,0,0,.5)!important;color:#432f1d!important}
            #${PANEL_ID}.qol-ss-open{display:flex!important}
            #${PANEL_ID} .qol-ss-head{display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 auto!important;min-height:39px!important;padding:0 10px 0 12px!important;background:linear-gradient(var(--qol-accent-mid),var(--qol-accent-deep))!important;color:#fffaf0!important;font-size:13px!important;font-weight:700!important;cursor:move!important;user-select:none!important;touch-action:none!important}
            #${PANEL_ID} .qol-ss-close{display:flex!important;align-items:center!important;justify-content:center!important;width:24px!important;height:24px!important;border-radius:4px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;cursor:pointer!important;font-size:19px!important;line-height:1!important}
            #${PANEL_ID} .qol-ss-body{display:flex!important;flex:1 1 auto!important;min-height:0!important;flex-direction:column!important;gap:8px!important;padding:10px!important;overflow:hidden!important}
            #${PANEL_ID} .qol-ss-tabs{display:flex!important;flex:0 0 auto!important;gap:5px!important;overflow-x:auto!important;padding-bottom:2px!important}
            #${PANEL_ID} .qol-ss-tab,#${PANEL_ID} .qol-ss-action,#${DIALOG_ID} .qol-ss-action,#${DIALOG_ID} .qol-ss-tab{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:27px!important;padding:5px 10px!important;border:1px solid #a9906d!important;border-radius:4px!important;background:linear-gradient(#fffaf0,#e8d6b6)!important;color:#4d351d!important;font-size:9px!important;font-weight:700!important;cursor:pointer!important;white-space:nowrap!important;user-select:none!important}
            #${PANEL_ID} .qol-ss-tab.qol-active,#${PANEL_ID} .qol-ss-action,#${DIALOG_ID} .qol-ss-action{border-color:var(--qol-action-border)!important;background:linear-gradient(var(--qol-accent),var(--qol-accent-gradient-end))!important;color:#fff8e9!important}
            #${PANEL_ID} [aria-disabled="true"]{opacity:.5!important;cursor:not-allowed!important;pointer-events:none!important}

            #${PANEL_ID} .qol-ss-composer{display:grid!important;grid-template-columns:minmax(0,1fr) 170px!important;gap:8px!important;flex:0 0 auto!important;padding:9px!important;border:1px solid #cdbb9d!important;border-radius:5px!important;background:#fffaf0!important}
            #${PANEL_ID} .qol-ss-composer-copy{display:flex!important;flex-direction:column!important;gap:4px!important;min-width:0!important}
            #${PANEL_ID} .qol-ss-composer-label{color:var(--qol-accent-deep)!important;font-size:9px!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.3px!important}
            #${PANEL_ID} .qol-ss-message{display:block!important;width:100%!important;height:68px!important;min-height:54px!important;max-height:130px!important;padding:7px 8px!important;border:1px solid #bca789!important;border-radius:4px!important;background:#fff!important;color:#332719!important;resize:vertical!important;font-size:10px!important;line-height:1.4!important;outline:none!important;appearance:auto!important;-webkit-appearance:auto!important}
            #${PANEL_ID} .qol-ss-message:focus,#${PANEL_ID} .qol-ss-recipient-select:focus,#${PANEL_ID} .qol-ss-search:focus{border-color:var(--qol-accent)!important;box-shadow:0 0 0 1px var(--qol-accent-soft)!important}
            #${PANEL_ID} .qol-ss-composer-actions{display:flex!important;flex-direction:column!important;justify-content:flex-end!important;gap:5px!important;min-width:0!important}
            #${PANEL_ID} .qol-ss-recipient-select{display:block!important;width:100%!important;height:28px!important;padding:3px 6px!important;border:1px solid #a99473!important;border-radius:4px!important;background:#fff!important;color:#432f1d!important;font-size:10px!important;appearance:auto!important;-webkit-appearance:auto!important}
            #${PANEL_ID} .qol-ss-recipient-count{min-height:14px!important;color:#735a3b!important;font-size:8.5px!important;line-height:1.3!important}
            #${PANEL_ID} .qol-ss-send{width:100%!important}

            #${PANEL_ID} .qol-ss-toolbar{display:flex!important;align-items:center!important;gap:6px!important;flex:0 0 auto!important}
            #${PANEL_ID} .qol-ss-search{flex:1!important;min-width:120px!important;height:27px!important;padding:4px 7px!important;border:1px solid #bca789!important;border-radius:4px!important;background:#fff!important;color:#422f1e!important;font-size:10px!important;appearance:auto!important;-webkit-appearance:auto!important}
            #${PANEL_ID} .qol-ss-summary{display:flex!important;align-items:center!important;gap:7px!important;flex:0 0 auto!important;min-height:31px!important;margin:0!important;padding:5px 7px!important;border:1px solid #d3c3aa!important;border-radius:4px!important;background:#f1e9dc!important;color:#735a3b!important;font-size:8.5px!important;overflow-x:auto!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-ss-summary-metric{display:inline-flex!important;align-items:center!important;gap:4px!important;padding-right:8px!important;border-right:1px solid #ccb99b!important;font-weight:700!important}
            #${PANEL_ID} .qol-ss-summary-metric:last-of-type{border-right:0!important}
            #${PANEL_ID} .qol-ss-summary-meta{margin-left:auto!important;color:#87745c!important;font-size:8px!important;font-weight:400!important}
            #${PANEL_ID} .qol-ss-summary-change,#${PANEL_ID} .qol-ss-change{font-weight:700!important}
            #${PANEL_ID} .qol-positive{color:#35651f!important}
            #${PANEL_ID} .qol-negative{color:#8b2922!important}
            #${PANEL_ID} .qol-stationary{color:#967016!important}
            #${PANEL_ID} .qol-ss-empty{padding:30px 16px!important;border:1px dashed #c8b490!important;border-radius:5px!important;background:#fffaf0!important;color:#6e573b!important;text-align:center!important;font-size:11px!important;line-height:1.5!important}
            #${PANEL_ID} .qol-ss-table-wrap{flex:1 1 auto!important;min-height:0!important;border:1px solid #cdbb9d!important;border-radius:4px!important;overflow:auto!important;background:#fff!important;scrollbar-color:var(--qol-scroll-thumb) #e7ded1!important;scrollbar-width:thin!important}
            #${PANEL_ID} .qol-ss-table{width:100%!important;min-width:990px!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:9px!important}
            #${PANEL_ID} .qol-ss-table th{position:sticky!important;top:0!important;z-index:2!important;height:31px!important;padding:4px 5px!important;border-bottom:1px solid #cbbd9f!important;background:#e5d4b8!important;color:#533b22!important;text-align:left!important;font-size:8px!important;text-transform:uppercase!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-ss-table th.qol-ss-icon-column,#${PANEL_ID} .qol-ss-table td.qol-ss-number-column,#${PANEL_ID} .qol-ss-table th.qol-ss-role-column,#${PANEL_ID} .qol-ss-table td.qol-ss-role-column,#${PANEL_ID} .qol-ss-table th.qol-ss-mail-column,#${PANEL_ID} .qol-ss-table td.qol-ss-mail-column{text-align:center!important}
            #${PANEL_ID} .qol-ss-table td{height:29px!important;padding:4px 5px!important;border-top:1px solid #eadfce!important;color:#4d3824!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
            #${PANEL_ID} .qol-ss-table td.qol-ss-name-column{font-weight:700!important}
            #${PANEL_ID} .qol-ss-table td.qol-ss-notes-column{overflow:visible!important;text-overflow:clip!important}
            #${PANEL_ID} .qol-ss-table tr:hover td{background:#fff8e7!important}
            #${PANEL_ID} .qol-ss-sort{cursor:pointer!important;user-select:none!important}
            #${PANEL_ID} .qol-ss-sort:hover{background:#d7c29d!important}
            #${PANEL_ID} .qol-ss-sort::after{content:""!important;margin-left:3px!important}
            #${PANEL_ID} .qol-ss-sort.qol-sort-asc::after{content:"▲"!important}
            #${PANEL_ID} .qol-ss-sort.qol-sort-desc::after{content:"▼"!important}
            #${PANEL_ID} .qol-ss-metric-icon{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:17px!important;height:17px!important;vertical-align:middle!important;color:currentColor!important}
            #${PANEL_ID} .qol-ss-metric-icon svg{width:15px!important;height:15px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important}
            #${PANEL_ID} .qol-ss-metric-icon i{display:block!important;margin:0!important;transform:scale(.82)!important;transform-origin:center!important}
            #${PANEL_ID} .qol-ss-note-icon{width:13px!important;height:13px!important}
            #${PANEL_ID} .qol-ss-note-icon svg{width:12px!important;height:12px!important;stroke-width:2!important}
            #${PANEL_ID} .qol-ss-change{display:inline-flex!important;align-items:center!important;gap:2px!important}
            #${PANEL_ID} .qol-ss-note-divider{display:inline-block!important;margin:0 5px!important;color:#b7a98f!important;font-weight:400!important}
            #${PANEL_ID} .qol-ss-mail{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:21px!important;height:21px!important;margin:0 auto!important;border:1px solid #a98e67!important;border-radius:4px!important;background:#fffaf0!important;color:var(--qol-accent-deep)!important;cursor:pointer!important;outline:none!important}
            #${PANEL_ID} .qol-ss-mail:hover,#${PANEL_ID} .qol-ss-mail:focus-visible{border-color:var(--qol-accent)!important;background:var(--qol-accent-soft)!important;box-shadow:0 0 0 1px var(--qol-accent-soft)!important}
            #${PANEL_ID} .qol-ss-mail .qol-ss-metric-icon{width:14px!important;height:14px!important}
            #${PANEL_ID} .qol-ss-mail svg{width:13px!important;height:13px!important;stroke-width:2!important}
            #${PANEL_ID} .qol-ss-role-check{position:relative!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;width:17px!important;height:17px!important;margin:0 auto!important;border:1px solid #8e7656!important;border-radius:3px!important;background:#fff!important;color:#fff!important;cursor:pointer!important;user-select:none!important;outline:none!important}
            #${PANEL_ID} .qol-ss-role-check:hover,#${PANEL_ID} .qol-ss-role-check:focus-visible{border-color:var(--qol-accent)!important;box-shadow:0 0 0 1px var(--qol-accent-soft)!important}
            #${PANEL_ID} .qol-ss-role-check[aria-checked="true"]{border-color:#46651f!important;background:#648b2c!important}
            #${PANEL_ID} .qol-ss-role-check[aria-checked="true"]::after{content:"✓"!important;font-size:12px!important;font-weight:700!important;line-height:1!important}

            #${NATIVE_ACTION_ID}{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:7px!important;margin:8px 0!important;padding:6px 8px!important;border:1px solid #cdbb9d!important;border-radius:4px!important;background:#f4ecde!important;font-family:Arial,Helvetica,sans-serif!important}
            #${NATIVE_ACTION_ID} .qol-ss-native-label{margin-right:auto!important;color:#6e573b!important;font-size:9px!important;font-weight:700!important;text-transform:uppercase!important}
            #${NATIVE_SCAN_ID}{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:27px!important;padding:5px 12px!important;border:1px solid var(--qol-action-border)!important;border-radius:4px!important;background:linear-gradient(var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font:700 10px Arial,sans-serif!important;cursor:pointer!important;user-select:none!important}
            #${NATIVE_SCAN_ID}.qol-ss-working{opacity:.65!important;cursor:wait!important;pointer-events:none!important}

            #${DIALOG_ID}{position:fixed!important;inset:0!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:20px!important;background:rgba(20,16,11,.62)!important}
            #${DIALOG_ID},#${DIALOG_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${DIALOG_ID} .qol-ss-dialog-card{width:min(430px,calc(100vw - 36px))!important;border:3px solid var(--qol-border)!important;border-radius:7px!important;background:#f7f5f0!important;box-shadow:0 16px 42px rgba(0,0,0,.5)!important;color:#432f1d!important;overflow:hidden!important}
            #${DIALOG_ID} .qol-ss-dialog-title{padding:11px 13px!important;background:linear-gradient(var(--qol-accent-mid),var(--qol-accent-deep))!important;color:#fffaf0!important;font-weight:700!important;font-size:13px!important}
            #${DIALOG_ID} .qol-ss-dialog-message{padding:15px 14px!important;font-size:11px!important;line-height:1.5!important;white-space:pre-line!important}
            #${DIALOG_ID} .qol-ss-dialog-actions{display:flex!important;justify-content:flex-end!important;gap:7px!important;padding:0 14px 14px!important}

            #${LOCK_ID}{position:fixed!important;inset:0!important;z-index:2147483646!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:22px!important;background:rgba(0,0,0,.72)!important;color:#fff!important;font-family:Arial,Helvetica,sans-serif!important;text-align:center!important;cursor:wait!important;user-select:none!important;pointer-events:auto!important;touch-action:none!important}
            #${LOCK_ID} .qol-ss-lock-card{display:flex!important;flex-direction:column!important;align-items:center!important;gap:7px!important;min-width:min(360px,82vw)!important;max-width:560px!important;padding:18px 22px!important;border:1px solid rgba(255,255,255,.18)!important;border-radius:7px!important;background:rgba(30,24,17,.88)!important;box-shadow:0 12px 32px rgba(0,0,0,.42)!important}
            #${LOCK_ID} .qol-ss-lock-title{font-size:14px!important;font-weight:700!important}
            #${LOCK_ID} .qol-ss-lock-status{color:#ddd!important;font-size:10px!important;font-weight:400!important;line-height:1.45!important}
            #${LOCK_ID} .qol-ss-lock-stop{display:none!important;margin-top:5px!important;min-height:26px!important;padding:5px 12px!important;border:1px solid #b8a383!important;border-radius:4px!important;background:#f7f5f0!important;color:#4d351d!important;font-size:9px!important;font-weight:700!important;cursor:pointer!important}
            #${LOCK_ID}.qol-ss-cancellable .qol-ss-lock-stop{display:inline-flex!important;align-items:center!important;justify-content:center!important}

            @media(max-width:820px){#${PANEL_ID}{min-width:calc(100vw - 20px)!important;right:10px!important}#${PANEL_ID} .qol-ss-composer{grid-template-columns:1fr!important}#${PANEL_ID} .qol-ss-composer-actions{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important}#${PANEL_ID} .qol-ss-recipient-count{grid-column:1 / -1!important}}
        `;
    document.head.appendChild(style);
  }
  function isSecretSocietyTabActive() {
    return /(?:^|\/)tab:SecretSociety(?:\/|$)/i.test(location.hash || '');
  }
  function getSocietyRoot() {
    if (!isSecretSocietyTabActive()) return null;
    return document.querySelector('.loadedTab.tabSecretSociety.activeTab.currentTab .secretSociety.defaultWindow,' + '.loadedTab.tabSecretSociety.activeTab .secretSociety.defaultWindow,' + '.loadedTab.tabSecretSociety.currentTab .secretSociety.defaultWindow,' + '.secretSociety.defaultWindow');
  }
  function getMembersTable(root) {
    return root?.querySelector('.paginated table.memberList, table.memberList') || null;
  }
  function getSocietyId(root) {
    const routeMatch = String(location.hash || '').match(/(?:^|\/)societyId:(\d+)(?:\/|$)/i);
    if (routeMatch) return routeMatch[1];
    const activeTab = root?.querySelector('dynamic-tabulation[active-tab]');
    const activeId = cleanText(activeTab?.getAttribute('active-tab'));
    if (activeId) return activeId;
    const kickAction = root?.querySelector('[clickable*="societyId"]')?.getAttribute('clickable') || '';
    return kickAction.match(/societyId['"]?\s*:\s*(\d+)/i)?.[1] || '';
  }
  function getSocietyName(root) {
    return cleanText(root?.querySelector('dynamic-tabulation .tab.active .content span')?.textContent || root?.querySelector('h6.headerWithIcon')?.textContent) || 'Secret Society';
  }
  function extractMembers(root) {
    const table = getMembersTable(root);
    if (!table) return [];
    return Array.from(table.querySelectorAll('tbody tr')).map(row => {
      const cells = Array.from(row.querySelectorAll(':scope > td'));
      const playerLink = row.querySelector('td.name a.playerLink[playername], a.playerLink[playername]');
      const name = cleanText(playerLink?.getAttribute('playername') || playerLink?.textContent || cells[1]?.textContent);
      return normalizeMember({
        rank: cleanText(cells[0]?.textContent).replace(/\.$/, ''),
        name,
        playerId: playerLink?.getAttribute('playerid') || '',
        villages: cells[2]?.textContent,
        population: cells[3]?.textContent,
        resourcesSent: cells[4]?.textContent,
        troopsLostInDefense: cells[5]?.textContent,
        troopsCurrentlyProvided: cells[6]?.textContent
      });
    }).filter(member => member.name);
  }
  function currentPage(root) {
    const routePage = String(location.hash || '').match(/(?:^|\/)cp:(\d+)(?:\/|$)/i);
    if (routePage) return Number(routePage[1]);
    const page = root?.querySelector('.tg-pagination .number.disabled,' + '.tg-pagination .number.active,' + '.tg-pagination [aria-current="page"]');
    const value = Number(cleanText(page?.textContent));
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
  function totalPages(root) {
    const values = Array.from(root?.querySelectorAll('.tg-pagination .number') || []).map(item => Number(cleanText(item.textContent))).filter(value => Number.isFinite(value) && value > 0);
    return Math.max(1, currentPage(root), ...values);
  }
  function hasNextPage(root) {
    return Boolean(root?.querySelector('.tg-pagination .nextPage:not(.disabled),' + '.tg-pagination .next:not(.disabled)'));
  }
  function pageSignature(root) {
    return extractMembers(root).map(member => `${memberKey(member)}:${member.rank}`).join('|');
  }
  function pageRoute(page) {
    const hash = String(location.hash || '#/');
    if (/(?:^|\/)cp:\d+(?:\/|$)/i.test(hash)) {
      return hash.replace(/\/cp:\d+(?=\/|$)/i, `/cp:${page}`);
    }
    return `${hash.replace(/\/$/, '')}/cp:${page}`;
  }
  async function waitForPage(page, previousSignature = '', timeout = PAGE_TIMEOUT) {
    const startedAt = Date.now();
    let lastSignature = '';
    let stableReads = 0;
    while (Date.now() - startedAt < timeout) {
      await delay(120);
      const root = getSocietyRoot();
      if (!root || currentPage(root) !== page || !getMembersTable(root)) continue;
      const signature = pageSignature(root);
      if (!signature) continue;
      if (previousSignature && signature === previousSignature) continue;
      if (signature === lastSignature) stableReads += 1;else {
        lastSignature = signature;
        stableReads = 1;
      }
      if (stableReads >= 3) return root;
    }
    return null;
  }
  async function openPage(page, root) {
    const before = pageSignature(root);
    if (currentPage(root) === page && before) {
      return waitForPage(page, '', 2500);
    }
    const target = pageRoute(page);
    if (location.hash !== target) location.hash = target;
    return waitForPage(page, before);
  }
  function scanButtonState(text, working) {
    const button = document.getElementById(NATIVE_SCAN_ID);
    if (!button) return;
    button.textContent = text;
    button.classList.toggle('qol-ss-working', Boolean(working));
    button.setAttribute('aria-busy', String(Boolean(working)));
  }
  function showInteractionLock(title, message, {
    cancellable = false
  } = {}) {
    hideInteractionLock();
    const lock = document.createElement('div');
    lock.id = LOCK_ID;
    lock.setAttribute('role', 'status');
    lock.setAttribute('aria-live', 'polite');
    lock.setAttribute('aria-busy', 'true');
    if (cancellable) lock.classList.add('qol-ss-cancellable');
    lock.innerHTML = `
            <div class="qol-ss-lock-card">
                <div class="qol-ss-lock-title"></div>
                <div class="qol-ss-lock-status"></div>
                <div class="qol-ss-lock-stop" role="button" tabindex="0">Stop after current message</div>
            </div>
        `;
    lock.querySelector('.qol-ss-lock-title').textContent = title;
    lock.querySelector('.qol-ss-lock-status').textContent = message;
    const stop = lock.querySelector('.qol-ss-lock-stop');
    const requestStop = event => {
      event?.preventDefault();
      event?.stopPropagation();
      cancelMessageRun = true;
      stop.textContent = 'Stopping…';
      stop.setAttribute('aria-disabled', 'true');
      updateInteractionLock('Finishing the current message, then APES will stop.');
    };
    stop.addEventListener('click', requestStop);
    stop.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') requestStop(event);
    });
    lock.addEventListener('wheel', event => event.preventDefault(), {
      passive: false
    });
    lock.addEventListener('contextmenu', event => event.preventDefault());
    document.body.appendChild(lock);
    return lock;
  }
  function updateInteractionLock(message) {
    const status = document.querySelector(`#${LOCK_ID} .qol-ss-lock-status`);
    if (status) status.textContent = message;
  }
  function hideInteractionLock() {
    document.getElementById(LOCK_ID)?.remove();
  }
  async function scanCurrentSociety() {
    let root = getSocietyRoot();
    if (scanInProgress || !root || !getMembersTable(root)) return;
    scanInProgress = true;
    showInteractionLock('Scanning Secret Society…', 'Opening page 1.');
    scanButtonState('Preparing scan…', true);
    try {
      root = await openPage(1, root);
      if (!root) throw new Error('Page 1 did not finish rendering.');
      const societyName = getSocietyName(root);
      const societyId = getSocietyId(root);
      const scanId = societyId || normalizedText(societyName).replace(/[^a-z0-9]+/g, '-') || 'secret-society';
      const previous = loadScans().find(scan => scan.id === scanId);
      const previousMembers = new Map((previous?.members || []).map(member => [memberKey(member), member]));
      const previousRoles = new Map((previous?.members || []).map(member => [memberKey(member), {
        off: member.off,
        def: member.def,
        op: member.op
      }]));
      const members = new Map();
      let expectedPages = totalPages(root);
      let reachedLastPage = false;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        if (currentPage(root) !== page) {
          root = await openPage(page, root);
          if (!root) throw new Error(`Page ${page} did not finish rendering.`);
        }
        expectedPages = Math.max(expectedPages, totalPages(root), page);
        updateInteractionLock(`Reading page ${page} of ${expectedPages}…`);
        scanButtonState(`Scanning page ${page} of ${expectedPages}…`, true);
        const pageMembers = extractMembers(root);
        if (!pageMembers.length) throw new Error(`No members were found on page ${page}.`);
        pageMembers.forEach(member => members.set(memberKey(member), member));
        const nextAvailable = hasNextPage(root);
        if (page >= expectedPages && !nextAvailable) {
          reachedLastPage = true;
          break;
        }
        if (page >= expectedPages && nextAvailable) expectedPages = page + 1;
        const nextRoot = await openPage(page + 1, root);
        if (!nextRoot) throw new Error(`Page ${page + 1} did not finish rendering.`);
        root = nextRoot;
      }
      if (!reachedLastPage) throw new Error('The scan reached its page safety limit.');
      const scannedMembers = Array.from(members.values()).map(member => {
        const earlier = previousMembers.get(memberKey(member));
        const villages = numericValue(member.villages);
        const earlierVillages = numericValue(earlier?.villages);
        const population = numericValue(member.population);
        const earlierPopulation = numericValue(earlier?.population);
        return {
          ...member,
          ...(previousRoles.get(memberKey(member)) || {
            off: false,
            def: false,
            op: false
          }),
          villageChange: earlier && villages != null && earlierVillages != null ? villages - earlierVillages : null,
          populationChange: earlier && population != null && earlierPopulation != null ? population - earlierPopulation : null,
          isNew: Boolean(previous && !earlier)
        };
      }).sort((left, right) => {
        return (numericValue(left.rank) ?? Number.MAX_SAFE_INTEGER) - (numericValue(right.rank) ?? Number.MAX_SAFE_INTEGER);
      });
      const scannedAt = Date.now();
      const previousSummary = previous ? normalizeSnapshot(previous.summary, previous.members, previous.scannedAt) : null;
      const history = previousSummary ? [...(previous.history || []), previousSummary].filter((snapshot, index, snapshots) => {
        return snapshots.findIndex(item => item.scannedAt === snapshot.scannedAt) === index;
      }).slice(-SNAPSHOT_HISTORY_LIMIT) : [];
      const scan = {
        id: scanId,
        societyId,
        route: pageRoute(1),
        name: societyName,
        scannedAt,
        members: scannedMembers,
        summary: summarizeMembers(scannedMembers, scannedAt),
        history
      };
      const scans = loadScans();
      const index = scans.findIndex(item => item.id === scan.id);
      if (index >= 0) scans[index] = scan;else scans.push(scan);
      saveScans(scans);
      openPanel(scan.id);
      scanButtonState(`Scan complete · ${scan.members.length} members`, false);
      updateInteractionLock(`Scan complete · ${scan.members.length} members found.`);
      await delay(700);
    } catch (error) {
      console.error('[APES Secret Society] Scan failed:', error);
      scanButtonState('Scan incomplete · try again', false);
      updateInteractionLock(error?.message || 'The scan did not finish. Please try again.');
      await delay(1800);
    } finally {
      scanInProgress = false;
      hideInteractionLock();
      window.setTimeout(() => scanButtonState('Scan SS', false), 1200);
    }
  }
  function injectNativeScanButton() {
    const existing = document.getElementById(NATIVE_ACTION_ID);
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
    if (existing && root.contains(existing)) return;
    existing?.remove();
    const actions = document.createElement('div');
    actions.id = NATIVE_ACTION_ID;
    actions.innerHTML = `
            <span class="qol-ss-native-label">APES Secret Society tools</span>
            <div id="${NATIVE_SCAN_ID}" role="button" tabindex="0">Scan SS</div>
        `;
    const button = actions.querySelector(`#${NATIVE_SCAN_ID}`);
    const activate = event => {
      event.preventDefault();
      event.stopPropagation();
      void scanCurrentSociety();
    };
    button.addEventListener('click', activate);
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });
    const paginated = table.closest('.paginated, [pagination]');
    (paginated || table).before(actions);
  }
  function numericValue(value) {
    const source = String(value == null ? '' : value).trim();
    const digits = source.replace(/\D/g, '');
    if (!digits) return null;
    const parsed = Number(digits) * (/^-/.test(source) ? -1 : 1);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  function nullableNumber(value) {
    return value == null || value === '' ? null : numericValue(value);
  }
  const MEMBER_COLUMNS = [{
    key: 'rank',
    label: 'Rank'
  }, {
    key: 'name',
    label: 'Member'
  }, {
    key: 'villages',
    label: 'Villages',
    icon: 'house'
  }, {
    key: 'population',
    label: 'Population',
    icon: 'person'
  }, {
    key: 'resourcesSent',
    label: 'Resources Sent',
    icon: 'crop'
  }, {
    key: 'troopsLostInDefense',
    label: 'Troops Lost in Defense',
    icon: 'shield'
  }, {
    key: 'troopsCurrentlyProvided',
    label: 'Troops Currently Provided',
    icon: 'sword'
  }];
  const ICON_PATHS = Object.freeze({
    house: '<path d="M3 11.5 12 4l9 7.5"></path><path d="M5.5 10v10h13V10M9 20v-6h6v6"></path>',
    person: '<circle cx="12" cy="7.5" r="3.5"></circle><path d="M5.5 20c.4-4.3 2.6-6.5 6.5-6.5s6.1 2.2 6.5 6.5"></path>',
    shield: '<path d="M12 3 20 6v5.5c0 4.8-3.2 7.9-8 9.5-4.8-1.6-8-4.7-8-9.5V6l8-3Z"></path>',
    sword: '<path d="m5 19 4.5-4.5M7 21l-4-4 3-1 1-3 4 4-3 1-1 3Z"></path><path d="m10 14 8.5-8.5L21 3l-2.5 6L13 14.5"></path>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m4 7 8 6 8-6"></path>'
  });
  function iconHtml(kind, label, extraClass = '') {
    const classes = `qol-ss-metric-icon${extraClass ? ` ${extraClass}` : ''}`;
    if (kind === 'crop') {
      return `<span class="${classes}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><i class="unit_crop_small_illu resType4"></i></span>`;
    }
    const paths = ICON_PATHS[kind] || '';
    return `<span class="${classes}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg></span>`;
  }
  function formatMetric(value) {
    const numeric = numericValue(value);
    return numeric == null ? escapeHtml(value || '—') : numeric.toLocaleString();
  }
  function changeDescriptor(value) {
    const numeric = nullableNumber(value);
    if (numeric == null) return {
      tone: 'stationary',
      arrow: '—',
      amount: '—'
    };
    if (numeric > 0) return {
      tone: 'positive',
      arrow: '↗',
      amount: Math.abs(numeric).toLocaleString()
    };
    if (numeric < 0) return {
      tone: 'negative',
      arrow: '↘',
      amount: Math.abs(numeric).toLocaleString()
    };
    return {
      tone: 'stationary',
      arrow: '→',
      amount: '0'
    };
  }
  function changeMetricHtml(kind, label, value) {
    const change = changeDescriptor(value);
    return `<span class="qol-ss-change qol-${change.tone}">${iconHtml(kind, label, 'qol-ss-note-icon')}<span>${change.arrow} ${change.amount}</span></span>`;
  }
  function memberNotesHtml(member) {
    if (member.isNew) return '<span class="qol-ss-change qol-positive">New member</span>';
    if (member.villageChange == null && member.populationChange == null) {
      return '<span class="qol-ss-change qol-stationary">Baseline</span>';
    }
    return `${changeMetricHtml('house', 'Village change', member.villageChange)}<span class="qol-ss-note-divider">|</span>${changeMetricHtml('person', 'Population change', member.populationChange)}`;
  }
  function memberNotesText(member) {
    if (member.isNew) return 'New member';
    if (member.villageChange == null && member.populationChange == null) return 'Baseline';
    const villages = changeDescriptor(member.villageChange);
    const population = changeDescriptor(member.populationChange);
    return `Villages ${villages.arrow} ${villages.amount} | Population ${population.arrow} ${population.amount}`;
  }
  function previousSnapshot(scan) {
    return Array.isArray(scan?.history) && scan.history.length ? scan.history[scan.history.length - 1] : null;
  }
  function summaryChangeHtml(value, hasComparison = true) {
    if (!hasComparison) return '';
    const change = changeDescriptor(value);
    return `<span class="qol-ss-summary-change qol-${change.tone}">${change.arrow} ${change.amount}</span>`;
  }
  function sortedMembers(members) {
    const multiplier = memberSort.direction === 'asc' ? 1 : -1;
    return members.slice().sort((left, right) => {
      const a = numericValue(left[memberSort.key]);
      const b = numericValue(right[memberSort.key]);
      if (a != null && b != null) return (a - b) * multiplier;
      return String(left[memberSort.key] || '').localeCompare(String(right[memberSort.key] || ''), undefined, {
        numeric: true,
        sensitivity: 'base'
      }) * multiplier;
    });
  }
  function getDraft(scanId) {
    if (!composerDrafts.has(scanId)) {
      composerDrafts.set(scanId, {
        message: '',
        role: 'off'
      });
    }
    return composerDrafts.get(scanId);
  }
  function roleCount(scan, role) {
    return scan.members.filter(member => member[role]).length;
  }
  function showScannerDialog(title, message) {
    document.getElementById(DIALOG_ID)?.remove();
    const dialog = document.createElement('div');
    dialog.id = DIALOG_ID;
    dialog.innerHTML = `
            <div class="qol-ss-dialog-card" role="dialog" aria-modal="true">
                <div class="qol-ss-dialog-title"></div>
                <div class="qol-ss-dialog-message"></div>
                <div class="qol-ss-dialog-actions">
                    <div class="qol-ss-action" role="button" tabindex="0">OK</div>
                </div>
            </div>
        `;
    dialog.querySelector('.qol-ss-dialog-title').textContent = title;
    dialog.querySelector('.qol-ss-dialog-message').textContent = message;
    const close = () => dialog.remove();
    const ok = dialog.querySelector('.qol-ss-action');
    ok.addEventListener('click', close);
    ok.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') close();
    });
    document.body.appendChild(dialog);
    ok.focus();
  }
  function confirmAction(title, message, confirmLabel) {
    return new Promise(resolve => {
      document.getElementById(DIALOG_ID)?.remove();
      const dialog = document.createElement('div');
      dialog.id = DIALOG_ID;
      dialog.innerHTML = `
                <div class="qol-ss-dialog-card" role="alertdialog" aria-modal="true">
                    <div class="qol-ss-dialog-title"></div>
                    <div class="qol-ss-dialog-message"></div>
                    <div class="qol-ss-dialog-actions">
                        <div class="qol-ss-tab" data-cancel role="button" tabindex="0">Cancel</div>
                        <div class="qol-ss-action" data-confirm role="button" tabindex="0"></div>
                    </div>
                </div>
            `;
      dialog.querySelector('.qol-ss-dialog-title').textContent = title;
      dialog.querySelector('.qol-ss-dialog-message').textContent = message;
      dialog.querySelector('[data-confirm]').textContent = confirmLabel;
      const finish = value => {
        dialog.remove();
        resolve(value);
      };
      const cancel = dialog.querySelector('[data-cancel]');
      const confirm = dialog.querySelector('[data-confirm]');
      cancel.addEventListener('click', () => finish(false));
      confirm.addEventListener('click', () => finish(true));
      cancel.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') finish(false);
      });
      confirm.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') finish(true);
      });
      document.body.appendChild(dialog);
      cancel.focus();
    });
  }
  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(element, value);else element.value = value;
    element.dispatchEvent(new Event('input', {
      bubbles: true
    }));
    element.dispatchEvent(new Event('change', {
      bubbles: true
    }));
  }
  function cleanIgmRoute() {
    return String(location.hash || '#/').replace(/\/overlayigm:[^/]+/gi, '').replace(/\/$/, '');
  }
  async function openNewConversation() {
    document.getElementById(COMPOSER_ID)?.querySelector('.closeOverlay')?.click();
    let base = cleanIgmRoute();
    if (!/(?:^|\/)window:igm(?:\/|$)/i.test(base)) base += '/window:igm';
    if (location.hash !== base) {
      location.hash = base;
      await delay(120);
    }
    location.hash = `${base}/overlayigm:igmSystemNewConversation`;
    return waitUntil(() => {
      return document.querySelector(`#${COMPOSER_ID} .newIgmConversation`);
    }, COMPOSER_TIMEOUT, 120);
  }
  function visibleAutocompleteItems() {
    return Array.from(document.querySelectorAll('.ui-autocomplete li, .ui-autocomplete [role="option"], .ui-menu li.ui-menu-item')).filter(item => {
      const style = window.getComputedStyle(item);
      return style.display !== 'none' && style.visibility !== 'hidden' && item.getClientRects().length > 0;
    });
  }
  function exactAutocompleteItem(playerName) {
    const expected = normalizedText(playerName);
    const items = visibleAutocompleteItems();
    return items.find(item => {
      const playerElement = item.matches?.('[playername]') ? item : item.querySelector?.('[playername]');
      const explicitName = cleanText(playerElement?.getAttribute('playername'));
      return normalizedText(explicitName || item.textContent) === expected;
    }) || null;
  }
  function clickAutocompleteItem(item) {
    const target = item.querySelector('a, [role="option"]') || item;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
      const EventClass = type.startsWith('pointer') && typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
      target.dispatchEvent(new EventClass(type, {
        bubbles: true,
        cancelable: true,
        view: window
      }));
    });
  }
  function composerElements(composer) {
    return {
      recipient: composer.querySelector('.optionContainer [autocompletedata="player"] input.targetInput,' + '.optionContainer .serverautocompleteContainer input.targetInput'),
      message: composer.querySelector('.shareMessage textarea, textarea[ng-model="localTextModel"]'),
      send: composer.querySelector('.buttonContainer button.share, button[clickable="share();"]')
    };
  }
  function sendButtonReady(button) {
    return Boolean(button) && !button.classList.contains('disabled') && button.getAttribute('aria-disabled') !== 'true' && !button.disabled;
  }
  async function fillNativeRecipient(composer, playerName) {
    const elements = composerElements(composer);
    if (!elements.recipient) throw new Error('Travian recipient field was not found.');
    elements.recipient.focus();
    setNativeValue(elements.recipient, '');
    await delay(80);
    setNativeValue(elements.recipient, playerName);
    elements.recipient.dispatchEvent(new KeyboardEvent('keyup', {
      key: playerName.slice(-1) || 'a',
      bubbles: true,
      cancelable: true
    }));
    await delay(250);
    let suggestion = exactAutocompleteItem(playerName);
    if (!suggestion && !sendButtonReady(elements.send)) {
      suggestion = await waitUntil(() => exactAutocompleteItem(playerName), 6500, 100);
    }
    if (suggestion) {
      clickAutocompleteItem(suggestion);
      await delay(180);
    } else if (!sendButtonReady(elements.send)) {
      throw new Error(`Recipient “${playerName}” was not confirmed by Travian.`);
    }
    return elements;
  }
  async function prepareNativeMessage(composer, playerName, messageText) {
    const elements = composerElements(composer);
    if (!elements.recipient || !elements.message || !elements.send) {
      throw new Error('Travian message fields were not found.');
    }
    setNativeValue(elements.message, messageText);
    await fillNativeRecipient(composer, playerName);
    const ready = await waitUntil(() => sendButtonReady(elements.send), 5000, 100);
    if (!ready) throw new Error(`The message for “${playerName}” never became sendable.`);
    return elements.send;
  }
  async function openMemberMessage(playerName, control) {
    if (memberMailInProgress || messageInProgress) return;
    memberMailInProgress = true;
    control?.setAttribute('aria-busy', 'true');
    control?.setAttribute('aria-disabled', 'true');
    try {
      const composer = await openNewConversation();
      if (!composer) throw new Error('The new-message window did not open.');
      const elements = await fillNativeRecipient(composer, playerName);
      elements.message?.focus();
    } catch (error) {
      console.error(`[APES Secret Society] Could not address message to ${playerName}:`, error);
      showScannerDialog('Could not open message', error?.message || `APES could not address a new message to “${playerName}”.`);
    } finally {
      memberMailInProgress = false;
      control?.removeAttribute('aria-busy');
      control?.removeAttribute('aria-disabled');
    }
  }
  async function sendNativeMessage(playerName, messageText) {
    const composer = await openNewConversation();
    if (!composer) throw new Error('The new-message window did not open.');
    const send = await prepareNativeMessage(composer, playerName, messageText);
    send.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    }));
    const closed = await waitUntil(() => !document.getElementById(COMPOSER_ID), COMPOSER_TIMEOUT, 120);
    if (!closed) {
      const error = cleanText(document.querySelector(`#${COMPOSER_ID} .error`)?.textContent);
      throw new Error(error || `Travian did not confirm the message to “${playerName}”.`);
    }
  }
  async function sendRoleMessages(scan, role, messageText) {
    if (messageInProgress) return;
    const recipients = scan.members.filter(member => member[role] && member.name);
    if (!messageText.trim()) {
      showScannerDialog('Message required', 'Type the message you want to send first.');
      return;
    }
    if (!recipients.length) {
      showScannerDialog('No recipients', `No members are currently marked as ${role.toUpperCase()}.`);
      return;
    }
    const confirmed = await confirmAction('Send Secret Society messages?', `APES will send this message individually to ${recipients.length} ${role.toUpperCase()} ${recipients.length === 1 ? 'member' : 'members'}. The screen will remain locked until the sequence finishes.`, `Send ${recipients.length} ${recipients.length === 1 ? 'message' : 'messages'}`);
    if (!confirmed) return;
    messageInProgress = true;
    cancelMessageRun = false;
    const failures = [];
    let sent = 0;
    showInteractionLock('Sending Secret Society messages…', `Preparing message 1 of ${recipients.length}.`, {
      cancellable: true
    });
    try {
      for (let index = 0; index < recipients.length; index += 1) {
        if (cancelMessageRun) break;
        const member = recipients[index];
        updateInteractionLock(`Message ${index + 1} of ${recipients.length} · ${member.name}`);
        try {
          await sendNativeMessage(member.name, messageText);
          sent += 1;
        } catch (error) {
          console.error(`[APES Secret Society] Message to ${member.name} failed:`, error);
          failures.push({
            name: member.name,
            reason: error?.message || 'Unknown error'
          });
          document.getElementById(COMPOSER_ID)?.querySelector('.closeOverlay')?.click();
          await delay(250);
        }
        if (!cancelMessageRun && index < recipients.length - 1) await delay(MESSAGE_GAP);
      }
    } finally {
      messageInProgress = false;
      hideInteractionLock();
    }
    const stopped = cancelMessageRun;
    cancelMessageRun = false;
    const failureSummary = failures.length ? `\n\nNot sent: ${failures.slice(0, 6).map(item => item.name).join(', ')}${failures.length > 6 ? ` and ${failures.length - 6} more` : ''}.` : '';
    showScannerDialog(stopped ? 'Message sequence stopped' : 'Message sequence complete', `${sent} of ${recipients.length} messages sent.${failureSummary}`);
  }
  function updateMemberRole(scanId, key, role, checked) {
    if (!ROLE_KEYS.includes(role)) return;
    const scans = loadScans();
    const scan = scans.find(item => item.id === scanId);
    const member = scan?.members.find(item => memberKey(item) === key);
    if (!member) return;
    member[role] = Boolean(checked);
    saveScans(scans);
  }
  function exportScanCsv(scan) {
    if (!scan) return;
    const quote = value => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
    const columns = [...MEMBER_COLUMNS, {
      key: 'def',
      label: 'Def'
    }, {
      key: 'off',
      label: 'Off'
    }, {
      key: 'op',
      label: 'OP'
    }, {
      key: 'notes',
      label: 'Notes'
    }];
    const rows = [columns.map(column => quote(column.label)).join(','), ...sortedMembers(scan.members).map(member => {
      return columns.map(column => quote(column.key === 'notes' ? memberNotesText(member) : ROLE_KEYS.includes(column.key) ? member[column.key] ? 'Yes' : 'No' : member[column.key])).join(',');
    })];
    const blob = new Blob([rows.join('\r\n')], {
      type: 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = String(scan.name || 'secret-society').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '');
    link.href = url;
    link.download = `APES-Secret-Society-${safeName}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  function deleteStoredScans() {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      delete all[serverKey()];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (_) {
      localStorage.removeItem(STORAGE_KEY);
    }
    composerDrafts.clear();
    renderPanel();
  }
  async function confirmDeleteStoredScans() {
    const confirmed = await confirmAction('Delete Secret Society data?', 'This removes every Secret Society list and every Off/Def/OP assignment saved by APES on this game server. This cannot be undone.', 'Delete data');
    if (confirmed) deleteStoredScans();
  }
  function waitForSecretSociety(timeout = PAGE_TIMEOUT) {
    return waitUntil(() => {
      const root = getSocietyRoot();
      return root && getMembersTable(root) ? root : null;
    }, timeout, 120);
  }
  async function updateStoredSociety(scan) {
    if (!scan || scanInProgress) return;
    showInteractionLock('Opening Secret Society…', `Opening ${scan.name}.`);
    try {
      if (scan.route && location.hash !== scan.route) location.hash = scan.route;
      const root = await waitForSecretSociety();
      hideInteractionLock();
      if (!root) {
        showScannerDialog('Secret Society unavailable', 'APES could not open this Secret Society.');
        return;
      }
      await scanCurrentSociety();
    } finally {
      if (!scanInProgress) hideInteractionLock();
    }
  }
  function roleCheckboxHtml(member, role) {
    const checked = Boolean(member[role]);
    return `
            <div class="qol-ss-role-check"
                 data-member-key="${escapeHtml(memberKey(member))}"
                 data-member-role="${role}"
                 role="checkbox"
                 tabindex="0"
                 aria-label="Mark ${escapeHtml(member.name)} as ${role.toUpperCase()}"
                 aria-checked="${checked}"></div>
        `;
  }
  function renderPanel(selectedId) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const scans = loadScans();
    const selected = scans.find(scan => scan.id === selectedId) || scans[0];
    const body = panel.querySelector('.qol-ss-body');
    if (!selected) {
      body.innerHTML = `
                <div class="qol-ss-empty">
                    No Secret Society has been scanned yet.<br>
                    Open its Secret Society tab and select <strong>Scan SS</strong> above the member table.
                </div>
            `;
      return;
    }
    const tabs = scans.map(scan => `
            <div class="qol-ss-tab${scan.id === selected.id ? ' qol-active' : ''}"
                 data-ss-tab="${escapeHtml(scan.id)}" role="button" tabindex="0">
                ${escapeHtml(scan.name)}
            </div>
        `).join('');
    const draft = getDraft(selected.id);
    const summary = normalizeSnapshot(selected.summary, selected.members, selected.scannedAt);
    const earlierSummary = previousSnapshot(selected);
    const hasComparison = Boolean(earlierSummary);
    const memberDelta = hasComparison ? summary.memberCount - earlierSummary.memberCount : null;
    const villageDelta = hasComparison ? summary.villages - earlierSummary.villages : null;
    const populationDelta = hasComparison ? summary.population - earlierSummary.population : null;
    const comparisonText = hasComparison ? `Compared with ${new Date(earlierSummary.scannedAt).toLocaleString()}` : 'First snapshot';
    body.innerHTML = `
            <div class="qol-ss-tabs">${tabs}</div>
            <section class="qol-ss-composer">
                <label class="qol-ss-composer-copy">
                    <span class="qol-ss-composer-label">Message</span>
                    <textarea class="qol-ss-message" placeholder="Type the message APES should send individually to the selected group…">${escapeHtml(draft.message)}</textarea>
                </label>
                <div class="qol-ss-composer-actions">
                    <span class="qol-ss-composer-label">Recipients</span>
                    <select class="qol-ss-recipient-select" aria-label="Select recipient group">
                        <option value="off"${draft.role === 'off' ? ' selected' : ''}>All Off members</option>
                        <option value="def"${draft.role === 'def' ? ' selected' : ''}>All Def members</option>
                        <option value="op"${draft.role === 'op' ? ' selected' : ''}>All OP members</option>
                    </select>
                    <span class="qol-ss-recipient-count"></span>
                    <div class="qol-ss-action qol-ss-send" data-ss-send role="button" tabindex="0">Send messages</div>
                </div>
            </section>
            <div class="qol-ss-toolbar">
                <input class="qol-ss-search" type="search" placeholder="Search members…" aria-label="Search Secret Society members">
                <div class="qol-ss-action" data-ss-export role="button" tabindex="0">Export CSV</div>
                <div class="qol-ss-action" data-ss-refresh role="button" tabindex="0">Update</div>
                <div class="qol-ss-tab" data-ss-delete role="button" tabindex="0">Delete SS Data</div>
            </div>
            <div class="qol-ss-summary">
                <span class="qol-ss-summary-metric"><strong>${summary.memberCount.toLocaleString()}</strong> members ${summaryChangeHtml(memberDelta, hasComparison)}</span>
                <span class="qol-ss-summary-metric">${iconHtml('house', 'Total villages')}<strong>${summary.villages.toLocaleString()}</strong> villages ${summaryChangeHtml(villageDelta, hasComparison)}</span>
                <span class="qol-ss-summary-metric">${iconHtml('person', 'Total population')}<strong>${summary.population.toLocaleString()}</strong> population ${summaryChangeHtml(populationDelta, hasComparison)}</span>
                <span class="qol-ss-summary-meta">${escapeHtml(comparisonText)} · scanned ${escapeHtml(new Date(selected.scannedAt).toLocaleString())}</span>
            </div>
            <div class="qol-ss-table-wrap">
                <table class="qol-ss-table">
                    <colgroup>
                        <col style="width:46px"><col style="width:160px"><col style="width:50px"><col style="width:72px"><col style="width:94px"><col style="width:78px"><col style="width:86px"><col style="width:36px"><col style="width:36px"><col style="width:36px"><col style="width:42px"><col style="width:190px">
                    </colgroup>
                    <thead><tr>
                        ${MEMBER_COLUMNS.map(column => `
                            <th class="qol-ss-sort${column.icon ? ' qol-ss-icon-column' : ''}${memberSort.key === column.key ? ` qol-sort-${memberSort.direction}` : ''}"
                                data-ss-sort="${column.key}" role="button" tabindex="0" title="${escapeHtml(column.label)}">${column.icon ? iconHtml(column.icon, column.label) : column.label}</th>
                        `).join('')}
                        <th class="qol-ss-role-column">Def</th>
                        <th class="qol-ss-role-column">Off</th>
                        <th class="qol-ss-role-column">OP</th>
                        <th class="qol-ss-mail-column" title="Message member">${iconHtml('mail', 'Message member')}</th>
                        <th>Notes</th>
                    </tr></thead>
                    <tbody></tbody>
                </table>
            </div>
        `;
    const search = body.querySelector('.qol-ss-search');
    const message = body.querySelector('.qol-ss-message');
    const recipientSelect = body.querySelector('.qol-ss-recipient-select');
    const recipientCount = body.querySelector('.qol-ss-recipient-count');
    const sendButton = body.querySelector('[data-ss-send]');
    const refreshRecipientCount = () => {
      const role = recipientSelect.value;
      const count = roleCount(selected, role);
      recipientCount.textContent = `${count} ${role.toUpperCase()} ${count === 1 ? 'member' : 'members'} selected`;
      sendButton.setAttribute('aria-disabled', String(count === 0));
      sendButton.textContent = count === 0 ? 'No recipients' : `Send to ${count}`;
    };
    const renderRows = () => {
      const query = normalizedText(search.value);
      const members = sortedMembers(selected.members.filter(member => {
        return !query || normalizedText(Object.values(member).join(' ')).includes(query);
      }));
      body.querySelector('tbody').innerHTML = members.length ? members.map(member => `
                    <tr>
                        <td class="qol-ss-number-column">${formatMetric(member.rank)}</td>
                        <td class="qol-ss-name-column" title="${escapeHtml(member.name)}">${escapeHtml(member.name)}</td>
                        <td class="qol-ss-number-column">${formatMetric(member.villages)}</td>
                        <td class="qol-ss-number-column">${formatMetric(member.population)}</td>
                        <td class="qol-ss-number-column">${formatMetric(member.resourcesSent)}</td>
                        <td class="qol-ss-number-column">${formatMetric(member.troopsLostInDefense)}</td>
                        <td class="qol-ss-number-column">${formatMetric(member.troopsCurrentlyProvided)}</td>
                        <td class="qol-ss-role-column">${roleCheckboxHtml(member, 'def')}</td>
                        <td class="qol-ss-role-column">${roleCheckboxHtml(member, 'off')}</td>
                        <td class="qol-ss-role-column">${roleCheckboxHtml(member, 'op')}</td>
                        <td class="qol-ss-mail-column"><div class="qol-ss-mail" data-ss-mail="${escapeHtml(memberKey(member))}" role="button" tabindex="0" title="Message ${escapeHtml(member.name)}" aria-label="Message ${escapeHtml(member.name)}">${iconHtml('mail', `Message ${member.name}`)}</div></td>
                        <td class="qol-ss-notes-column">${memberNotesHtml(member)}</td>
                    </tr>
                `).join('') : '<tr><td colspan="12">No matching members.</td></tr>';
      body.querySelectorAll('[data-member-role]').forEach(control => {
        const toggle = event => {
          event.preventDefault();
          event.stopPropagation();
          const role = control.dataset.memberRole;
          const key = control.dataset.memberKey;
          const checked = control.getAttribute('aria-checked') !== 'true';
          control.setAttribute('aria-checked', String(checked));
          const member = selected.members.find(item => memberKey(item) === key);
          if (member) member[role] = checked;
          updateMemberRole(selected.id, key, role, checked);
          refreshRecipientCount();
        };
        control.addEventListener('click', toggle);
        control.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') toggle(event);
        });
      });
      body.querySelectorAll('[data-ss-mail]').forEach(control => {
        const open = event => {
          event.preventDefault();
          event.stopPropagation();
          const member = selected.members.find(item => {
            return memberKey(item) === control.dataset.ssMail;
          });
          if (member?.name) void openMemberMessage(member.name, control);
        };
        control.addEventListener('click', open);
        control.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') open(event);
        });
      });
    };
    renderRows();
    refreshRecipientCount();
    search.addEventListener('input', renderRows);
    message.addEventListener('input', () => {
      draft.message = message.value;
    });
    recipientSelect.addEventListener('change', () => {
      draft.role = recipientSelect.value;
      refreshRecipientCount();
    });
    sendButton.addEventListener('click', () => {
      void sendRoleMessages(selected, recipientSelect.value, message.value);
    });
    sendButton.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        void sendRoleMessages(selected, recipientSelect.value, message.value);
      }
    });
    body.querySelectorAll('[data-ss-tab]').forEach(tab => {
      tab.addEventListener('click', () => renderPanel(tab.dataset.ssTab));
    });
    body.querySelector('[data-ss-refresh]').addEventListener('click', () => {
      void updateStoredSociety(selected);
    });
    body.querySelector('[data-ss-export]').addEventListener('click', () => exportScanCsv(selected));
    body.querySelector('[data-ss-delete]').addEventListener('click', () => {
      void confirmDeleteStoredScans();
    });
    body.querySelectorAll('[data-ss-sort]').forEach(header => {
      const sort = () => {
        const key = header.dataset.ssSort;
        memberSort = {
          key,
          direction: memberSort.key === key && memberSort.direction === 'asc' ? 'desc' : 'asc'
        };
        renderPanel(selected.id);
      };
      header.addEventListener('click', sort);
      header.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') sort();
      });
    });
  }
  function makeDraggable(panel, handle) {
    if (handle.dataset.qolDragBound === 'true') return;
    handle.dataset.qolDragBound = 'true';
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('.qol-ss-close')) return;
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;
      handle.setPointerCapture?.(event.pointerId);
      const move = moveEvent => {
        const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
        const maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
        const left = Math.min(maxLeft, Math.max(8, startLeft + moveEvent.clientX - startX));
        const top = Math.min(maxTop, Math.max(8, startTop + moveEvent.clientY - startY));
        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
        panel.style.setProperty('right', 'auto', 'important');
      };
      const stop = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', stop, true);
        window.removeEventListener('pointercancel', stop, true);
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', stop, true);
      window.addEventListener('pointercancel', stop, true);
    });
  }
  function openPanel(selectedId) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    window.dispatchEvent(new CustomEvent('qol_close_others', {
      detail: {
        source: 'secretSocietyScanner'
      }
    }));
    panel.classList.add('qol-ss-open');
    renderPanel(selectedId);
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
      button.setAttribute('aria-label', 'Open Secret Society Scanner');
      button.innerHTML = `
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="8" cy="8" r="3"></circle>
                    <circle cx="16" cy="8" r="3"></circle>
                    <path d="M3 20v-2c0-3 2-5 5-5s5 2 5 5v2"></path>
                    <path d="M11 15c1-1.3 2.6-2 4.5-2 3 0 5.5 2 5.5 5v2"></path>
                </svg>
            `;
      const toggle = event => {
        event.preventDefault();
        event.stopPropagation();
        const panel = document.getElementById(PANEL_ID);
        if (panel.classList.contains('qol-ss-open')) panel.classList.remove('qol-ss-open');else openPanel();
      };
      button.addEventListener('click', toggle);
      button.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') toggle(event);
      });
      document.body.appendChild(button);
    }
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.innerHTML = `
                <div class="qol-ss-head">
                    <span>Secret Society Manager</span>
                    <div class="qol-ss-close" role="button" tabindex="0" aria-label="Close">×</div>
                </div>
                <div class="qol-ss-body"></div>
            `;
      const close = panel.querySelector('.qol-ss-close');
      close.addEventListener('click', () => panel.classList.remove('qol-ss-open'));
      close.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') panel.classList.remove('qol-ss-open');
      });
      document.body.appendChild(panel);
      makeDraggable(panel, panel.querySelector('.qol-ss-head'));
    }
    panel.style.removeProperty('display');
    renderPanel();
    window.qolRepositionAllButtons?.();
  }
  function start() {
    if (!enabled()) return;
    injectPanel();
    injectNativeScanButton();
    if (!observer) {
      observer = new MutationObserver(() => {
        if (nativeScanRefreshQueued || !enabled()) return;
        nativeScanRefreshQueued = true;
        window.setTimeout(() => {
          nativeScanRefreshQueued = false;
          if (enabled()) injectNativeScanButton();
        }, 80);
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || document.getElementById(LOCK_ID)) return;
    document.getElementById(DIALOG_ID)?.remove();
    document.getElementById(PANEL_ID)?.classList.remove('qol-ss-open');
  });
  window.addEventListener('qol_close_others', event => {
    const compatibleSources = new Set(['secretSocietyScanner', 'playerDossier', 'reportArchive']);
    if (!compatibleSources.has(event.detail?.source)) {
      document.getElementById(PANEL_ID)?.classList.remove('qol-ss-open');
    }
  });
  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key !== FEATURE_KEY) return;
    if (event.detail.enabled) start();else {
      cancelMessageRun = true;
      document.getElementById(NATIVE_ACTION_ID)?.remove();
      document.getElementById(PANEL_ID)?.classList.remove('qol-ss-open');
      document.getElementById(PANEL_ID)?.style.setProperty('display', 'none', 'important');
      hideInteractionLock();
    }
    window.qolRepositionAllButtons?.();
  });
  window.qolOpenSecretSocietyManager = () => openPanel();
  const begin = () => start();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', begin, {
      once: true
    });
  } else {
    begin();
  }
})();
