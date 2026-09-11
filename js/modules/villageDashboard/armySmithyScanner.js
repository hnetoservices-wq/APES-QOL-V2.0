(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';
  const STORE_PREFIX = 'apes_qol_village_smithy_levels_v1';
  const RESEARCH_UI_SOURCE = 'APES_QOL_VILLAGE_RESEARCH_UI';
  const RESEARCH_BRIDGE_SOURCE = 'APES_QOL_VILLAGE_RESEARCH_BRIDGE';
  const REQUEST_TYPE = 'REQUEST_RESEARCH';
  const RESPONSE_TYPE = 'RESEARCH_RESPONSE';
  const SMITHY_BUILDING_ID = 13;
  const VILLAGE_SETTLE_MS = 900;
  const ROUTE_SETTLE_MS = 180;

  let scanActive = false;
  let scanResultState = 'idle';
  let scanProgress = { current: 0, total: 0, village: '' };
  let observer = null;
  let observedBody = null;
  const pendingResearch = new Map();

  function sleep(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  function currentVillageId() {
    return String(window.location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
  }

  function playerId() {
    const villages = window.APES_VILLAGE_PALETTE?.getVillages?.() || [];
    const direct = villages.find(village => Number.isFinite(Number(village?.playerId)))?.playerId;
    return String(direct ?? 'unknown');
  }

  function storageKey() {
    return `${STORE_PREFIX}:${window.location.hostname}:${playerId()}`;
  }

  function readStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey()) || '{}');
      if (!parsed || typeof parsed !== 'object') return { villages: {} };
      if (!parsed.villages || typeof parsed.villages !== 'object') parsed.villages = {};
      return parsed;
    } catch (_error) {
      return { villages: {} };
    }
  }

  function writeStore(store) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(store));
      return true;
    } catch (error) {
      console.warn('[APES Village Dashboard] Could not save Smithy levels.', error);
      return false;
    }
  }

  function saveVillageResearch(villageId, payload, smithyLocation = null) {
    const id = String(villageId || '');
    if (!/^\d+$/.test(id)) return;
    const store = readStore();
    const previous = store.villages[id] || {};
    store.villages[id] = {
      ...previous,
      levels: payload?.units && typeof payload.units === 'object' ? payload.units : previous.levels || {},
      loaded: payload?.loaded === true,
      smithyLocation: Number.isFinite(Number(smithyLocation)) ? Number(smithyLocation) : (previous.smithyLocation ?? null),
      scannedAt: Date.now()
    };
    writeStore(store);
  }

  function savedVillageResearch(villageId) {
    return readStore().villages?.[String(villageId || '')] || null;
  }

  function requestResearch(villageId, timeout = 700) {
    const id = String(villageId || '');
    if (!/^\d+$/.test(id)) return Promise.resolve(null);
    const requestId = `apes-smithy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise(resolve => {
      const timer = window.setTimeout(() => {
        pendingResearch.delete(requestId);
        resolve(null);
      }, timeout);
      pendingResearch.set(requestId, payload => {
        window.clearTimeout(timer);
        resolve(payload || null);
      });
      window.postMessage({
        source: RESEARCH_UI_SOURCE,
        type: REQUEST_TYPE,
        requestId,
        villageId: id
      }, window.location.origin);
    });
  }

  async function waitForResearch(villageId, timeout = 4500) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const payload = await requestResearch(villageId, 450);
      if (payload?.loaded && payload?.units && Object.keys(payload.units).length) return payload;
      await sleep(120);
    }
    return await requestResearch(villageId, 450);
  }

  function smithyLocationFromDom() {
    const view = document.getElementById('villageView');
    const image = view?.querySelector(`img.location.buildingId${SMITHY_BUILDING_ID}`);
    if (!image) return null;
    const fromId = String(image.id || '').match(/^buildingImage(\d+)$/)?.[1];
    if (fromId) return Number(fromId);
    const wrapper = image.closest('building-location');
    const locationClass = Array.from(wrapper?.classList || []).find(name => /^buildingLocation\d+$/.test(name));
    if (locationClass) return Number(locationClass.replace('buildingLocation', ''));
    return null;
  }

  async function waitForVillage(villageId, timeout = 5000) {
    const id = String(villageId || '');
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (currentVillageId() === id && document.getElementById('villageView')) return true;
      await sleep(90);
    }
    return false;
  }

  async function loadVillageResearch(village) {
    const villageId = String(village?.villageId || '');
    if (!/^\d+$/.test(villageId)) return null;

    let payload = await requestResearch(villageId, 500);
    if (payload?.loaded && Object.keys(payload.units || {}).length) {
      saveVillageResearch(villageId, payload, savedVillageResearch(villageId)?.smithyLocation ?? null);
      return payload;
    }

    const smithyLocation = smithyLocationFromDom();
    if (!Number.isFinite(Number(smithyLocation))) {
      saveVillageResearch(villageId, { loaded: false, units: {} }, null);
      return null;
    }

    window.location.hash = `#/page:village/villId:${villageId}/location:${smithyLocation}/window:building`;

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (document.querySelector('.buildingDetails.blacksmith')) break;
      await sleep(100);
    }

    payload = await waitForResearch(villageId, 4200);
    if (payload) saveVillageResearch(villageId, payload, smithyLocation);

    window.location.hash = `#/page:village/villId:${villageId}`;
    await waitForVillage(villageId, 3500);
    await sleep(ROUTE_SETTLE_MS);
    return payload;
  }

  function setButtonText() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.classList.contains('open')) return;
    const button = overlay.querySelector('[data-apes-vd-army-scan]');
    if (!button) return;

    let nextText = null;
    if (scanActive) {
      button.classList.add('busy');
      button.setAttribute('aria-disabled', 'true');
      const suffix = scanProgress.total ? ` ${scanProgress.current}/${scanProgress.total}` : '';
      nextText = `Scanning Army${suffix}…`;
    } else {
      button.classList.remove('busy');
      button.setAttribute('aria-disabled', 'false');
      if (scanResultState === 'saved') nextText = 'Saved ✓';
      if (scanResultState === 'error') nextText = 'Scan failed';
    }

    if (nextText !== null && button.textContent !== nextText) button.textContent = nextText;
  }

  function formatScanTime(timestamp) {
    const date = new Date(Number(timestamp));
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleString(undefined, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  function patchDetail(detail) {
    const villageId = String(detail?.dataset?.villageId || '');
    if (!villageId) return;
    const saved = savedVillageResearch(villageId);
    const levels = saved?.levels && typeof saved.levels === 'object' ? saved.levels : {};
    const table = detail.querySelector('.apes-vd-intel-units');
    if (!table) return;

    const header = table.querySelector('thead tr');
    if (header && !header.querySelector('.apes-vd-smithy-heading')) {
      const th = document.createElement('th');
      th.className = 'apes-vd-smithy-heading';
      th.textContent = 'Smithy';
      th.title = 'Completed Smithy upgrade level';
      header.appendChild(th);
    }

    table.querySelectorAll('tbody > tr').forEach(row => {
      if (row.querySelector('.apes-vd-intel-empty')) {
        const empty = row.querySelector('.apes-vd-intel-empty');
        if (empty && empty.colSpan !== 3) empty.colSpan = 3;
        return;
      }

      let cell = row.querySelector(':scope > .apes-vd-smithy-level-cell');
      if (!cell) {
        cell = document.createElement('td');
        cell.className = 'apes-vd-smithy-level-cell';
        row.appendChild(cell);
      }

      const absoluteId = String(row.querySelector('[data-unit-id]')?.getAttribute('data-unit-id') || '');
      const rawLevel = absoluteId ? levels[absoluteId] : undefined;
      const level = Number(rawLevel);
      const known = rawLevel !== undefined && Number.isFinite(level) && level >= 0;
      const stateKey = known ? `level:${level}` : (saved?.scannedAt ? 'na' : 'unscanned');

      if (cell.dataset.apesSmithyState !== stateKey) {
        cell.dataset.apesSmithyState = stateKey;
        cell.innerHTML = known
          ? `<span class="apes-vd-smithy-level" title="Smithy level ${level}">Lv. ${level}</span>`
          : `<span class="apes-vd-smithy-level unknown" title="${saved?.scannedAt ? 'No Smithy level applies to this unit' : 'Run Scan Army to collect Smithy levels'}">—</span>`;
      }
    });

    const source = detail.querySelector('.apes-vd-intel-source');
    if (source) {
      let status = source.querySelector('.apes-vd-smithy-source');
      if (!status) {
        status = document.createElement('span');
        status.className = 'apes-vd-smithy-source';
        source.appendChild(status);
      }
      const nextText = saved?.scannedAt
        ? ` · Smithy: ${saved.loaded ? 'scanned' : 'not available'} · ${formatScanTime(saved.scannedAt)}`
        : ' · Smithy: not scanned';
      if (status.textContent !== nextText) status.textContent = nextText;
    }
  }

  function patchExpandedRows() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.classList.contains('open')) return;
    overlay.querySelectorAll('.apes-vd-expanded-intel').forEach(patchDetail);
    setButtonText();
  }

  function installObserver() {
    const body = document.querySelector(`#${OVERLAY_ID} .apes-vd-body`);
    if (!body || body === observedBody) return;
    observer?.disconnect();
    observedBody = body;
    observer = new MutationObserver(() => queueMicrotask(patchExpandedRows));
    observer.observe(body, { childList: true, subtree: true });
    patchExpandedRows();
  }

  async function fullArmyScan() {
    if (scanActive) return;
    const villages = window.APES_VILLAGE_PALETTE?.getVillages?.() || [];
    const ids = villages.map(village => String(village?.villageId || '')).filter(id => /^\d+$/.test(id));
    if (!ids.length) return;

    scanActive = true;
    scanResultState = 'scanning';
    scanProgress = { current: 0, total: ids.length, village: '' };
    const originalHash = window.location.hash;
    let failed = false;
    setButtonText();

    try {
      const troopResult = await window.APES?.villageDashboardIntel?.refreshTroops?.();
      if (troopResult === false) failed = true;

      for (let index = 0; index < villages.length; index += 1) {
        const village = villages[index];
        const villageId = String(village?.villageId || '');
        if (!/^\d+$/.test(villageId)) continue;

        scanProgress = {
          current: index + 1,
          total: villages.length,
          village: String(village?.name || villageId)
        };
        setButtonText();

        if (currentVillageId() !== villageId || /\/window:|\/location:/i.test(window.location.hash)) {
          window.location.hash = `#/page:village/villId:${villageId}`;
        }
        const arrived = await waitForVillage(villageId, 5000);
        if (!arrived) {
          failed = true;
          continue;
        }
        await sleep(VILLAGE_SETTLE_MS);
        const payload = await loadVillageResearch(village);
        if (!payload?.loaded) failed = true;
        patchExpandedRows();
      }
    } catch (error) {
      failed = true;
      console.warn('[APES Village Dashboard] Army + Smithy scan failed.', error);
    } finally {
      if (window.location.hash !== originalHash) {
        window.location.hash = originalHash;
        await sleep(250);
      }
      scanActive = false;
      scanResultState = failed ? 'error' : 'saved';
      scanProgress = { current: 0, total: 0, village: '' };
      window.APES_VILLAGE_PALETTE?.refresh?.();
      window.dispatchEvent(new CustomEvent('apes_vd_smithy_levels_updated'));
      window.setTimeout(patchExpandedRows, 120);
    }
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.data?.source !== RESEARCH_BRIDGE_SOURCE || event.data?.type !== RESPONSE_TYPE) return;
    const requestId = String(event.data?.requestId || '');
    const resolve = pendingResearch.get(requestId);
    if (!resolve) return;
    pendingResearch.delete(requestId);
    resolve(event.data?.payload || null);
  });

  window.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-apes-vd-army-scan]');
    if (!button) return;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!scanActive) void fullArmyScan();
  }, true);

  window.addEventListener('keydown', event => {
    const button = event.target?.closest?.('[data-apes-vd-army-scan]');
    if (!button || !['Enter', ' '].includes(event.key)) return;
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!scanActive) void fullArmyScan();
  }, true);

  window.setInterval(() => {
    installObserver();
    patchExpandedRows();
  }, 400);

  window.APES = window.APES || {};
  window.APES.villageSmithyLevels = Object.freeze({
    scan: fullArmyScan,
    get: villageId => savedVillageResearch(villageId),
    isScanning: () => scanActive
  });
})();
