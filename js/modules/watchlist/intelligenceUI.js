(() => {
  'use strict';

  const PANEL_ID = 'qol-wl-intel-overlay';
  const MS_DAY = 86400000;
  const PERIODS = Object.freeze({ '24h': MS_DAY, '7d': 7 * MS_DAY, '30d': 30 * MS_DAY });
  const history = window.APES_WATCHLIST_HISTORY;
  let context = null;
  let overlay = null;

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  }
  function label(text) {
    return window.APES?.i18n ? window.APES.i18n.label(text) : escape(text);
  }
  function number(value) {
    return Number(value).toLocaleString();
  }
  function signed(value) {
    if (value == null || !Number.isFinite(value)) return '—';
    return (value > 0 ? '+' : '') + number(value);
  }
  function tone(value) { return value > 0 ? 'qol-positive' : value < 0 ? 'qol-negative' : ''; }
  function datetime(at) {
    if (!Number.isFinite(Number(at)) || !Number(at)) return '—';
    return new Date(at).toLocaleString([], { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }
  function dateOnly(at) {
    return new Date(at).toLocaleDateString([], { day:'2-digit', month:'short' });
  }
  function control(text, action, value, selected) {
    return '<div class="qol-wl-intel-btn" role="button" tabindex="0" data-wl-intel-action="' + escape(action) +
      '" data-wl-intel-value="' + escape(value) + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' + label(text) + '</div>';
  }
  function metric(title, value, subtitle, className) {
    return '<div class="qol-wl-intel-metric"><small>' + label(title) + '</small><strong class="' + escape(className || '') +
      '">' + escape(value) + '</strong><span>' + (subtitle || '&nbsp;') + '</span></div>';
  }
  function eventDetail(event) {
    switch (event.kind) {
      case 'village-added': return { tone:'positive', title:label('New village detected'), detail:escape(event.name) + ' · (' + escape(event.coords) + ')' };
      case 'village-missing': {
        const state = event.status === 'confirmed' ? label('Still absent on a later successful scan') :
          event.status === 'resolved' ? label('Reappeared on a later scan') : label('Awaiting a second successful scan');
        return { tone:event.status === 'confirmed' ? 'negative' : 'uncertain',
          title:label('Village no longer detected'), detail:escape(event.name) + ' · (' + escape(event.coords) + ') · ' + state };
      }
      case 'village-renamed': return { tone:'', title:label('Village renamed'), detail:escape(event.from) + ' → ' + escape(event.to) + ' · (' + escape(event.coords) + ')' };
      case 'capital-changed': return { tone:'', title:label('Capital changed'), detail:'(' + escape(event.from) + ') → (' + escape(event.to) + ')' };
      case 'population-changed': return { tone:event.delta > 0 ? 'positive' : 'negative',
        title:label('Population changed') + ' ' + escape(signed(event.delta)),
        detail:number(event.from) + ' → ' + number(event.to) };
      default: return null;
    }
  }
  function eventsHtml(record, ms) {
    const events = history.timeline(record, ms);
    if (!events.length) return '<div class="qol-wl-intel-empty">' + label('No changes recorded for this period.') + '</div>';
    return '<div class="qol-wl-intel-timeline">' + events.slice(0, 80).map(event => {
      const info = eventDetail(event);
      if (!info) return '';
      return '<div class="qol-wl-intel-event ' + escape(info.tone) + '">' +
        '<span class="qol-wl-intel-dot"></span><div>' +
        '<div class="qol-wl-intel-event-title">' + info.title + '</div>' +
        '<div>' + info.detail + '</div><div class="qol-wl-intel-event-time">' + escape(datetime(event.at)) +
        '</div></div></div>';
    }).join('') + '</div>';
  }
  function chartHtml(record, ms) {
    const points = history.chart(record, ms);
    if (points.length < 2) return '<div class="qol-wl-intel-chart-notice">' + label('Scan this player again to build a population graph.') + '</div>';
    const values = points.map(p => p.population).filter(Number.isFinite);
    if (values.length < 2) return '<div class="qol-wl-intel-chart-notice">' + label('Insufficient population data.') + '</div>';
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const spread = Math.max(1, maximum - minimum);
    const firstTime = points[0].at;
    const lastTime = points[points.length - 1].at;
    const span = Math.max(1, lastTime - firstTime);
    const coords = points.map(point => ({
      x: 20 + Math.round(660 * (point.at - firstTime) / span),
      y: 130 - Math.round(105 * (point.population - minimum) / spread),
      point
    }));
    const path = coords.map((p, index) => (index ? 'L ' : 'M ') + p.x + ' ' + p.y).join(' ');
    const circles = coords.map(p =>
      '<circle cx="' + p.x + '" cy="' + p.y + '" r="3.1" fill="#486b30"><title>' +
      escape(datetime(p.point.at) + ' · ' + number(p.point.population)) + '</title></circle>'
    ).join('');
    const chart = '<svg class="qol-wl-intel-chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 150" role="img" aria-label="' +
      escape('Population history') + '">' +
      '<line x1="20" y1="25" x2="680" y2="25" stroke="#eee1ca" stroke-width="1"/>' +
      '<line x1="20" y1="78" x2="680" y2="78" stroke="#eee1ca" stroke-width="1"/>' +
      '<line x1="20" y1="130" x2="680" y2="130" stroke="#eee1ca" stroke-width="1"/>' +
      '<path d="' + path + '" stroke="#537a36" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      circles + '</svg>';
    return '<div class="qol-wl-intel-chart-wrap">' + chart +
      '<div class="qol-wl-intel-chart-legend"><span>' + escape(dateOnly(firstTime)) + ' · ' + number(points[0].population) +
      '</span><span>' + escape(dateOnly(lastTime)) + ' · ' + number(points[points.length - 1].population) + '</span></div></div>';
  }
  function villagesHtml(record) {
    const villages = history.latestVillages(record);
    if (!villages.length) return '<div class="qol-wl-intel-empty">' + label('No village history available yet.') + '</div>';
    const order = { new:0, current:1, unverified:2, missing:3 };
    villages.sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5) || a.name.localeCompare(b.name));
    const rows = villages.map(village => {
      const statusLabels = { new:'New', current:'Known', unverified:'Not detected — verify', missing:'Confirmed missing' };
      const badge = '<span class="qol-wl-intel-state ' + escape(village.status) + '">' + label(statusLabels[village.status]) + '</span>';
      const coords = '(' + escape(village.coords) + ')';
      const canSend = village.status === 'new' || village.status === 'current';
      const coordLink = canSend ? '<a href="#" class="qol-wl-intel-coords" data-wl-intel-route="window:sendTroops/x:' +
        encodeURIComponent(village.x) + '/y:' + encodeURIComponent(village.y) + '" title="' +
        escape('Send troops to village') + '">' + coords + '</a>' : '<span>' + coords + '</span>';
      const capital = village.capital ? ' <span class="qol-wl-intel-state">' + label('Capital') + '</span>' : '';
      return '<tr><td>' + escape(village.name) + capital + '</td><td>' + coordLink + '</td><td>' + badge + '</td></tr>';
    }).join('');
    return '<table class="qol-wl-intel-villages"><thead><tr><th>' + label('Village') + '</th><th>' +
      label('Coordinates') + '</th><th>' + label('Status') + '</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function render() {
    if (!context || !overlay) return;
    const record = history.read(context.playerId);
    const snapshots = record.snapshots || [];
    const latest = snapshots[snapshots.length - 1] || null;
    const windowMs = PERIODS[context.period];
    const trend = history.trend(record, windowMs);
    const playerName = context.playerName || record.name || context.playerId;
    const popDelta = trend ? trend.delta : null;
    const villageDelta = trend ? trend.villageDelta : null;
    const caveat = trend && !trend.complete ? label('Partial period — since first available scan') : '&nbsp;';
    const lastAt = context.lastUpdatedAt || latest?.at;
    const top = '<div class="qol-wl-intel-head"><div><div class="qol-wl-intel-title">' +
      label('Player Intelligence') + ' — ' + escape(playerName) +
      '</div><div class="qol-wl-intel-sub">' + label('Historical changes and village tracking') +
      '</div></div><div class="qol-wl-intel-close" role="button" tabindex="0" data-wl-intel-action="close" aria-label="' +
      escape('Close') + '">×</div></div>';
    const actions = '<div class="qol-wl-intel-actions"><div class="qol-wl-intel-action-group">' +
      control('History', 'view', 'history', context.view === 'history') +
      control('Villages', 'view', 'villages', context.view === 'villages') +
      '</div><div class="qol-wl-intel-action-group">' + Object.keys(PERIODS).map(period =>
      control(period, 'period', period, context.period === period)
    ).join('') + '</div></div>';
    const metrics = '<div class="qol-wl-intel-metrics">' +
      metric('Population change', signed(popDelta), caveat, tone(popDelta)) +
      metric('Village change', signed(villageDelta), caveat, tone(villageDelta)) +
      metric('Last scanned', datetime(lastAt), '&nbsp;', '') +
      '</div>';
    const content = context.view === 'villages'
      ? '<div class="qol-wl-intel-section"><div class="qol-wl-intel-section-head"><span>' +
        label('Known villages') + '</span><span class="qol-wl-intel-section-meta">' +
        escape(latest ? String(latest.villages.length) : '0') + '</span></div>' + villagesHtml(record) + '</div>'
      : '<div class="qol-wl-intel-section"><div class="qol-wl-intel-section-head"><span>' +
        label('Population trend') + '</span><span class="qol-wl-intel-section-meta">' + escape(context.period) +
        '</span></div>' + chartHtml(record, windowMs) + '</div>' +
        '<div class="qol-wl-intel-section"><div class="qol-wl-intel-section-head"><span>' +
        label('Change history') + '</span><span class="qol-wl-intel-section-meta">' + escape(context.period) +
        '</span></div>' + eventsHtml(record, windowMs) + '</div>';
    overlay.innerHTML = '<div class="qol-wl-intel-panel" role="dialog" aria-modal="true" aria-label="' +
      escape('Player Intelligence') + '"><div>' + top + '</div><div class="qol-wl-intel-body">' +
      actions + metrics + content + '</div></div>';
    window.APES?.i18n?.apply(overlay);
  }
  function activate(element) {
    const route = element.closest('[data-wl-intel-route]');
    if (route) {
      context?.onNavigate?.(route.getAttribute('data-wl-intel-route'));
      close();
      return;
    }
    const button = element.closest('[data-wl-intel-action]');
    if (!button) return;
    switch (button.getAttribute('data-wl-intel-action')) {
      case 'close': close(); break;
      case 'view': context.view = button.getAttribute('data-wl-intel-value'); render(); break;
      case 'period': context.period = button.getAttribute('data-wl-intel-value'); render(); break;
    }
  }
  function handleKeydown(event) {
    if (!overlay) return;
    if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const control = event.target.closest?.('[role="button"]');
    if (control && overlay.contains(control)) { event.preventDefault(); activate(control); }
  }
  function open(entry, view = 'history', onNavigate) {
    if (!entry?.playerId) return;
    close();
    context = {
      playerId: String(entry.playerId),
      playerName: String(entry.playerName || ''),
      lastUpdatedAt: Number(entry.lastUpdatedAt) || null,
      view: view === 'villages' ? 'villages' : 'history',
      period:'7d', onNavigate
    };
    overlay = document.createElement('div');
    overlay.id = PANEL_ID;
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
      else if (event.target.closest?.('[data-wl-intel-action],[data-wl-intel-route]')) {
        event.preventDefault();
        activate(event.target);
      }
    });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', handleKeydown, true);
    render();
    overlay.querySelector('.qol-wl-intel-close')?.focus();
  }
  function close() {
    if (overlay) { overlay.remove(); overlay = null; }
    context = null;
    document.removeEventListener('keydown', handleKeydown, true);
  }
  function refresh() { if (context && overlay) render(); }
  window.APES_WATCHLIST_INTELLIGENCE = Object.freeze({ open, close, refresh });
})();
