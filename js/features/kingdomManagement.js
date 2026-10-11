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
  let filters = { tags: [], kingdomTags: {} }, selectedFilter = '', filterSaving = false;
  let scanning = false, cancelled = false, scanPromise = null;
  let status = '', tone = 'neutral';
  const enabled = () => typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE) === true;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const fmt = value => Number.isFinite(value) ? value.toLocaleString('en-US') : '—';
  const date = value => new Date(value).toLocaleString();
  const delay = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  // Use APES-owned div controls: the game decorates native button elements.
  function action(label, attributes = '', disabled = false) {
    disabled = disabled || filterSaving;
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
  function statisticsRoute(base) {
    const parts = base.replace(/^#\/?/, '').split('/').filter(part => part && !/^(window|subtab|tab|statsPage|search|searchRank|location|cp|kingdomId|playerId|reportId|societyId):/i.test(part));
    return `#/${[...parts, 'window:statistics', 'tab:Kingdoms'].join('/')}`;
  }
  function routeState(hash = location.hash) {
    return Object.fromEntries(hash.replace(/^#\/?/, '').split('/').filter(part => part.includes(':')).map(part => {
      const split = part.indexOf(':'); return [part.slice(0, split).toLowerCase(), part.slice(split + 1)];
    }));
  }
  function matchesRoute(tab) {
    const state = routeState();
    // The game can normalize default parameters or leave the URL unchanged
    // when its native pager advances. The rendered pager confirms the page.
    return state.window?.toLowerCase() === 'statistics' && (!state.tab || state.tab.toLowerCase() === 'kingdoms') &&
      (!state.subtab || state.subtab.toLowerCase() === tab.toLowerCase());
  }
  function routeSummary() {
    const state = routeState();
    return `${state.window || 'no window'}/${state.tab || 'default tab'}/${state.subtab || 'default ranking'}, URL page ${state.statspage || state.cp || 'default'}`;
  }
  function ownsStatisticsRoute(originalHash) {
    const state = routeState(), original = routeState(originalHash);
    return state.window?.toLowerCase() === 'statistics' && (!state.tab || state.tab.toLowerCase() === 'kingdoms') &&
      ['page', 'villid'].every(key => !original[key] || state[key] === original[key]);
  }
  function checkCancelled() {
    if (cancelled || !enabled()) throw new Error('Kingdom scan cancelled.');
  }
  async function waitForNativeTab(selector, label) {
    const started = performance.now();
    let last = null;
    while (performance.now() - started < 12000) {
      checkCancelled();
      const control = [...document.querySelectorAll(selector)].find(S.isVisible);
      if (routeState().window?.toLowerCase() === 'statistics' && control) {
        if (last === control) return control;
        last = control;
      } else last = null;
      await delay(140);
    }
    throw new Error(`${label} tab did not become available (${routeSummary()}). No snapshot was saved.`);
  }
  async function openNativeRanking(stage, originalHash) {
    setStatus(`Opening Kingdoms · ${stage.label}…`);
    if (routeState().window?.toLowerCase() !== 'statistics') location.hash = statisticsRoute(originalHash);
    const kingdomsTab = await waitForNativeTab('.statistics .naviTabKingdoms[clickable]', 'Kingdoms');
    if (!kingdomsTab.classList.contains('active')) kingdomsTab.click();
    const rankingTab = await waitForNativeTab(`.statistics .loadedTab.tabKingdoms.currentTab .naviTab${stage.tab}[clickable]`, stage.tab);
    // Select the child tab after its Kingdoms controller exists. Opening both
    // levels through one deep link can reset the child to VictoryPoints.
    rankingTab.click();
  }
  async function waitForPage(stage, page, previous, seen) {
    const start = performance.now();
    let signature = '', stable = 0, foreignSince = null, foreignHash = '', firstPageRequested = false;
    while (performance.now() - start < 12000) {
      checkCancelled();
      const matchingRoute = matchesRoute(stage.tab);
      // Ignore transient route rewrites. A persistent departure from the
      // statistics window is an interruption, not permission to parse old DOM.
      if (routeState().window?.toLowerCase() !== 'statistics') {
        if (foreignHash !== location.hash) { foreignHash = location.hash; foreignSince = performance.now(); }
        if (foreignSince !== null && performance.now() - foreignSince >= 2500) {
          throw new Error(`${stage.label}, page ${page}: statistics navigation was interrupted (${routeSummary()}). No snapshot was saved.`);
        }
      } else { foreignSince = null; foreignHash = ''; }
      const result = S.readPage(stage);
      if (page === 1 && !previous && matchingRoute && result?.page > 1 && !firstPageRequested &&
          result.firstControl?.isConnected && !result.firstControl.classList.contains('disabled')) {
        firstPageRequested = true; result.firstControl.click();
        signature = ''; stable = 0; await delay(140); continue;
      }
      const fresh = matchingRoute && result && result.page === page && (page !== 1 || result.rows[0].ranking === 1) &&
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
    const rendered = S.readPage(stage);
    throw new Error(`${stage.label}, page ${page} did not finish loading (${routeSummary()}; rendered page ${rendered?.page || 'unavailable'}). No snapshot was saved.`);
  }
  function lockScreen() {
    const lock = document.createElement('div');
    lock.id = LOCK_ID;
    lock.setAttribute('role', 'dialog'); lock.setAttribute('aria-modal', 'true'); lock.setAttribute('aria-labelledby', 'qol-km-scan-title');
    lock.innerHTML = `<div class="qol-km-lock-card" role="status" aria-live="polite"><strong id="qol-km-scan-title">Scanning Kingdoms</strong><span data-km-progress>Preparing statistics…</span><progress data-km-bar max="5" value="0" aria-label="Completed statistics rankings"></progress>${action('Cancel scan', 'data-km-cancel')}</div>`;
    lock.querySelector('[data-km-cancel]').addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); cancelScan(); });
    lock.addEventListener('keydown', activateOnKeyboard);
    document.body.appendChild(lock);
    document.getElementById(PANEL_ID)?.classList.add('qol-km-scan-hidden');
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
    if (filterSaving) return Promise.resolve(false);
    if (scanPromise) return scanPromise;
    scanPromise = performScan().finally(() => { scanPromise = null; });
    return scanPromise;
  }
  async function performScan() {
    if (!enabled()) return false;
    scanning = true; cancelled = false;
    const originalHash = location.hash, startedAt = Date.now(), focused = document.activeElement;
    let navigated = false;
    lockScreen(); render();
    const kingdoms = new Map(), pages = {}, missing = {}, coverage = {};
    try {
      await H.load();
      filters = await H.loadFilters();
      for (let stageIndex = 0; stageIndex < S.STAGES.length; stageIndex++) {
        const stage = S.STAGES[stageIndex], seen = new Set();
        let previous = null, finished = false, advertisedLast = 1;
        for (let page = 1; page <= 10000; page++) {
          checkCancelled();
          if (page === 1) {
            navigated = true;
            await openNativeRanking(stage, originalHash);
          } else {
            const current = S.readPage(stage);
            if (!current || current.page !== previous.page || current.signature !== previous.signature || !current.hasNext || !current.nextControl?.isConnected) {
              throw new Error(`${stage.label}, page ${page}: the statistics pager changed before advancing. No snapshot was saved.`);
            }
            current.nextControl.click();
          }
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
      document.getElementById(PANEL_ID)?.classList.remove('qol-km-scan-hidden');
      if (navigated && ownsStatisticsRoute(originalHash)) location.hash = originalHash;
      render();
      if (focused?.isConnected) focused.focus?.();
    }
  }
  function sorted(rows) {
    return rows.filter(row => (!selectedFilter || filters.kingdomTags[row.id] === selectedFilter) && `${row.name} ${row.king} ${row.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) => {
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
  function filterChoices(selected, row = false) {
    const empty = row ? filters.tags.length ? 'No filter' : 'Create a Filter' : 'All kingdoms';
    return `<option value=""${selected ? '' : ' selected'}${row && !filters.tags.length ? ' hidden' : ''}>${empty}</option>${filters.tags.map(tag => `<option value="tag:${esc(tag)}"${tag === selected ? ' selected' : ''}>${esc(tag)}</option>`).join('')}<option value="create">Create a Filter</option>`;
  }
  async function changeFilter(target) {
    if (scanning || filterSaving) { render(); return; }
    const kingdomId = target.hasAttribute('data-km-row-filter') ? target.dataset.kmRowFilter : null;
    if (target.value !== 'create' && kingdomId === null) {
      selectedFilter = target.value.startsWith('tag:') ? target.value.slice(4) : ''; render(); return;
    }
    let tag = target.value.startsWith('tag:') ? target.value.slice(4) : '';
    if (target.value === 'create') {
      const input = window.prompt('Enter a tag for this filter (for example, Unreal):');
      if (input === null) { render(); return; }
      tag = input.replace(/\s+/g, ' ').trim();
      if (!tag || tag.length > 60) { render(); setStatus('Enter a tag between 1 and 60 characters.', 'error'); return; }
    }
    filterSaving = true; render();
    try {
      filters = await H.setFilter(tag, kingdomId);
      if (kingdomId === null) selectedFilter = filters.tags.find(item => item.toLocaleLowerCase() === tag.toLocaleLowerCase()) || '';
      setStatus(tag ? `Filter saved: ${tag}.` : 'Kingdom filter removed.', 'success');
    } catch (error) { setStatus(`Filter could not be saved: ${error.message}`, 'error'); }
    finally { filterSaving = false; render(); }
  }
  function table(rows, comparisons = null) {
    const compareMap = new Map((comparisons || []).map(row => [row.id, row]));
    const visible = sorted(rows);
    return `<div class="qol-km-table-wrap"><table><thead><tr class="qol-km-groups"><th scope="colgroup">Filter</th><th colspan="3" scope="colgroup">Kingdom</th><th colspan="2" scope="colgroup">Population</th><th colspan="2" scope="colgroup">Territory & players</th><th colspan="2" scope="colgroup">Attack</th><th colspan="2" scope="colgroup">Defense</th><th colspan="2" scope="colgroup">Treasures & victory</th>${comparisons ? '<th scope="col">Development</th>' : ''}</tr><tr><th scope="col" class="qol-km-filter-column">Filter</th>${COLUMNS.map(([key, label]) => `<th scope="col" aria-sort="${key === sortKey ? ascending ? 'ascending' : 'descending' : 'none'}" class="qol-km-${key}-column">${action(esc(label) + (key === sortKey ? ascending ? ' ↑' : ' ↓' : ''), `data-km-sort="${key}"`)}</th>`).join('')}${comparisons ? '<th scope="col">Changes</th>' : ''}</tr></thead><tbody>${visible.map(row => {
      const comparison = compareMap.get(row.id);
      return `<tr><td class="qol-km-filter-column"><select data-km-row-filter="${esc(row.id)}" aria-label="Filter for ${esc(row.name)}">${filterChoices(filters.kingdomTags[row.id], true)}</select></td>${COLUMNS.map(([key]) => {
        const change = comparison?.changes[key];
        const improved = key === 'rank' ? change < 0 : change > 0;
        const delta = Number.isFinite(change) ? `<small class="qol-km-delta ${change ? improved ? 'positive' : 'negative' : ''}" title="Change from earlier snapshot">${change > 0 ? '+' : ''}${fmt(change)}</small>` : '';
        return `<td class="qol-km-${key}-column"${row[key] === null ? ' title="Not listed in this ranking"' : ''}>${cell(row, key)}${delta}</td>`;
      }).join('')}${comparison ? `<td class="qol-km-notes">${esc([comparison.status !== 'Present' ? comparison.status : '', comparison.renamed ? `Renamed from ${comparison.before.name}` : '', comparison.kingChanged ? `King changed from ${comparison.before.king || '—'}` : ''].filter(Boolean).join(' · ') || '—')}</td>` : ''}</tr>`;
    }).join('') || `<tr><td colspan="${COLUMNS.length + 1 + (comparisons ? 1 : 0)}">No kingdoms match your filter or search.</td></tr>`}</tbody></table></div><span class="qol-km-caption">${visible.length} of ${rows.length} kingdoms shown</span>`;
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
    body.innerHTML = `<div class="qol-km-controls">${action(scanning ? 'Scanning Kingdoms…' : 'Scan Kingdoms', 'data-km-scan', scanning)}<label>Filter <select data-km-filter>${filterChoices(selectedFilter)}</select></label><label class="qol-km-search">Search <input data-km-search type="search" value="${esc(search)}" placeholder="Kingdom or king"></label><span data-km-status data-tone="${tone}" role="status">${esc(status)}</span></div><nav class="qol-km-tabs" aria-label="Kingdom views">${action('Results & snapshots', `data-km-tab="results" aria-pressed="${activeTab === 'results'}"`, scanning)}${action('Comparison', `data-km-tab="comparison" aria-pressed="${activeTab === 'comparison'}"`, scanning)}</nav>${content}`;
    for (const control of body.querySelectorAll('select, input')) control.disabled = scanning || filterSaving;
  }
  function mountPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement('section'); panel.id = PANEL_ID;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Kingdom Management');
    panel.innerHTML = `<header class="qol-km-head"><span>${CROWN} Kingdom Management</span>${action('×', 'data-km-close aria-label="Close Kingdom Management"')}</header><div class="qol-km-body" data-km-body></div>`;
    panel.addEventListener('click', async event => {
      if (event.target.closest('select, input')) event.stopPropagation();
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
      event.stopPropagation();
      const target = event.target;
      if (target.hasAttribute('data-km-row-filter') || target.hasAttribute('data-km-filter')) { void changeFilter(target); return; }
      if (scanning || filterSaving) return;
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
    document.body.appendChild(panel); makeDraggable(panel); render(); return panel;
  }
  function makeDraggable(panel) {
    const head = panel.querySelector('.qol-km-head');
    let drag = null;
    function clampPosition() {
      if (!panel.classList.contains('qol-km-open') || panel.classList.contains('apes-aoc-embedded-tool') || !panel.style.left) return;
      const box = panel.getBoundingClientRect();
      panel.style.left = `${Math.max(0, Math.min(box.left, window.innerWidth - box.width))}px`;
      panel.style.top = `${Math.max(0, Math.min(box.top, window.innerHeight - box.height))}px`;
    }
    head.addEventListener('pointerdown', event => {
      if (scanning || event.button !== 0 || event.target.closest('.qol-km-action') || panel.classList.contains('apes-aoc-embedded-tool')) return;
      const box = panel.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top };
      head.setPointerCapture?.(event.pointerId); event.preventDefault(); event.stopPropagation();
    });
    head.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (scanning || panel.classList.contains('apes-aoc-embedded-tool')) { drag = null; return; }
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
      panel.style.left = `${drag.left + event.clientX - drag.x}px`;
      panel.style.top = `${drag.top + event.clientY - drag.y}px`;
      clampPosition(); event.preventDefault(); event.stopPropagation();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) head.addEventListener(type, () => { drag = null; });
    window.addEventListener('resize', clampPosition);
    if (typeof ResizeObserver === 'function') new ResizeObserver(clampPosition).observe(panel);
  }
  async function refresh() {
    try { snapshots = await H.load(); filters = await H.loadFilters(); render(); } catch (error) { setStatus(`Saved kingdom data could not be loaded: ${error.message}`, 'error'); }
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
