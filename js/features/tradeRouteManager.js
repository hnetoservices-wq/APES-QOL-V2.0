(() => {
  'use strict';

  const feature = 'tradeRouteManager';
  const resources = ['wood', 'clay', 'iron', 'crop'];
  const tabs = '.tabTradeRoute .tradeRoute, .tabTradeRoute .tradeRoutes';
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
    const digits = cell.textContent.trim().replace(/[\s,.'’]/g, '');
    return /^\d+$/.test(digits) ? Number(digits) : null;
  }

  function readRoutes(root, source) {
    return [...root.querySelectorAll('.routeContainer')].map(route => {
      const link = route.querySelector('.controlPanel .villageLink[villageid]');
      const target = link?.getAttribute('villageid');
      const active = icon => route.querySelector('.tradeRoute_' + icon + '_small_flat_black')
        ?.closest('.iconButton')?.classList.contains('active');
      const paused = active('pause') && !active('start');
      const hours = new Set([...route.querySelectorAll('.timeline .timeMarker > div[class*="hour-"]')]
        .filter(marker => !marker.closest('.ng-hide, [hidden]'))
        .map(marker => [...marker.classList].find(name => /^hour-\d+$/.test(name)))
        .filter(Boolean));
      const amounts = resources.map(resource => routeAmount(route, resource));
      if (!target || (!paused && (!active('start') || active('pause') || !hours.size || amounts.includes(null)))) {
        throw new Error('Incomplete trade route details');
      }
      return {
        source, target, paused,
        destination: link.getAttribute('villagename') || link.textContent.trim() || target,
        hours: [...hours].map(hour => Number(hour.slice(5))).sort((a, b) => a - b),
        amounts: amounts.map(amount => paused ? 0 : amount * hours.size / 24)
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
    readings[village.id] = window.APES.villageResourceProduction?.captureForScan?.(village.id)?.production;
    const view = await waitFor(() => document.querySelector('#villageView:not(.ng-hide)'), check);
    const market = view.querySelector('img.location.buildingId17');
    if (!market) return [];
    const slot = market.id.match(/^buildingImage(\d+)$/)?.[1];
    if (!slot) throw new Error('Marketplace slot unavailable');
    const previous = new Set(document.querySelectorAll(tabs));
    location.hash = hash + '/location:' + slot + '/window:building/tab:TradeRoute';
    const tab = await waitFor(() => [...document.querySelectorAll(tabs)].find(root =>
      !previous.has(root) && !root.closest('.ng-hide, .hiddenTab, [hidden]') &&
      root.closest('.tabTradeRoute.currentTab, .tabTradeRoute.activeTab')), check);
    await new Promise(resolve => setTimeout(resolve, 350));
    check();
    if (!tab.isConnected || !location.hash.startsWith(hash + '/')) throw new Error('Marketplace view changed');
    return readRoutes(tab, village.id).map(route => ({ ...route, marketHash: location.hash }));
  }

  function render() {
    const body = panel.querySelector('[data-route-balances] tbody');
    body.replaceChildren();
    renderRoutes();
    if (!snapshot || snapshot.account !== account()) return;
    const complete = snapshot.failed.length === 0;
    for (const village of snapshot.villages) {
      const row = body.insertRow();
      row.insertCell().textContent = village.name;
      resources.forEach((resource, index) => {
        const base = snapshot.readings[village.id]?.[resource];
        let incoming = 0;
        let outgoing = 0;
        for (const route of snapshot.routes) {
          if (route.target === village.id) incoming += route.amounts[index];
          if (route.source === village.id) outgoing += route.amounts[index];
        }
        const cell = row.insertCell();
        const net = Number.isFinite(base) && complete ? base + incoming - outgoing : null;
        const value = document.createElement('strong');
        value.textContent = net === null ? '—' : number.format(net);
        if (net < 0) value.className = 'qol-route-deficit';
        const details = document.createElement('small');
        details.textContent = 'Base ' + (Number.isFinite(base) ? number.format(base) : '—') +
          ' · In ' + number.format(incoming) + ' · Out ' + number.format(outgoing);
        cell.append(value, details);
      });
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
      for (const value of [source, route.destination,
        route.hours.map(hour => String(hour).padStart(2, '0') + ':00').join(', ') || '—',
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
      cell.colSpan = 5;
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
      const villages = await window.APES_CP_VILLAGE_NAVIGATOR.getOwnedVillages();
      const routes = [];
      const failed = [];
      const readings = {};
      for (const [index, village] of villages.entries()) {
        check();
        status.textContent = `Scanning ${index + 1}/${villages.length} · ${village.name}`;
        try { routes.push(...await scanVillage(village, villages, readings, check)); }
        catch (error) {
          check();
          failed.push(village.name);
          console.warn('[APES Trade Routes]', village.name, error);
        }
      }
      snapshot = { account: key, villages, routes, failed, readings };
      render();
      status.textContent = failed.length
        ? 'Partial scan. Net rates unavailable. Could not read: ' + failed.join(', ')
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
        <p>Hourly balance = production + scheduled imports − scheduled exports.</p>
        <p role="status">Scan trade routes to calculate village balances.</p>
        <div class="qol-simple-routes-table" data-route-balances><table>
          <thead><tr><th>Village</th><th>Wood / h</th><th>Clay / h</th><th>Iron / h</th><th>Crop / h</th></tr></thead>
          <tbody></tbody>
        </table></div>
        <h3>Trade routes</h3>
        <label>Filter by village <input type="search" data-route-filter></label>
        <div class="qol-simple-routes-table" data-route-list><table>
          <thead><tr><th>From</th><th>To</th><th>Departures</th><th>Status</th><th>Manage</th></tr></thead>
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
