(() => {
  'use strict';

  const feature = 'tradeRouteManager';
  const rootSelector = '.tabTradeRoute .tradeRoute, .tabTradeRoute .tradeRoutes';
  const labels = [['wood', 'Wood'], ['clay', 'Clay'], ['iron', 'Iron'], ['crop', 'Crop']];
  let root;
  let panel;
  let compact = true;
  let actions = [];
  let frame;
  let signature;
  const observer = new MutationObserver(records => {
    if (records.some(record => !panel?.contains(record.target))) schedule();
  });

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function findControl(route, icon) {
    return route.querySelector('.tradeRoute_' + icon + '_small_flat_black')?.closest('.iconButton');
  }

  function routeData(route) {
    const target = route.querySelector('.controlPanel .villageLink[villageid]');
    if (!target) return null;
    const start = findControl(route, 'start');
    const pause = findControl(route, 'pause');
    const active = start?.classList.contains('active') ? true :
      pause?.classList.contains('active') ? false : null;
    const action = active === true ? pause : active === false ? start : null;
    const times = [...route.querySelectorAll('.timeline .timeMarker > div[class*="hour-"]')]
      .filter(marker => !marker.closest('.ng-hide, [hidden]'))
      .map(marker => [...marker.classList].find(name => /^hour-\d+$/.test(name)))
      .filter(Boolean)
      .map(name => Number(name.slice(5)))
      .sort((first, second) => first - second)
      .map(hour => String(hour).padStart(2, '0') + ':00');
    return {
      destination: target.getAttribute('villagename') || target.textContent.trim(),
      resources: labels.map(([key]) => route.querySelector('.' + key + 'Value .resourceValue')?.textContent.trim() || '—'),
      active,
      times: [...new Set(times)],
      action: action?.matches('.disabled, [disabled], [aria-disabled="true"], .ng-hide') ? null : action
    };
  }

  function control(label, action, style = 'secondary') {
    const button = document.createElement('div');
    button.className = 'qol-wl-action-btn ' + style;
    button.setAttribute('role', 'button');
    button.tabIndex = 0;
    button.dataset.qolRouteAction = action;
    button.textContent = label;
    return button;
  }

  function detach() {
    root?.classList.remove('qol-routes-compact');
    panel?.remove();
    panel = null;
    root = null;
    actions = [];
    signature = undefined;
  }

  function render() {
    frame = undefined;
    const next = window.isQolEnabled(feature)
      ? [...document.querySelectorAll(rootSelector)].find(element =>
        !element.closest('.ng-hide, .hiddenTab, [hidden]') &&
        element.querySelector('.routeContainer'))
      : null;
    if (next !== root) {
      detach();
      if (!next) return;
      root = next;
      panel = document.createElement('section');
      panel.className = 'qol-simple-trade-routes';
      panel.addEventListener('click', activate);
      panel.addEventListener('keydown', event => {
        const button = event.target.closest('[data-qol-route-action]');
        if (!button || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) button.click();
      });
      root.before(panel);
    }
    if (!panel) return;

    const cards = [...root.querySelectorAll('.routeContainer')];
    const routes = cards.map(routeData).filter(Boolean);
    const showList = compact && routes.length > 0 && routes.length === cards.length;
    root.classList.toggle('qol-routes-compact', showList);
    actions = routes.map(route => route.action);
    const state = JSON.stringify([showList, routes.length === cards.length, routes.map(({ action, ...route }) => ({ ...route, actionable: Boolean(action) }))]);
    if (state === signature) return;
    signature = state;

    const heading = document.createElement('div');
    heading.className = 'qol-simple-routes-heading';
    const title = document.createElement('strong');
    title.textContent = 'Trade Route Manager';
    heading.append(title);
    if (routes.length && routes.length === cards.length) {
      heading.append(control(showList ? 'Show game controls' : 'Show compact list', 'view'));
    }
    panel.replaceChildren(heading);
    if (!showList) return;

    const table = document.createElement('table');
    const header = table.createTHead().insertRow();
    for (const label of ['Destination', ...labels.map(([, label]) => label), 'Departures', 'Status', 'Actions']) {
      const cell = document.createElement('th');
      cell.scope = 'col';
      cell.textContent = label;
      header.append(cell);
    }
    const body = table.createTBody();
    routes.forEach((route, index) => {
      const row = body.insertRow();
      for (const value of [route.destination, ...route.resources, route.times.join(', ') || '—',
        route.active === null ? '—' : route.active ? 'Active' : 'Paused']) {
        row.insertCell().textContent = value;
      }
      const cell = row.insertCell();
      if (route.action) cell.append(control(route.active ? 'Pause' : 'Resume', String(index)));
    });
    const wrap = document.createElement('div');
    wrap.className = 'qol-simple-routes-table';
    wrap.append(table);
    panel.append(wrap);
  }

  function activate(event) {
    const button = event.target.closest('[data-qol-route-action]');
    if (!button) return;
    event.stopPropagation();
    const action = button.dataset.qolRouteAction;
    if (action === 'view') {
      compact = !compact;
      render();
      panel?.querySelector('[data-qol-route-action="view"]')?.focus();
      return;
    }
    const native = actions[Number(action)];
    if (native?.isConnected) native.click();
    schedule();
  }

  function syncSetting() {
    observer.disconnect();
    if (window.isQolEnabled(feature)) {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['class', 'hidden', 'disabled', 'aria-disabled'] });
    }
    schedule();
  }

  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key === feature) syncSetting();
  });
  window.addEventListener('storage', event => {
    if (event.key === 'qol_' + feature) syncSetting();
  });
  syncSetting();
})();
