(() => {
  'use strict';

  const feature = 'tradeRouteManager';
  const resources = ['wood', 'clay', 'iron', 'crop'];
  // Travian Kingdoms Town Hall costs, in wood, clay, iron, crop order.
  const celebrationCosts = { small: [3800, 4000, 3030, 9500], big: [16200, 20250, 17500, 47700] };
  const tabs = '.tabTradeRoute .tradeRoute';
  const launcherId = 'qol-trade-route-toggle-btn';
  const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  let panel;
  let running = false;
  let snapshot;
  const account = () => {
    const context = window.APES.context;
    return context.isPlayerResolved() ? context.getServer() + ':' + context.getPlayerId() : null;
  };

  function routeAmount(route, resource) {
    const cell = route.querySelector('.' + resource + 'Value .resourceValue');
    if (!cell) return route.querySelector('.costs .resourceValue') ? 0 : null;
    // Travian wraps displayed resource counts in Unicode direction marks.
    const digits = cell.textContent.replace(/[\p{Cf}\s,.'’]/gu, '');
    return /^\d+$/.test(digits) ? Number(digits) : null;
  }

  function readTiming(route, markers) {
    route.dispatchEvent(new Event('apes_read_trade_route_timing', { bubbles: true }));
    const data = JSON.parse(route.getAttribute('data-apes-route-timing') || '{}');
    route.removeAttribute('data-apes-route-timing');
    const hourAligned = markers.length > 0 && markers.every(marker =>
      marker.parentElement.style.margin.split(' ').every(value => /^(?:0|0px|0%)$/.test(value)) &&
      marker.parentElement.style.margin !== '');
    const single = markers.length > 0 && markers.every(marker =>
      [...marker.childNodes].some(node => node.nodeType === Node.COMMENT_NODE && node.textContent.trim() === 'ngIf: recurrences>1') &&
      ![...marker.childNodes].some(node => node.nodeType === Node.COMMENT_NODE && node.textContent.includes('end ngIf: recurrences>1')));
    const minute = Number.isInteger(data.minutesOffset) && Math.abs(data.minutesOffset) < 60
      ? data.minutesOffset : hourAligned ? 0 : null;
    return {
      minute,
      repeats: [1, 2, 3].includes(data.recurrences) ? data.recurrences : single ? 1 : null,
      travelSeconds: Number.isFinite(data.duration) && data.duration > 0 ? data.duration : null
    };
  }

  function readClock() {
    const text = document.querySelector('#servertime [i18ndt]')?.textContent.replace(/\p{Cf}/gu, '').trim();
    const match = text?.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return null;
    const hours = Number(match[1]);
    if (hours > (match[4] ? 12 : 23) || Number(match[2]) > 59 || Number(match[3] || 0) > 59) return null;
    const adjusted = match[4] ? hours % 12 + (match[4].toUpperCase() === 'PM' ? 12 : 0) : hours;
    return adjusted * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
  }

  function readRoutes(root, source) {
    return [...root.querySelectorAll('.routeContainer')].map(route => {
      const link = route.querySelector('.controlPanel .villageLink[villageid]');
      const target = link?.getAttribute('villageid');
      const active = icon => route.querySelector('.tradeRoute_' + icon + '_small_flat_black')
        ?.closest('.iconButton')?.classList.contains('active');
      const paused = active('pause') && !active('start');
      const markers = [...route.querySelectorAll('.timeline .timeMarker > div[class*="hour-"]')]
        .filter(marker => !marker.closest('.ng-hide, [hidden]'));
      const hours = new Set(markers
        .map(marker => [...marker.classList].find(name => /^hour-\d+$/.test(name)))
        .filter(Boolean));
      const amounts = resources.map(resource => routeAmount(route, resource));
      if (!target || (!paused && (!active('start') || active('pause') || !hours.size || amounts.includes(null)))) {
        throw new Error('Incomplete trade route details');
      }
      const timing = readTiming(route, markers);
      return {
        source, target, paused,
        ...timing,
        destination: link.getAttribute('villagename') || link.textContent.trim() || target,
        hours: [...hours].map(hour => Number(hour.slice(5))).sort((a, b) => a - b),
        shipment: amounts,
        amounts: amounts.map(amount => paused ? 0 : amount * hours.size * (timing.repeats ?? 1) / 24)
      };
    });
  }

  function waitFor(read, check) {
    const deadline = Date.now() + 6500;
    return (async () => {
      while (Date.now() < deadline) {
        check();
        const result = read();
        if (result) return result;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Marketplace view did not finish loading');
    })();
  }

  async function scanVillage(village, villages, readings, check) {
    const hash = '#/page:village/villId:' + village.id;
    await window.APES_CP_VILLAGE_NAVIGATOR.navigate(village, villages);
    check();
    const reading = window.APES.villageResourceProduction?.captureForScan?.(village.id);
    if (reading) readings[village.id] = { ...reading, clock: readClock() };
    const view = await waitFor(() => document.querySelector('#villageView:not(.ng-hide)'), check);
    const hall = view.querySelector('img.location.buildingId24');
    const level = Number(hall?.closest('building-location')?.querySelector('.buildingLevel')?.textContent.trim());
    village.townHall = Number.isInteger(level) && level >= 1 && level <= 20
      ? level : village.townHallLevel ?? (hall || village.hasTownHall ? null : 0);
    const market = view.querySelector('img.location.buildingId17');
    if (!market) return [];
    const slot = market.id.match(/^buildingImage(\d+)$/)?.[1];
    if (!slot) throw new Error('Marketplace slot unavailable');
    const previous = new Set(document.querySelectorAll(tabs));
    const marketHash = hash + '/location:' + slot + '/window:building/tab:TradeRoute';
    location.hash = marketHash;
    return waitFor(() => {
      if (location.hash !== marketHash) return null;
      const tab = [...document.querySelectorAll(tabs)].find(root =>
        !previous.has(root) && !root.closest('.ng-hide, .hiddenTab, [hidden]') &&
        root.closest('.tabTradeRoute.currentTab, .tabTradeRoute.activeTab'));
      if (!tab) return null;
      if (tab.querySelector('[ng-if="tradeRoutes.data.length == 0"]:not(.ng-hide)')) return [];
      if (!tab.querySelector('.routeContainer')) return null;
      try {
        return readRoutes(tab, village.id).map(route => ({ ...route, marketHash }));
      } catch {
        return null;
      }
    }, check);
  }

  function plannedCelebrations() {
    try { return JSON.parse(localStorage.getItem('qol_trade_celebrations:' + account())) || {}; }
    catch { return {}; }
  }

  function formatDuration(seconds) {
    return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
      .map(value => String(value).padStart(2, '0')).join(':');
  }

  function celebrationPlan(cell, village, plans) {
    const bigAllowed = village.townHall >= 10;
    const selected = plans[village.id];
    const type = (selected === 'small' && village.townHall !== 0) || (selected === 'big' && bigAllowed)
      ? selected : 'none';
    const controls = document.createElement('div');
    controls.className = 'qol-route-celebrations';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Plan celebration for ' + village.name);
    for (const [value, label, disabled] of [
      ['none', 'None', false], ['small', 'Small', village.townHall === 0], ['big', 'Big', !bigAllowed]
    ]) {
      const button = document.createElement('div');
      button.className = 'qol-wl-action-btn ' + (value === type ? 'primary' : 'secondary');
      button.setAttribute('role', 'button');
      button.setAttribute('aria-disabled', String(disabled));
      button.setAttribute('aria-pressed', String(value === type));
      button.tabIndex = disabled ? -1 : 0;
      button.dataset.celebration = value;
      button.textContent = label;
      if (disabled && value === 'big') button.title = 'Requires a verified Town Hall level of 10 or higher';
      button.addEventListener('click', () => {
        const key = account();
        if (disabled || !key || key !== snapshot?.account) return;
        const next = plannedCelebrations();
        next[village.id] = value;
        try { localStorage.setItem('qol_trade_celebrations:' + key, JSON.stringify(next)); }
        catch {
          panel.querySelector('[role="status"]').textContent = 'Could not save the celebration plan.';
          return;
        }
        const index = cell.parentElement.sectionRowIndex;
        render();
        panel.querySelector('[data-route-balances] tbody').rows[index]
          ?.querySelector(`[data-celebration="${value}"]`)?.focus();
      });
      controls.append(button);
    }
    cell.append(controls);
    const costs = celebrationCosts[type];
    if (!costs) return null;
    const { dataset } = document.documentElement;
    const speed = Number(dataset.apesCpWorldSpeed || dataset.apesWorldSpeed);
    const duration = speed > 0 ? window.APES.celebrationDurationSeconds?.(village.townHall, type, speed) : null;
    const note = document.createElement('small');
    note.textContent = duration ? formatDuration(duration) + ' per celebration' :
      village.townHall == null ? 'Town Hall level unverified' : 'Duration unavailable';
    cell.append(note);
    return { costs, duration };
  }

  function render() {
    const body = panel.querySelector('[data-route-balances] tbody');
    body.replaceChildren();
    renderRoutes();
    if (!snapshot || snapshot.account !== account()) return;
    const complete = snapshot.failed.length === 0;
    const unread = new Set(snapshot.failed.map(village => village.id));
    const plans = plannedCelebrations();
    for (const village of snapshot.villages) {
      const row = body.insertRow();
      row.insertCell().textContent = village.name;
      const celebrationCell = document.createElement('td');
      const plan = celebrationPlan(celebrationCell, village, plans);
      const reading = snapshot.readings[village.id];
      const clock = reading?.clock;
      const forecast = window.APES.tradeRouteForecast;
      const end = Number(village.celebrationEnd);
      const endMs = end < 1e11 ? end * 1000 : end;
      const untilEnd = Math.ceil((endMs - reading?.capturedAt) / 1000);
      const firstQueue = untilEnd > 0 ? untilEnd : plan?.duration;
      const timing = plan?.duration && Number.isFinite(clock) && !unread.has(village.id)
        ? forecast.eventsForVillage(snapshot.routes, village.id, clock, firstQueue + plan.duration * 2) : null;
      if (plan?.duration) {
        const note = document.createElement('small');
        note.textContent = !timing || timing.unknownOutgoing ? 'Shipment timing unavailable'
          : 'First queue check in ' + formatDuration(firstQueue) +
            (timing.unknownIncoming || !complete ? ' · Some imports excluded' : '');
        celebrationCell.append(note);
      }
      resources.forEach((resource, index) => {
        const base = reading?.production?.[resource];
        let incoming = 0;
        let outgoing = 0;
        for (const route of snapshot.routes) {
          if (route.target === village.id) incoming += route.amounts[index];
          if (route.source === village.id) outgoing += route.amounts[index];
        }
        const cell = row.insertCell();
        const outgoingKnown = !unread.has(village.id) && !snapshot.routes.some(route =>
          route.source === village.id && !route.paused && route.repeats === null);
        const incomingKnown = complete && !snapshot.routes.some(route =>
          route.target === village.id && !route.paused && route.repeats === null);
        const net = Number.isFinite(base) && outgoingKnown ? base + incoming - outgoing : null;
        const value = document.createElement('strong');
        value.textContent = net === null ? '—' : (incomingKnown ? '' : '≥') + number.format(net);
        if (incomingKnown && net < 0) value.className = 'qol-route-deficit';
        const details = document.createElement('small');
        details.textContent = 'Base ' + (Number.isFinite(base) ? number.format(base) : '—') +
          ' · In ' + (incomingKnown ? number.format(incoming) : incoming ? '≥' + number.format(incoming) : '—') +
          ' · Out ' + (outgoingKnown ? number.format(outgoing) : '—');
        cell.append(value, details);
        if (plan) {
          const cost = plan.costs[index];
          const reserve = document.createElement('small');
          reserve.textContent = 'Cost: ' + number.format(cost) + ' per celebration';
          cell.append(reserve);
          const stock = reading?.stock?.[resource];
          if (stock) {
            const stockNote = document.createElement('small');
            stockNote.textContent = stock.capacity < cost
              ? 'Storage too small by ' + number.format(cost - stock.capacity)
              : 'Stock at scan: ' + number.format(stock.amount);
            if (stock.capacity < cost || stock.amount < cost) stockNote.className = 'qol-route-deficit';
            cell.append(stockNote);
          }
          if (timing && !timing.unknownOutgoing && (!stock || stock.capacity >= cost)) {
            const result = forecast.forecastResource({
              stock, rate: base, cost, cycle: plan.duration, firstQueue, shipments: timing.events, index
            });
            renderForecast(cell, result, timing.events, index, reading.capturedAt,
              incomingKnown ? net : null, cost * 3600 / plan.duration);
          }
        }
      });
      row.insertCell().textContent = village.townHall === 0 ? 'None' : village.townHall ?? '—';
      row.append(celebrationCell);
    }
  }

  function renderForecast(cell, result, events, index, capturedAt, net, required) {
    const guidance = document.createElement('small');
    cell.append(guidance);
    if (!result) {
      guidance.textContent = 'Stock or production unavailable';
      return;
    }
    if (!result.failure) {
      guidance.textContent = 'Next 3 celebrations funded';
      if (net !== null && net < required) guidance.textContent += ' · Long-term reserve shrinks';
      return;
    }
    const { at, kind, short, queue } = result.failure;
    const time = new Date(capturedAt + at * 1000).toLocaleString();
    const label = kind === 'celebration' ? 'Celebration ' + queue : kind === 'export' ? 'Shipment' : 'Stock';
    guidance.className = 'qol-route-deficit';
    guidance.textContent = label + ' short ' + number.format(Math.ceil(short)) + ' · ' + time;
    if (result.fraction === null) {
      const note = document.createElement('small');
      note.textContent = 'Need more stock or income even with exports stopped';
      cell.append(note);
      return;
    }
    const exports = new Set(events.filter(event => event.kind === 'export').map(event => event.route));
    for (const route of exports) {
      const current = route.shipment[index];
      const limit = Math.floor(current * result.fraction);
      if (limit >= current) continue;
      const note = document.createElement('small');
      note.textContent = 'To ' + route.destination + ': ' + number.format(current) + ' → ' +
        number.format(limit) + ' per shipment';
      cell.append(note);
    }
  }

  function renderRoutes() {
    const body = panel.querySelector('[data-route-list] tbody');
    body.replaceChildren();
    if (!snapshot || snapshot.account !== account()) return;
    const names = new Map(snapshot.villages.map(village => [village.id, village.name]));
    const filter = panel.querySelector('[data-route-filter]').value.trim().toLocaleLowerCase();
    const routes = [...snapshot.routes].sort((a, b) =>
      names.get(a.source).localeCompare(names.get(b.source)) || a.destination.localeCompare(b.destination));
    for (const route of routes) {
      const source = names.get(route.source);
      if (!`${source} ${route.destination}`.toLocaleLowerCase().includes(filter)) continue;
      const row = body.insertRow();
      const departures = route.hours.map(hour => {
        if (route.minute === null) return String(hour).padStart(2, '0') + ':??';
        const time = (hour * 60 + route.minute + 1440) % 1440;
        return String(Math.floor(time / 60)).padStart(2, '0') + ':' + String(time % 60).padStart(2, '0');
      }).join(', ');
      const shipment = route.shipment.map((amount, index) => amount > 0
        ? resources[index] + ' ' + number.format(amount) : '').filter(Boolean).join(' · ');
      for (const value of [source, route.destination, shipment || '—', departures || '—',
        route.paused ? 'Paused' : 'Active']) row.insertCell().textContent = value;
      const edit = document.createElement('div');
      edit.className = 'qol-wl-action-btn secondary';
      edit.setAttribute('role', 'button');
      edit.tabIndex = 0;
      edit.textContent = 'Open Marketplace';
      edit.addEventListener('click', () => {
        if (running || snapshot?.account !== account()) return;
        panel.close();
        location.hash = route.marketHash;
      });
      row.insertCell().append(edit);
    }
    if (!body.rows.length) {
      const cell = body.insertRow().insertCell();
      cell.colSpan = 6;
      cell.textContent = filter ? 'No matching routes.' : 'No routes found in the scanned villages.';
    }
  }

  async function scan() {
    if (running) return;
    const key = account();
    const status = panel.querySelector('[role="status"]');
    if (!key) {
      status.textContent = 'Account information is still loading.';
      return;
    }
    const original = location.hash;
    const scanControl = panel.querySelector('[data-route-scan]');
    const check = () => {
      if (account() !== key || !window.isQolEnabled(feature) || !panel.open)
        throw new Error('Scan interrupted.');
    };
    running = true;
    scanControl.setAttribute('aria-disabled', 'true');
    try {
      status.textContent = 'Reading villages…';
      const owned = await window.APES_CP_VILLAGE_NAVIGATOR.getOwnedVillages();
      // The shared navigator returns frozen village records.
      const villages = owned.map(village => ({ ...village, townHall: village.townHallLevel ?? null }));
      const routes = [];
      const failed = [];
      const readings = {};
      for (const [index, village] of villages.entries()) {
        check();
        status.textContent = `Scanning ${index + 1}/${villages.length} · ${village.name}`;
        try { routes.push(...await scanVillage(village, villages, readings, check)); }
        catch (error) {
          check();
          failed.push(village);
          console.warn('[APES Trade Routes]', village.name, error);
        }
      }
      snapshot = { account: key, villages, routes, failed, readings };
      render();
      status.textContent = failed.length
        ? 'Partial scan. Some trade balances are unknown. Could not read: ' + failed.map(village => village.name).join(', ')
        : 'Scan complete. A dash means production could not be read.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      if (account() === key && location.hash !== original) location.hash = original;
      scanControl.setAttribute('aria-disabled', 'false');
      running = false;
    }
  }

  function open() {
    if (!window.isQolEnabled(feature)) return;
    if (panel?.open) return;
    window.APES?.ui?.closeOtherTools(feature);
    if (!panel) {
      panel = document.createElement('dialog');
      panel.className = 'qol-simple-trade-routes';
      panel.setAttribute('aria-label', 'Trade Route Manager');
      panel.innerHTML = `
        <header class="qol-simple-routes-heading"><h2>Trade Route Manager</h2>
          <div class="qol-wl-action-btn primary" role="button" tabindex="0" data-route-scan>Scan trade routes</div>
          <div class="qol-wl-action-btn secondary" role="button" tabindex="0" data-route-close>Close</div>
        </header>
        <p>Forecasts check three celebration deadlines. The first is at the end of the active celebration, or one cycle after the scan if no end time is known. They assume steady production and scheduled deliveries. Other queued celebrations, deliveries already in transit and other spending are excluded. Suggested shipment amounts apply together for one village.</p>
        <p role="status">Scan trade routes to calculate village balances.</p>
        <div class="qol-simple-routes-table" data-route-balances><table>
          <thead><tr><th>Village</th><th>Wood / h</th><th>Clay / h</th><th>Iron / h</th><th>Crop / h</th><th>Town Hall</th><th>Plan Celebration</th></tr></thead>
          <tbody></tbody>
        </table></div>
        <h3>Trade routes</h3>
        <label>Filter by village <input type="search" data-route-filter></label>
        <div class="qol-simple-routes-table" data-route-list><table>
          <thead><tr><th>From</th><th>To</th><th>Per shipment</th><th>Departures</th><th>Status</th><th>Manage</th></tr></thead>
          <tbody></tbody>
        </table></div>`;
      panel.querySelector('[data-route-scan]').addEventListener('click', scan);
      panel.querySelector('[data-route-close]').addEventListener('click', () => panel.close());
      panel.querySelector('[data-route-filter]').addEventListener('input', renderRoutes);
      document.body.append(panel);
    }
    render();
    panel.showModal();
  }

  const launcher = document.createElement('div');
  launcher.id = launcherId;
  launcher.title = 'Trade Route Manager';
  launcher.setAttribute('aria-label', launcher.title);
  launcher.setAttribute('role', 'button');
  launcher.tabIndex = 0;
  launcher.innerHTML = '<svg class="qol-feature-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 8h16m-5-5 5 5-5 5m5 3H4m5-5-5 5 5 5"/></svg>';
  launcher.addEventListener('click', open);
  document.body.append(launcher);
  window.qolRepositionAllButtons?.();
  document.addEventListener('keydown', event => {
    const control = event.target.closest?.('#' + launcherId + ', .qol-simple-trade-routes [role="button"]');
    if (!control || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) control.click();
  }, true);
  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key === feature && !window.isQolEnabled(feature)) panel?.close();
  });
  window.addEventListener('qol_close_others', event => {
    if (event.detail?.source !== feature) panel?.close();
  });
})();
