(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';
  const UI_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_UI';
  const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
  const REQUEST_TYPE = 'REQUEST_SNAPSHOT';
  const RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';
  const SMITHY_TYPE = 13;
  const CACHE_MS = 60000;
  const RETRY_MS = 30000;

  let snapshot = { generatedAt: 0, activeVillageId: '', villages: [] };
  let scanPromise = null;
  const smithyByVillage = new Map();

  const UNIT_STATS = Object.freeze({
    1: [40, 35, 50, 1], 2: [30, 65, 35, 1], 3: [70, 40, 25, 1], 4: [0, 20, 10, 2],
    5: [120, 65, 50, 3], 6: [180, 80, 105, 4], 7: [60, 30, 75, 3], 8: [75, 60, 10, 6],
    9: [50, 40, 30, 5], 10: [0, 80, 80, 1],
    11: [40, 20, 5, 1], 12: [10, 35, 60, 1], 13: [60, 30, 30, 1], 14: [0, 10, 5, 1],
    15: [55, 105, 40, 2], 16: [150, 50, 75, 3], 17: [65, 30, 80, 3], 18: [50, 60, 10, 6],
    19: [40, 60, 40, 4], 20: [10, 80, 80, 1],
    21: [15, 40, 50, 1], 22: [65, 35, 20, 1], 23: [0, 20, 10, 2], 24: [90, 25, 40, 2],
    25: [45, 115, 55, 2], 26: [140, 60, 165, 3], 27: [50, 30, 105, 3], 28: [70, 45, 10, 6],
    29: [40, 50, 50, 4], 30: [0, 80, 80, 1]
  });

  function sleep(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  function normalise(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function formatInt(value) {
    return Math.round(Number(value) || 0).toLocaleString();
  }

  function requestSnapshot() {
    window.postMessage({ source: UI_SOURCE, type: REQUEST_TYPE }, location.origin);
  }

  function villageById(villageId) {
    return (snapshot.villages || []).find(village => String(village?.villageId) === String(villageId)) || null;
  }

  function smithyBuilding(village) {
    const matches = (village?.buildings || []).filter(building => Number(building?.buildingType) === SMITHY_TYPE);
    if (!matches.length) return null;
    return matches.sort((a, b) => (Number(b?.lvl) || 0) - (Number(a?.lvl) || 0))[0] || null;
  }

  function stateFor(villageId) {
    return smithyByVillage.get(String(villageId)) || null;
  }

  function setState(villageId, patch) {
    const key = String(villageId);
    const current = smithyByVillage.get(key) || {
      levels: new Map(),
      scannedAt: 0,
      attemptedAt: 0,
      status: 'idle',
      message: ''
    };
    const next = { ...current, ...patch };
    smithyByVillage.set(key, next);
    return next;
  }

  function waitUntil(test, timeout = 5000, interval = 80) {
    const started = performance.now();
    return new Promise(resolve => {
      const tick = () => {
        let value = null;
        try { value = test(); } catch (_error) { value = null; }
        if (value) return resolve(value);
        if (performance.now() - started >= timeout) return resolve(null);
        window.setTimeout(tick, interval);
      };
      tick();
    });
  }

  function smithyModal() {
    return Array.from(document.querySelectorAll('.modalWrapper.building')).find(modal =>
      modal.querySelector('.buildingDetails.blacksmith') &&
      (modal.querySelector('.contentHeader .building[options="13"]') || modal.querySelector('img.buildingHuge.buildingType13'))
    ) || null;
  }

  function parseSmithyPage(modal, levels) {
    modal.querySelectorAll('.buildingDetails.blacksmith .item.unit.upgrade').forEach(item => {
      const image = item.querySelector('img.itemImage.unitThumb[data]');
      const unitId = Number.parseInt(image?.getAttribute('data') || '', 10);
      if (!Number.isFinite(unitId) || unitId <= 0) return;

      const levelSpans = Array.from(item.querySelectorAll('.additionalInfo span'));
      let level = null;
      for (let index = levelSpans.length - 1; index >= 0; index -= 1) {
        const text = levelSpans[index].textContent.replace(/[^\d-]/g, '').trim();
        if (!text) continue;
        const parsed = Number.parseInt(text, 10);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 20) {
          level = parsed;
          break;
        }
      }
      if (level !== null) levels.set(unitId, level);
    });
  }

  async function parseAllSmithyPages(modal) {
    const levels = new Map();
    parseSmithyPage(modal, levels);

    let pages = Array.from(modal.querySelectorAll('.buildingDetails.blacksmith carousel .pages .page'));
    if (pages.length > 1) {
      for (let index = 0; index < pages.length; index += 1) {
        pages = Array.from(modal.querySelectorAll('.buildingDetails.blacksmith carousel .pages .page'));
        const page = pages[index];
        if (!page) continue;
        if (!page.classList.contains('active')) {
          page.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          await sleep(140);
        }
        parseSmithyPage(modal, levels);
      }
    }
    return levels;
  }

  async function waitForVillage(village) {
    const expectedId = String(village?.villageId || '');
    const expectedName = normalise(village?.name);
    return waitUntil(() => {
      const hashId = String(location.hash).match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
      if (expectedId && hashId && hashId !== expectedId) return null;
      const name = normalise(document.querySelector('#villageList .currentVillageName .villageEntry, #villageList .villageEntry')?.textContent);
      if (expectedName && name && name !== expectedName) return null;
      return document.querySelector('#villageView');
    }, 5500, 90);
  }

  async function waitForTroopOverviewScan() {
    if (!/window:villagesOverview\/tab:Troops/i.test(location.hash)) return;
    const started = Date.now();
    while (/window:villagesOverview\/tab:Troops/i.test(location.hash) && Date.now() - started < 6000) {
      await sleep(120);
    }
    await sleep(220);
  }

  async function scanSmithy(villageId) {
    const key = String(villageId);
    const village = villageById(key);
    if (!village) return false;

    const building = smithyBuilding(village);
    const attemptedAt = Date.now();
    if (!building) {
      setState(key, {
        levels: new Map(),
        scannedAt: attemptedAt,
        attemptedAt,
        status: 'no-smithy',
        message: 'No Smithy'
      });
      patchAll();
      return true;
    }

    setState(key, { attemptedAt, status: 'scanning', message: 'Scanning Smithy…' });
    patchAll();

    let previousHash = '';
    try {
      // The troop overview scanner starts from the same expand action. Give it priority,
      // then capture the user's real route only after it has restored it.
      await sleep(500);
      await waitForTroopOverviewScan();
      previousHash = location.hash;

      const targetHash = `#/page:village/villId:${key}`;
      if (!String(location.hash).includes(`/villId:${key}`) || /\/window:/i.test(location.hash)) {
        location.hash = targetHash;
      }

      const villageReady = await waitForVillage(village);
      if (!villageReady) throw new Error('Village did not become ready.');
      await sleep(240);

      let modal = smithyModal();
      if (!modal) {
        const locationId = Number(building?.locationId);
        if (!Number.isFinite(locationId)) throw new Error('Smithy location is unavailable.');

        const area = await waitUntil(() =>
          document.querySelector(`area[location-id="${locationId}"][clickable*="openBuildingDialog"], [location-id="${locationId}"][clickable*="openBuildingDialog"]`),
        3500, 80);
        if (!area) throw new Error('Smithy map location was not found.');

        area.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        modal = await waitUntil(smithyModal, 5000, 90);
      }
      if (!modal) throw new Error('Smithy window did not open.');

      await sleep(180);
      const levels = await parseAllSmithyPages(modal);
      if (!levels.size) throw new Error('No unit levels were found in the Smithy.');

      setState(key, {
        levels,
        scannedAt: Date.now(),
        attemptedAt,
        status: 'ready',
        message: ''
      });
      return true;
    } catch (error) {
      console.warn('[APES Village Dashboard] Smithy level scan failed.', error);
      setState(key, {
        attemptedAt,
        status: 'error',
        message: String(error?.message || error)
      });
      return false;
    } finally {
      if (previousHash && location.hash !== previousHash) {
        location.hash = previousHash;
        await sleep(250);
      }
      requestSnapshot();
      patchAll();
    }
  }

  function improvedStat(base, upkeep, level) {
    const lvl = Number.isFinite(Number(level)) ? Math.max(0, Math.min(20, Number(level))) : 0;
    return base + (base + (300 * upkeep / 7)) * (Math.pow(1.007, lvl) - 1);
  }

  function troopRowData(detail, state) {
    return Array.from(detail.querySelectorAll('.apes-vd-intel-units tbody tr')).map(row => {
      const iconCell = row.children?.[0];
      const countCell = row.children?.[1];
      const levelCell = row.children?.[2];
      const unitId = Number.parseInt(iconCell?.dataset.apesUnitIcon || iconCell?.querySelector('[data-unit-id]')?.getAttribute('data-unit-id') || '', 10);
      const count = Number.parseInt(String(countCell?.textContent || '').replace(/[^\d-]/g, ''), 10) || 0;
      const level = Number.isFinite(unitId) && state?.status === 'ready'
        ? (state.levels.has(unitId) ? state.levels.get(unitId) : 0)
        : null;
      return { row, unitId, count, level, levelCell };
    }).filter(item => Number.isFinite(item.unitId));
  }

  function patchSmithyBuildingRow(detail, village) {
    const smithy = smithyBuilding(village);
    const rows = Array.from(detail.querySelectorAll('.apes-vd-intel-buildings tbody tr'));
    const row = rows.find(candidate => normalise(candidate.children?.[0]?.textContent) === 'smithy');
    if (!row) return;
    const levelCell = row.children?.[1];
    if (levelCell) levelCell.textContent = smithy ? String(Math.max(0, Number(smithy.lvl) || 0)) : '—';
  }

  function patchSource(detail, state, rowData) {
    const source = detail.querySelector('.apes-vd-intel-source');
    if (!source) return;
    const troopPart = String(source.textContent || '').split('·')[0].trim() || 'Troops';
    let smithyText = 'Smithy: waiting';
    if (state?.status === 'scanning') smithyText = 'Smithy: scanning…';
    else if (state?.status === 'ready') {
      const detected = rowData.filter(item => item.level !== null).length;
      smithyText = `Smithy levels: ${detected}/${rowData.length}`;
    } else if (state?.status === 'no-smithy') smithyText = 'Smithy: not built';
    else if (state?.status === 'error') smithyText = 'Smithy: scan unavailable';
    source.textContent = `${troopPart} · ${smithyText}`;
  }

  function patchPower(detail, rowData) {
    let attack = 0;
    let defInf = 0;
    let defCav = 0;
    rowData.forEach(item => {
      const stats = UNIT_STATS[item.unitId];
      if (!stats || !item.count) return;
      const level = item.level ?? 0;
      attack += item.count * improvedStat(stats[0], stats[3], level);
      defInf += item.count * improvedStat(stats[1], stats[3], level);
      defCav += item.count * improvedStat(stats[2], stats[3], level);
    });

    const legendRows = Array.from(detail.querySelectorAll('.apes-vd-intel-legend > div'));
    const infValue = legendRows[0]?.querySelector('strong');
    const cavValue = legendRows[1]?.querySelector('strong');
    if (infValue) infValue.textContent = formatInt(defInf);
    if (cavValue) cavValue.textContent = formatInt(defCav);

    const total = defInf + defCav;
    const infPct = total > 0 ? Math.max(0, Math.min(100, (defInf / total) * 100)) : 50;
    detail.querySelector('.apes-vd-intel-donut')?.style.setProperty('--apes-vd-inf', `${infPct.toFixed(2)}%`);

    const averageDefense = total / 2;
    const type = averageDefense > attack * 1.1 ? 'Defense' : attack > averageDefense * 1.1 ? 'Offense' : 'Mixed';
    const typeValue = detail.querySelector('.apes-vd-intel-type strong');
    if (typeValue) typeValue.textContent = type;
  }

  function patchDetail(detail) {
    const villageId = String(detail?.dataset.villageId || '');
    if (!villageId) return;
    const village = villageById(villageId);
    if (!village) return;
    const state = stateFor(villageId);

    patchSmithyBuildingRow(detail, village);
    const rowData = troopRowData(detail, state);
    rowData.forEach(item => {
      if (!item.levelCell) return;
      if (state?.status === 'ready') item.levelCell.textContent = String(item.level ?? 0);
      else if (state?.status === 'scanning') item.levelCell.textContent = '…';
    });
    patchSource(detail, state, rowData);
    if (state?.status === 'ready') patchPower(detail, rowData);
  }

  function patchAll() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.classList.contains('open')) return;
    overlay.querySelectorAll('.apes-vd-expanded-intel[data-village-id]').forEach(patchDetail);
  }

  function nextVillageToScan() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.classList.contains('open')) return '';
    const now = Date.now();
    for (const detail of overlay.querySelectorAll('.apes-vd-expanded-intel[data-village-id]')) {
      const villageId = String(detail.dataset.villageId || '');
      if (!villageId) continue;
      const state = stateFor(villageId);
      if (state?.status === 'scanning') continue;
      if (state?.status === 'ready' && now - state.scannedAt < CACHE_MS) continue;
      if (state?.status === 'no-smithy' && now - state.scannedAt < CACHE_MS) continue;
      if (state?.attemptedAt && now - state.attemptedAt < RETRY_MS) continue;
      return villageId;
    }
    return '';
  }

  function maybeScan() {
    if (scanPromise) return;
    const villageId = nextVillageToScan();
    if (!villageId) return;
    scanPromise = scanSmithy(villageId).finally(() => {
      scanPromise = null;
      window.setTimeout(maybeScan, 350);
    });
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.data?.source !== BRIDGE_SOURCE || event.data?.type !== RESPONSE_TYPE) return;
    if (!event.data.payload || typeof event.data.payload !== 'object') return;
    snapshot = event.data.payload;
    patchAll();
    maybeScan();
  });

  requestSnapshot();
  let snapshotTicks = 0;
  window.setInterval(() => {
    patchAll();
    maybeScan();
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay?.classList.contains('open')) {
      snapshotTicks += 1;
      if (snapshotTicks >= 4) {
        snapshotTicks = 0;
        requestSnapshot();
      }
    } else {
      snapshotTicks = 0;
    }
  }, 400);
})();
