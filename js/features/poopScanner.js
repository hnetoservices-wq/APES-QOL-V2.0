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
    const cellId = hashId || centerId || '';
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

  function renderPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const tbody = panel.querySelector('tbody');
    if (!tbody) return;
    const list = entries();
    panel.querySelector('[data-poop-count]').textContent =
      list.length + (list.length === 1 ? ' village saved' : ' villages saved');
    tbody.innerHTML = list.length ? list.map(item => '<tr>' +
      '<td>' + esc(item.owner) + '</td>' +
      '<td>' + esc(item.villageName) + '</td>' +
      '<td>(' + esc(item.x) + ' | ' + esc(item.y) + ')</td>' +
      '<td><a target="_self" href="' + esc(item.url) + '">Open map</a></td>' +
      '<td><div class="apes-poop-remove" role="button" tabindex="0" data-poop-remove="' +
      esc(item.cellId) + '">Remove</div></td></tr>').join('') :
      '<tr><td colspan="5" class="apes-poop-empty">No villages saved. Select a village belonging to a scanned Secret Society member and use Add Player to POOP.</td></tr>';
  }

  function close() {
    document.getElementById(PANEL_ID)?.classList.remove('is-open');
  }

  function open() {
    if (!enabled()) return;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    renderPanel();
    window.APES?.ui?.closeOtherTools?.(FEATURE);
    panel.classList.add('is-open');
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
        '<div class="apes-poop-scroll"><table><thead><tr><th>Owner</th><th>Village</th>' +
        '<th>Coordinates</th><th>Location</th><th></th></tr></thead><tbody></tbody></table></div></div>';
      panel.querySelector('.apes-poop-close').addEventListener('click', close);
      panel.addEventListener('click', event => {
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
  }

  window.APES_POOP_SCANNER = Object.freeze({
    open, close, getEntries: entries, addVillage, removeVillage,
    hasMember: societyMember, getVillageInfo, refresh: refreshMapActions
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
