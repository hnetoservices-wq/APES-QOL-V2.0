/* APES QoL — Protection Of Outside Peasants (POOP).
 * Initial milestone: capture villages belonging to players in a SAVED
 * Secret Society Scanner membership list. No automatic map scraping.
 */
(() => {
  'use strict';

  const FEATURE = 'poopScanner';
  const SS_STORAGE = 'apes_secret_society_scans_v1';
  const STORAGE = 'apes_poop_villages_v1';
  const PANEL_ID = 'apes-poop-panel';
  const LAUNCH_ID = 'apes-poop-launcher';
  const ACTION_CLASS = 'apes-poop-add-row';
  let observer = null;
  let refreshQueued = false;
  let scanInProgress = false;
  let scanCancelled = false;
  let scanPromise = null;
  let lastScan = null;
  const SCAN_TIMEOUT = 9000;
  const LOCK_ID = 'apes-poop-scan-lock';

  const enabled = () => typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE) === true;
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fold = value => clean(value).toLocaleLowerCase();
  const esc = value => clean(value).replace(/[&<>"']/g, char =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const serverKey = () => location.hostname.replace(/[^a-z0-9]+/gi, '_').toLowerCase();

  function storedRoot(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) { return {}; }
  }

  function societyMember(playerId, playerName) {
    if (!playerId && !clean(playerName)) return null;
    const scans = storedRoot(SS_STORAGE)[serverKey()];
    if (!Array.isArray(scans)) return null;
    const id = clean(playerId), name = fold(playerName);
    for (const society of scans) {
      if (!Array.isArray(society?.members)) continue;
      for (const member of society.members) {
        const memberId = clean(member?.playerId), memberName = fold(member?.name);
        // Prefer the stable player ID; never accept a conflicting ID because
        // two unrelated accounts happened to reuse the same display name.
        if (id && memberId && id === memberId ||
          ((!id || !memberId) && name && name === memberName)) {
          return { societyId: clean(society.societyId || society.id), societyName: clean(society.name) };
        }
      }
    }
    return null;
  }

  function entries() {
    const list = storedRoot(STORAGE)[serverKey()];
    return Array.isArray(list) ? list.filter(item =>
      item && /^\d+$/.test(String(item.cellId)) &&
      item.owner && item.villageName && item.url
    ) : [];
  }

  function saveEntries(list) {
    try {
      const root = storedRoot(STORAGE);
      root[serverKey()] = list;
      localStorage.setItem(STORAGE, JSON.stringify(root));
      return true;
    } catch (error) {
      console.warn('[APES POOP] Could not save villages:', error);
      return false;
    }
  }

  function getVillageInfo(root) {
    if (!root) return null;
    const header = root.querySelector('.villageDetails.contentBoxHeader');
    const table = header?.nextElementSibling;
    if (!table || table.tagName?.toLowerCase() !== 'table') return null;
    const rows = Array.from(table.querySelectorAll('tr'));
    const ownerRow = rows.find(row => fold(row.querySelector('th')?.textContent) === 'owner');
    const populationRow = rows.find(row => fold(row.querySelector('th')?.textContent) === 'population');
    const player = ownerRow?.querySelector('a.playerLink[playerid]');
    const owner = clean(player?.getAttribute('playername') || player?.textContent);
    const playerId = clean(player?.getAttribute('playerid'));
    const coord = header.querySelector('.coordinateWrapper[x][y]');
    const x = coord ? Number(coord.getAttribute('x')) : NaN;
    const y = coord ? Number(coord.getAttribute('y')) : NaN;
    const title = clean(root.querySelector('.contentHeader h2 span')?.textContent ||
      root.querySelector('.contentHeader h2')?.textContent);
    // The URL contains cellId when opened from the map. Travian sometimes
    // supplies a centerId in the coordinates link instead of a cellId in the
    // route; that numeric prefix is the same map cell identifier.
    const hashId = location.hash.match(/(?:^|\/)cellId:(\d+)(?:\/|$)/i)?.[1];
    const centerAction = coord?.querySelector('[clickable*="centerId"]')?.getAttribute('clickable') || '';
    const centerId = centerAction.match(/centerId['"]?\s*,\s*['"](\d+)(?:_\d+)?['"]/i)?.[1];
    const cellId = centerId || hashId || '';
    if (!owner || !playerId || !title || !populationRow || !cellId ||
      !Number.isInteger(x) || !Number.isInteger(y)) return null;
    const match = societyMember(playerId, owner);
    if (!match) return null;
    return {
      owner, playerId, villageName: title, x, y, cellId,
      url: location.origin + '/#/page:map/cellId:' + cellId + '/window:mapCellDetails',
      societyId: match.societyId, societyName: match.societyName,
      populationRow, table
    };
  }

  function addVillage(info) {
    const safe = info && {
      owner: clean(info.owner), playerId: clean(info.playerId),
      villageName: clean(info.villageName), x: Number(info.x), y: Number(info.y),
      cellId: clean(info.cellId), url: clean(info.url),
      societyId: clean(info.societyId), societyName: clean(info.societyName)
    };
    if (!safe || !/^\d+$/.test(safe.cellId) || !safe.owner || !safe.villageName ||
      !Number.isInteger(safe.x) || !Number.isInteger(safe.y) ||
      !societyMember(safe.playerId, safe.owner)) return false;
    // Build the URL ourselves. Don't trust an arbitrary user-supplied link.
    safe.url = location.origin + '/#/page:map/cellId:' + safe.cellId + '/window:mapCellDetails';
    const list = entries();
    const previous = list.findIndex(item => item.cellId === safe.cellId);
    if (previous >= 0) {
      safe.addedAt = list[previous].addedAt;
      list[previous] = { ...list[previous], ...safe };
    } else {
      safe.addedAt = Date.now();
      list.push(safe);
    }
    if (!saveEntries(list)) return false;
    renderPanel();
    return true;
  }

  function villageWindows() {
    return Array.from(document.querySelectorAll('window.modalWrapper.mapCellDetails'));
  }

  function refreshMapActions() {
    const active = enabled();
    for (const root of villageWindows()) {
      const info = active ? getVillageInfo(root) : null;
      const existing = root.querySelector('.' + ACTION_CLASS);
      if (!info) {
        existing?.remove();
        continue;
      }
      const saved = entries().some(item => item.cellId === info.cellId);
      const row = existing || document.createElement('tr');
      if (!existing) {
        row.className = ACTION_CLASS;
        const cell = document.createElement('td');
        cell.colSpan = 2;
        const control = document.createElement('div');
        control.className = 'apes-poop-action';
        control.setAttribute('role', 'button');
        control.setAttribute('tabindex', '0');
        control.addEventListener('click', event => {
          event.stopPropagation();
          const current = getVillageInfo(root);
          if (current && addVillage(current)) refreshMapActions();
        });
        control.addEventListener('keydown', event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (!event.repeat) control.click();
        });
        cell.appendChild(control);
        row.appendChild(cell);
      }
      const label = saved ? 'Saved to POOP' : 'Add Player to POOP';
      const control = row.querySelector('.apes-poop-action');
      if (control.textContent !== label) control.textContent = label;
      row.querySelector('.apes-poop-action').classList.toggle('is-saved', saved);
      // Keep this directly below Population, regardless of other fields.
      if (row.previousElementSibling !== info.populationRow) {
        info.populationRow.insertAdjacentElement('afterend', row);
      }
    }
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    window.setTimeout(() => {
      refreshQueued = false;
      refreshMapActions();
    }, 90);
  }

  function removeVillage(cellId) {
    const previous = entries();
    const next = previous.filter(item => item.cellId !== String(cellId));
    if (next.length === previous.length) return false;
    if (!saveEntries(next)) return false;
    renderPanel();
    refreshMapActions();
    return true;
  }


  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const scanRoute = cellId => '#/page:map/cellId:' + cellId + '/window:mapCellDetails';

  function attackTimers(root, now = Date.now()) {
    // Only the village popup's actual incoming-attack group qualifies.
    // Unrelated own-village outgoing troop movements must never be counted.
    const rows = Array.from(root.querySelectorAll('.attackContainer.infoMovements li.incoming_attacks'));
    const arrivals = [];
    let total = 0;
    let unreadable = 0;
    for (const row of rows) {
      const clock = row.querySelector('.countdown[countdown]');
      const unix = Number(clock?.getAttribute('countdown'));
      const count = Number(row.querySelector('.count')?.textContent?.trim());
      if (!clock || !Number.isFinite(unix) || unix <= 0) {
        unreadable++;
        continue;
      }
      if (unix * 1000 <= now) continue;
      const quantity = Number.isInteger(count) && count > 0 ? count : 1;
      total += quantity;
      arrivals.push({ arrivalAt: unix * 1000, count: quantity });
    }
    arrivals.sort((a, b) => a.arrivalAt - b.arrivalAt);
    return { arrivals, total, unreadable };
  }

  function matchingPopup(entry) {
    const popup = villageWindows().find(root => {
      const header = root.querySelector('.villageDetails.contentBoxHeader');
      if (!header) return false;
      const coords = header.querySelector('.coordinateWrapper[x][y]');
      if (!coords || Number(coords.getAttribute('x')) !== Number(entry.x) ||
        Number(coords.getAttribute('y')) !== Number(entry.y)) return false;
      const action = coords.querySelector('[clickable*="centerId"]')?.getAttribute('clickable') || '';
      const identifier = action.match(/centerId['"]?\s*,\s*['"](\d+)(?:_\d+)?['"]/i)?.[1];
      // Never read another village's timer while Angular is changing popups.
      if (identifier && identifier !== String(entry.cellId)) return false;
      const owner = root.querySelector('.villageDetails.contentBoxHeader + table a.playerLink[playerid]');
      const id = owner?.getAttribute('playerid');
      if (entry.playerId && id && String(entry.playerId) !== String(id)) return false;
      return Boolean(root.querySelector('.mapContainer') &&
        root.querySelector('.villageDetails.contentBoxHeader + table'));
    });
    return popup || null;
  }

  function checkScanCancelled() {
    if (scanCancelled || !enabled()) throw new Error('POOP scan cancelled.');
  }

  async function waitForVillage(entry) {
    const start = Date.now();
    let stableRoot = null, stable = 0;
    while (Date.now() - start < SCAN_TIMEOUT) {
      checkScanCancelled();
      const root = matchingPopup(entry);
      if (root && root === stableRoot) stable++;
      else { stableRoot = root; stable = root ? 1 : 0; }
      if (stable >= 3) return root;
      await sleep(120);
    }
    throw new Error('Village details did not finish loading.');
  }

  async function navigateForScan(entry) {
    checkScanCancelled();
    const destination = scanRoute(entry.cellId);
    // Close any other map-cell popup first; Travian can retain the old popup
    // while the route changes from one cellId to another.
    if (location.hash !== destination) {
      if (/\/window:mapCellDetails(?:\/|$)/i.test(location.hash)) {
        location.hash = '#/page:map';
        await sleep(160);
      }
      checkScanCancelled();
      location.hash = destination;
    }
    return waitForVillage(entry);
  }

  function formatRemaining(arrivalAt, now = Date.now()) {
    const left = Math.max(0, Math.ceil((arrivalAt - now) / 1000));
    const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), sec = left % 60;
    return [h, m, sec].map(part => String(part).padStart(2, '0')).join(':');
  }

  function scanStatus(message) {
    const status = document.querySelector('#' + PANEL_ID + ' [data-poop-scan-status]');
    if (status) status.textContent = message;
    const progress = document.querySelector('#' + LOCK_ID + ' [data-poop-progress]');
    if (progress) progress.textContent = message;
  }

  function renderScanSummary() {
    const node = document.querySelector('#' + PANEL_ID + ' [data-poop-results]');
    if (!node) return;
    if (!lastScan) {
      node.innerHTML = '<div class="apes-poop-scan-empty">Run Scan Villages to check for incoming attacks.</div>';
      return;
    }
    const rows = lastScan.results;
    const attacked = rows.filter(row => row.status === 'attacked');
    const unavailable = rows.filter(row => row.status === 'unavailable');
    const checked = rows.length - unavailable.length;
    const heading = '<div class="apes-poop-scan-metrics"><strong>' + attacked.length +
      '</strong> villages under attack · ' + checked + '/' + lastScan.total +
      ' checked' + (unavailable.length ? ' · ' + unavailable.length + ' unavailable' : '') + '</div>';
    if (!attacked.length) {
      node.innerHTML = heading + '<div class="apes-poop-scan-empty">' +
        (unavailable.length ? 'No attacks detected in successfully checked villages. Some villages could not be checked.' :
          (lastScan.complete ? 'No active incoming attacks detected.' : 'No attacks detected so far.')) +
        '</div>' + (unavailable.length ?
        '<div class="apes-poop-scan-failures">Unable to check: ' +
          unavailable.map(row => esc(row.villageName)).join(', ') + '</div>' : '');
      return;
    }
    const lines = attacked.sort((a, b) => a.arrivalAt - b.arrivalAt).map(row =>
      '<tr><td>' + esc(row.owner) + '</td><td>' + esc(row.villageName) + '</td>' +
      '<td>(' + esc(row.x) + ' | ' + esc(row.y) + ')</td>' +
      '<td><strong>' + row.total + '</strong></td>' +
      '<td class="apes-poop-eta" data-poop-eta="' + row.arrivalAt + '">' + formatRemaining(row.arrivalAt) + '</td>' +
      '<td><a href="' + esc(row.url) + '">Open map</a></td></tr>').join('');
    node.innerHTML = heading +
      '<div class="apes-poop-scan-table"><table><thead><tr><th>Owner</th><th>Village</th>' +
      '<th>Coordinates</th><th>Attacks</th><th>Next arrival</th><th></th></tr></thead><tbody>' +
      lines + '</tbody></table></div>' +
      (unavailable.length ? '<div class="apes-poop-scan-failures">Unable to check: ' +
        unavailable.map(row => esc(row.villageName)).join(', ') + '</div>' : '');
  }

  function tickScanTimers() {
    const now = Date.now();
    for (const clock of document.querySelectorAll('#' + PANEL_ID + ' [data-poop-eta]')) {
      const arrivalAt = Number(clock.getAttribute('data-poop-eta'));
      if (Number.isFinite(arrivalAt)) clock.textContent = formatRemaining(arrivalAt, now);
    }
  }

  function lockScan() {
    const overlay = document.createElement('div');
    overlay.id = LOCK_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = '<div class="apes-poop-lock-card"><strong>Scanning POOP villages</strong>' +
      '<div data-poop-progress>Preparing saved villages…</div>' +
      '<div class="apes-poop-lock-stop" role="button" tabindex="0">Cancel scan</div></div>';
    overlay.querySelector('.apes-poop-lock-stop').addEventListener('click', () => { scanCancelled = true; });
    overlay.querySelector('.apes-poop-lock-stop').addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) scanCancelled = true;
      }
    });
    overlay.addEventListener('wheel', event => event.preventDefault(), { passive: false });
    document.body.appendChild(overlay);
    overlay.querySelector('.apes-poop-lock-stop').focus();
  }

  function scan() {
    if (scanPromise) return scanPromise;
    scanPromise = performScan().finally(() => { scanPromise = null; });
    return scanPromise;
  }

  async function performScan() {
    if (!enabled()) return false;
    const villages = entries().slice();
    if (!villages.length) {
      scanStatus('Add villages to POOP before scanning.');
      return false;
    }
    const originalHash = location.hash;
    const originalFocus = document.activeElement;
    scanCancelled = false;
    scanInProgress = true;
    lastScan = { startedAt: Date.now(), total: villages.length, results: [], complete: false };
    lockScan();
    renderScanSummary();
    let completed = false;
    try {
      for (let index = 0; index < villages.length; index++) {
        checkScanCancelled();
        const entry = villages[index];
        scanStatus('Scanning ' + (index + 1) + '/' + villages.length + ': ' + entry.villageName);
        try {
          const popup = await navigateForScan(entry);
          const details = attackTimers(popup);
          if (details.unreadable) throw new Error('Incoming attack timer was unreadable.');
          lastScan.results.push({
            ...entry, status: details.arrivals.length ? 'attacked' : 'clear',
            total: details.total, arrivalAt: details.arrivals[0]?.arrivalAt || 0,
            arrivals: details.arrivals
          });
        } catch (error) {
          if (scanCancelled || !enabled()) throw error;
          lastScan.results.push({ ...entry, status: 'unavailable', error: clean(error?.message) });
        }
        renderScanSummary();
      }
      completed = true;
      lastScan.complete = true;
      const attacked = lastScan.results.filter(row => row.status === 'attacked').length;
      const failures = lastScan.results.filter(row => row.status === 'unavailable').length;
      scanStatus('Scan finished: ' + attacked + ' village(s) under attack, ' +
        failures + ' unchecked.');
      return failures === 0;
    } catch (error) {
      scanStatus(scanCancelled ? 'Scan cancelled · partial results shown.' :
        (error?.message || 'Scan interrupted.'));
      return false;
    } finally {
      scanInProgress = false;
      document.getElementById(LOCK_ID)?.remove();
      if (location.hash !== originalHash && /(?:^|\/)window:mapCellDetails(?:\/|$)/i.test(location.hash)) {
        location.hash = originalHash;
      } else if (location.hash === '#/page:map') {
        location.hash = originalHash;
      }
      // Never overwrite saved village records with transient attack results.
      if (completed) lastScan.scannedAt = Date.now();
      renderScanSummary();
      if (originalFocus?.isConnected) originalFocus.focus?.();
    }
  }

  function renderPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const tbody = panel.querySelector('tbody');
    if (!tbody) return;
    const list = entries();
    panel.querySelector('[data-poop-count]').textContent =
      list.length + (list.length === 1 ? ' village saved' : ' villages saved');
    renderScanSummary();
    tbody.innerHTML = list.length ? list.map(item => '<tr>' +
      '<td>' + esc(item.owner) + '</td>' +
      '<td>' + esc(item.villageName) + '</td>' +
      '<td>(' + esc(item.x) + ' | ' + esc(item.y) + ')</td>' +
      '<td><a target="_self" href="' + esc(item.url) + '">Open map</a></td>' +
      '<td><div class="apes-poop-remove" role="button" tabindex="0" data-poop-remove="' +
      esc(item.cellId) + '">Remove</div></td></tr>').join('') :
      '<tr><td colspan="5" class="apes-poop-empty">No villages saved. Select a village belonging to a scanned Secret Society member and use Add Player to POOP.</td></tr>';
  }

  function makePanelDraggable(panel) {
    const header = panel.querySelector('.apes-poop-head');
    let drag = null;

    function clampPosition() {
      if (!panel.classList.contains('is-open') || !panel.style.left) return;
      const box = panel.getBoundingClientRect();
      const left = Math.max(0, Math.min(box.left, window.innerWidth - box.width));
      const top = Math.max(0, Math.min(box.top, window.innerHeight - box.height));
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
    }

    // Convert the initial right-anchored position into left/top positioning.
    // This makes native CSS resize:both grow from the bottom-right corner.
    function positionForMovement() {
      if (panel.style.left) return;
      const box = panel.getBoundingClientRect();
      panel.style.left = box.left + 'px';
      panel.style.top = box.top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      clampPosition();
    }

    header.addEventListener('pointerdown', event => {
      if (event.button !== 0 || scanInProgress ||
          event.target.closest('.apes-poop-close, [role="button"], a, button, input')) return;
      positionForMovement();
      const box = panel.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        x: event.clientX, y: event.clientY,
        left: box.left, top: box.top
      };
      event.preventDefault();
    });
    window.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const left = Math.max(0, Math.min(
        drag.left + event.clientX - drag.x, window.innerWidth - panel.offsetWidth));
      const top = Math.max(0, Math.min(
        drag.top + event.clientY - drag.y, window.innerHeight - panel.offsetHeight));
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
      event.preventDefault();
    });
    for (const type of ['pointerup', 'pointercancel', 'blur'])
      window.addEventListener(type, () => { drag = null; });

    window.addEventListener('resize', clampPosition);
    if (typeof ResizeObserver === 'function')
      new ResizeObserver(clampPosition).observe(panel);
    return { positionForMovement, clampPosition };
  }

  function close() {
    if (scanInProgress) return;
    document.getElementById(PANEL_ID)?.classList.remove('is-open');
  }

  function open() {
    if (!enabled()) return;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    renderPanel();
    window.APES?.ui?.closeOtherTools?.(FEATURE);
    panel.classList.add('is-open');
    panel.__apesPoopDrag?.positionForMovement();
    panel.__apesPoopDrag?.clampPosition();
  }

  function start() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', start, { once: true });
      return;
    }
    if (!document.getElementById(PANEL_ID)) {
      const panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.innerHTML = '<div class="apes-poop-head"><strong>Protection Of Outside Peasants</strong>' +
        '<span class="apes-poop-close" role="button" tabindex="0" aria-label="Close POOP">×</span></div>' +
        '<div class="apes-poop-body"><p>Villages belonging to members of your scanned Secret Societies.</p>' +
        '<div class="apes-poop-count" data-poop-count></div>' +
        '<div class="apes-poop-scanbar"><div class="apes-poop-scan-button" data-poop-scan role="button" tabindex="0">Scan Villages</div>' +
        '<span data-poop-scan-status aria-live="polite">Not scanned</span></div>' +
        '<section class="apes-poop-results" data-poop-results></section>' +
        '<div class="apes-poop-scroll"><table><thead><tr><th>Owner</th><th>Village</th>' +
        '<th>Coordinates</th><th>Location</th><th></th></tr></thead><tbody></tbody></table></div></div>';
      panel.querySelector('.apes-poop-close').addEventListener('click', close);
      panel.addEventListener('click', event => {
        if (event.target.closest('[data-poop-scan]')) { void scan(); return; }
        const id = event.target.closest('[data-poop-remove]')?.getAttribute('data-poop-remove');
        if (id) removeVillage(id);
      });
      panel.addEventListener('keydown', event => {
        const clickable = event.target.closest('[role="button"]');
        if (!clickable || !['Enter',' '].includes(event.key)) return;
        event.preventDefault();
        if (!event.repeat) clickable.click();
      });
      document.body.appendChild(panel);
      panel.__apesPoopDrag = makePanelDraggable(panel);
    }
    if (!document.getElementById(LAUNCH_ID)) {
      const launch = document.createElement('div');
      launch.id = LAUNCH_ID;
      launch.className = 'apes-poop-launch-action';
      launch.setAttribute('role','button');
      launch.setAttribute('tabindex','0');
      launch.title = 'Protection Of Outside Peasants';
      launch.setAttribute('aria-label', 'Open Protection Of Outside Peasants');
      launch.textContent = 'P';
      launch.addEventListener('click', open);
      launch.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (!event.repeat) open();
      });
      document.body.appendChild(launch);
      window.qolRepositionAllButtons?.();
    }
    document.getElementById(LAUNCH_ID).style.display = enabled() ? '' : 'none';
    if (!observer) {
      observer = new MutationObserver(queueRefresh);
      observer.observe(document.body, { childList:true, subtree:true, attributes:true,
        attributeFilter:['playerid','playername','x','y'] });
    }
    queueRefresh();
    if (!window.__apesPoopScanTicker) window.__apesPoopScanTicker = window.setInterval(tickScanTimers, 1000);
  }

  window.APES_POOP_SCANNER = Object.freeze({
    open, close, getEntries: entries, addVillage, removeVillage,
    hasMember: societyMember, getVillageInfo, refresh: refreshMapActions,
    scan, cancelScan: () => { scanCancelled = true; }, attackTimers,
    getScan: () => lastScan && JSON.parse(JSON.stringify(lastScan))
  });
  window.APES?.actions?.register?.({
    id: 'kingdom.poop', label: 'Protection Of Outside Peasants',
    description: 'View saved villages from Secret Society members outside your kingdom borders.',
    group: 'Kingdom Management', keywords: ['poop','secret society','outside','villages'],
    enabled, run: open
  });
  window.addEventListener('storage', event => {
    if (event.key === SS_STORAGE || event.key === STORAGE) {
      queueRefresh();
      renderPanel();
    }
  });
  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key !== FEATURE && event.detail?.key !== 'secretSocietyScanner') return;
    if (!enabled()) close();
    start();
  });
  window.addEventListener('qol_close_others', event => {
    if (event.detail?.source !== FEATURE) close();
  });
  start();
})();
