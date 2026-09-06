(() => {
  'use strict';
  const A = window.APES_AOC_INTERNAL, D = A?.data;
  if (!D) return;
  const R = A.rendering = {};
  const SORTS = new Set(['order', 'attention', 'nextEvent', 'construction', 'storage']);
  let search = '', sortMode = readSort();
  const byId = id => document.getElementById(id);

  function readSort() {
    try {
      const v = localStorage.getItem(`apes_aoc_sort:${location.hostname}`);
      return SORTS.has(v) ? v : 'order';
    } catch (_) {
      return 'order';
    }
  }

  function saveSort(v) {
    sortMode = SORTS.has(v) ? v : 'order';
    try { localStorage.setItem(`apes_aoc_sort:${location.hostname}`, sortMode); } catch (_) {}
  }

  function control(className, attrs, html) {
    return `<div class="${className}" role="button" tabindex="0" ${attrs || ''}>${html}</div>`;
  }

  function cell(primary, secondary = '', time = null) {
    return `<div class="apes-aoc2-stack"><strong>${D.esc(primary)}</strong>${secondary ? `<small>${D.esc(secondary)}</small>` : ''}${time ? `<small class="apes-aoc2-countdown" data-time="${time}">${D.esc(D.duration(time - Date.now()))}</small>` : ''}</div>`;
  }

  function buildingsHtml(v) {
    const scan = D.scanFor(v.villageId);
    const entries = scan?.buildings?.length ? scan.buildings : D.TRACKED.map(def => {
      const b = (v.buildings || []).find(x => Number(x.buildingType) === def.type);
      return b ? { ...def, location: D.num(b.locationId), level: D.num(b.lvl) } : null;
    }).filter(Boolean);
    if (!entries.length) return '<span class="apes-aoc2-idle">None found</span>';
    return `<div class="apes-aoc2-building-list">${entries.map(b => control(
      'apes-aoc2-building apes-aoc2-control',
      `data-building-village-id="${D.esc(v.villageId)}" data-building-location="${b.location ?? ''}"`,
      `${D.esc(b.label)}${b.level !== null ? ` <b>${b.level}</b>` : ''}`
    )).join('')}</div>`;
  }

  function resourcesHtml(v) {
    const r = D.projected(v);
    if (!r.length) return '<span class="apes-aoc2-idle">Visit village to capture</span>';
    const wh = r.filter(x => x.key !== 'crop').sort((a, b) => b.percent - a.percent)[0];
    const crop = r.find(x => x.key === 'crop');
    const risk = r.filter(x => Number.isFinite(x.eta)).sort((a, b) => a.eta - b.eta)[0];
    return cell(`Warehouse ${wh?.percent ?? 0}%`, crop ? `Crop ${crop.percent}% · ${D.int(crop.production)}/h` : '', risk && risk.eta < 86400000 ? Date.now() + risk.eta : null);
  }

  function attentionHtml(ins) {
    return ins.alerts.length
      ? `<div class="apes-aoc2-attention">${ins.alerts.slice(0, 3).map(a => `<span class="apes-aoc2-status ${a[1]}">${D.esc(a[0])}</span>`).join('')}${ins.alerts.length > 3 ? `<span class="apes-aoc2-more">+${ins.alerts.length - 3}</span>` : ''}</div>`
      : '<span class="apes-aoc2-status ready">All good</span>';
  }

  function models() {
    const list = (D.snapshot.villages || []).map((v, index) => ({ v, index, ins: D.insight(v) }));
    const f = x => Number.isFinite(x) ? x : Infinity;
    list.sort((a, b) => sortMode === 'attention' ? b.ins.score - a.ins.score || a.index - b.index
      : sortMode === 'nextEvent' ? f(a.ins.next) - f(b.ins.next) || a.index - b.index
      : sortMode === 'construction' ? f(a.ins.construction) - f(b.ins.construction) || a.index - b.index
      : sortMode === 'storage' ? f(a.ins.storage) - f(b.ins.storage) || a.index - b.index
      : a.index - b.index);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(({ v }) => `${v.name || ''} ${v.x ?? ''}|${v.y ?? ''}`.toLowerCase().includes(q));
  }

  function renderOverview(all) {
    const t = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc2-overview-metrics`);
    if (!t) return;
    const pop = all.reduce((s, m) => s + (Number(m.v.population) || 0), 0);
    const attention = all.filter(m => m.ins.alerts.some(a => a[2] >= 30)).length;
    const free = all.reduce((s, m) => s + m.ins.free, 0);
    const next = all.flatMap(m => m.ins.events).filter(e => e.at >= Date.now()).sort((a, b) => a.at - b.at)[0]?.at;
    const rows = [['⌂', D.int(all.length), 'Villages'], ['●', D.int(pop), 'Population'], ['!', D.int(attention), 'Needs Attention'], ['✓', D.int(free), 'Free Finishes'], ['◷', next ? D.duration(next - Date.now()) : '—', 'Next Event']];
    t.innerHTML = rows.map((r, i) => `<div class="apes-aoc2-metric ${i === 2 && attention ? 'warn' : ''} ${i === 3 && free ? 'ready' : ''}"><span>${r[0]}</span><strong>${D.esc(r[1])}</strong><small>${r[2]}</small></div>`).join('');
  }

  function renderEvents(all) {
    const t = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc-events-list`);
    if (!t) return;
    const alarmNodes = [...t.querySelectorAll('[data-apes-building-alarm-event]')];
    const now = Date.now();
    const events = all.flatMap(m => m.ins.events).filter(e => e.at >= now - 1000).sort((a, b) => a.at - b.at).slice(0, 7);
    t.innerHTML = events.length ? events.map(e => `<div class="apes-aoc-event" role="button" tabindex="0" data-event-village-id="${D.esc(e.id)}"><strong>${e.at <= now + 1000 ? 'NOW' : new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</strong><span>${D.esc(e.name)} — ${D.esc(e.label)}</span><small class="apes-aoc-event-countdown" data-event-ms="${e.at}">${D.esc(D.duration(e.at - now))}</small></div>`).join('') : '<span class="apes-aoc-events-empty">No upcoming account events found.</span>';
    alarmNodes.forEach(n => t.appendChild(n));
  }

  function renderFreshness(all) {
    const t = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc2-freshness`);
    if (!t) return;
    if (!D.snapshot.generatedAt) { t.textContent = 'Waiting for live data'; return; }
    const stale = all.filter(m => {
      const ts = Number(D.scanFor(m.v.villageId)?.scannedAt);
      return !Number.isFinite(ts) || Date.now() - ts > D.STALE_MS;
    }).length;
    t.textContent = stale ? `Live · ${stale} resource snapshot${stale === 1 ? '' : 's'} stale/missing` : 'Live · resource data current';
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
    body.innerHTML = list.length ? list.map(({ v, ins }, index) => {
      const coords = D.num(v.x) !== null && D.num(v.y) !== null ? `(${v.x}|${v.y})` : '';
      const build = ins.build;
      const buildHtml = build.length ? `<div class="apes-aoc2-stack">${build.slice(0, 2).map(b => `<span><strong>${D.esc(`${b.label}${b.level !== null ? ` → ${b.level}` : ''}`)}</strong>${b.end ? `<small class="apes-aoc2-countdown" data-time="${b.end}">${D.duration(b.end - Date.now())}</small>` : ''}</span>`).join('')}</div>` : '<span class="apes-aoc2-idle">Idle</span>';
      const villageControl = control(
        'apes-aoc2-village-name apes-aoc2-control',
        `data-village-id="${D.esc(v.villageId)}"`,
        `<span class="apes-aoc2-order">${String(index + 1).padStart(2, '0')}.</span><span class="apes-aoc2-village-copy"><strong>${D.esc(v.name || 'Village')}</strong><small>${D.esc(coords)}${D.num(v.population) !== null ? ` · ${D.int(v.population)} pop` : ''}</small><em>${v.isMainVillage ? '<span>Capital</span>' : ''}${v.isTown ? '<span>City</span>' : ''}</em></span>`
      );
      return `<div class="apes-aoc2-village-row ${String(v.villageId) === active || v.isActive ? 'current' : ''}">${villageControl}<div class="apes-aoc2-cell">${ins.train.active ? cell(ins.train.count ? `${D.int(ins.train.count)} queued` : 'Training active', '', ins.train.end) : '<span class="apes-aoc2-idle">Idle</span>'}</div><div class="apes-aoc2-cell">${ins.party.active ? cell(ins.party.label, '', ins.party.end) : '<span class="apes-aoc2-idle">None</span>'}</div><div class="apes-aoc2-cell">${buildHtml}</div><div class="apes-aoc2-cell">${ins.smith.active ? cell('Upgrade active', '', ins.smith.end) : '<span class="apes-aoc2-idle">Idle</span>'}</div><div class="apes-aoc2-cell">${resourcesHtml(v)}</div><div class="apes-aoc2-cell">${buildingsHtml(v)}</div><div class="apes-aoc2-cell">${attentionHtml(ins)}</div></div>`;
    }).join('') : '<div class="apes-aoc2-loading">No villages match this search.</div>';
    R.updateCountdowns();
  }

  R.updateCountdowns = () => {
    document.querySelectorAll(`#${D.OVERLAY_ID} [data-time]`).forEach(e => {
      const t = Number(e.dataset.time);
      if (Number.isFinite(t)) e.textContent = D.duration(t - Date.now());
    });
    document.querySelectorAll(`#${D.OVERLAY_ID} .apes-aoc-event-countdown[data-event-ms]`).forEach(e => {
      const t = Number(e.dataset.eventMs);
      if (Number.isFinite(t)) e.textContent = D.duration(t - Date.now());
    });
  };

  R.render = () => {
    R.mount();
    const all = (D.snapshot.villages || []).map((v, index) => ({ v, index, ins: D.insight(v) }));
    renderOverview(all);
    renderEvents(all);
    renderFreshness(all);
    renderVillages();
    A.actions?.renderTools?.();
  };

  R.mount = () => {
    let o = byId(D.OVERLAY_ID);
    if (o) return o;
    o = document.createElement('div');
    o.id = D.OVERLAY_ID;
    o.setAttribute('aria-hidden', 'true');
    const quickActions = [['hero', 'Hero Inventory'], ['rally', 'Rally Point'], ['chat', 'Chat'], ['statistics', 'Statistics'], ['auction', 'Auction House'], ['quests', 'Quest Book']]
      .map(x => control('apes-aoc2-quick-action apes-aoc2-control', `data-quick="${x[0]}"`, `<span>${x[1]}</span><b>›</b>`)).join('');
    o.innerHTML = `<div class="apes-aoc2-shell" role="dialog" aria-modal="true" aria-label="Account Operations Center"><header class="apes-aoc2-header"><div class="apes-aoc2-brand"><span>APES</span><small>QoL 2.0</small><i></i><strong>Account Operations Center</strong></div><div class="apes-aoc2-header-actions"><span class="apes-aoc2-freshness">Waiting for live data</span>${control('apes-aoc2-refresh apes-aoc2-control', '', 'Refresh')}${control('apes-aoc2-close apes-aoc2-control', 'aria-label="Close Account Operations Center"', '×')}</div></header><div class="apes-aoc2-layout"><main class="apes-aoc2-main"><section class="apes-aoc2-card"><div class="apes-aoc2-section-title"><strong>Account</strong><small>Live account overview</small></div><div class="apes-aoc2-overview-metrics"></div></section><section class="apes-aoc2-card apes-aoc-events"><div class="apes-aoc2-section-title"><strong>Next Events</strong><small>Account-wide timeline</small></div><div class="apes-aoc-events-list"></div></section><section class="apes-aoc2-card apes-aoc2-villages"><div class="apes-aoc2-village-toolbar"><div class="apes-aoc2-section-title"><strong>Villages</strong><small class="apes-aoc2-result-count">Waiting for data</small></div><div class="apes-aoc2-filters"><input class="apes-aoc2-search" type="search" placeholder="Search village…"><select class="apes-aoc2-sort"><option value="order">Village order</option><option value="attention">Needs attention</option><option value="nextEvent">Next event</option><option value="construction">Construction finish</option><option value="storage">Storage risk</option></select></div></div><div class="apes-aoc2-table-scroll"><div class="apes-aoc2-village-head"><span>Village</span><span>Training</span><span>Celebration</span><span>Construction</span><span>Smithy</span><span>Resources</span><span>Buildings</span><span>Attention</span></div><div class="apes-aoc2-village-body"></div></div></section></main><aside class="apes-aoc2-sidebar"><section class="apes-aoc2-side-card"><div class="apes-aoc2-side-title"><strong>Quick Actions</strong><small>Current village</small></div><div class="apes-aoc2-quick-list">${quickActions}</div></section><section class="apes-aoc2-side-card apes-aoc2-tools-card"><div class="apes-aoc2-side-title"><strong>Enabled Tools</strong><small>Drag to reorder · click to open</small></div><div class="apes-aoc2-tools-list"></div></section></aside></div><footer class="apes-aoc2-footer"><span>H / Esc to close</span><span>Resource data is captured automatically as villages are visited.</span></footer></div>`;
    document.body.appendChild(o);
    const sort = o.querySelector('.apes-aoc2-sort');
    sort.value = sortMode;
    sort.onchange = () => { saveSort(sort.value); R.render(); };
    o.querySelector('.apes-aoc2-search').oninput = e => { search = e.target.value.trim(); R.render(); };
    A.actions?.bind?.(o);
    return o;
  };
})();
