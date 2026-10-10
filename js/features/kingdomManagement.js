(() => {
  'use strict';
  const FEATURE = 'kingdomManagement';
  const PANEL_ID = 'qol-kingdom-management-panel';
  const BUTTON_ID = 'qol-kingdom-management-toggle-btn';
  const LOCK_ID = 'qol-kingdom-management-scan-lock';
  const S = window.APES_KINGDOM_STATISTICS;
  const H = window.APES_KINGDOM_HISTORY;
  if (!S || !H) return;
  const COLUMNS = Object.freeze([
    ['rank', 'Rank'], ['name', 'Kingdom'], ['king', 'King'], ['villages', 'Villages'], ['population', 'Population'],
    ['area', 'Total area'], ['players', 'Players'], ['averageAttack', 'Avg. attack'], ['totalAttack', 'Total attack'],
    ['averageDefense', 'Avg. defense'], ['totalDefense', 'Total defense'], ['treasures', 'Treasures'], ['victoryPoints', 'Victory points']
  ]);
  const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l4 5 5-7 5 7 4-5-2 13H5z"></path><path d="M5 16h14"></path></svg>';
  let snapshots = [], selectedId = '', earlierId = '', laterId = '', activeTab = 'results';
  let search = '', sortKey = 'rank', ascending = true;
  let scanning = false, cancelled = false, scanPromise = null;
  let status = '', tone = 'neutral';
  const enabled = () => typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE) === true;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const fmt = value => Number.isFinite(value) ? value.toLocaleString('en-US') : '—';
  const date = value => new Date(value).toLocaleString();
  const delay = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  // Use APES-owned div controls: the game decorates native button elements.
  function action(label, attributes = '', disabled = false) {
    return `<div class="qol-km-action" role="button" tabindex="${disabled ? '-1' : '0'}" aria-disabled="${disabled}" ${attributes}>${label}</div>`;
  }
  function activateOnKeyboard(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const control = event.target.closest?.('.qol-km-action');
    if (!control) return;
    event.preventDefault(); event.stopPropagation();
    if (!event.repeat && control.getAttribute('aria-disabled') !== 'true') control.click();
  }
  function setStatus(message, nextTone = 'neutral') {
    status = message; tone = nextTone;
    const node = document.querySelector(`#${PANEL_ID} [data-km-status]`);
    if (node) { node.textContent = status; node.dataset.tone = tone; }
    const progress = document.querySelector(`#${LOCK_ID} [data-km-progress]`);
    if (progress) progress.textContent = message;
  }
  function route(base, tab, page) {
    const parts = base.replace(/^#\/?/, '').split('/').filter(part => part && !/^(window|subtab|tab|statsPage|search|searchRank):/i.test(part));
    return `#/${[...parts, 'window:statistics', `subtab:${tab}`, 'tab:Kingdoms', `statsPage:${page}`].join('/')}`;
  }
  function matchesRoute(tab, page) {
    const parts = location.hash.split('/');
    return ['window:statistics', `subtab:${tab}`, 'tab:Kingdoms', `statsPage:${page}`].every(part => parts.includes(part));
  }
  function checkCancelled() {
    if (cancelled || !enabled()) throw new Error('Kingdom scan cancelled.');
  }
  async function waitForPage(stage, page, previous, seen) {
    const start = performance.now();
    let signature = '', stable = 0;
    while (performance.now() - start < 12000) {
      checkCancelled();
      if (!matchesRoute(stage.tab, page)) throw new Error('The statistics page changed during the scan.');
      const result = S.readPage(stage);
      const fresh = result && result.page === page && (page !== 1 || result.rows[0].ranking === 1) &&
        (!previous || result.signature !== previous.signature && result.rows[0].ranking > previous.rows.at(-1).ranking) &&
        result.rows.every(row => !seen.has(row.id));
      if (fresh) {
        const nextSignature = JSON.stringify([result.page, result.signature, result.lastPage, result.hasNext]);
        stable = signature === nextSignature ? stable + 1 : 1;
        signature = nextSignature;
        if (stable >= 3) return result;
      } else { signature = ''; stable = 0; }
      await delay(140);
    }
    throw new Error(`${stage.label}, page ${page} did not finish loading. No snapshot was saved.`);
  }
  function lockScreen() {
    const lock = document.createElement('div');
    lock.id = LOCK_ID;
    lock.setAttribute('role', 'dialog'); lock.setAttribute('aria-modal', 'true'); lock.setAttribute('aria-labelledby', 'qol-km-scan-title');
    lock.innerHTML = `<div class="qol-km-lock-card" role="status" aria-live="polite"><strong id="qol-km-scan-title">Scanning Kingdoms</strong><span data-km-progress>Preparing statistics…</span><progress data-km-bar max="5" value="0" aria-label="Completed statistics rankings"></progress>${action('Cancel scan', 'data-km-cancel')}</div>`;
    lock.querySelector('[data-km-cancel]').addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); cancelScan(); });
    lock.addEventListener('keydown', activateOnKeyboard);
    document.body.appendChild(lock);
    lock.querySelector('[data-km-cancel]').focus();
  }
  function cancelScan() { if (scanning) cancelled = true; }
  function guardInput(event) {
    if (!scanning || !event.isTrusted) return;
    if (event.type === 'wheel' || event.type === 'touchmove' || event.type === 'keydown' && event.key === 'Tab') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Tab') document.querySelector(`#${LOCK_ID} [data-km-cancel]`)?.focus();
      return;
    }
    if (event.target?.closest?.(`#${LOCK_ID}`)) return;
    if (event.type === 'keydown' && event.key === 'Escape') cancelScan();
    event.preventDefault(); event.stopImmediatePropagation();
  }
  function scan() {
    if (scanPromise) return scanPromise;
    scanPromise = performScan().finally(() => { scanPromise = null; });
    return scanPromise;
  }
  async function performScan() {
    if (!enabled()) return false;
    scanning = true; cancelled = false;
    const originalHash = location.hash, startedAt = Date.now(), focused = document.activeElement;
    let lastRoute = '';
    lockScreen(); render();
    const kingdoms = new Map(), pages = {}, missing = {}, coverage = {};
    try {
      await H.load();
      for (let stageIndex = 0; stageIndex < S.STAGES.length; stageIndex++) {
        const stage = S.STAGES[stageIndex], seen = new Set();
        let previous = null, finished = false, advertisedLast = 1;
        for (let page = 1; page <= 10000; page++) {
          checkCancelled();
          lastRoute = route(originalHash, stage.tab, page);
          location.hash = lastRoute;
          setStatus(`Scanning ${stage.label} · page ${page}${advertisedLast > 1 ? ` of ${advertisedLast}` : ''} · ${seen.size} kingdoms read…`);
          const result = await waitForPage(stage, page, previous, seen);
          advertisedLast = Math.max(advertisedLast, result.lastPage);
          for (const row of result.rows) {
            seen.add(row.id);
            const entry = kingdoms.get(row.id) || { id: row.id, name: row.name, king: '', kingId: '', ...Object.fromEntries(H.METRICS.map(key => [key, null])) };
            if (stage.tab === 'Population') Object.assign(entry, { name: row.name, king: row.king, kingId: row.kingId });
            for (const key of Object.keys(stage.fields)) entry[key] = row[key];
            kingdoms.set(row.id, entry);
          }
          pages[stage.tab] = page;
          if (!result.hasNext) {
            if (page < advertisedLast) throw new Error(`${stage.label} stopped before page ${advertisedLast}. No snapshot was saved.`);
            finished = true; break;
          }
          previous = result;
        }
        if (!finished) throw new Error('The statistics pagination limit was exceeded. No snapshot was saved.');
        coverage[stage.tab] = seen;
        document.querySelector(`#${LOCK_ID} [data-km-bar]`).value = stageIndex + 1;
      }
      checkCancelled();
      for (const stage of S.STAGES) missing[stage.tab] = [...kingdoms.keys()].filter(id => !coverage[stage.tab].has(id)).length;
      const rows = [...kingdoms.values()].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.name.localeCompare(b.name));
      const snapshot = { id: `${startedAt}-${Math.random().toString(36).slice(2, 9)}`, server: location.hostname, startedAt, scannedAt: Date.now(), complete: true, pages, missing, kingdoms: rows };
      setStatus(`Saving snapshot · ${rows.length} kingdoms…`);
      snapshots = await H.append(snapshot);
      selectedId = laterId = snapshot.id; earlierId = snapshots[1]?.id || ''; activeTab = 'results';
      setStatus(`Snapshot saved · ${rows.length} kingdoms · ${Object.values(pages).reduce((sum, value) => sum + value, 0)} statistics pages.`, 'success');
      return true;
    } catch (error) {
      setStatus(error?.message || String(error), 'error');
      return false;
    } finally {
      scanning = false;
      document.getElementById(LOCK_ID)?.remove();
      if (lastRoute && location.hash === lastRoute) location.hash = originalHash;
      render();
      if (focused?.isConnected) focused.focus?.();
    }
  }
  function sorted(rows) {
    return rows.filter(row => `${row.name} ${row.king} ${row.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
      if (bv === null || bv === undefined) return -1;
      const difference = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return ascending ? difference : -difference;
    });
  }
  function cell(row, key) {
    if (key === 'name') return `<span class="qol-km-name">${esc(row.name)}</span>`;
    if (key === 'king') return esc(row.king || '—');
    return fmt(row[key]);
  }
  function table(rows, comparisons = null) {
    const compareMap = new Map((comparisons || []).map(row => [row.id, row]));
    return `<div class="qol-km-table-wrap"><table><thead><tr class="qol-km-groups"><th colspan="3" scope="colgroup">Kingdom</th><th colspan="2" scope="colgroup">Population</th><th colspan="2" scope="colgroup">Territory & players</th><th colspan="2" scope="colgroup">Attack</th><th colspan="2" scope="colgroup">Defense</th><th colspan="2" scope="colgroup">Treasures & victory</th>${comparisons ? '<th scope="col">Development</th>' : ''}</tr><tr>${COLUMNS.map(([key, label]) => `<th scope="col" aria-sort="${key === sortKey ? ascending ? 'ascending' : 'descending' : 'none'}">${action(esc(label) + (key === sortKey ? ascending ? ' ↑' : ' ↓' : ''), `data-km-sort="${key}"`)}</th>`).join('')}${comparisons ? '<th scope="col">Changes</th>' : ''}</tr></thead><tbody>${sorted(rows).map(row => {
      const comparison = compareMap.get(row.id);
      return `<tr>${COLUMNS.map(([key]) => {
        const change = comparison?.changes[key];
        const improved = key === 'rank' ? change < 0 : change > 0;
        const delta = Number.isFinite(change) ? `<small class="qol-km-delta ${change ? improved ? 'positive' : 'negative' : ''}" title="Change from earlier snapshot">${change > 0 ? '+' : ''}${fmt(change)}</small>` : '';
        return `<td${row[key] === null ? ' title="Not listed in this ranking"' : ''}>${cell(row, key)}${delta}</td>`;
      }).join('')}${comparison ? `<td class="qol-km-notes">${esc([comparison.status !== 'Present' ? comparison.status : '', comparison.renamed ? `Renamed from ${comparison.before.name}` : '', comparison.kingChanged ? `King changed from ${comparison.before.king || '—'}` : ''].filter(Boolean).join(' · ') || '—')}</td>` : ''}</tr>`;
    }).join('') || `<tr><td colspan="${COLUMNS.length + (comparisons ? 1 : 0)}">No kingdoms match your search.</td></tr>`}</tbody></table></div>`;
  }
  function choices(selected) {
    return snapshots.map(snapshot => `<option value="${esc(snapshot.id)}"${snapshot.id === selected ? ' selected' : ''}>${esc(date(snapshot.scannedAt))} · ${snapshot.kingdoms.length} kingdoms</option>`).join('');
  }
  function render() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const body = panel.querySelector('[data-km-body]');
    if (!snapshots.length) {
      body.innerHTML = `<div class="qol-km-first">${action(scanning ? 'Scanning Kingdoms…' : 'Scan Kingdoms', 'data-km-scan', scanning)}<p data-km-status data-tone="${tone}" role="status">${esc(status)}</p></div>`;
      return;
    }
    const selected = snapshots.find(item => item.id === selectedId) || snapshots[0]; selectedId = selected.id;
    if (!snapshots.some(item => item.id === laterId)) laterId = selected.id;
    if (!snapshots.some(item => item.id === earlierId)) earlierId = snapshots[1]?.id || '';
    let content = '';
    if (activeTab === 'results') {
      const missingRankings = S.STAGES.filter(stage => selected.missing?.[stage.tab]).map(stage => `${stage.tab}: ${selected.missing[stage.tab]}`);
      content = `<div class="qol-km-controls"><label>Snapshot <select data-km-snapshot>${choices(selected.id)}</select></label>${action('Delete snapshot', 'data-km-delete', scanning)}<span>${esc(date(selected.startedAt || selected.scannedAt))} → ${esc(date(selected.scannedAt))} · ${selected.kingdoms.length} kingdoms</span></div><p class="qol-km-caption">Rank follows the population ranking. — means the kingdom was not listed in that ranking.${missingRankings.length ? ` Missing entries by ranking: ${esc(missingRankings.join(' · '))}.` : ''}</p>${table(selected.kingdoms)}`;
    } else if (snapshots.length < 2) {
      content = '<p class="qol-km-empty">Scan Kingdoms again to compare kingdom development between two snapshots.</p>';
    } else {
      const earlier = snapshots.find(item => item.id === earlierId), later = snapshots.find(item => item.id === laterId);
      const valid = earlier && later && earlier.scannedAt < later.scannedAt;
      const comparisons = valid ? H.compare(earlier, later) : [];
      content = `<div class="qol-km-controls"><label>Earlier <select data-km-earlier>${choices(earlierId)}</select></label><label>Later <select data-km-later>${choices(laterId)}</select></label></div>${valid ? `<p class="qol-km-caption">${comparisons.filter(row => row.status === 'New').length} new · ${comparisons.filter(row => row.status === 'Missing').length} missing · ${comparisons.filter(row => row.renamed).length} renamed · ${comparisons.filter(row => row.kingChanged).length} king changes. Cells show later values and changes from the earlier snapshot; missing kingdoms show their last known values. Negative rank changes mean an improved rank.</p>${table(comparisons.map(row => row.after || row.before), comparisons)}` : '<p class="qol-km-empty">Choose two different snapshots in chronological order.</p>'}`;
    }
    body.innerHTML = `<div class="qol-km-controls">${action(scanning ? 'Scanning Kingdoms…' : 'Scan Kingdoms', 'data-km-scan', scanning)}<label class="qol-km-search">Search <input data-km-search type="search" value="${esc(search)}" placeholder="Kingdom or king"></label><span data-km-status data-tone="${tone}" role="status">${esc(status)}</span></div><nav class="qol-km-tabs" aria-label="Kingdom views">${action('Results & snapshots', `data-km-tab="results" aria-pressed="${activeTab === 'results'}"`, scanning)}${action('Comparison', `data-km-tab="comparison" aria-pressed="${activeTab === 'comparison'}"`, scanning)}</nav>${content}`;
  }
  function mountPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('section'); panel.id = PANEL_ID;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Kingdom Management');
    panel.innerHTML = `<header class="qol-km-head"><span>${CROWN} Kingdom Management</span>${action('×', 'data-km-close aria-label="Close Kingdom Management"')}</header><div class="qol-km-body" data-km-body></div>`;
    panel.addEventListener('click', async event => {
      const control = event.target.closest('.qol-km-action');
      if (!control) return;
      event.preventDefault(); event.stopPropagation();
      if (control.getAttribute('aria-disabled') === 'true' || scanning) return;
      if (control.hasAttribute('data-km-close')) close();
      if (control.hasAttribute('data-km-scan')) void scan();
      if (control.dataset.kmTab) { activeTab = control.dataset.kmTab; render(); }
      if (control.dataset.kmSort) { ascending = sortKey === control.dataset.kmSort ? !ascending : true; sortKey = control.dataset.kmSort; render(); }
      if (control.hasAttribute('data-km-delete') && !scanning && window.confirm('Delete this saved kingdom snapshot?')) {
        try { snapshots = await H.remove(selectedId); render(); } catch (error) { setStatus(`Snapshot could not be deleted: ${error.message}`, 'error'); }
      }
    });
    panel.addEventListener('keydown', activateOnKeyboard);
    panel.addEventListener('change', event => {
      const target = event.target;
      if (target.hasAttribute('data-km-snapshot')) selectedId = target.value;
      if (target.hasAttribute('data-km-earlier')) earlierId = target.value;
      if (target.hasAttribute('data-km-later')) laterId = target.value;
      render();
    });
    panel.addEventListener('input', event => {
      if (!event.target.hasAttribute('data-km-search')) return;
      search = event.target.value;
      const start = event.target.selectionStart;
      render();
      const field = panel.querySelector('[data-km-search]'); field.focus(); field.setSelectionRange(start, start);
    });
    document.body.appendChild(panel); render(); return panel;
  }
  async function refresh() {
    try { snapshots = await H.load(); render(); } catch (error) { setStatus(`Saved snapshots could not be loaded: ${error.message}`, 'error'); }
  }
  function open() {
    if (!enabled()) return null;
    const panel = mountPanel();
    window.APES?.ui?.closeOtherTools?.(FEATURE);
    panel.classList.add('qol-km-open'); panel.setAttribute('aria-hidden', 'false');
    void refresh(); return panel;
  }
  function close() {
    const panel = document.getElementById(PANEL_ID);
    panel?.classList.remove('qol-km-open'); panel?.setAttribute('aria-hidden', 'true');
  }
  function ensureLauncher() {
    const old = document.getElementById(BUTTON_ID);
    if (!enabled()) { cancelScan(); old?.remove(); close(); return; }
    if (old || !document.body) return;
    const button = document.createElement('div'); button.id = BUTTON_ID; button.className = 'qol-km-action';
    button.setAttribute('role', 'button'); button.setAttribute('tabindex', '0');
    button.title = 'Kingdom Management'; button.setAttribute('aria-label', 'Open Kingdom Management'); button.innerHTML = CROWN;
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      if (!enabled() || scanning) return;
      document.getElementById(PANEL_ID)?.classList.contains('qol-km-open') ? close() : open();
    });
    button.addEventListener('keydown', activateOnKeyboard);
    document.body.appendChild(button); window.qolRepositionAllButtons?.();
  }
  window.APES_KINGDOM_MANAGEMENT = Object.freeze({ open, close, scan, cancel: cancelScan, isScanning: () => scanning, getSnapshots: () => JSON.parse(JSON.stringify(snapshots)) });
  window.APES?.actions?.register?.({ id: 'kingdoms.open', label: 'Kingdom Management', description: 'Scan kingdom statistics and compare snapshots.', group: 'Kingdom Management', keywords: ['crown', 'kingdom', 'population', 'treasures', 'victory', 'comparison'], enabled, run: open });
  window.addEventListener('qol_setting_changed', event => { if (event.detail?.key === FEATURE) ensureLauncher(); });
  window.addEventListener('qol_close_others', event => { if (event.detail?.source !== FEATURE) close(); });
  for (const type of ['pointerdown', 'click', 'keydown', 'wheel', 'touchstart', 'touchmove']) document.addEventListener(type, guardInput, { capture: true, passive: false });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (scanning) { cancelScan(); event.preventDefault(); return; }
    if (document.getElementById(PANEL_ID)?.classList.contains('qol-km-open')) { close(); event.preventDefault(); }
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureLauncher, { once: true }); else ensureLauncher();
})();
