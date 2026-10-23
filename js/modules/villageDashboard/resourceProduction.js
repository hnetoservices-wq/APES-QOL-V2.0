(() => {
  'use strict';

  const STORE_PREFIX = 'apes_qol_village_resource_production_v1';
  const HISTORY_PREFIX = 'apes_qol_account_resource_production_history_v1';
  const MAX_SCAN_SNAPSHOTS = 180;
  const RESOURCE_DEFS = Object.freeze([
    { key: 'wood', label: 'Wood' },
    { key: 'clay', label: 'Clay' },
    { key: 'iron', label: 'Iron' },
    { key: 'crop', label: 'Crop' }
  ]);

  let captureTimer = null;
  let secondPassTimer = null;
  let lastSignature = '';

  function currentVillageId() {
    return String(window.location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
  }

  function playerId() {
    const villages = window.APES_VILLAGE_PALETTE?.getVillages?.() || [];
    const direct = villages.find(village => Number.isFinite(Number(village?.playerId)))?.playerId;
    return Number.isFinite(Number(direct)) ? String(direct) : '';
  }

  function storageKey() {
    const player = playerId();
    return player ? `${STORE_PREFIX}:${window.location.hostname}:${player}` : '';
  }

  function readStore() {
    const key = storageKey();
    if (!key) return { villages: {} };
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      if (!parsed || typeof parsed !== 'object') return { villages: {} };
      if (!parsed.villages || typeof parsed.villages !== 'object') parsed.villages = {};
      return parsed;
    } catch (_error) {
      return { villages: {} };
    }
  }

  function writeStore(store) {
    const key = storageKey();
    if (!key) return false;
    try {
      localStorage.setItem(key, JSON.stringify(store));
      return true;
    } catch (error) {
      console.warn('[APES Village Dashboard] Could not save resource production.', error);
      return false;
    }
  }

  function normaliseNumeric(value) {
    return String(value ?? '')
      .replace(/\u2212/g, '-')
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
      .replace(/\s+/g, '')
      .trim();
  }

  function parseSignedInteger(value) {
    const text = normaliseNumeric(value);
    if (!text) return null;
    const compact = text.match(/^([+-]?)(\d+(?:[.,]\d+)?)([kKmM])$/);
    if (compact) {
      const sign = compact[1] === '-' ? -1 : 1;
      const number = Number.parseFloat(compact[2].replace(',', '.'));
      const multiplier = compact[3].toLowerCase() === 'm' ? 1000000 : 1000;
      return Number.isFinite(number) ? Math.round(sign * number * multiplier) : null;
    }
    const negative = text.startsWith('-');
    const digits = text.replace(/[^0-9]/g, '');
    if (!digits) return null;
    const number = Number.parseInt(digits, 10);
    return Number.isFinite(number) ? (negative ? -number : number) : null;
  }

  function directText(element) {
    if (!element) return '';
    return Array.from(element.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent || '')
      .join(' ')
      .trim();
  }

  function readCurrentProduction() {
    const output = {};
    let found = 0;

    for (const resource of RESOURCE_DEFS) {
      const stock = document.querySelector(`#resourceBar .stockContainer.${resource.key}`);
      const block = stock?.closest('[ng-repeat]') || stock?.parentElement;
      const productionNode = block?.querySelector('.production .value');
      const production = parseSignedInteger(directText(productionNode));
      if (!Number.isFinite(production)) continue;
      output[resource.key] = production;
      found += 1;
    }

    return found ? output : null;
  }


  // Use exact progressbar attributes, not the visually abbreviated "219k".
  // Each reading is a single-village snapshot; stale snapshots remain labeled.
  function readCurrentStock() {
    const stock = {};
    for (const resource of RESOURCE_DEFS) {
      const bar = document.querySelector(
        `#resourceBar .stockContainer.${resource.key} .progressbar[value][max-value]`
      );
      if (!bar) return null;
      const amountText = bar.getAttribute('value');
      const capacityText = bar.getAttribute('max-value');
      if (amountText == null || capacityText == null ||
          !String(amountText).trim() || !String(capacityText).trim()) return null;
      const amount = Number(amountText);
      const capacity = Number(capacityText);
      if (!Number.isFinite(amount) || amount < 0 ||
          !Number.isFinite(capacity) || capacity <= 0) return null;
      stock[resource.key] = { amount, capacity };
    }
    return stock;
  }

  function save(villageId, production, currentStock = null) {
    const id = String(villageId || '');
    if (!/^\d+$/.test(id) || !production || typeof production !== 'object') return false;
    const store = readStore();
    const previous = store.villages[id] || {};
    const now = Date.now();
    const next = {
      ...previous,
      production: {
        ...(previous.production || {}),
        ...production
      },
      scannedAt: now,
      ...(currentStock ? { stock: currentStock, stockAt: now } : {})
    };
    store.villages[id] = next;
    if (!writeStore(store)) return false;
    window.dispatchEvent(new CustomEvent('apes_vd_resource_production_updated', {
      detail: { villageId: id, production: { ...next.production } }
    }));
    return true;
  }

  function captureCurrent() {
    const villageId = currentVillageId();
    if (!villageId || !/\/page:village(?:\/|$)/i.test(window.location.hash)) return false;
    if (/\/window:villagesOverview/i.test(window.location.hash)) return false;
    if (!document.getElementById('resourceBar')) return false;

    const production = readCurrentProduction();
    if (!production) return false;

    const signature = `${villageId}:${RESOURCE_DEFS.map(item => production[item.key] ?? '').join(':')}`;
    if (signature === lastSignature) return true;
    lastSignature = signature;
    return save(villageId, production, readCurrentStock());
  }

  function captureForScan(expectedVillageId) {
    const villageId=String(expectedVillageId || '');
    if (!/^\d+$/.test(villageId) || currentVillageId()!==villageId ||
        !/\/page:village(?:\/|$)/i.test(window.location.hash) ||
        !document.getElementById('resourceBar')) return null;
    const production=readCurrentProduction();
    if (!production || RESOURCE_DEFS.some(resource=>!Number.isFinite(production[resource.key]))) return null;
    if (!save(villageId,production,readCurrentStock())) return null;
    return {villageId,production,capturedAt:Date.now()};
  }

  function historyStorageKey() {
    const player=playerId();
    return player ? `${HISTORY_PREFIX}:${window.location.hostname}:${player}` : '';
  }

  function scanHistory() {
    const key=historyStorageKey();
    if(!key)return [];
    try{
      const data=JSON.parse(localStorage.getItem(key)||'[]');
      return Array.isArray(data) ? data.filter(row=>
        Number.isFinite(Number(row?.timestamp))&&row?.totals&&typeof row.totals==='object'&&
        Number.isInteger(Number(row?.captured))&&Number.isInteger(Number(row?.villages))
      ).sort((a,b)=>Number(a.timestamp)-Number(b.timestamp)).slice(-MAX_SCAN_SNAPSHOTS) : [];
    }catch(_error){return [];}
  }

  function recordScan(expectedVillageIds,captures) {
    const key=historyStorageKey();
    if(!key||!Array.isArray(expectedVillageIds)||!expectedVillageIds.length)return false;
    const expected=[...new Set(expectedVillageIds.map(String).filter(id=>/^\d+$/.test(id)))];
    if(!expected.length)return false;
    const values=captures&&typeof captures==='object'?captures:{};
    const perVillage={};
    for(const id of expected) {
      const reading=values[id];
      if(reading?.villageId!==id||!reading?.production||
         RESOURCE_DEFS.some(resource=>!Number.isFinite(Number(reading.production[resource.key]))))continue;
      perVillage[id]=Object.fromEntries(RESOURCE_DEFS.map(resource=>[resource.key,Number(reading.production[resource.key])]));
    }
    const totals=Object.fromEntries(RESOURCE_DEFS.map(resource=>[
      resource.key,Object.values(perVillage).reduce((sum,village)=>sum+village[resource.key],0)
    ]));
    const captured=Object.keys(perVillage).length;
    const item={timestamp:Date.now(),villages:expected.length,captured,complete:captured===expected.length,totals,perVillage};
    try{
      const records=scanHistory();
      records.push(item);
      localStorage.setItem(key,JSON.stringify(records.slice(-MAX_SCAN_SNAPSHOTS)));
      window.dispatchEvent(new CustomEvent('apes_vd_resource_history_updated',{
        detail:{timestamp:item.timestamp,captured,villages:expected.length,complete:item.complete}
      }));
      return true;
    }catch(error){
      console.warn('[APES Village Dashboard] Could not save resource production scan history.',error);
      return false;
    }
  }

  function scheduleCapture() {
    window.clearTimeout(captureTimer);
    window.clearTimeout(secondPassTimer);
    captureTimer = window.setTimeout(captureCurrent, 320);
    secondPassTimer = window.setTimeout(captureCurrent, 850);
  }

  window.addEventListener('hashchange', scheduleCapture);
  window.addEventListener('apes_vd_smithy_levels_updated', scheduleCapture);

  window.setInterval(() => {
    if (document.getElementById('apes-v2-village-overlay')?.classList.contains('open')) captureCurrent();
  }, 1500);

  window.APES = window.APES || {};
  window.APES.villageResourceProduction = Object.freeze({
    capture: captureCurrent,
    captureForScan,
    recordScan,
    scanHistory,
    get: villageId => readStore().villages?.[String(villageId || '')] || null,
    all: () => ({ ...(readStore().villages || {}) })
  });

  scheduleCapture();
})();
