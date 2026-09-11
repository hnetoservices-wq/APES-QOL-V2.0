(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';
  const UI_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_UI';
  const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
  const REQUEST_TYPE = 'REQUEST_SNAPSHOT';
  const RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';
  const TROOP_CACHE_MS = 30000;
  const HISTORY_PREFIX = 'apes_qol_village_army_history_v1';
  const HISTORY_LIMIT = 365;

  const expanded = new Set();
  const troopRows = new Map();
  let troopRowsUpdatedAt = 0;
  let troopScanPromise = null;
  let snapshot = { generatedAt: 0, activeVillageId: '', villages: [] };
  let wasOpen = false;
  let scanState = 'idle';

  const UNIT_DATA = Object.freeze({
    1: [
      ['Legionnaire',40,35,50,1], ['Praetorian',30,65,35,1], ['Imperian',70,40,25,1],
      ['Equites Legati',0,20,10,2], ['Equites Imperatoris',120,65,50,3], ['Equites Caesaris',180,80,105,4],
      ['Battering Ram',60,30,75,3], ['Fire Catapult',75,60,10,6], ['Senator',50,40,30,5], ['Settler',0,80,80,1]
    ],
    2: [
      ['Clubswinger',40,20,5,1], ['Spearman',10,35,60,1], ['Axeman',60,30,30,1],
      ['Scout',0,10,5,1], ['Paladin',55,105,40,2], ['Teutonic Knight',150,50,75,3],
      ['Ram',65,30,80,3], ['Catapult',50,60,10,6], ['Chief',40,60,40,4], ['Settler',10,80,80,1]
    ],
    3: [
      ['Phalanx',15,40,50,1], ['Swordsman',65,35,20,1], ['Pathfinder',0,20,10,2],
      ['Theutates Thunder',90,25,40,2], ['Druidrider',45,115,55,2], ['Haeduan',140,60,165,3],
      ['Ram',50,30,105,3], ['Trebuchet',70,45,10,6], ['Chieftain',40,50,50,4], ['Settler',0,80,80,1]
    ]
  });

  const UNIT_COLORS = Object.freeze([
    '#5b9bd5', '#ed7d31', '#70ad47', '#ffc000', '#a5a5a5',
    '#4472c4', '#c55a11', '#255e91', '#8064a2', '#00b0f0'
  ]);

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function norm(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  }

  function formatInt(value) {
    return Math.round(Number(value) || 0).toLocaleString();
  }

  function formatCompact(value) {
    const number = Math.round(Number(value) || 0);
    const abs = Math.abs(number);
    if (abs >= 1000000) return `${(number / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}m`;
    if (abs >= 1000) return `${(number / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return String(number);
  }

  function requestSnapshot() {
    window.postMessage({ source: UI_SOURCE, type: REQUEST_TYPE }, location.origin);
  }

  function villageById(villageId) {
    return (snapshot.villages || []).find(village => String(village?.villageId) === String(villageId)) || null;
  }

  function rowVillageId(row) {
    return String(row?.querySelector('[data-village-id]')?.dataset.villageId || '');
  }

  function waitFor(selector, timeout = 5000) {
    const started = performance.now();
    return new Promise(resolve => {
      const tick = () => {
        const node = document.querySelector(selector);
        if (node) return resolve(node);
        if (performance.now() - started >= timeout) return resolve(null);
        window.setTimeout(tick, 70);
      };
      tick();
    });
  }

  function overviewRoute() {
    const villageId = String(snapshot.activeVillageId || snapshot.villages?.[0]?.villageId || '');
    return `#/page:village${villageId ? `/villId:${villageId}` : ''}/window:villagesOverview/tab:Troops`;
  }

  function villageIdFromOverviewRow(row, link) {
    const raw = [
      row?.dataset?.villageId,
      link?.getAttribute?.('href'),
      link?.getAttribute?.('clickable'),
      row?.getAttribute?.('clickable')
    ].filter(Boolean).join(' ');
    return raw.match(/(?:villId|villageId|setActiveVillage)[^\d]{0,24}(\d+)/i)?.[1] || '';
  }

  function parseOwnTroopsTable(table) {
    const headerIds = Array.from(table.querySelectorAll('thead.troopsIconRow th i[unit-icon][data]'))
      .map(icon => String(icon.getAttribute('data') || '').trim());
    const parsed = [];

    Array.from(table.querySelectorAll('tbody tr')).forEach(row => {
      const cells = Array.from(row.querySelectorAll(':scope > td'));
      const link = cells[0]?.querySelector('a');
      const name = link?.textContent?.replace(/\s+/g, ' ').trim();
      if (!name || cells.length < 2) return;
      const units = {};
      for (let index = 1; index < cells.length; index += 1) {
        const key = headerIds[index - 1] || String(index);
        units[key] = Math.max(0, Number.parseInt(cells[index].textContent.replace(/[^\d-]/g, ''), 10) || 0);
      }
      parsed.push({
        villageId: villageIdFromOverviewRow(row, link),
        name,
        units
      });
    });
    return parsed;
  }

  function absoluteUnitId(tribeId, localIndex) {
    const tribe = Number(tribeId);
    if (tribe >= 1 && tribe <= 3) return (tribe - 1) * 10 + localIndex;
    return localIndex;
  }

  function troopOverviewForVillage(village) {
    const byId = troopRows.get(`id:${String(village?.villageId || '')}`);
    if (byId) return byId;
    return troopRows.get(`name:${norm(village?.name)}`) || null;
  }

  function troopCounts(village) {
    const overview = troopOverviewForVillage(village);
    if (overview) {
      const counts = [];
      for (let localIndex = 1; localIndex <= 10; localIndex += 1) {
        const absolute = String(absoluteUnitId(village?.tribeId, localIndex));
        const fallback = String(localIndex);
        counts.push(Number(overview.units[absolute] ?? overview.units[fallback] ?? 0) || 0);
      }
      return { counts, source: 'Troop Overview' };
    }

    const counts = Array(10).fill(0);
    const ownPlayerId = Number(village?.playerId);
    for (const troop of village?.stationaryTroops || []) {
      if (Number.isFinite(ownPlayerId) && Number(troop?.playerId) !== ownPlayerId) continue;
      const units = troop?.units;
      if (!units) continue;
      if (Array.isArray(units)) {
        for (let index = 0; index < Math.min(10, units.length); index += 1) counts[index] += Number(units[index]) || 0;
      } else if (typeof units === 'object') {
        Object.entries(units).forEach(([key, value]) => {
          const raw = Number(key);
          let local = raw;
          const tribe = Number(village?.tribeId);
          if (tribe >= 1 && tribe <= 3 && raw > (tribe - 1) * 10 && raw <= tribe * 10) local = raw - (tribe - 1) * 10;
          if (local >= 1 && local <= 10) counts[local - 1] += Number(value) || 0;
        });
      }
    }
    return { counts, source: 'Village cache' };
  }

  function powerSummary(village, counts) {
    const data = UNIT_DATA[Number(village?.tribeId)] || [];
    let attack = 0;
    let defInf = 0;
    let defCav = 0;
    counts.forEach((count, index) => {
      const unit = data[index];
      if (!unit || !count) return;
      attack += count * unit[1];
      defInf += count * unit[2];
      defCav += count * unit[3];
    });
    const defenseAverage = (defInf + defCav) / 2;
    return {
      attack,
      defInf,
      defCav,
      type: attack > defenseAverage ? 'Offense' : 'Defense'
    };
  }

  function historyStorageKey() {
    const playerId = String(snapshot?.playerId ?? 'unknown');
    return `${HISTORY_PREFIX}:${location.host}:${playerId}`;
  }

  function readHistoryStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(historyStorageKey()) || '{}');
      if (!parsed || typeof parsed !== 'object') return { villages: {} };
      if (!parsed.villages || typeof parsed.villages !== 'object') parsed.villages = {};
      return parsed;
    } catch (_error) {
      return { villages: {} };
    }
  }

  function writeHistoryStore(store) {
    try {
      localStorage.setItem(historyStorageKey(), JSON.stringify(store));
      return true;
    } catch (error) {
      console.warn('[APES Village Dashboard] Could not save army history.', error);
      return false;
    }
  }

  function localDayKey(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function historyForVillage(villageId) {
    const store = readHistoryStore();
    const rows = store.villages?.[String(villageId)];
    return Array.isArray(rows) ? rows.slice().sort((a, b) => Number(a.timestamp) - Number(b.timestamp)) : [];
  }

  function recordTroopHistory() {
    const villages = Array.isArray(snapshot?.villages) ? snapshot.villages : [];
    if (!villages.length) return 0;
    const now = Date.now();
    const day = localDayKey(now);
    const store = readHistoryStore();
    let saved = 0;

    villages.forEach(village => {
      const current = troopCounts(village);
      if (current.source !== 'Troop Overview') return;
      const villageId = String(village?.villageId || '');
      if (!villageId) return;
      const rows = Array.isArray(store.villages[villageId]) ? store.villages[villageId] : [];
      const entry = {
        timestamp: now,
        day,
        villageName: String(village?.name || ''),
        tribeId: Number(village?.tribeId) || 0,
        counts: current.counts.slice(0, 10).map(value => Math.max(0, Number(value) || 0))
      };
      const sameDay = rows.findIndex(item => item?.day === day);
      if (sameDay >= 0) rows[sameDay] = entry;
      else rows.push(entry);
      rows.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
      store.villages[villageId] = rows.slice(-HISTORY_LIMIT);
      saved += 1;
    });

    if (saved) writeHistoryStore(store);
    return saved;
  }

  async function refreshOverviewTroops(force = false) {
    if (!force && troopRows.size && Date.now() - troopRowsUpdatedAt < TROOP_CACHE_MS) return true;
    if (troopScanPromise) return troopScanPromise;

    scanState = 'scanning';
    renderExpandedRows();

    troopScanPromise = (async () => {
      const previousHash = location.hash;
      try {
        location.hash = overviewRoute();
        const table = await waitFor('.tabTroops .tabContentOwnTroops .ownTroops table.villagesTable, .ownTroops table.villagesTable', 5500);
        if (!table) throw new Error('Troop Overview table not found');
        const parsed = parseOwnTroopsTable(table);
        if (!parsed.length) throw new Error('No village troop rows found');

        troopRows.clear();
        parsed.forEach(row => {
          if (row.villageId) troopRows.set(`id:${row.villageId}`, row);
          troopRows.set(`name:${norm(row.name)}`, row);
        });
        troopRowsUpdatedAt = Date.now();
        const saved = recordTroopHistory();
        scanState = saved ? 'saved' : 'ready';
        window.dispatchEvent(new CustomEvent('apes_vd_army_history_updated', { detail: { villages: saved } }));
        return true;
      } catch (error) {
        console.warn('[APES Village Dashboard] Troop overview scan failed.', error);
        scanState = 'error';
        return false;
      } finally {
        if (location.hash !== previousHash) location.hash = previousHash;
        window.setTimeout(requestSnapshot, 120);
        troopScanPromise = null;
      }
    })();

    const result = await troopScanPromise;
    renderExpandedRows();
    return result;
  }

  function unitRowsHtml(village, counts) {
    const data = UNIT_DATA[Number(village?.tribeId)] || [];
    const rows = counts.map((count, index) => {
      if (!count) return '';
      const name = data[index]?.[0] || `Unit ${index + 1}`;
      return `<tr><td>${esc(name)}</td><td>${esc(formatInt(count))}</td></tr>`;
    }).filter(Boolean).join('');
    return rows || '<tr><td colspan="2" class="apes-vd-intel-empty">No own troops found.</td></tr>';
  }

  function niceMaximum(value) {
    const raw = Math.max(1, Number(value) || 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
    const normal = raw / magnitude;
    const step = normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10;
    return step * magnitude;
  }

  function chartDate(timestamp) {
    const date = new Date(Number(timestamp));
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function fullScanDate(timestamp) {
    const date = new Date(Number(timestamp));
    if (!Number.isFinite(date.getTime())) return '—';
    return date.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function lineChartSvg(scans, series) {
    const width = 620;
    const height = 224;
    const left = 52;
    const right = 16;
    const top = 14;
    const bottom = 34;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const rawMax = Math.max(1, ...series.flatMap(item => item.values.map(value => Number(value) || 0)));
    const max = niceMaximum(rawMax);
    const xAt = index => scans.length <= 1 ? left + plotWidth / 2 : left + (plotWidth * index / (scans.length - 1));
    const yAt = value => top + plotHeight - (Math.max(0, Number(value) || 0) / max) * plotHeight;

    const grid = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
      const y = top + plotHeight - ratio * plotHeight;
      return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}" class="apes-vd-dev-gridline"/><text x="${left - 8}" y="${(y + 3).toFixed(1)}" class="apes-vd-dev-axis" text-anchor="end">${esc(formatCompact(max * ratio))}</text>`;
    }).join('');

    const paths = series.map(item => {
      const points = item.values.map((value, index) => `${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`).join(' ');
      const dots = item.values.map((value, index) => `<circle cx="${xAt(index).toFixed(1)}" cy="${yAt(value).toFixed(1)}" r="2.6" fill="${item.color}"><title>${esc(item.name)} · ${esc(formatInt(value))} · ${esc(fullScanDate(scans[index]?.timestamp))}</title></circle>`).join('');
      return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
    }).join('');

    const labelIndexes = scans.length <= 1 ? [0] : scans.length === 2 ? [0, 1] : [0, Math.floor((scans.length - 1) / 2), scans.length - 1];
    const labels = [...new Set(labelIndexes)].map(index => `<text x="${xAt(index).toFixed(1)}" y="${height - 10}" class="apes-vd-dev-axis" text-anchor="middle">${esc(chartDate(scans[index]?.timestamp))}</text>`).join('');

    return `<svg class="apes-vd-dev-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Development chart">${grid}${paths}${labels}</svg>`;
  }

  function seriesLegend(series) {
    return `<div class="apes-vd-dev-legend">${series.map(item => `<span><i style="background:${item.color}"></i><b>${esc(item.name)}</b><em>${esc(formatCompact(item.values[item.values.length - 1] || 0))}</em></span>`).join('')}</div>`;
  }

  function armySeries(village, scans) {
    const data = UNIT_DATA[Number(village?.tribeId)] || [];
    return Array.from({ length: 10 }, (_, index) => ({
      name: data[index]?.[0] || `Unit ${index + 1}`,
      color: UNIT_COLORS[index],
      values: scans.map(scan => Math.max(0, Number(scan?.counts?.[index]) || 0))
    })).filter(item => item.values.some(value => value > 0));
  }

  function powerSeries(village, scans, villageType) {
    const powers = scans.map(scan => powerSummary(village, Array.isArray(scan?.counts) ? scan.counts : []));
    if (villageType === 'Offense') {
      return [{ name: 'Offensive Power', color: '#d65c3a', values: powers.map(power => power.attack) }];
    }
    return [
      { name: 'Anti Infantry', color: '#5b9bd5', values: powers.map(power => power.defInf) },
      { name: 'Anti Cavalry', color: '#ed7d31', values: powers.map(power => power.defCav) }
    ];
  }

  function developmentCard(title, subtitle, scans, series) {
    if (!scans.length) {
      return `<section class="apes-vd-dev-card"><div class="apes-vd-dev-title"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></div><div class="apes-vd-dev-empty">No army history yet. Run a troop scan to create the first daily snapshot.</div></section>`;
    }
    if (!series.length) {
      return `<section class="apes-vd-dev-card"><div class="apes-vd-dev-title"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></div><div class="apes-vd-dev-empty">No units to graph yet.</div></section>`;
    }
    return `<section class="apes-vd-dev-card"><div class="apes-vd-dev-title"><strong>${esc(title)}</strong><span>${esc(subtitle)}</span></div>${lineChartSvg(scans, series)}${seriesLegend(series)}</section>`;
  }

  function scanButtonText() {
    if (scanState === 'scanning') return 'Scanning…';
    if (scanState === 'saved') return 'Saved ✓';
    if (scanState === 'error') return 'Scan failed';
    return 'Scan Army';
  }

  function detailHtml(village) {
    const current = troopCounts(village);
    const scans = historyForVillage(village?.villageId);
    const latestCounts = scans.length ? scans[scans.length - 1].counts : current.counts;
    const power = powerSummary(village, latestCounts || []);
    const coordinates = Number.isFinite(Number(village?.x)) && Number.isFinite(Number(village?.y)) ? `(${village.x}|${village.y})` : '';
    const badges = [village?.isMainVillage ? 'Capital' : '', village?.isTown ? 'City' : ''].filter(Boolean);
    const latest = scans[scans.length - 1];
    const army = armySeries(village, scans);
    const powerLines = powerSeries(village, scans, power.type);

    return `
      <div class="apes-vd-intel-head">
        <div>
          <strong>${esc(village?.name || 'Village')}</strong>
          <span>${esc([coordinates, Number.isFinite(Number(village?.population)) ? `${formatInt(village.population)} pop` : ''].filter(Boolean).join(' · '))}</span>
        </div>
        <div class="apes-vd-intel-actions">
          <div class="apes-vd-intel-badges">${badges.map(badge => `<span>${esc(badge)}</span>`).join('')}</div>
          <span class="apes-vd-army-scan ${scanState === 'scanning' ? 'busy' : ''}" role="button" tabindex="0" data-apes-vd-army-scan="1">${esc(scanButtonText())}</span>
        </div>
      </div>
      <div class="apes-vd-intel-grid apes-vd-intel-grid-history">
        <section class="apes-vd-intel-left">
          <div class="apes-vd-intel-type"><span>Village Type</span><strong>${esc(power.type)}</strong></div>
          <table class="apes-vd-intel-table apes-vd-intel-units">
            <thead><tr><th>Unit</th><th>Count</th></tr></thead>
            <tbody>${unitRowsHtml(village, current.counts)}</tbody>
          </table>
          <div class="apes-vd-intel-source">Troops: ${esc(current.source)} · History: ${scans.length} daily scan${scans.length === 1 ? '' : 's'}${latest ? ` · Last: ${esc(fullScanDate(latest.timestamp))}` : ''}</div>
        </section>
        <section class="apes-vd-development">
          ${developmentCard('Army Development', 'Each troop type keeps the same color across scans.', scans, army)}
          ${developmentCard('Power Development', power.type === 'Offense' ? 'Offensive power' : 'Anti Infantry + Anti Cavalry defensive power', scans, powerLines)}
        </section>
      </div>`;
  }

  function ensureRowControls() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.classList.contains('open')) return;
    const body = overlay.querySelector('.apes-vd-body');
    if (!body) return;

    const rows = Array.from(body.querySelectorAll(':scope > .apes-vd-row'));
    rows.forEach(row => {
      const villageId = rowVillageId(row);
      if (!villageId) return;
      let toggle = row.querySelector(':scope > .apes-vd-expand-toggle');
      if (!toggle) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'apes-vd-expand-toggle';
        toggle.dataset.apesVdExpand = villageId;
        toggle.title = 'Expand village information';
        toggle.setAttribute('aria-label', 'Expand village information');
        row.appendChild(toggle);
      }
      const isExpanded = expanded.has(villageId);
      toggle.classList.toggle('open', isExpanded);
      toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      toggle.textContent = isExpanded ? '⌃' : '⌄';

      const next = row.nextElementSibling;
      if (isExpanded) {
        const village = villageById(villageId);
        let detail = next?.classList.contains('apes-vd-expanded-intel') && next.dataset.villageId === villageId ? next : null;
        if (!detail) {
          detail = document.createElement('div');
          detail.className = 'apes-vd-expanded-intel';
          detail.dataset.villageId = villageId;
          row.insertAdjacentElement('afterend', detail);
        }
        detail.innerHTML = village ? detailHtml(village) : '<div class="apes-vd-intel-loading">Loading village information…</div>';
      } else if (next?.classList.contains('apes-vd-expanded-intel')) {
        next.remove();
      }
    });
  }

  function renderExpandedRows() {
    try {
      ensureRowControls();
    } catch (error) {
      console.warn('[APES Village Dashboard] Expanded village intel render failed.', error);
    }
  }

  document.addEventListener('click', event => {
    const scan = event.target.closest?.('[data-apes-vd-army-scan]');
    if (scan) {
      const overlay = document.getElementById(OVERLAY_ID);
      if (!overlay?.contains(scan)) return;
      event.preventDefault();
      event.stopPropagation();
      if (scanState !== 'scanning') void refreshOverviewTroops(true);
      return;
    }

    const toggle = event.target.closest?.('.apes-vd-expand-toggle[data-apes-vd-expand]');
    if (!toggle) return;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.contains(toggle)) return;
    event.preventDefault();
    event.stopPropagation();
    const villageId = String(toggle.dataset.apesVdExpand || '');
    if (!villageId) return;
    if (expanded.has(villageId)) expanded.delete(villageId); else expanded.add(villageId);
    renderExpandedRows();
    if (expanded.has(villageId)) void refreshOverviewTroops(false);
  }, true);

  document.addEventListener('keydown', event => {
    const scan = event.target.closest?.('[data-apes-vd-army-scan]');
    if (!scan || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    scan.click();
  }, true);

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.data?.source !== BRIDGE_SOURCE || event.data?.type !== RESPONSE_TYPE) return;
    if (!event.data?.payload || typeof event.data.payload !== 'object') return;
    snapshot = event.data.payload;
    renderExpandedRows();
  });

  window.setInterval(() => {
    const overlay = document.getElementById(OVERLAY_ID);
    const isOpen = Boolean(overlay?.classList.contains('open'));
    if (isOpen && !wasOpen) {
      requestSnapshot();
      window.setTimeout(renderExpandedRows, 0);
    }
    if (isOpen) renderExpandedRows();
    wasOpen = isOpen;
  }, 450);

  window.APES = window.APES || {};
  window.APES.villageDashboardIntel = Object.freeze({
    refreshTroops: () => refreshOverviewTroops(true),
    historyForVillage: villageId => historyForVillage(villageId),
    collapseAll: () => { expanded.clear(); renderExpandedRows(); }
  });
})();