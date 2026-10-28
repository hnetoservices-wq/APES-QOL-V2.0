(() => {
  'use strict';
  // MAIN-world read-only integration: no requests, hovering, or game actions.
  const FLAG = '__APES_QOL_ROYAL_TRIBUTE_COUNTDOWN__';
  const STORAGE_KEY = 'qol_royalTributeCountdown';
  const TABLES = Object.freeze([
    { selector: '.tributeVillages table.gradient',
      rows: 'tbody tr[ng-repeat*="village in tributeVillages"]',
      kind: 'own', container: '.tributeVillages' },
    { selector: '.foreignVillages table.gradient',
      rows: 'tbody tr[ng-repeat*="village in foreignVillages"]',
      kind: 'foreign', container: '.foreignVillages' }
  ]);
  const LABEL_CLASS = 'qol-royal-tribute-eta';
  const CELL_CLASS = 'qol-royal-tribute-eta-cell';
  const HEAD_CLASS = 'qol-royal-tribute-eta-head';
  const COUNT_CLASS = 'qol-royal-tribute-village-count';
  const PRODUCTION_CLASS = 'qol-royal-tribute-production-total';
  const ACTIVE_CLASS = 'qol-royal-tributes-active';
  const BUTTON_LABEL_CLASS = 'qol-royal-collect-label';
  const TRANSIT_CLASS = 'qol-royal-tribute-in-transit';
  const TRANSIT_PANEL_CLASS = 'qol-royal-tribute-transit-panel';
  if (window[FLAG]) return;
  window[FLAG] = true;

  function isEnabled() {
    try { return window.localStorage?.getItem(STORAGE_KEY) !== 'false'; }
    catch (_) { return true; }
  }

  function villageIdFor(row) {
    const id = row.querySelector('td.playerColumn [villageid]')?.getAttribute('villageid');
    return id && /^\d+$/.test(id) ? id : '';
  }

  function villageDataFor(id) {
    if (!id) return null;
    const record = window.Cache?.c?.['Village:' + id];
    return record?.data ?? record ?? null;
  }

  function isConnected(row) {
    const cell = row.querySelector('td.collect');
    return !!cell && !cell.classList.contains('notConnected') &&
      !!cell.querySelector('.collectTributesContainer');
  }

  function regularCollectButton(container) {
    // Travian switches to a DIFFERENT premium Gold button after collection.
    // Only the standard fetchTribute() action may receive the short label.
    return container?.querySelector('button[clickable^="fetchTribute("]') || null;
  }

  function isNativeReady(row) {
    // The premium instant-collection action must never count as Ready.
    const container = row.querySelector('td.collect')?.querySelector('.collectTributesContainer');
    const button = regularCollectButton(container);
    return !!button && button.disabled !== true && !button.classList.contains('disabled');
  }

  function syncTransitLayout(row) {
    const container = row.querySelector('td.collect')?.querySelector('.collectTributesContainer');
    if (!container) return;
    const onWay = container.querySelector('.tributeOnTheWay');
    const panel = onWay?.parentElement;
    container.classList.toggle(TRANSIT_CLASS, !!onWay && !!panel && panel.parentElement === container);
    for (const oldPanel of container.querySelectorAll('.' + TRANSIT_PANEL_CLASS)) {
      if (oldPanel !== panel) oldPanel.classList.remove(TRANSIT_PANEL_CLASS);
    }
    if (onWay && panel?.parentElement === container) {
      panel.classList.add(TRANSIT_PANEL_CLASS);
    }
    // Remove any label accidentally added to a premium button by a previous
    // experimental version. Its original price and wording must stay visible.
    container.querySelectorAll('button[premium-feature] .' + BUTTON_LABEL_CLASS)
      .forEach(label => label.remove());
  }

  function ensureCollectLabel(row) {
    // Decorate only the regular native button. Do not modify the premium
    // Collect now action or its displayed price, including during updates.
    const container = row.querySelector('td.collect')?.querySelector('.collectTributesContainer');
    const button = regularCollectButton(container);
    if (!button) return;
    let label = button.querySelector('.' + BUTTON_LABEL_CLASS);
    if (!label) {
      label = document.createElement('span');
      label.className = BUTTON_LABEL_CLASS;
      label.textContent = 'Collect';
      button.appendChild(label);
    }
  }

  function formatShortTime(seconds) {
    // Round up: never claim 00h00m while tribute collection is still pending.
    const minutes = Math.max(1, Math.ceil(seconds / 60));
    const hours = Math.floor(minutes / 60);
    return String(hours).padStart(2, '0') + 'h' +
      String(minutes % 60).padStart(2, '0') + 'm';
  }

  function describe(data, nowSeconds) {
    const calc = window.APES?.royalTributeEtaMath;
    const status = typeof calc?.readVillageStatus === 'function'
      ? calc.readVillageStatus(data, nowSeconds)
      : { state: 'unknown' };
    switch (status.state) {
      case 'ready': return { text: 'Ready', tone: 'ready', title: 'The game permits collection now.' };
      case 'denied': return { text: 'Denied', tone: 'unavailable', title: 'Collection is not permitted.' };
      case 'on_way': return { text: 'On way', tone: 'in-progress', title: 'Tributes are already in transit.' };
      case 'pending': return { text: 'Pending', tone: 'pending', title: 'Predicted time elapsed; waiting for the game to enable collection.' };
      case 'stalled': return { text: 'Stopped', tone: 'unavailable', title: 'No tribute production is reported.' };
      case 'game_eta':
      case 'estimated':
        if (!Number.isFinite(status.seconds) || status.seconds < 0)
          return { text: '—', tone: 'unavailable', title: 'No valid collection ETA.' };
        return {
          text: formatShortTime(status.seconds),
          tone: status.state === 'estimated' ? 'estimated' : 'countdown',
          title: status.state === 'estimated'
            ? 'Estimate based on hourly tribute production; may change.'
            : 'Game-predicted collection time: ' + new Date(status.at * 1000).toLocaleString()
        };
      default: return { text: '—', tone: 'unavailable', title: 'Tribute time unavailable.' };
    }
  }

  function createTimerCell(row) {
    let cell = row.querySelector('td.' + CELL_CLASS);
    if (!cell) {
      cell = document.createElement('td');
      cell.className = CELL_CLASS;
      row.appendChild(cell);
    }
    return cell;
  }

  function setTimer(cell, data, id, nowSeconds, nativeReady) {
    let label = cell.querySelector('.' + LABEL_CLASS);
    if (!label) {
      label = document.createElement('span');
      label.className = LABEL_CLASS;
      label.setAttribute('aria-live', 'off');
      cell.appendChild(label);
    }
    const state = !data && nativeReady
      ? { text: 'Ready', tone: 'ready', title: 'The native Collect button is enabled.' }
      : describe(data, nowSeconds);
    if (label.textContent !== state.text) label.textContent = state.text;
    if (label.dataset.tone !== state.tone) label.dataset.tone = state.tone;
    if (label.title !== state.title) label.title = state.title;
    if (label.dataset.villageId !== id) label.dataset.villageId = id;
  }

  function headerBadge(head, className, title) {
    let badge = head.querySelector('.' + className);
    if (!badge) {
      badge = document.createElement('span');
      badge.className = className;
      head.insertBefore(badge, head.firstChild);
    }
    badge.title = title;
    return badge;
  }

  function renderHeader(table, count, hourlyTotal, missingRates, kind) {
    const row = table.querySelector('thead tr');
    if (!row) return;
    const heads = row.querySelectorAll('th');
    if (heads.length < 2) return;
    const relation = kind === 'foreign' ? 'foreign-governor' : 'own-governor';
    const countBadge = headerBadge(heads[0], COUNT_CLASS,
      'Connected ' + relation + ' villages under your influence.');
    if (countBadge.textContent !== String(count)) countBadge.textContent = String(count);
    const productionBadge = headerBadge(heads[1], PRODUCTION_CLASS,
      'Total hourly tribute resources from connected ' + relation + ' villages.' +
      (missingRates ? ' Some production rates are unavailable.' : ''));
    const production = (missingRates ? '≥ ' : '') + hourlyTotal.toLocaleString() + ' res/h';
    if (productionBadge.textContent !== production) productionBadge.textContent = production;
    if (!row.querySelector('th.' + HEAD_CLASS)) {
      const header = document.createElement('th');
      header.className = HEAD_CLASS;
      header.textContent = 'ETA';
      header.title = 'Time until tributes can be collected';
      row.appendChild(header);
    }
  }

  function cleanup(table, config) {
    table.closest(config.container)?.classList.remove(ACTIVE_CLASS);
    table.querySelectorAll('.' + COUNT_CLASS + ', .' + PRODUCTION_CLASS +
      ', th.' + HEAD_CLASS + ', td.' + CELL_CLASS +
      ', td.collect .' + LABEL_CLASS + ', .' + BUTTON_LABEL_CLASS).forEach(element => element.remove());
    table.querySelectorAll('.collectTributesContainer.' + TRANSIT_CLASS)
      .forEach(element => element.classList.remove(TRANSIT_CLASS));
    table.querySelectorAll('.' + TRANSIT_PANEL_CLASS)
      .forEach(element => element.classList.remove(TRANSIT_PANEL_CLASS));
  }

  function renderTable(table, config, nowSeconds) {
    table.closest(config.container)?.classList.add(ACTIVE_CLASS);
    const seen = new Set();
    let count = 0, hourlyTotal = 0, missingRates = false;
    for (const row of table.querySelectorAll(config.rows)) {
      const id = villageIdFor(row);
      const oldCell = row.querySelector('td.' + CELL_CLASS);
      if (!id || !isConnected(row)) {
        oldCell?.remove();
        row.querySelectorAll('.' + BUTTON_LABEL_CLASS).forEach(element => element.remove());
        row.querySelectorAll('.' + TRANSIT_PANEL_CLASS)
          .forEach(element => element.classList.remove(TRANSIT_PANEL_CLASS));
        row.querySelectorAll('.' + TRANSIT_CLASS)
          .forEach(element => element.classList.remove(TRANSIT_CLASS));
        continue;
      }
      syncTransitLayout(row);
      ensureCollectLabel(row);
      const data = villageDataFor(id);
      setTimer(createTimerCell(row), data, id, nowSeconds, isNativeReady(row));
      if (seen.has(id)) continue;
      seen.add(id);
      count++;
      const hourly = data?.tributeProduction;
      if (typeof hourly === 'number' && Number.isFinite(hourly) && hourly >= 0)
        hourlyTotal += hourly;
      else missingRates = true;
    }
    renderHeader(table, count, hourlyTotal, missingRates, config.kind);
    // Remove legacy below-button labels in both tables.
    table.querySelectorAll('td.collect .' + LABEL_CLASS).forEach(element => element.remove());
  }

  function tick() {
    const enabled = isEnabled();
    const nowSeconds = Date.now() / 1000;
    for (const config of TABLES) {
      const table = document.querySelector(config.selector);
      if (!table) continue;
      if (!enabled) cleanup(table, config);
      else renderTable(table, config, nowSeconds);
    }
  }

  window.setInterval(tick, 1000);
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', tick, { once: true });
  else tick();
})();