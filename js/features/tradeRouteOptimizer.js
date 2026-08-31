(() => {
  'use strict';

  const FEATURE_KEY = 'cpManager';
  const TRADE_PLANNER_ID = 'qol-cp-trade-planner-panel';
  const OPTIMIZER_ID = 'qol-cp-trade-optimizer';
  const STYLE_ID = 'qol-cp-trade-optimizer-styles';
  const REFRESH_MS = 350;
  const RESOURCE_KEYS = Object.freeze(['wood', 'clay', 'iron', 'crop']);
  const RESOURCE_LABELS = Object.freeze({
    wood: 'Wood',
    clay: 'Clay',
    iron: 'Iron',
    crop: 'Crop'
  });
  const RESOURCE_ICON_CLASSES = Object.freeze({
    wood: 'unit_wood_small_illu resType1',
    clay: 'unit_clay_small_illu resType2',
    iron: 'unit_iron_small_illu resType3',
    crop: 'unit_crop_small_illu resType4'
  });
  let refreshTimer = null;
  let lastSignature = '';
  let lastPlan = null;
  function enabled() {
    return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY) === true;
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function formatNumber(value) {
    return Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('en-US') : '-';
  }
  function resourceIcon(resource) {
    return `<i class="qol-cp-game-resource-icon ${RESOURCE_ICON_CLASSES[resource] || ''}" title="${RESOURCE_LABELS[resource] || resource}" aria-label="${RESOURCE_LABELS[resource] || resource}" role="img"></i>`;
  }
  function planner() {
    return document.getElementById(TRADE_PLANNER_ID);
  }
  function plannerVisible(panel = planner()) {
    if (!panel) return false;
    const style = getComputedStyle(panel);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  function parseHourlyValue(value) {
    const text = String(value ?? '').replace(/\u2212/g, '-').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim();
    if (!text || /unavailable/i.test(text)) return null;
    const match = text.match(/(-?[\d.,]+)\s*\/\s*h/i);
    if (!match) return null;
    const negative = match[1].trim().startsWith('-');
    const digits = match[1].replace(/[^0-9]/g, '');
    if (!digits) return null;
    const parsed = Number.parseInt(digits, 10);
    return Number.isFinite(parsed) ? negative ? -parsed : parsed : null;
  }
  function readVillageRows(panel) {
    return Array.from(panel.querySelectorAll('.qol-cp-trade-row')).map(row => {
      const index = Number.parseInt(row.dataset.index || '', 10);
      const cells = row.querySelectorAll('td');
      const name = cells[0]?.textContent?.replace(/\s+/g, ' ').trim() || `Village ${index + 1}`;
      const frequency = Math.max(1, Math.min(3, Number.parseInt(row.querySelector('.qol-cp-trade-frequency')?.value || '1', 10) || 1));
      const hasMarket = Boolean(row.querySelector('.qol-cp-open-market-btn'));
      const balances = {};
      for (const key of RESOURCE_KEYS) {
        const strong = row.querySelector(`.qol-cp-trade-${key} .qol-cp-trade-resource strong`);
        balances[key] = parseHourlyValue(strong?.textContent);
      }
      return {
        index,
        name,
        frequency,
        hasMarket,
        balances,
        row
      };
    }).filter(item => Number.isFinite(item.index));
  }
  function signatureFor(rows) {
    return rows.map(row => [row.index, row.name, row.frequency, row.hasMarket ? 1 : 0, ...RESOURCE_KEYS.map(key => row.balances[key] ?? 'x')].join('|')).join('||');
  }
  function emptyResourceMap() {
    return Object.fromEntries(RESOURCE_KEYS.map(key => [key, 0]));
  }
  function getOrCreateRoute(routeMap, source, destination) {
    const key = `${source.index}>${destination.index}`;
    let route = routeMap.get(key);
    if (!route) {
      route = {
        key,
        sourceIndex: source.index,
        sourceName: source.name,
        destinationIndex: destination.index,
        destinationName: destination.name,
        frequency: source.frequency,
        hourly: emptyResourceMap(),
        perRoute: emptyResourceMap()
      };
      routeMap.set(key, route);
    }
    return route;
  }
  function buildPlan(rows) {
    const routeMap = new Map();
    const metrics = Object.fromEntries(RESOURCE_KEYS.map(key => [key, {
      need: 0,
      eligibleSurplus: 0,
      strandedSurplus: 0,
      covered: 0,
      uncovered: 0
    }]));
    for (const resource of RESOURCE_KEYS) {
      const sources = [];
      const deficits = [];
      for (const row of rows) {
        const balance = row.balances[resource];
        if (!Number.isFinite(balance)) continue;
        if (balance > 0) {
          if (row.hasMarket) {
            sources.push({
              row,
              remaining: Math.floor(balance)
            });
            metrics[resource].eligibleSurplus += Math.floor(balance);
          } else {
            metrics[resource].strandedSurplus += Math.floor(balance);
          }
        } else if (balance < 0) {
          const need = Math.ceil(Math.abs(balance));
          deficits.push({
            row,
            remaining: need
          });
          metrics[resource].need += need;
        }
      }
      sources.sort((a, b) => b.remaining - a.remaining || a.row.name.localeCompare(b.row.name));
      deficits.sort((a, b) => b.remaining - a.remaining || a.row.name.localeCompare(b.row.name));
      for (const deficit of deficits) {
        while (deficit.remaining > 0) {
          sources.sort((a, b) => b.remaining - a.remaining);
          const source = sources.find(candidate => candidate.remaining >= candidate.row.frequency);
          if (!source) break;
          const rawAllocation = Math.min(source.remaining, deficit.remaining);
          const frequency = source.row.frequency;
          const allocation = Math.floor(rawAllocation / frequency) * frequency;
          if (allocation <= 0) break;
          const route = getOrCreateRoute(routeMap, source.row, deficit.row);
          route.hourly[resource] += allocation;
          route.perRoute[resource] += allocation / frequency;
          source.remaining -= allocation;
          deficit.remaining -= allocation;
          metrics[resource].covered += allocation;
        }
      }
      metrics[resource].uncovered = deficits.reduce((sum, item) => sum + item.remaining, 0);
    }
    const routes = Array.from(routeMap.values()).filter(route => RESOURCE_KEYS.some(key => route.hourly[key] > 0)).sort((a, b) => {
      const bTotal = RESOURCE_KEYS.reduce((sum, key) => sum + b.hourly[key], 0);
      const aTotal = RESOURCE_KEYS.reduce((sum, key) => sum + a.hourly[key], 0);
      return bTotal - aTotal || a.sourceName.localeCompare(b.sourceName) || a.destinationName.localeCompare(b.destinationName);
    });
    return {
      routes,
      metrics,
      rows
    };
  }
  function percentageCovered(metric) {
    if (!metric.need) return 100;
    return Math.max(0, Math.min(100, Math.round(metric.covered / metric.need * 100)));
  }
  function optimizerStatusHtml(plan) {
    const deficitResources = RESOURCE_KEYS.filter(key => plan.metrics[key].need > 0);
    if (!deficitResources.length) {
      return '<strong>No hourly deficits detected.</strong> Current celebration settings do not require any balancing routes.';
    }
    const coverage = deficitResources.map(key => {
      const metric = plan.metrics[key];
      return `${RESOURCE_LABELS[key]} ${percentageCovered(metric)}%`;
    }).join(' · ');
    const uncovered = RESOURCE_KEYS.filter(key => plan.metrics[key].uncovered > 0).map(key => `${formatNumber(plan.metrics[key].uncovered)} ${RESOURCE_LABELS[key]}/h`).join(' · ');
    const stranded = RESOURCE_KEYS.filter(key => plan.metrics[key].strandedSurplus > 0).map(key => `${formatNumber(plan.metrics[key].strandedSurplus)} ${RESOURCE_LABELS[key]}/h`).join(' · ');
    return [`<strong>${plan.routes.length} suggested route${plan.routes.length === 1 ? '' : 's'}.</strong> Coverage: ${escapeHtml(coverage)}.`, uncovered ? `<span class="qol-cp-optimizer-warning">Uncovered: ${escapeHtml(uncovered)}.</span>` : '<span class="qol-cp-optimizer-good">All detected deficits are covered.</span>', stranded ? `<span class="qol-cp-optimizer-warning">Surplus without a scanned Market: ${escapeHtml(stranded)}.</span>` : ''].filter(Boolean).join(' ');
  }
  function routeResourceHtml(route, resource) {
    const hourly = route.hourly[resource];
    if (!Number.isFinite(hourly) || hourly <= 0) return '<span class="qol-cp-optimizer-none">—</span>';
    const perRoute = route.perRoute[resource];
    return `<div class="qol-cp-optimizer-resource"><strong>${formatNumber(hourly)}/h</strong><span>${formatNumber(perRoute)}/route</span></div>`;
  }
  function planText(plan) {
    if (!plan?.routes?.length) return '';
    return plan.routes.map((route, index) => {
      const amounts = RESOURCE_KEYS.filter(key => route.perRoute[key] > 0).map(key => `${formatNumber(route.perRoute[key])} ${RESOURCE_LABELS[key]}`).join(' | ');
      return `${index + 1}. ${route.sourceName} -> ${route.destinationName} | x${route.frequency}/h | ${amounts}`;
    }).join('\n');
  }
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${TRADE_PLANNER_ID} .qol-cp-trade-table-wrap{min-height:145px!important}
#${OPTIMIZER_ID}{flex:0 0 auto!important;min-height:150px!important;max-height:260px!important;border-top:1px solid #cdbd9f!important;background:#f7f1e6!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:7px 9px!important;background:#e9dfcc!important;border-bottom:1px solid #d3c4aa!important;color:var(--qol-accent-deep)!important;flex:0 0 auto!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-title{display:flex!important;flex-direction:column!important;gap:2px!important;min-width:0!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-title strong{font-size:10px!important;text-transform:uppercase!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-title span{font-size:8.5px!important;color:#79664d!important;font-weight:normal!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-copy{display:inline-flex!important;align-items:center!important;justify-content:center!important;height:25px!important;min-width:72px!important;padding:3px 8px!important;border:1px solid var(--qol-action-border)!important;border-radius:3px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:9px!important;font-weight:bold!important;cursor:pointer!important;user-select:none!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-copy.disabled{opacity:.42!important;pointer-events:none!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-status{padding:5px 9px!important;background:#fffaf0!important;border-bottom:1px solid #ded2bd!important;color:#5b4630!important;font-size:8.5px!important;line-height:1.35!important;flex:0 0 auto!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-good{color:#4f7328!important;font-weight:bold!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-warning{color:#9b2b26!important;font-weight:bold!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-wrap{overflow:auto!important;min-height:0!important;flex:1 1 auto!important;background:#fff!important}
#${OPTIMIZER_ID} table{min-width:920px!important;width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:9px!important}
#${OPTIMIZER_ID} th,#${OPTIMIZER_ID} td{padding:5px 7px!important;border-bottom:1px solid #e4dccd!important;color:#4b3b28!important;vertical-align:middle!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
#${OPTIMIZER_ID} th{position:sticky!important;top:0!important;z-index:2!important;background:#f4eee2!important;color:#6a573d!important;font-size:8px!important;text-transform:uppercase!important}
#${OPTIMIZER_ID} th:nth-child(1),#${OPTIMIZER_ID} td:nth-child(1),#${OPTIMIZER_ID} th:nth-child(2),#${OPTIMIZER_ID} td:nth-child(2){width:145px!important}
#${OPTIMIZER_ID} th:nth-child(n+3):nth-child(-n+6),#${OPTIMIZER_ID} td:nth-child(n+3):nth-child(-n+6){width:125px!important;text-align:right!important}
#${OPTIMIZER_ID} th:nth-child(7),#${OPTIMIZER_ID} td:nth-child(7){width:68px!important;text-align:center!important}
#${OPTIMIZER_ID} th:nth-child(8),#${OPTIMIZER_ID} td:nth-child(8){width:104px!important;text-align:center!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-resource{display:flex!important;flex-direction:column!important;align-items:flex-end!important;gap:1px!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-resource strong{font-size:9.5px!important;color:#4f7328!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-resource span{font-size:8px!important;color:#7b6a54!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-none{color:#aa9c87!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-open{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:86px!important;height:24px!important;padding:3px 7px!important;border:1px solid var(--qol-action-border)!important;border-radius:3px!important;background:linear-gradient(to bottom,var(--qol-accent),var(--qol-accent-dark))!important;color:#fff!important;font-size:8.5px!important;font-weight:bold!important;cursor:pointer!important;user-select:none!important}
#${OPTIMIZER_ID} .qol-cp-optimizer-empty{padding:18px 12px!important;color:#79664d!important;text-align:center!important;font-size:9px!important;font-style:italic!important}
`;
    document.head.appendChild(style);
  }
  function bindOptimizerControls(panel) {
    if (panel.dataset.qolTradeOptimizerBound === 'true') return;
    panel.dataset.qolTradeOptimizerBound = 'true';
    const activate = event => {
      const copy = event.target.closest?.('.qol-cp-optimizer-copy');
      if (copy) {
        event.preventDefault();
        event.stopPropagation();
        if (copy.classList.contains('disabled')) return;
        const text = planText(lastPlan);
        if (!text) return;
        navigator.clipboard?.writeText(text).then(() => {
          const previous = copy.textContent;
          copy.textContent = 'Copied';
          window.setTimeout(() => {
            if (copy.isConnected) copy.textContent = previous;
          }, 900);
        }).catch(() => {});
        return;
      }
      const open = event.target.closest?.('.qol-cp-optimizer-open');
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        const index = String(open.dataset.sourceIndex || '');
        const sourceRow = panel.querySelector(`.qol-cp-trade-row[data-index="${CSS.escape(index)}"]`);
        const nativeButton = sourceRow?.querySelector('.qol-cp-open-market-btn');
        nativeButton?.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
      }
    };
    panel.addEventListener('click', activate);
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (!event.target.closest?.('.qol-cp-optimizer-copy,.qol-cp-optimizer-open')) return;
      activate(event);
    });
  }
  function renderOptimizer(panel, rows) {
    const body = panel.querySelector('.qol-cp-trade-body');
    if (!body) return;
    let root = document.getElementById(OPTIMIZER_ID);
    if (!root) {
      root = document.createElement('section');
      root.id = OPTIMIZER_ID;
      body.appendChild(root);
    } else if (root.parentElement !== body) {
      body.appendChild(root);
    }
    const plan = buildPlan(rows);
    lastPlan = plan;
    const title = panel.querySelector('.qol-cp-trade-title-wrap > span:first-child');
    if (title) title.textContent = 'Trade Route Optimizer';
    const note = panel.querySelector('.qol-cp-trade-note');
    if (note && note.dataset.qolOptimizerNote !== 'true') {
      note.dataset.qolOptimizerNote = 'true';
      note.innerHTML += ' <strong>Suggested Routes</strong> below automatically match hourly surpluses to deficits using the current celebration and Routes/h selections.';
    }
    const resourceHeaders = RESOURCE_KEYS.map(key => `<th title="${RESOURCE_LABELS[key]}">${resourceIcon(key)}</th>`).join('');
    const routeRows = plan.routes.map(route => `
            <tr>
                <td title="${escapeHtml(route.sourceName)}">${escapeHtml(route.sourceName)}</td>
                <td title="${escapeHtml(route.destinationName)}">${escapeHtml(route.destinationName)}</td>
                ${RESOURCE_KEYS.map(key => `<td>${routeResourceHtml(route, key)}</td>`).join('')}
                <td>x${route.frequency}</td>
                <td><div class="qol-cp-optimizer-open" role="button" tabindex="0" data-source-index="${route.sourceIndex}">Open Market</div></td>
            </tr>
        `).join('');
    root.innerHTML = `
            <div class="qol-cp-optimizer-head">
                <div class="qol-cp-optimizer-title">
                    <strong>Suggested Routes</strong>
                    <span>Largest deficits are matched to the largest eligible surpluses. Merchant capacity is not yet enforced.</span>
                </div>
                <div class="qol-cp-optimizer-copy${plan.routes.length ? '' : ' disabled'}" role="button" tabindex="0">Copy Plan</div>
            </div>
            <div class="qol-cp-optimizer-status">${optimizerStatusHtml(plan)}</div>
            <div class="qol-cp-optimizer-wrap">
                ${plan.routes.length ? `
                    <table>
                        <thead><tr><th>Source</th><th>Destination</th>${resourceHeaders}<th>Routes/h</th><th>Plan Route</th></tr></thead>
                        <tbody>${routeRows}</tbody>
                    </table>
                ` : '<div class="qol-cp-optimizer-empty">No balancing routes are required or no eligible Marketplace surplus is available.</div>'}
            </div>
        `;
  }
  function refresh(force = false) {
    if (!enabled()) return;
    const panel = planner();
    if (!plannerVisible(panel)) return;
    injectStyles();
    bindOptimizerControls(panel);
    const rows = readVillageRows(panel);
    if (!rows.length) return;
    const signature = signatureFor(rows);
    if (!force && signature === lastSignature && document.getElementById(OPTIMIZER_ID)) return;
    lastSignature = signature;
    renderOptimizer(panel, rows);
  }
  function start() {
    injectStyles();
    if (refreshTimer !== null) return;
    refreshTimer = window.setInterval(() => refresh(false), REFRESH_MS);
    refresh(true);
  }
  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key !== FEATURE_KEY) return;
    lastSignature = '';
    if (event.detail.enabled === false) {
      document.getElementById(OPTIMIZER_ID)?.remove();
      lastPlan = null;
      return;
    }
    refresh(true);
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {
      once: true
    });
  } else {
    start();
  }
})();
