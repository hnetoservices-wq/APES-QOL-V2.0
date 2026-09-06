(() => {
  'use strict';

  const A = window.APES_AOC_INTERNAL;
  const D = A?.data;
  if (!D || D.__intelLayerV1) return;
  D.__intelLayerV1 = true;

  const MAX_AGE_MS = 6 * 60 * 60 * 1000;
  const OBSERVE_DEBOUNCE_MS = 180;
  let cache = null;
  let cacheKey = '';
  let observeTimer = null;

  function storeKey() {
    return `apes_aoc_intel_v1:${location.hostname}:${String(D.snapshot?.playerId ?? 'unknown')}`;
  }

  function readStore() {
    const key = storeKey();
    if (cache && cacheKey === key) return cache;
    try {
      cache = JSON.parse(localStorage.getItem(key) || '{}') || {};
    } catch (_) {
      cache = {};
    }
    cache.villages = cache.villages || {};
    cacheKey = key;
    return cache;
  }

  function writeStore() {
    try { localStorage.setItem(storeKey(), JSON.stringify(readStore())); } catch (_) {}
  }

  function villageId() {
    const id = String(D.currentVillageId?.() || '');
    return /^\d+$/.test(id) ? id : '';
  }

  function cleanText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function number(value) {
    const text = cleanText(value).replace(/[\u2212]/g, '-');
    if (!text) return 0;
    const compact = text.replace(/\s/g, '').match(/^([+-]?)(\d+(?:[.,]\d+)?)([kKmM])$/);
    if (compact) {
      const base = Number.parseFloat(compact[2].replace(',', '.'));
      const multiplier = compact[3].toLowerCase() === 'm' ? 1e6 : 1e3;
      return Math.round((compact[1] === '-' ? -1 : 1) * base * multiplier);
    }
    const negative = /^-/.test(text);
    const digits = text.replace(/[^0-9]/g, '');
    return digits ? (negative ? -1 : 1) * Number.parseInt(digits, 10) : 0;
  }

  function durationMs(value) {
    const text = cleanText(value).toLowerCase();
    if (!text || /ready|now/.test(text)) return 0;
    let ms = 0;
    let matched = false;
    const unitPattern = /(\d+)\s*(d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/g;
    let match;
    while ((match = unitPattern.exec(text))) {
      matched = true;
      const amount = Number(match[1]);
      const unit = match[2];
      if (unit === 'd' || unit.startsWith('day')) ms += amount * 86400000;
      else if (unit === 'h' || unit.startsWith('hr') || unit.startsWith('hour')) ms += amount * 3600000;
      else if (unit === 'm' || unit.startsWith('min')) ms += amount * 60000;
      else ms += amount * 1000;
    }
    if (matched) return ms;
    const clock = text.match(/(?:(\d+)d\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (clock) {
      const days = Number(clock[1] || 0);
      const hours = Number(clock[2] || 0);
      const minutes = Number(clock[3] || 0);
      const seconds = Number(clock[4] || 0);
      return days * 86400000 + hours * 3600000 + minutes * 60000 + seconds * 1000;
    }
    return null;
  }

  function rowCells(table) {
    return [...table.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('td')].map(cell => cleanText(cell.textContent)));
  }

  function headers(table) {
    return [...table.querySelectorAll('thead th')].map(cell => cleanText(cell.textContent).toLowerCase());
  }

  function isVisible(element) {
    if (!element?.isConnected) return false;
    const rectangle = element.getBoundingClientRect();
    if (rectangle.width <= 0 || rectangle.height <= 0) return false;
    for (let current = element; current && current !== document.body; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  }

  function category(type) {
    const text = String(type || '').toLowerCase();
    if (text.includes('siege')) return 'siege';
    if (text.includes('attack')) return 'attack';
    if (text.includes('raid')) return 'raid';
    if (text.includes('reinforcement') || text.includes('support')) return 'reinforcement';
    if (text.includes('merchant')) return 'merchant';
    return 'other';
  }

  function saveSection(id, section, items) {
    if (!id) return;
    const store = readStore();
    const village = store.villages[id] = store.villages[id] || {};
    const payload = { capturedAt: Date.now(), items };
    const previous = JSON.stringify(village[section]?.items || []);
    const next = JSON.stringify(items);
    village[section] = payload;
    store.updatedAt = Date.now();
    writeStore();
    if (previous !== next) window.dispatchEvent(new CustomEvent('apes_aoc_force_render', { detail: { reason: `intel:${section}`, villageId: id } }));
  }

  function parseIncomingMovements(table, id) {
    const items = rowCells(table).map(cells => {
      if (cells.length < 5) return null;
      const remainingMs = durationMs(cells[3]);
      return {
        enemy: cells[0],
        originVillage: cells[1],
        type: cells[2],
        category: category(cells[2]),
        remaining: cells[3],
        landing: cells[4],
        eta: Number.isFinite(remainingMs) ? Date.now() + remainingMs : null
      };
    }).filter(Boolean);
    saveSection(id, 'incomingMovements', items);
  }

  function parseIncomingResources(table, id) {
    const items = rowCells(table).map(cells => {
      if (cells.length < 8) return null;
      const remainingMs = durationMs(cells[2]);
      return {
        sender: cells[0],
        originVillage: cells[1],
        remaining: cells[2],
        eta: Number.isFinite(remainingMs) ? Date.now() + remainingMs : null,
        wood: number(cells[3]),
        clay: number(cells[4]),
        iron: number(cells[5]),
        crop: number(cells[6]),
        total: number(cells[7])
      };
    }).filter(Boolean);
    saveSection(id, 'incomingResources', items);
  }

  function parseOutgoings(table, id) {
    const items = rowCells(table).map(cells => {
      if (cells.length < 5) return null;
      const remainingMs = durationMs(cells[3]);
      return {
        target: cells[0],
        targetVillage: cells[1],
        type: cells[2],
        category: category(cells[2]),
        remaining: cells[3],
        landing: cells[4],
        eta: Number.isFinite(remainingMs) ? Date.now() + remainingMs : null
      };
    }).filter(Boolean);
    saveSection(id, 'outgoings', items);
  }

  function inspectEmptyStates(id) {
    document.querySelectorAll('.qol-rp-empty,.qol-ir-empty').forEach(empty => {
      if (!isVisible(empty)) return;
      const text = cleanText(empty.textContent).toLowerCase();
      if (text.includes('scan completed without finding any of the selected movement types')) saveSection(id, 'incomingMovements', []);
      else if (text.includes('scan completed without finding any active incoming resource shipments')) saveSection(id, 'incomingResources', []);
    });
  }

  function inspectTables() {
    observeTimer = null;
    const id = villageId();
    if (!id) return;
    document.querySelectorAll('table').forEach(table => {
      if (!isVisible(table)) return;
      const head = headers(table);
      if (head.length < 5) return;
      const signature = head.join('|');
      if (signature === 'enemy|village|type|remaining|landing') parseIncomingMovements(table, id);
      else if (signature === 'player|village|remaining|wood|clay|iron|crop|total') parseIncomingResources(table, id);
      else if (signature === 'target|village|type|remaining|landing') parseOutgoings(table, id);
    });
    inspectEmptyStates(id);
  }

  function scheduleInspect() {
    if (observeTimer !== null) clearTimeout(observeTimer);
    observeTimer = setTimeout(inspectTables, OBSERVE_DEBOUNCE_MS);
  }

  function freshSection(section) {
    if (!section || !Number.isFinite(Number(section.capturedAt))) return null;
    const age = Date.now() - Number(section.capturedAt);
    if (age > MAX_AGE_MS) return null;
    return { ...section, age };
  }

  D.intelFor = id => {
    const village = readStore().villages?.[String(id)] || {};
    return {
      incomingMovements: freshSection(village.incomingMovements),
      incomingResources: freshSection(village.incomingResources),
      outgoings: freshSection(village.outgoings)
    };
  };

  D.intelStamp = id => {
    const village = readStore().villages?.[String(id)] || {};
    return Math.max(
      Number(village.incomingMovements?.capturedAt) || 0,
      Number(village.incomingResources?.capturedAt) || 0,
      Number(village.outgoings?.capturedAt) || 0
    );
  };

  D.intelResourceOverflow = village => {
    const intel = D.intelFor(village?.villageId)?.incomingResources;
    const resources = D.projected(village);
    if (!intel?.items?.length || !resources.length) return [];
    const now = Date.now();
    const state = Object.fromEntries(resources.map(resource => [resource.key, {
      current: Number(resource.current) || 0,
      capacity: Number(resource.capacity) || 0,
      production: Number(resource.production) || 0
    }]));
    const warnings = [];
    [...intel.items].filter(item => Number.isFinite(Number(item.eta)) && Number(item.eta) > now).sort((a, b) => a.eta - b.eta).forEach(item => {
      const hours = Math.max(0, Number(item.eta) - now) / 3600000;
      ['wood', 'clay', 'iron', 'crop'].forEach(key => {
        const resource = state[key];
        if (!resource) return;
        const beforeArrival = Math.max(0, Math.min(resource.capacity, resource.current + resource.production * hours));
        const afterArrival = beforeArrival + (Number(item[key]) || 0);
        if (resource.capacity > 0 && afterArrival > resource.capacity) {
          warnings.push({ key, overflow: Math.round(afterArrival - resource.capacity), eta: item.eta, shipment: item });
        }
      });
    });
    return warnings;
  };

  const observer = new MutationObserver(scheduleInspect);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('qol_setting_changed', scheduleInspect);

  window.APES_AOC_INTEL = Object.freeze({
    version: 1,
    inspect: id => D.intelFor(id),
    clear() {
      cache = { villages: {} };
      cacheKey = storeKey();
      writeStore();
      window.dispatchEvent(new CustomEvent('apes_aoc_force_render', { detail: { reason: 'intel-cleared' } }));
    }
  });

  scheduleInspect();
})();
