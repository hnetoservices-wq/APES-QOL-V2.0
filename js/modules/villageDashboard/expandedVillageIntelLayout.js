(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';
  let observer = null;
  let observedBody = null;
  let scheduled = false;

  const UNIT_META = new Map([
    ['legionnaire', ['roman', 1, 1]],
    ['praetorian', ['roman', 2, 2]],
    ['imperian', ['roman', 3, 3]],
    ['equites legati', ['roman', 4, 4]],
    ['equites imperatoris', ['roman', 5, 5]],
    ['equites caesaris', ['roman', 6, 6]],
    ['battering ram', ['roman', 7, 7]],
    ['fire catapult', ['roman', 8, 8]],
    ['senator', ['roman', 9, 9]],
    ['settler|roman', ['roman', 10, 10]],

    ['clubswinger', ['teuton', 1, 11]],
    ['spearman', ['teuton', 2, 12]],
    ['axeman', ['teuton', 3, 13]],
    ['scout', ['teuton', 4, 14]],
    ['paladin', ['teuton', 5, 15]],
    ['teutonic knight', ['teuton', 6, 16]],
    ['ram|teuton', ['teuton', 7, 17]],
    ['catapult', ['teuton', 8, 18]],
    ['chief', ['teuton', 9, 19]],
    ['settler|teuton', ['teuton', 10, 20]],

    ['phalanx', ['gaul', 1, 21]],
    ['swordsman', ['gaul', 2, 22]],
    ['pathfinder', ['gaul', 3, 23]],
    ['theutates thunder', ['gaul', 4, 24]],
    ['druidrider', ['gaul', 5, 25]],
    ['haeduan', ['gaul', 6, 26]],
    ['ram|gaul', ['gaul', 7, 27]],
    ['trebuchet', ['gaul', 8, 28]],
    ['chieftain', ['gaul', 9, 29]],
    ['settler|gaul', ['gaul', 10, 30]]
  ]);

  function normalise(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function inferTribe(detail) {
    const names = Array.from(detail.querySelectorAll('.apes-vd-intel-units tbody td:first-child'))
      .map(cell => normalise(cell.textContent));
    if (names.some(name => ['clubswinger', 'spearman', 'axeman', 'paladin', 'teutonic knight'].includes(name))) return 'teuton';
    if (names.some(name => ['phalanx', 'swordsman', 'pathfinder', 'druidrider', 'haeduan'].includes(name))) return 'gaul';
    if (names.some(name => ['legionnaire', 'praetorian', 'imperian', 'equites legati', 'equites caesaris'].includes(name))) return 'roman';
    return '';
  }

  function unitMeta(name, tribe) {
    const key = normalise(name);
    if (UNIT_META.has(key)) return UNIT_META.get(key);
    return UNIT_META.get(`${key}|${tribe}`) || null;
  }

  function countFromRow(row) {
    const raw = row.children?.[1]?.textContent || '';
    const value = Number(raw.replace(/[^\d-]/g, ''));
    return Number.isFinite(value) ? value : 0;
  }

  function patchUnitTable(detail) {
    const tbody = detail.querySelector('.apes-vd-intel-units tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll(':scope > tr'));
    if (!rows.length || rows.some(row => row.querySelector('.apes-vd-intel-empty'))) return;

    const tribe = inferTribe(detail);
    const decorated = rows.map((row, originalIndex) => {
      const firstCell = row.children?.[0];
      const storedName = row.dataset.apesUnitName || firstCell?.textContent || '';
      const name = storedName.replace(/\s+/g, ' ').trim();
      if (!row.dataset.apesUnitName) row.dataset.apesUnitName = name;
      return { row, name, count: countFromRow(row), originalIndex };
    });

    decorated.sort((left, right) => right.count - left.count || left.originalIndex - right.originalIndex);
    decorated.forEach(({ row, name }) => {
      const meta = unitMeta(name, tribe);
      const cell = row.children?.[0];
      if (!cell) return;
      if (meta) {
        const [tribeClass, localIndex, absoluteId] = meta;
        if (cell.dataset.apesUnitIcon !== String(absoluteId)) {
          cell.dataset.apesUnitIcon = String(absoluteId);
          cell.innerHTML = `<span class="apes-vd-unit-icon-wrap" title="${name}" aria-label="${name}"><i class="unitSmall ${tribeClass} unitType${localIndex}" data-unit-id="${absoluteId}" aria-hidden="true"></i></span>`;
        }
      }
      tbody.appendChild(row);
    });

    const heading = detail.querySelector('.apes-vd-intel-units thead th:first-child');
    if (heading && heading.textContent !== 'Unit') heading.textContent = 'Unit';
  }

  function ensureVillageToggleProxy(row) {
    const villageCell = row.querySelector(':scope > .apes-vd-village');
    const source = row.querySelector(':scope > .apes-vd-expand-toggle');
    if (!villageCell || !source) return;

    let proxy = villageCell.querySelector(':scope > .apes-vd-expand-toggle-proxy');
    if (!proxy) {
      proxy = document.createElement('span');
      proxy.className = 'apes-vd-expand-toggle-proxy';
      proxy.setAttribute('role', 'button');
      proxy.tabIndex = 0;
      proxy.title = 'Expand village information';
      proxy.setAttribute('aria-label', 'Expand village information');
      villageCell.appendChild(proxy);
    }

    const isOpen = source.classList.contains('open') || source.getAttribute('aria-expanded') === 'true';
    proxy.dataset.apesVdExpandProxy = source.dataset.apesVdExpand || '';
    proxy.classList.toggle('open', isOpen);
    proxy.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    proxy.innerHTML = `<span class="apes-vd-expand-toggle-proxy-label">Info</span><span class="apes-vd-expand-toggle-proxy-arrow">${isOpen ? '⌃' : '⌄'}</span>`;
  }

  function patch() {
    scheduled = false;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.classList.contains('open')) return;
    const body = overlay.querySelector('.apes-vd-body');
    if (!body) return;

    body.querySelectorAll(':scope > .apes-vd-row').forEach(ensureVillageToggleProxy);
    body.querySelectorAll(':scope > .apes-vd-expanded-intel').forEach(patchUnitTable);
  }

  function schedulePatch() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(patch);
  }

  function installObserver() {
    const overlay = document.getElementById(OVERLAY_ID);
    const body = overlay?.querySelector('.apes-vd-body');
    if (!body || body === observedBody) return;
    observer?.disconnect();
    observedBody = body;
    observer = new MutationObserver(schedulePatch);
    observer.observe(body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'aria-expanded'] });
    schedulePatch();
  }

  document.addEventListener('click', event => {
    const proxy = event.target.closest?.('.apes-vd-expand-toggle-proxy[data-apes-vd-expand-proxy]');
    if (!proxy) return;
    const row = proxy.closest('.apes-vd-row');
    const source = row?.querySelector(':scope > .apes-vd-expand-toggle');
    if (!source) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    source.click();
    schedulePatch();
  }, true);

  document.addEventListener('keydown', event => {
    const proxy = event.target.closest?.('.apes-vd-expand-toggle-proxy[data-apes-vd-expand-proxy]');
    if (!proxy || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    proxy.click();
  }, true);

  window.setInterval(() => {
    installObserver();
    schedulePatch();
  }, 350);
})();
