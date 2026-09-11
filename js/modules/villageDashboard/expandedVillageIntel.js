(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';
  const UI_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_UI';
  const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
  const REQUEST_TYPE = 'REQUEST_SNAPSHOT';
  const RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';
  const TROOP_CACHE_MS = 30000;

  const expanded = new Set();
  const troopRowsByName = new Map();
  let troopRowsUpdatedAt = 0;
  let troopScanPromise = null;
  let snapshot = { generatedAt: 0, activeVillageId: '', villages: [] };
  let wasOpen = false;

  const UNIT_DATA = Object.freeze({
    1: [
      ['Legionnaire',40,35,50,1], ['Praetorian',30,65,35,1], ['Imperian',70,40,25,1],
      ['Equites Legati',0,20,10,2], ['Equites Imperatoris',120,65,50,3], ['Equites Caesaris',180,80,105,4],
      ['Battering Ram',60,30,75,3], ['Fire Catapult',75,60,10,6], ['Senator',50,40,30,5], ['Settler',0,80,80,1]
    ],
    2: [
      ['Clubswinger',40,20,5,1], ['Spearman',10,35,60,1], ['Axeman',60,30,30,1],
      ['Scout',0,10,5,1], ['Paladin',55,100,40,2], ['Teutonic Knight',150,50,75,3],
      ['Ram',65,30,80,3], ['Catapult',50,60,10,6], ['Chief',40,60,40,4], ['Settler',10,80,80,1]
    ],
    3: [
      ['Phalanx',15,40,50,1], ['Swordsman',65,35,20,1], ['Pathfinder',0,20,10,2],
      ['Theutates Thunder',90,25,40,2], ['Druidrider',45,115,55,2], ['Haeduan',140,60,165,3],
      ['Ram',50,30,105,3], ['Trebuchet',70,45,10,6], ['Chieftain',40,50,50,4], ['Settler',0,80,80,1]
    ]
  });

  const BUILDINGS = Object.freeze([
    [19, 'Barracks'], [20, 'Stables'], [46, 'Healing Tent'], [12, 'Smithy'], [22, 'Academy']
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

  function num(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function formatInt(value) {
    return Math.round(Number(value) || 0).toLocaleString();
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

  function parseOwnTroopsTable(table) {
    const headerIds = Array.from(table.querySelectorAll('thead.troopsIconRow th i[unit-icon][data]'))
      .map(icon => String(icon.getAttribute('data') || '').trim());
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const parsed = new Map();

    rows.forEach(row => {
      const cells = Array.from(row.querySelectorAll(':scope > td'));
      const name = cells[0]?.querySelector('a')?.textContent?.replace(/\s+/g, ' ').trim();
      if (!name || cells.length < 2) return;
      const units = {};
      for (let index = 1; index < cells.length; index += 1) {
        const key = headerIds[index - 1] || String(index);
        units[key] = Math.max(0, Number.parseInt(cells[index].textContent.replace(/[^\d-]/g, ''), 10) || 0);
      }
      parsed.set(norm(name), { name, units });
    });
    return parsed;
  }

  async function refreshOverviewTroops(force = false) {
    if (!force && troopRowsByName.size && Date.now() - troopRowsUpdatedAt < TROOP_CACHE_MS) return true;
    if (troopScanPromise) return troopScanPromise;

    troopScanPromise = (async () => {
      const previousHash = location.hash;
      try {
        location.hash = overviewRoute();
        const table = await waitFor('.tabTroops .tabContentOwnTroops .ownTroops table.villagesTable, .ownTroops table.villagesTable', 5500);
        if (!table) return false;
        const parsed = parseOwnTroopsTable(table);
        if (!parsed.size) return false;
        troopRowsByName.clear();
        parsed.forEach((value, key) => troopRowsByName.set(key, value));
        troopRowsUpdatedAt = Date.now();
        return true;
      } catch (error) {
        console.warn('[APES Village Dashboard] Troop overview scan failed.', error);
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

  function absoluteUnitId(tribeId, localIndex) {
    const tribe = Number(tribeId);
    if (tribe >= 1 && tribe <= 3) return (tribe - 1) * 10 + localIndex;
    return localIndex;
  }

  function troopCounts(village) {
    const overview = troopRowsByName.get(norm(village?.name));
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

  function smithyLevels(village) {
    const levels = Array(10).fill(null);
    const seen = new WeakSet();
    const walk = (value, depth = 0) => {
      if (!value || depth > 7 || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      const unitRaw = num(value.unitId ?? value.troopId ?? value.unitType ?? value.unitTypeId);
      const levelRaw = num(value.level ?? value.lvl ?? value.researchLevel ?? value.upgradeLevel ?? value.currentLevel);
      if (unitRaw !== null && levelRaw !== null && levelRaw >= 0 && levelRaw <= 20) {
        const tribe = Number(village?.tribeId);
        let local = unitRaw;
        if (tribe >= 1 && tribe <= 3 && unitRaw > (tribe - 1) * 10 && unitRaw <= tribe * 10) local = unitRaw - (tribe - 1) * 10;
        if (local >= 1 && local <= 10) levels[local - 1] = Math.max(levels[local - 1] ?? 0, levelRaw);
      }
      (Array.isArray(value) ? value : Object.values(value)).forEach(child => walk(child, depth + 1));
    };
    walk(village?.smithyQueue);
    return levels;
  }

  function improvedStat(base, upkeep, level) {
    const lvl = Number.isFinite(Number(level)) ? Math.max(0, Math.min(20, Number(level))) : 0;
    return base + (base + (300 * upkeep / 7)) * (Math.pow(1.007, lvl) - 1);
  }

  function powerSummary(village, counts, levels) {
    const data = UNIT_DATA[Number(village?.tribeId)] || [];
    let attack = 0;
    let defInf = 0;
    let defCav = 0;
    counts.forEach((count, index) => {
      const unit = data[index];
      if (!unit || !count) return;
      const level = levels[index] ?? 0;
      attack += count * improvedStat(unit[1], unit[4], level);
      defInf += count * improvedStat(unit[2], unit[4], level);
      defCav += count * improvedStat(unit[3], unit[4], level);
    });
    const defenseAverage = (defInf + defCav) / 2;
    const type = defenseAverage > attack * 1.1 ? 'Defense' : attack > defenseAverage * 1.1 ? 'Offense' : 'Mixed';
    return { attack, defInf, defCav, type };
  }

  function buildingLevel(village, type) {
    const matches = (village?.buildings || []).filter(building => Number(building?.buildingType) === Number(type));
    if (!matches.length) return '—';
    return Math.max(...matches.map(building => Number(building?.lvl) || 0));
  }

  function queueEntries(village) {
    const found = [];
    const seen = new WeakSet();
    const walk = (value, depth = 0) => {
      if (!value || depth > 7 || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      const unitId = num(value.unitId ?? value.troopId ?? value.unitType ?? value.unitTypeId);
      const amount = num(value.amount ?? value.count ?? value.number ?? value.quantity ?? value.units);
      const buildingType = num(value.buildingType ?? value.buildingTypeId);
      if (unitId !== null && amount !== null && amount > 0) found.push({ unitId, amount, buildingType });
      (Array.isArray(value) ? value : Object.values(value)).forEach(child => walk(child, depth + 1));
    };
    walk(village?.unitQueue);
    return found;
  }

  function trainingForBuilding(village, buildingType) {
    const tribe = Number(village?.tribeId);
    const entries = queueEntries(village);
    const matched = entries.filter(entry => {
      if (entry.buildingType !== null) return Number(entry.buildingType) === Number(buildingType);
      let local = Number(entry.unitId);
      if (tribe >= 1 && tribe <= 3 && local > (tribe - 1) * 10 && local <= tribe * 10) local -= (tribe - 1) * 10;
      if (buildingType === 19) return local >= 1 && local <= 3;
      if (buildingType === 20) return local >= 4 && local <= 6;
      return false;
    });
    if (!matched.length) return '—';
    return matched.slice(0, 2).map(entry => {
      let local = Number(entry.unitId);
      if (tribe >= 1 && tribe <= 3 && local > (tribe - 1) * 10 && local <= tribe * 10) local -= (tribe - 1) * 10;
      const name = UNIT_DATA[tribe]?.[local - 1]?.[0] || `Unit ${entry.unitId}`;
      return `${formatInt(entry.amount)} ${name}`;
    }).join(', ');
  }

  function unitRowsHtml(village, counts, levels) {
    const data = UNIT_DATA[Number(village?.tribeId)] || [];
    const rows = counts.map((count, index) => {
      if (!count) return '';
      const unit = data[index];
      const name = unit?.[0] || `Unit ${index + 1}`;
      const level = levels[index];
      return `<tr><td>${esc(name)}</td><td>${esc(formatInt(count))}</td><td>${level === null ? '—' : esc(level)}</td></tr>`;
    }).filter(Boolean).join('');
    return rows || '<tr><td colspan="3" class="apes-vd-intel-empty">No own troops found.</td></tr>';
  }

  function donutHtml(power) {
    const total = power.defInf + power.defCav;
    const infPct = total > 0 ? Math.max(0, Math.min(100, power.defInf / total * 100)) : 50;
    return `
      <div class="apes-vd-intel-chart-title">Defensive Power by Type</div>
      <div class="apes-vd-intel-chart-body">
        <div class="apes-vd-intel-donut" style="--apes-vd-inf:${infPct.toFixed(2)}%"><span></span></div>
        <div class="apes-vd-intel-legend">
          <div><i class="inf"></i><span>Anti Infantry</span><strong>${esc(formatInt(power.defInf))}</strong></div>
          <div><i class="cav"></i><span>Anti Cavalry</span><strong>${esc(formatInt(power.defCav))}</strong></div>
        </div>
      </div>`;
  }

  function detailHtml(village) {
    const { counts, source } = troopCounts(village);
    const levels = smithyLevels(village);
    const power = powerSummary(village, counts, levels);
    const coordinates = Number.isFinite(Number(village?.x)) && Number.isFinite(Number(village?.y)) ? `(${village.x}|${village.y})` : '';
    const badges = [village?.isMainVillage ? 'Capital' : '', village?.isTown ? 'City' : ''].filter(Boolean);
    const knownLevels = levels.filter(level => level !== null).length;

    const buildings = BUILDINGS.map(([type, label]) => {
      const training = type === 19 || type === 20 ? trainingForBuilding(village, type) : type === 12 && village?.smithyQueue ? 'Upgrade active' : '—';
      return `<tr><td>${esc(label)}</td><td>${esc(buildingLevel(village, type))}</td><td>${esc(training)}</td></tr>`;
    }).join('');

    return `
      <div class="apes-vd-intel-head">
        <div>
          <strong>${esc(village?.name || 'Village')}</strong>
          <span>${esc([coordinates, Number.isFinite(Number(village?.population)) ? `${formatInt(village.population)} pop` : ''].filter(Boolean).join(' · '))}</span>
        </div>
        <div class="apes-vd-intel-badges">${badges.map(badge => `<span>${esc(badge)}</span>`).join('')}</div>
      </div>
      <div class="apes-vd-intel-grid">
        <section class="apes-vd-intel-left">
          <div class="apes-vd-intel-type"><span>Village Type</span><strong>${esc(power.type)}</strong></div>
          <table class="apes-vd-intel-table apes-vd-intel-units">
            <thead><tr><th>Village Units</th><th>Count</th><th>Level</th></tr></thead>
            <tbody>${unitRowsHtml(village, counts, levels)}</tbody>
          </table>
          <table class="apes-vd-intel-table apes-vd-intel-buildings">
            <thead><tr><th>Training</th><th>Level</th><th>Current Queue</th></tr></thead>
            <tbody>${buildings}</tbody>
          </table>
          <div class="apes-vd-intel-source">Troops: ${esc(source)} · Smithy levels detected: ${knownLevels}/10</div>
        </section>
        <section class="apes-vd-intel-chart">${donutHtml(power)}</section>
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
    collapseAll: () => { expanded.clear(); renderExpandedRows(); }
  });
})();
