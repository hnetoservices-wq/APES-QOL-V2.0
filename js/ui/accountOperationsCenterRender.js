(() => {
  'use strict';

  const A = window.APES_AOC_INTERNAL;
  const D = A?.data;
  if (!D) return;

  const R = A.rendering = {};
  const SORTS = new Set(['order', 'attention', 'nextEvent', 'construction', 'storage', 'population', 'alphabetical']);
  let search = '';
  let sortMode = readSort();
  let expandedVillageId = '';

  const byId = id => document.getElementById(id);

  function readSort() {
    try {
      const value = localStorage.getItem(`apes_aoc_sort:${location.hostname}`);
      return SORTS.has(value) ? value : 'order';
    } catch (_) {
      return 'order';
    }
  }

  function saveSort(value) {
    sortMode = SORTS.has(value) ? value : 'order';
    try { localStorage.setItem(`apes_aoc_sort:${location.hostname}`, sortMode); } catch (_) {}
  }

  function control(className, attrs, html) {
    return `<div class="${className}" role="button" tabindex="0" ${attrs || ''}>${html}</div>`;
  }

  function timedSmall(time, prefix = '', className = '') {
    if (!Number.isFinite(Number(time))) return '';
    return `<small class="apes-aoc2-countdown ${className}" data-time="${Number(time)}" data-prefix="${D.esc(prefix)}">${D.esc(prefix)}${D.esc(D.duration(Number(time) - Date.now()))}</small>`;
  }

  function cell(primary, secondary = '', time = null, timePrefix = '', extraClass = '') {
    return `<div class="apes-aoc2-stack ${extraClass}"><strong>${D.esc(primary)}</strong>${secondary ? `<small>${D.esc(secondary)}</small>` : ''}${time ? timedSmall(time, timePrefix) : ''}</div>`;
  }

  function buildLabel(item) {
    return `${item.label}${item.level !== null ? ` → ${item.level}` : ''}`;
  }

  function constructionHtml(ins) {
    if (!ins.build.length) return '<span class="apes-aoc2-idle">Idle</span>';
    const now = Date.now();
    return `<div class="apes-aoc2-stack">${ins.build.slice(0, 2).map(item => {
      const free = item.end && item.end > now && item.end - now <= D.FREE_FINISH_MS;
      const status = item.waiting ? 'Queued' : '';
      return `<span><strong class="${free ? 'ready' : ''}">${D.esc(buildLabel(item))}</strong>${status ? `<small>${status}</small>` : ''}${item.end ? timedSmall(item.end, '', free ? 'ready' : '') : ''}</span>`;
    }).join('')}${ins.build.length > 2 ? `<small>+${ins.build.length - 2} queued</small>` : ''}</div>`;
  }

  function trainingBuildings(village) {
    return D.scanFor(village.villageId)?.trainingBuildings || [];
  }

  function trainingHtml(village, train) {
    if (!train.active) return '<span class="apes-aoc2-idle">Idle</span>';
    if (train.entries?.length) {
      const rows = train.entries.slice(0, 2).map(entry => {
        const unit = entry.unitName || (entry.unitId !== null ? `Unit ${entry.unitId}` : 'units');
        const amount = entry.amount > 0 ? D.int(entry.amount) : '';
        const primary = [entry.buildingLabel, amount && `${amount} ${unit}`].filter(Boolean).join(' · ') || 'Training active';
        return `<span><strong>${D.esc(primary)}</strong>${entry.end ? timedSmall(entry.end) : ''}</span>`;
      }).join('');
      return `<div class="apes-aoc2-stack">${rows}${train.entries.length > 2 ? `<small>+${train.entries.length - 2} queue entries</small>` : ''}${!train.entries.some(entry => entry.end) && train.end ? timedSmall(train.end) : ''}</div>`;
    }
    const buildings = trainingBuildings(village).map(entry => entry.label);
    const primary = buildings.length ? buildings.slice(0, 2).join(' + ') : 'Training active';
    const secondary = train.count ? `${D.int(train.count)} queued` : '';
    return cell(primary, secondary, train.end);
  }

  function smithyHtml(smith) {
    if (!smith.active) return '<span class="apes-aoc2-idle">Ready</span>';
    const entry = smith.entries?.[0];
    const primary = entry
      ? `${entry.unitName || (entry.unitId !== null ? `Unit ${entry.unitId}` : 'Upgrade')}${entry.level !== null ? ` → ${entry.level}` : ''}`
      : 'Upgrade active';
    return cell(primary, '', smith.end);
  }

  function celebrationHtml(party) {
    if (party.active) return cell(party.label, '', party.end);
    if (party.hasTownHall) return '<span class="apes-aoc2-status ready">Ready</span>';
    return '<span class="apes-aoc2-idle">No Town Hall</span>';
  }

  function resourceTitle(resources) {
    return resources.map(resource => `${resource.name}: ${D.int(resource.current)} / ${D.int(resource.capacity)} · ${D.signed(resource.production)}/h · ${resource.direction === 'empty' ? 'empty' : 'full'} ${D.duration(resource.eta)}`).join('\n');
  }

  function resourcesHtml(village) {
    const resources = D.projected(village);
    if (!resources.length) return '<span class="apes-aoc2-idle">Visit village to capture</span>';
    const warehouse = resources.filter(resource => resource.key !== 'crop').sort((left, right) => right.percent - left.percent)[0];
    const crop = resources.find(resource => resource.key === 'crop');
    const risk = D.resourceRisk(resources);
    const cropClass = crop?.production < 0 ? 'danger' : '';
    const riskClass = risk && (risk.eta <= D.RESOURCE_WARNING_MS || risk.percent >= 100) ? (risk.eta <= 60 * 60 * 1000 || risk.percent >= 100 ? 'danger' : 'warn') : '';
    const riskLine = risk && risk.eta <= D.RESOURCE_EVENT_MS
      ? `<small class="apes-aoc2-resource-risk ${riskClass}">${D.esc(`${risk.name} ${risk.direction}`)} · <span class="apes-aoc2-countdown" data-time="${Date.now() + risk.eta}" data-prefix="">${D.esc(D.duration(risk.eta))}</span></small>`
      : '';
    return `<div class="apes-aoc2-stack apes-aoc2-resource-summary" title="${D.esc(resourceTitle(resources))}"><strong>W ${warehouse?.percent ?? 0}% · G ${crop?.percent ?? 0}%</strong>${crop ? `<small class="${cropClass}">Crop ${D.signed(crop.production)}/h</small>` : ''}${riskLine}</div>`;
  }

  function trackedBuildings(village) {
    const scan = D.scanFor(village.villageId);
    return scan?.buildings?.length ? scan.buildings : D.TRACKED.map(definition => {
      const building = (village.buildings || []).find(entry => Number(entry.buildingType) === definition.type);
      return building ? { ...definition, location: D.num(building.locationId), level: D.num(building.lvl) } : null;
    }).filter(Boolean);
  }

  function buildingsHtml(village) {
    const entries = trackedBuildings(village);
    if (!entries.length) return '<span class="apes-aoc2-idle">None found</span>';
    const title = entries.map(entry => `${entry.label}${entry.level !== null ? ` ${entry.level}` : ''}`).join(' · ');
    const visible = entries.slice(0, 2).map(entry => control(
      'apes-aoc2-building apes-aoc2-control',
      `data-building-village-id="${D.esc(village.villageId)}" data-building-location="${entry.location ?? ''}"`,
      `${D.esc(entry.label)}${entry.level !== null ? ` <b>${entry.level}</b>` : ''}`
    )).join('');
    return `<div class="apes-aoc2-building-list" title="${D.esc(title)}">${visible}${entries.length > 2 ? `<span class="apes-aoc2-building-more">+${entries.length - 2}</span>` : ''}</div>`;
  }

  function attentionHtml(ins) {
    if (!ins.alerts.length) return '<span class="apes-aoc2-status ready">All good</span>';
    const visible = ins.alerts.slice(0, 3);
    return `<div class="apes-aoc2-attention" title="${D.esc(ins.alerts.map(alert => alert[0]).join(' · '))}">${visible.map(alert => `<span class="apes-aoc2-status ${alert[1]} ${alert[3] ? 'actionable' : 'informational'}">${D.esc(alert[0])}</span>`).join('')}${ins.alerts.length > 3 ? `<span class="apes-aoc2-more">+${ins.alerts.length - 3}</span>` : ''}</div>`;
  }

  function models() {
    const list = (D.snapshot.villages || []).map((village, index) => ({ village, index, ins: D.insight(village) }));
    const finite = value => Number.isFinite(value) ? value : Infinity;
    list.sort((left, right) => {
      if (sortMode === 'attention') return Number(right.ins.needsAttention) - Number(left.ins.needsAttention) || right.ins.score - left.ins.score || left.index - right.index;
      if (sortMode === 'nextEvent') return finite(left.ins.next) - finite(right.ins.next) || left.index - right.index;
      if (sortMode === 'construction') return finite(left.ins.construction) - finite(right.ins.construction) || left.index - right.index;
      if (sortMode === 'storage') return finite(left.ins.storage) - finite(right.ins.storage) || left.index - right.index;
      if (sortMode === 'population') return (Number(right.village.population) || 0) - (Number(left.village.population) || 0) || left.index - right.index;
      if (sortMode === 'alphabetical') return String(left.village.name || '').localeCompare(String(right.village.name || ''), undefined, { numeric: true, sensitivity: 'base' });
      return left.index - right.index;
    });
    if (!search) return list;
    const query = search.toLowerCase();
    return list.filter(({ village }) => `${village.name || ''} ${village.x ?? ''}|${village.y ?? ''}`.toLowerCase().includes(query));
  }

  function renderOverview(all) {
    const target = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc2-overview-metrics`);
    if (!target) return;
    const population = all.reduce((sum, model) => sum + (Number(model.village.population) || 0), 0);
    const attention = all.filter(model => model.ins.needsAttention).length;
    const free = all.reduce((sum, model) => sum + model.ins.free, 0);
    const next = all.flatMap(model => model.ins.events).filter(event => event.at >= Date.now()).sort((left, right) => left.at - right.at)[0]?.at;
    const rows = [
      ['⌂', D.int(all.length), 'Villages'],
      ['●', D.int(population), 'Population'],
      ['!', D.int(attention), 'Needs Attention'],
      ['✓', D.int(free), 'Free Finishes'],
      ['◷', next ? D.duration(next - Date.now()) : '—', 'Next Event']
    ];
    target.innerHTML = rows.map((row, index) => `<div class="apes-aoc2-metric ${index === 2 && attention ? 'warn' : ''} ${index === 3 && free ? 'ready' : ''}"><span>${row[0]}</span><strong>${D.esc(row[1])}</strong><small>${row[2]}</small></div>`).join('');
  }

  function renderEvents(all) {
    const target = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc-events-list`);
    if (!target) return;
    const alarmNodes = [...target.querySelectorAll('[data-apes-building-alarm-event]')];
    const now = Date.now();
    const events = all.flatMap(model => model.ins.events).filter(event => event.at >= now - 1000).sort((left, right) => left.at - right.at).slice(0, 7);
    target.innerHTML = events.length
      ? events.map(event => `<div class="apes-aoc-event" role="button" tabindex="0" data-event-village-id="${D.esc(event.id)}"><strong>${event.at <= now + 1000 ? 'NOW' : new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</strong><span>${D.esc(event.name)} — ${D.esc(event.label)}</span><small class="apes-aoc-event-countdown" data-event-ms="${event.at}">${D.esc(D.duration(event.at - now))}</small></div>`).join('')
      : '<span class="apes-aoc-events-empty">No upcoming account events found.</span>';
    alarmNodes.forEach(node => target.appendChild(node));
  }

  function renderFreshness(all) {
    const target = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc2-freshness`);
    if (!target) return;
    if (!D.snapshot.generatedAt) {
      target.textContent = 'Waiting for live data';
      return;
    }
    const stale = all.filter(model => {
      const timestamp = Number(D.scanFor(model.village.villageId)?.scannedAt);
      return !Number.isFinite(timestamp) || Date.now() - timestamp > D.STALE_MS;
    }).length;
    target.textContent = stale
      ? `Live · ${stale} resource snapshot${stale === 1 ? '' : 's'} stale/missing`
      : 'Live · resource data current';
  }

  function detailList(items, empty = 'None') {
    return items.length ? `<div class="apes-aoc2-detail-list">${items.join('')}</div>` : `<span class="apes-aoc2-idle">${D.esc(empty)}</span>`;
  }

  function villageDetail(village, ins) {
    const construction = ins.build.map(item => {
      const body = `${buildLabel(item)}${item.waiting ? ' · queued' : ''}`;
      const timer = item.end ? timedSmall(item.end) : '';
      return `<div class="apes-aoc2-detail-line"><strong>${D.esc(body)}</strong>${timer}</div>`;
    });

    let training = [];
    if (ins.train.entries?.length) {
      training = ins.train.entries.map(entry => {
        const unit = entry.unitName || (entry.unitId !== null ? `Unit ${entry.unitId}` : 'units');
        const building = entry.buildingLabel ? `${entry.buildingLabel} · ` : '';
        return `<div class="apes-aoc2-detail-line"><strong>${D.esc(`${building}${D.int(entry.amount)} ${unit}`)}</strong>${entry.end ? timedSmall(entry.end) : ''}</div>`;
      });
    } else if (ins.train.active) {
      const buildings = trainingBuildings(village).map(entry => entry.label).join(' + ');
      training.push(`<div class="apes-aoc2-detail-line"><strong>${D.esc(buildings || 'Training active')}</strong>${ins.train.count ? `<small>${D.int(ins.train.count)} queued</small>` : ''}${ins.train.end ? timedSmall(ins.train.end) : ''}</div>`);
    }

    const resources = ins.res.map(resource => `<div class="apes-aoc2-detail-resource ${resource.production < 0 ? 'danger' : ''}"><strong>${D.esc(resource.name)}</strong><span>${D.int(resource.current)} / ${D.int(resource.capacity)}</span><small>${D.signed(resource.production)}/h</small><small>${D.esc(`${resource.direction === 'empty' ? 'Empty' : 'Full'} ${D.duration(resource.eta)}`)}</small></div>`);

    const activity = [];
    if (ins.party.active) activity.push(`<div class="apes-aoc2-detail-line"><strong>${D.esc(ins.party.label)}</strong>${timedSmall(ins.party.end)}</div>`);
    else if (ins.party.hasTownHall) activity.push('<div class="apes-aoc2-detail-line"><strong>Town Hall</strong><small>Celebration ready</small></div>');
    if (ins.smith.active) {
      const entry = ins.smith.entries?.[0];
      const label = entry ? `${entry.unitName || 'Smithy upgrade'}${entry.level !== null ? ` → ${entry.level}` : ''}` : 'Smithy upgrade';
      activity.push(`<div class="apes-aoc2-detail-line"><strong>${D.esc(label)}</strong>${ins.smith.end ? timedSmall(ins.smith.end) : ''}</div>`);
    } else if (D.hasBuilding(village, 12)) activity.push('<div class="apes-aoc2-detail-line"><strong>Smithy</strong><small>Ready</small></div>');
    ins.alerts.forEach(alert => activity.push(`<div class="apes-aoc2-detail-line"><span class="apes-aoc2-status ${alert[1]}">${D.esc(alert[0])}</span></div>`));

    const buildings = trackedBuildings(village).map(entry => control(
      'apes-aoc2-building apes-aoc2-control',
      `data-building-village-id="${D.esc(village.villageId)}" data-building-location="${entry.location ?? ''}"`,
      `${D.esc(entry.label)}${entry.level !== null ? ` <b>${entry.level}</b>` : ''}`
    ));

    return `<div class="apes-aoc2-village-detail" data-detail-village-id="${D.esc(village.villageId)}"><div class="apes-aoc2-detail-head"><div><strong>${D.esc(village.name || 'Village')}</strong><small>Village details</small></div>${control('apes-aoc2-detail-open apes-aoc2-control', `data-village-id="${D.esc(village.villageId)}"`, 'Open Village')}</div><div class="apes-aoc2-detail-grid"><section><h4>Construction</h4>${detailList(construction, 'Construction idle')}</section><section><h4>Training</h4>${detailList(training, 'Training idle')}</section><section><h4>Resources</h4>${resources.length ? `<div class="apes-aoc2-detail-resources">${resources.join('')}</div>` : '<span class="apes-aoc2-idle">Visit village to capture</span>'}</section><section><h4>Activity & Attention</h4>${detailList(activity, 'All good')}</section><section><h4>Tracked Buildings</h4><div class="apes-aoc2-detail-buildings">${buildings.length ? buildings.join('') : '<span class="apes-aoc2-idle">None found</span>'}</div></section></div></div>`;
  }

  function renderVillages() {
    const body = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc2-village-body`);
    const count = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc2-result-count`);
    if (!body) return;

    if (!D.snapshot.villages?.length) {
      if (count) count.textContent = 'Waiting for village data';
      body.innerHTML = '<div class="apes-aoc2-loading">Reading Travian village cache…</div>';
      return;
    }

    const list = models();
    if (count) count.textContent = search ? `${list.length} of ${D.snapshot.villages.length} villages` : `${D.snapshot.villages.length} villages`;
    const active = String(D.snapshot.activeVillageId || D.currentVillageId());

    body.innerHTML = list.length ? list.map(({ village, ins }, index) => {
      const id = String(village.villageId);
      const expanded = id === expandedVillageId;
      const coords = D.num(village.x) !== null && D.num(village.y) !== null ? `(${village.x}|${village.y})` : '';
      const villageLink = control(
        'apes-aoc2-village-name apes-aoc2-control',
        `data-village-id="${D.esc(id)}"`,
        `<span class="apes-aoc2-order">${String(index + 1).padStart(2, '0')}.</span><span class="apes-aoc2-village-copy"><strong>${D.esc(village.name || 'Village')}</strong><small>${D.esc(coords)}${D.num(village.population) !== null ? ` · ${D.int(village.population)} pop` : ''}</small><em>${village.isMainVillage ? '<span>Capital</span>' : ''}${village.isTown ? '<span>City</span>' : ''}</em></span>`
      );
      const expand = control(
        `apes-aoc2-expand-toggle apes-aoc2-control ${expanded ? 'expanded' : ''}`,
        `data-expand-village-id="${D.esc(id)}" aria-label="${expanded ? 'Collapse' : 'Expand'} ${D.esc(village.name || 'village')} details"`,
        expanded ? '⌃' : '⌄'
      );
      const first = `<div class="apes-aoc2-village-primary">${villageLink}${expand}</div>`;
      const row = `<div class="apes-aoc2-village-row ${index % 2 ? 'alt' : ''} ${id === active || village.isActive ? 'current' : ''} ${expanded ? 'expanded' : ''}" data-row-village-id="${D.esc(id)}" title="Click a cell to ${expanded ? 'collapse' : 'expand'} village details">${first}<div class="apes-aoc2-cell">${trainingHtml(village, ins.train)}</div><div class="apes-aoc2-cell">${celebrationHtml(ins.party)}</div><div class="apes-aoc2-cell">${constructionHtml(ins)}</div><div class="apes-aoc2-cell">${smithyHtml(ins.smith)}</div><div class="apes-aoc2-cell">${resourcesHtml(village)}</div><div class="apes-aoc2-cell">${buildingsHtml(village)}</div><div class="apes-aoc2-cell">${attentionHtml(ins)}</div></div>`;
      return row + (expanded ? villageDetail(village, ins) : '');
    }).join('') : '<div class="apes-aoc2-loading">No villages match this search.</div>';

    R.updateCountdowns();
  }

  R.toggleExpanded = villageId => {
    const id = String(villageId || '');
    expandedVillageId = expandedVillageId === id ? '' : id;
    renderVillages();
  };

  R.updateCountdowns = () => {
    document.querySelectorAll(`#${D.OVERLAY_ID} [data-time]`).forEach(element => {
      const time = Number(element.dataset.time);
      if (!Number.isFinite(time)) return;
      element.textContent = `${element.dataset.prefix || ''}${D.duration(time - Date.now())}`;
    });
    document.querySelectorAll(`#${D.OVERLAY_ID} .apes-aoc-event-countdown[data-event-ms]`).forEach(element => {
      const time = Number(element.dataset.eventMs);
      if (Number.isFinite(time)) element.textContent = D.duration(time - Date.now());
    });
  };

  R.render = () => {
    R.mount();
    const all = (D.snapshot.villages || []).map((village, index) => ({ village, index, ins: D.insight(village) }));
    renderOverview(all);
    renderEvents(all);
    renderFreshness(all);
    renderVillages();
    A.actions?.renderTools?.();
  };

  R.mount = () => {
    let overlay = byId(D.OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = D.OVERLAY_ID;
    overlay.setAttribute('aria-hidden', 'true');

    const quickActions = [
      ['hero', 'Hero Inventory'],
      ['rally', 'Rally Point'],
      ['chat', 'Chat'],
      ['statistics', 'Statistics'],
      ['auction', 'Auction House'],
      ['quests', 'Quest Book']
    ].map(item => control('apes-aoc2-quick-action apes-aoc2-control', `data-quick="${item[0]}"`, `<span>${item[1]}</span><b>›</b>`)).join('');

    overlay.innerHTML = `<div class="apes-aoc2-shell" role="dialog" aria-modal="true" aria-label="Account Operations Center"><header class="apes-aoc2-header"><div class="apes-aoc2-brand"><span>APES</span><small>QoL 2.0</small><i></i><strong>Account Operations Center</strong></div><div class="apes-aoc2-header-actions"><span class="apes-aoc2-freshness">Waiting for live data</span>${control('apes-aoc2-refresh apes-aoc2-control', '', 'Refresh')}${control('apes-aoc2-close apes-aoc2-control', 'aria-label="Close Account Operations Center"', '×')}</div></header><div class="apes-aoc2-layout"><main class="apes-aoc2-main"><section class="apes-aoc2-card"><div class="apes-aoc2-section-title"><strong>Account</strong><small>Actionable issues only count toward Needs Attention</small></div><div class="apes-aoc2-overview-metrics"></div></section><section class="apes-aoc2-card apes-aoc-events"><div class="apes-aoc2-section-title"><strong>Next Events</strong><small>Account-wide timeline</small></div><div class="apes-aoc-events-list"></div></section><section class="apes-aoc2-card apes-aoc2-villages"><div class="apes-aoc2-village-toolbar"><div class="apes-aoc2-section-title"><strong>Villages</strong><small class="apes-aoc2-result-count">Waiting for data</small></div><div class="apes-aoc2-filters"><input class="apes-aoc2-search" type="search" placeholder="Search village…"><select class="apes-aoc2-sort"><option value="order">Village order</option><option value="attention">Needs attention</option><option value="nextEvent">Next event</option><option value="construction">Construction finish</option><option value="storage">Storage risk</option><option value="population">Population</option><option value="alphabetical">Alphabetical</option></select></div></div><div class="apes-aoc2-table-scroll"><div class="apes-aoc2-village-head"><span>Village</span><span>Training</span><span>Celebration</span><span>Construction</span><span>Smithy</span><span>Resources</span><span>Buildings</span><span>Attention</span></div><div class="apes-aoc2-village-body"></div></div></section></main><aside class="apes-aoc2-sidebar"><section class="apes-aoc2-side-card"><div class="apes-aoc2-side-title"><strong>Quick Actions</strong><small>Current village</small></div><div class="apes-aoc2-quick-list">${quickActions}</div></section><section class="apes-aoc2-side-card apes-aoc2-tools-card"><div class="apes-aoc2-side-title"><strong>Enabled Tools</strong><small>Drag to reorder · click to open</small></div><div class="apes-aoc2-tools-list"></div></section></aside></div><footer class="apes-aoc2-footer"><span>H / Esc to close</span><span>Click a village cell for details · resource data is captured as villages are visited.</span></footer></div>`;

    document.body.appendChild(overlay);
    const sort = overlay.querySelector('.apes-aoc2-sort');
    sort.value = sortMode;
    sort.onchange = () => {
      saveSort(sort.value);
      R.render();
    };
    overlay.querySelector('.apes-aoc2-search').oninput = event => {
      search = event.target.value.trim();
      renderVillages();
    };
    A.actions?.bind?.(overlay);
    return overlay;
  };
})();
