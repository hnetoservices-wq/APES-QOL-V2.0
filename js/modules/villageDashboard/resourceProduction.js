(() => {
  'use strict';

  const STORE_PREFIX = 'apes_qol_village_resource_production_v1';
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

  function save(villageId, production) {
    const id = String(villageId || '');
    if (!/^\d+$/.test(id) || !production || typeof production !== 'object') return false;
    const store = readStore();
    const previous = store.villages[id] || {};
    const next = {
      ...previous,
      production: {
        ...(previous.production || {}),
        ...production
      },
      scannedAt: Date.now()
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
    return save(villageId, production);
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
    get: villageId => readStore().villages?.[String(villageId || '')] || null,
    all: () => ({ ...(readStore().villages || {}) })
  });

  scheduleCapture();
})();
