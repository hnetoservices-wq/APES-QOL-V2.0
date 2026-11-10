(() => {
  'use strict';

  const STORAGE_PREFIX = 'qol_watchlist_history_';
  const MAX_AGE_MS = 60 * 86400000;
  const MAX_SNAPSHOTS = 96;
  const MAX_EVENTS = 180;
  const UNCHANGED_INTERVAL_MS = 6 * 3600000;
  const scan = window.APES_WATCHLIST_SCAN;
  let cache = null;
  let cachedRaw = null;
  let dirty = false;

  function key() { return STORAGE_PREFIX + window.location.hostname; }
  function numeric(value) { return scan.populationNumber(value); }
  function position(village) {
    return String(village.x).trim() + '|' + String(village.y).trim();
  }
  function normalize(profile, at, prior) {
    if (!profile || scan.validateProfile(profile, String(profile.playerId || ''))) return null;
    const villages = profile.villages.map(village => ({
      x: String(village.x).trim(),
      y: String(village.y).trim(),
      name: String(village.name).trim()
    })).sort((a, b) => position(a).localeCompare(position(b)));
    const confirmed = profile.capitalConfirmed === true;
    const capital = confirmed && profile.capital ? position(profile.capital) : null;
    return {
      at: Number(at) || Date.now(),
      name: String(profile.playerName).trim(),
      population: numeric(profile.population),
      villages,
      // Never infer a capital change from the game's fallback first village.
      capital: confirmed && villages.some(village => position(village) === capital) ? capital : null,
      capitalConfirmed: confirmed
    };
  }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(key()); } catch (error) {
      console.warn('[APES Watchlist History] Storage read failed:', error);
    }
    if (cache && (dirty || raw === cachedRaw)) return cache;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      cache = parsed && parsed.version === 1 && parsed.players && typeof parsed.players === 'object' && !Array.isArray(parsed.players)
        ? parsed : { version: 1, players: {} };
    } catch (error) {
      console.warn('[APES Watchlist History] Invalid storage:', error);
      cache = { version: 1, players: {} };
    }
    cachedRaw = raw;
    dirty = false;
    return cache;
  }
  function ensure(id) {
    const store = load();
    if (!store.players[id]) {
      store.players[id] = { id, snapshots: [], events: [] };
      dirty = true;
    }
    return store.players[id];
  }
  function read(playerId) {
    const id = String(playerId || '').trim();
    return load().players[id] || { id, snapshots: [], events: [] };
  }
  function eventAt(at, kind, extra) {
    return Object.assign({ at, kind }, extra);
  }
  function compareSnapshots(previous, next) {
    if (!previous) return [];
    const events = [];
    const previousVillages = new Map(previous.villages.map(v => [position(v), v]));
    const currentVillages = new Map(next.villages.map(v => [position(v), v]));
    const at = next.at;
    for (const [coords, village] of currentVillages) {
      const old = previousVillages.get(coords);
      if (!old) events.push(eventAt(at, 'village-added', { coords, name: village.name }));
      else if (old.name !== village.name) {
        events.push(eventAt(at, 'village-renamed', { coords, from: old.name, to: village.name }));
      }
    }
    for (const [coords, village] of previousVillages) {
      if (!currentVillages.has(coords)) {
        events.push(eventAt(at, 'village-missing', { coords, name: village.name, status: 'pending' }));
      }
    }
    if (previous.capitalConfirmed && next.capitalConfirmed && previous.capital !== next.capital && previous.capital && next.capital) {
      events.push(eventAt(at, 'capital-changed', { from: previous.capital, to: next.capital }));
    }
    if (Number.isFinite(previous.population) && Number.isFinite(next.population) && previous.population !== next.population) {
      events.push(eventAt(at, 'population-changed', { from: previous.population, to: next.population, delta: next.population - previous.population }));
    }
    return events;
  }
  function updatePending(record, next) {
    const current = new Set(next.villages.map(position));
    for (const event of record.events) {
      if (event.kind !== 'village-missing' || event.status !== 'pending') continue;
      if (event.at >= next.at) continue; // First sighting cannot confirm itself.
      if (current.has(event.coords)) {
        event.status = 'resolved';
        event.resolvedAt = next.at;
      } else {
        event.status = 'confirmed';
        event.confirmedAt = next.at;
      }
      dirty = true;
    }
  }
  function trim(record, now) {
    const after = now - MAX_AGE_MS;
    record.snapshots = (record.snapshots || []).filter(s => s.at >= after).slice(-MAX_SNAPSHOTS);
    record.events = (record.events || []).filter(e => e.at >= after).slice(-MAX_EVENTS);
  }
  function seed(playerId, profile, at = Date.now()) {
    const id = String(playerId || '').trim();
    if (!id) return false;
    const record = read(id);
    if (record.snapshots.length) return false;
    const snapshot = normalize({ ...profile, playerId: id }, at);
    if (!snapshot) return false;
    const entry = ensure(id);
    entry.snapshots.push(snapshot);
    entry.name = snapshot.name;
    dirty = true;
    return true;
  }
  function seedExisting(tabs, now = Date.now()) {
    let added = 0;
    // A single record per player, even if watched on several tabs.
    const byId = new Map();
    (tabs || []).forEach(tab => (tab.entries || []).forEach(entry => {
      const id = String(entry.playerId || '').trim();
      if (!id) return;
      const timestamp = Number(entry.lastUpdatedAt) || now;
      if (!byId.has(id) || timestamp > byId.get(id).timestamp) byId.set(id, { entry, timestamp });
    }));
    for (const [id, value] of byId) {
      // Pre-Phase-2 records do not prove that a capital was correctly identified.
      added += Number(seed(id, { ...value.entry, capitalConfirmed: false }, Math.min(now, value.timestamp)));
    }
    return added;
  }
  function record(playerId, profile, at = Date.now()) {
    const id = String(playerId || '').trim();
    const snapshot = normalize({ ...profile, playerId: id }, at);
    if (!snapshot) return { ok: false, reason: 'Incomplete profile.' };
    const entry = ensure(id);
    const previous = entry.snapshots[entry.snapshots.length - 1] || null;
    // Late or duplicated scan results must never rewrite chronological history.
    if (previous && snapshot.at <= previous.at) return { ok: false, reason: 'Out-of-order scan.' };
    updatePending(entry, snapshot);
    const changes = compareSnapshots(previous, snapshot);
    entry.events.push(...changes);
    if (!previous || changes.length || snapshot.at - previous.at >= UNCHANGED_INTERVAL_MS ||
      previous.capitalConfirmed !== snapshot.capitalConfirmed) {
      entry.snapshots.push(snapshot);
    }
    entry.name = snapshot.name;
    trim(entry, snapshot.at);
    dirty = true;
    return { ok: true, events: changes };
  }
  function save() {
    if (!dirty) return true;
    try {
      const raw = JSON.stringify(load());
      localStorage.setItem(key(), raw);
      cachedRaw = raw;
      dirty = false;
      return true;
    } catch (error) {
      console.warn('[APES Watchlist History] Storage write failed:', error);
      return false;
    }
  }
  function timeline(record, rangeMs = 7 * 86400000, now = Date.now()) {
    return (record.events || []).filter(event => event.at >= now - rangeMs && event.at <= now).slice().reverse();
  }
  function trend(record, rangeMs, now = Date.now()) {
    const snapshots = record.snapshots || [];
    if (snapshots.length < 2) return null;
    const end = snapshots[snapshots.length - 1];
    const startOfRange = now - rangeMs;
    const before = snapshots.filter(item => item.at <= startOfRange).pop();
    const firstInside = snapshots.find(item => item.at >= startOfRange);
    const beginning = before || firstInside;
    if (!beginning || beginning.at >= end.at) return null;
    return {
      delta: end.population - beginning.population,
      baselineAt: beginning.at,
      finalAt: end.at,
      complete: Boolean(before),
      from: beginning.population,
      to: end.population
    };
  }
  function chart(record, rangeMs, now = Date.now()) {
    const list = record.snapshots || [];
    const start = now - rangeMs;
    const anchor = list.filter(s => s.at <= start).pop();
    const inside = list.filter(s => s.at >= start && s.at <= now);
    return anchor ? [anchor, ...inside] : inside;
  }
  function latestVillages(record) {
    const snapshots = record.snapshots || [];
    const latest = snapshots[snapshots.length - 1];
    if (!latest) return [];
    const previous = snapshots[snapshots.length - 2];
    const known = new Map((previous?.villages || []).map(v => [position(v), v]));
    const current = new Set(latest.villages.map(position));
    const villages = latest.villages.map(village => ({
      ...village,
      coords: position(village),
      status: previous && !known.has(position(village)) ? 'new' : 'current',
      capital: latest.capitalConfirmed && latest.capital === position(village)
    }));
    // Missing villages remain visible separately until pruned with the history.
    if (previous) for (const village of previous.villages) {
      if (!current.has(position(village))) {
        const missing = [...record.events].reverse().find(event => event.kind === 'village-missing' && event.coords === position(village));
        villages.push({ ...village, coords: position(village), status: missing?.status === 'confirmed' ? 'missing' : 'unverified', capital: false });
      }
    }
    return villages;
  }
  window.APES_WATCHLIST_HISTORY = Object.freeze({
    key, load, read, seed, seedExisting, record, save, timeline, trend, chart, latestVillages,
    compareSnapshots, normalize,
    MAX_SNAPSHOTS, MAX_EVENTS, MAX_AGE_MS
  });
})();
