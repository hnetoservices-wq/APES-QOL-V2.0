(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';
  const UNIT_COLORS = Object.freeze([
    '#5b9bd5', '#ed7d31', '#70ad47', '#ffc000', '#a5a5a5',
    '#4472c4', '#c55a11', '#255e91', '#8064a2', '#00b0f0'
  ]);
  const UNIT_NAMES = Object.freeze({
    1: ['Legionnaire','Praetorian','Imperian','Equites Legati','Equites Imperatoris','Equites Caesaris','Battering Ram','Fire Catapult','Senator','Settler'],
    2: ['Clubswinger','Spearman','Axeman','Scout','Paladin','Teutonic Knight','Ram','Catapult','Chief','Settler'],
    3: ['Phalanx','Swordsman','Pathfinder','Theutates Thunder','Druidrider','Haeduan','Ram','Trebuchet','Chieftain','Settler']
  });
  const ROLE_INDEXES = Object.freeze({
    Defense: Object.freeze({
      1: [0, 1, 3],                 // Legionnaire + Praetorian + scout
      2: [1, 3, 4],                 // Spearman + scout + Paladin
      3: [0, 2, 4, 5]               // Phalanx + scout + Druidrider + Haeduan
    }),
    Offense: Object.freeze({
      1: [0, 2, 3, 4, 5, 6, 7],    // Legionnaire + offense + scout + siege
      2: [0, 2, 3, 5, 6, 7],       // Clubs/Axe/TK + scout + siege
      3: [1, 2, 3, 5, 6, 7]        // Sword/TT + scout + Haeduan + siege
    }),
    Support: Object.freeze({
      1: [0,1,2,3,4,5,6,7],
      2: [0,1,2,3,4,5,6,7],
      3: [0,1,2,3,4,5,6,7]
    })
  });
  const RESOURCES = Object.freeze([
    { key: 'wood', label: 'Wood', short: 'W' },
    { key: 'clay', label: 'Clay', short: 'C' },
    { key: 'iron', label: 'Iron', short: 'I' },
    { key: 'crop', label: 'Crop', short: 'Cr' }
  ]);

  let observer = null;
  let observedBody = null;
  let scheduled = false;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatInt(value) {
    return Math.round(Number(value) || 0).toLocaleString();
  }

  function formatCompact(value) {
    const number = Number(value) || 0;
    const abs = Math.abs(number);
    const sign = number > 0 ? '+' : number < 0 ? '−' : '';
    const unsigned = Math.abs(number);
    if (abs >= 1000000) return `${sign}${(unsigned / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}m`;
    if (abs >= 1000) return `${sign}${(unsigned / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
    return `${sign}${Math.round(unsigned)}`;
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
    if (!Number.isFinite(date.getTime())) return '';
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function fullScanDate(timestamp) {
    const date = new Date(Number(timestamp));
    if (!Number.isFinite(date.getTime())) return '—';
    return date.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function villageFor(detail) {
    const villageId = String(detail?.dataset?.villageId || '');
    return (window.APES_VILLAGE_PALETTE?.getVillages?.() || [])
      .find(village => String(village?.villageId || '') === villageId) || null;
  }

  function roleFor(detail) {
    const select = detail.querySelector('.apes-vd-role-select');
    if (!select) return 'Support';
    if (select.value && select.value !== 'auto') return select.value;
    const text = String(select.selectedOptions?.[0]?.textContent || '');
    const match = text.match(/Auto\s*[·:-]\s*(Defense|Offense|Support)/i);
    if (!match) return 'Support';
    const raw = match[1].toLowerCase();
    return raw === 'defense' ? 'Defense' : raw === 'offense' ? 'Offense' : 'Support';
  }

  function filteredArmySeries(village, scans, role) {
    const tribe = Number(village?.tribeId) || 0;
    const indexes = ROLE_INDEXES[role]?.[tribe] || ROLE_INDEXES.Support[tribe] || [];
    const names = UNIT_NAMES[tribe] || [];
    return indexes.map(index => ({
      index,
      name: names[index] || `Unit ${index + 1}`,
      color: UNIT_COLORS[index],
      values: scans.map(scan => Math.max(0, Number(scan?.counts?.[index]) || 0))
    })).filter(series => series.values.some(value => value > 0));
  }

  function lineChartSvg(scans, series) {
    const width = 520;
    const height = 205;
    const left = 50;
    const right = 14;
    const top = 12;
    const bottom = 27;
    const plotWidth = width - left - right;
    const plotHeight = height - top - bottom;
    const rawMax = Math.max(1, ...series.flatMap(item => item.values.map(value => Number(value) || 0)));
    const max = niceMaximum(rawMax);
    const xAt = index => scans.length <= 1 ? left + plotWidth / 2 : left + (plotWidth * index / (scans.length - 1));
    const yAt = value => top + plotHeight - (Math.max(0, Number(value) || 0) / max) * plotHeight;

    const grid = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
      const y = top + plotHeight - ratio * plotHeight;
      return `<line x1="${left}" y1="${y.toFixed(1)}" x2="${width - right}" y2="${y.toFixed(1)}" class="apes-vd-dev-gridline"/><text x="${left - 8}" y="${(y + 3).toFixed(1)}" class="apes-vd-dev-axis" text-anchor="end">${esc(formatCompact(max * ratio).replace('+',''))}</text>`;
    }).join('');

    const paths = series.map(item => {
      const points = item.values.map((value, index) => `${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`).join(' ');
      const dots = item.values.map((value, index) => `<circle cx="${xAt(index).toFixed(1)}" cy="${yAt(value).toFixed(1)}" r="2.6" fill="${item.color}"><title>${esc(item.name)} · ${esc(formatInt(value))} · ${esc(fullScanDate(scans[index]?.timestamp))}</title></circle>`).join('');
      return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>${dots}`;
    }).join('');

    const labelIndexes = scans.length <= 1 ? [0] : scans.length === 2 ? [0, 1] : [0, Math.floor((scans.length - 1) / 2), scans.length - 1];
    const labels = [...new Set(labelIndexes)].map(index => `<text x="${xAt(index).toFixed(1)}" y="${height - 7}" class="apes-vd-dev-axis" text-anchor="middle">${esc(chartDate(scans[index]?.timestamp))}</text>`).join('');
    return `<svg class="apes-vd-dev-svg apes-vd-dev-svg-filtered" viewBox="0 0 ${width} ${height}" role="img" aria-label="Army development chart">${grid}${paths}${labels}</svg>`;
  }

  function seriesLegend(series) {
    return `<div class="apes-vd-dev-legend">${series.map(item => `<span><i style="background:${item.color}"></i><b>${esc(item.name)}</b><em>${esc(formatCompact(item.values[item.values.length - 1] || 0).replace('+',''))}</em></span>`).join('')}</div>`;
  }

  function patchArmyGraph(detail) {
    const village = villageFor(detail);
    if (!village) return;
    const villageId = String(village.villageId || '');
    const scans = window.APES?.villageDashboardIntel?.historyForVillage?.(villageId) || [];
    const role = roleFor(detail);
    const card = detail.querySelector('.apes-vd-development > .apes-vd-dev-card:first-child');
    if (!card) return;

    const series = filteredArmySeries(village, scans, role);
    const signature = [
      villageId,
      role,
      scans.length,
      scans[scans.length - 1]?.timestamp || 0,
      series.map(item => item.index).join(',')
    ].join('|');
    if (card.dataset.apesRoleGraph === signature) return;
    card.dataset.apesRoleGraph = signature;

    const subtitle = role === 'Defense'
      ? 'Defense-relevant troops · scouts and hybrid units included'
      : role === 'Offense'
        ? 'Offense-relevant troops · scouts, siege and hybrid units included'
        : 'Support composition · combat, scout and siege units';

    let body;
    if (!scans.length) {
      body = '<div class="apes-vd-dev-empty">No army history yet. Run Scan Army to create the first daily snapshot.</div>';
    } else if (!series.length) {
      body = `<div class="apes-vd-dev-empty">No ${esc(role.toLowerCase())}-relevant troops to graph.</div>`;
    } else {
      body = `${lineChartSvg(scans, series)}${seriesLegend(series)}`;
    }

    card.innerHTML = `<div class="apes-vd-dev-title"><strong>Army Development</strong><span>${esc(subtitle)}</span></div>${body}`;
  }

  function patchSmithy(detail) {
    const villageId = String(detail?.dataset?.villageId || '');
    if (!villageId) return;
    const saved = window.APES?.villageSmithyLevels?.get?.(villageId) || null;
    const levels = saved?.levels && typeof saved.levels === 'object' ? saved.levels : {};
    const table = detail.querySelector('.apes-vd-intel-units');
    if (!table) return;

    const header = table.querySelector('thead tr');
    if (header && !header.querySelector('.apes-vd-smithy-heading')) {
      const th = document.createElement('th');
      th.className = 'apes-vd-smithy-heading';
      th.textContent = 'Smithy';
      th.title = 'Completed Smithy upgrade level';
      header.appendChild(th);
    }

    table.querySelectorAll('tbody > tr').forEach(row => {
      const empty = row.querySelector('.apes-vd-intel-empty');
      if (empty) {
        empty.colSpan = 3;
        return;
      }

      let cell = row.querySelector(':scope > .apes-vd-smithy-level-cell');
      if (!cell) {
        cell = document.createElement('td');
        cell.className = 'apes-vd-smithy-level-cell';
        row.appendChild(cell);
      }

      const unitId = String(row.querySelector('[data-unit-id]')?.getAttribute('data-unit-id') || '');
      const raw = unitId ? levels[unitId] : undefined;
      const level = Number(raw);
      const known = raw !== undefined && Number.isFinite(level) && level >= 0;
      const state = known ? `level:${level}` : saved?.scannedAt ? 'na' : 'unscanned';
      if (cell.dataset.apesSmithyState === state) return;
      cell.dataset.apesSmithyState = state;
      cell.innerHTML = known
        ? `<span class="apes-vd-smithy-level" title="Completed Smithy level ${level}">Lv. ${level}</span>`
        : `<span class="apes-vd-smithy-level unknown" title="${saved?.scannedAt ? 'No completed Smithy level is available for this unit' : 'Run Scan Army to collect Smithy levels'}">—</span>`;
    });

    const source = detail.querySelector('.apes-vd-intel-source');
    if (source) {
      let status = source.querySelector('.apes-vd-smithy-source');
      if (!status) {
        status = document.createElement('span');
        status.className = 'apes-vd-smithy-source';
        source.appendChild(status);
      }
      const next = saved?.scannedAt
        ? ` · Smithy: ${saved.loaded ? 'loaded' : 'unavailable'}`
        : ' · Smithy: not scanned';
      if (status.textContent !== next) status.textContent = next;
    }
  }

  function resourceRowsHtml(villageId) {
    const api = window.APES?.villageResourceProduction;
    const currentSaved = api?.get?.(villageId) || null;
    const current = currentSaved?.production && typeof currentSaved.production === 'object' ? currentSaved.production : null;
    if (!current) return '<div class="apes-vd-resource-empty">Run Scan Army to collect resource production.</div>';

    const all = api?.all?.() || {};
    const totals = Object.fromEntries(RESOURCES.map(resource => [resource.key, 0]));
    Object.values(all).forEach(saved => {
      const production = saved?.production || {};
      RESOURCES.forEach(resource => {
        const value = Number(production[resource.key]);
        if (Number.isFinite(value) && value > 0) totals[resource.key] += value;
      });
    });

    return RESOURCES.map(resource => {
      const value = Number(current[resource.key]);
      const finite = Number.isFinite(value);
      const positive = finite ? Math.max(0, value) : 0;
      const total = Math.max(0, Number(totals[resource.key]) || 0);
      const pct = total > 0 ? Math.max(0, Math.min(100, positive / total * 100)) : 0;
      const pctText = total > 0 ? `${pct < 0.1 && pct > 0 ? '<0.1' : pct.toFixed(pct >= 10 ? 0 : 1)}%` : '—';
      const productionText = finite ? `${formatCompact(value)}/h` : '—';
      return `
        <div class="apes-vd-resource-row" title="${esc(resource.label)}: ${esc(productionText)} · ${esc(pctText)} of positive scanned account production">
          <span class="apes-vd-resource-icon ${resource.key}" aria-label="${esc(resource.label)}">${esc(resource.short)}</span>
          <span class="apes-vd-resource-bar"><i style="width:${pct.toFixed(2)}%"></i></span>
          <span class="apes-vd-resource-values"><strong>${pctText}</strong><em>${esc(productionText)}</em></span>
        </div>`;
    }).join('');
  }

  function patchSide(detail) {
    const villageId = String(detail?.dataset?.villageId || '');
    if (!villageId) return;
    const aside = detail.querySelector('.apes-vd-intel-grid-history > .apes-vd-contribution');
    if (!aside) return;

    let accountCard = aside.querySelector(':scope > .apes-vd-account-card');
    let resourceCard = aside.querySelector(':scope > .apes-vd-resource-card');

    if (!accountCard || !resourceCard) {
      const title = aside.querySelector(':scope > .apes-vd-contribution-title');
      const list = aside.querySelector(':scope > .apes-vd-contribution-list');
      if (!title || !list) return;

      aside.classList.add('apes-vd-side-stack');
      accountCard = document.createElement('section');
      accountCard.className = 'apes-vd-side-card apes-vd-account-card';
      accountCard.append(title, list);

      resourceCard = document.createElement('section');
      resourceCard.className = 'apes-vd-side-card apes-vd-resource-card';
      resourceCard.innerHTML = `
        <div class="apes-vd-resource-title">
          <strong>Resource Production</strong>
          <span>Village share of scanned account production</span>
        </div>
        <div class="apes-vd-resource-list"></div>`;

      aside.replaceChildren(accountCard, resourceCard);
    }

    const resourceList = resourceCard.querySelector('.apes-vd-resource-list');
    if (!resourceList) return;
    const html = resourceRowsHtml(villageId);
    if (resourceList.__apesResourceHtml !== html) {
      resourceList.__apesResourceHtml = html;
      resourceList.innerHTML = html;
    }
  }

  function patchDetail(detail) {
    patchSmithy(detail);
    patchArmyGraph(detail);
    patchSide(detail);
  }

  function patchAll() {
    scheduled = false;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.classList.contains('open')) return;
    overlay.querySelectorAll('.apes-vd-expanded-intel').forEach(patchDetail);
  }

  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(patchAll);
  }

  function installObserver() {
    const body = document.querySelector(`#${OVERLAY_ID} .apes-vd-body`);
    if (!body || body === observedBody) return;
    observer?.disconnect();
    observedBody = body;
    observer = new MutationObserver(schedulePatch);
    observer.observe(body, { childList: true, subtree: true });
    schedulePatch();
  }

  document.addEventListener('change', event => {
    if (event.target?.matches?.('.apes-vd-role-select')) window.setTimeout(schedulePatch, 0);
  }, true);

  window.addEventListener('apes_vd_army_history_updated', schedulePatch);
  window.addEventListener('apes_vd_smithy_levels_updated', schedulePatch);
  window.addEventListener('apes_vd_resource_production_updated', schedulePatch);

  window.setInterval(() => {
    installObserver();
    schedulePatch();
  }, 450);
})();
