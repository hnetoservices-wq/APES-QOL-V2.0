(() => {
  'use strict';

  const STORAGE_PREFIX = 'qol_watchlist_history_';
  const MAX_AGE_MS = 60 * 86400000;
  const MAX_SNAPSHOTS = 96;
  const MAX_EVENTS = 180;
  const MAX_PLAYERS = 650;
  // Preserve useful observations inside a six-hour view without storing an
  // unlimited snapshot for every unchanged refresh.
  const UNCHANGED_INTERVAL_MS = 15 * 60000;
  const SIX_HOURS_MS = 6 * 3600000;
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
      name: String(village.name).trim(),
      population: numeric(village.population)
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
      else {
        if (old.name !== village.name) {
          events.push(eventAt(at, 'village-renamed', { coords, from: old.name, to: village.name }));
        }
        // Do not manufacture a delta when either snapshot lacks village
        // population; older Watchlists had no such field.
        if (Number.isFinite(old.population) && Number.isFinite(village.population) && old.population !== village.population) {
          events.push(eventAt(at, 'village-population-changed', {
            coords, name: village.name, from: old.population, to: village.population,
            delta: village.population - old.population
          }));
        }
      }
    }
    for (const [coords, village] of previousVillages) {
      if (!currentVillages.has(coords)) {
        events.push(eventAt(at, 'village-missing', { coords, name: village.name, population: village.population, status: 'pending' }));
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
      if (event.kind !== 'village-missing' || !['pending', 'confirmed'].includes(event.status)) continue;
      if (event.at >= next.at) continue; // First sighting cannot confirm itself.
      if (current.has(event.coords)) {
        event.status = 'resolved';
        event.resolvedAt = next.at;
        dirty = true;
      } else if (event.status === 'pending') {
        event.status = 'confirmed';
        event.confirmedAt = next.at;
        dirty = true;
      }
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
    // A newly available (or now unavailable) village population reading must
    // be retained even when the player's total population did not change.
    const previousPopulation = new Map((previous?.villages || []).map(v => [position(v), v.population ?? null]));
    const villageReadingsChanged = snapshot.villages.some(v => previousPopulation.has(position(v)) &&
      (v.population ?? null) !== previousPopulation.get(position(v)));
    if (!previous || changes.length || villageReadingsChanged || snapshot.at - previous.at >= UNCHANGED_INTERVAL_MS ||
      previous.capitalConfirmed !== snapshot.capitalConfirmed) {
      entry.snapshots.push(snapshot);
    }
    entry.name = snapshot.name;
    entry.lastScannedAt = snapshot.at;
    trim(entry, snapshot.at);
    dirty = true;
    return { ok: true, events: changes };
  }
  function pruneAll(now = Date.now()) {
    const store = load();
    const sorted = Object.entries(store.players);
    for (const [id, record] of sorted) {
      const previousCount = (record.snapshots || []).length + (record.events || []).length;
      trim(record, now);
      if (!record.snapshots.length && !record.events.length) delete store.players[id];
      if (previousCount !== (record.snapshots || []).length + (record.events || []).length) dirty = true;
    }
    const remaining = Object.entries(store.players).sort((a, b) =>
      (Number(b[1].lastScannedAt) || Number(b[1].snapshots?.at?.(-1)?.at) || 0) -
      (Number(a[1].lastScannedAt) || Number(a[1].snapshots?.at?.(-1)?.at) || 0));
    if (remaining.length > MAX_PLAYERS) {
      for (const [id] of remaining.slice(MAX_PLAYERS)) delete store.players[id];
      dirty = true;
    }
  }
  function save() {
    if (!dirty) return true;
    try {
      pruneAll();
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
  function baseline(record, rangeMs, now = Date.now()) {
    const list = (record.snapshots || []).filter(s => s.at <= now);
    if (list.length < 2) return null;
    const end = list[list.length - 1];
    const start = now - rangeMs;
    if (end.at < start) return null;
    // The short view is strictly built from actual observations taken within
    // the last six hours. Older observations must not leak into it.
    if (rangeMs <= SIX_HOURS_MS) {
      const inside = list.filter(s => s.at >= start);
      if (inside.length < 2) return null;
      return { beginning: inside[0], end, complete: inside[0].at <= start };
    }
    const before = list.filter(s => s.at <= start).pop();
    const firstInside = list.find(s => s.at >= start);
    const beginning = before || firstInside;
    return beginning && beginning.at < end.at ?
      { beginning, end, complete: Boolean(before) } : null;
  }
  function trend(record, rangeMs, now = Date.now()) {
    const pair = baseline(record, rangeMs, now);
    if (!pair) return null;
    const { beginning, end, complete } = pair;
    return {
      delta: end.population - beginning.population,
      villageDelta: end.villages.length - beginning.villages.length,
      baselineAt: beginning.at,
      finalAt: end.at,
      complete,
      from: beginning.population,
      to: end.population
    };
  }
  function villageTrend(record, coords, rangeMs, now = Date.now()) {
    const list = (record.snapshots || []).filter(snapshot => snapshot.at <= now);
    if (list.length < 2) return null;
    const end = list[list.length - 1];
    const cutoff = now - rangeMs;
    if (end.at < cutoff) return null;
    const key = String(coords);
    const current = end.villages.find(v => position(v) === key);
    if (!current || !Number.isFinite(current.population)) return null;
    // Older Watchlist snapshots had no village populations. Start comparisons
    // at the first actual observation for this specific village, not at a
    // player-wide snapshot whose village population was unknown.
    const observed = list.map(snapshot => ({
      at: snapshot.at,
      village: snapshot.villages.find(v => position(v) === key)
    })).filter(item => item.village && Number.isFinite(item.village.population));
    const before = rangeMs > SIX_HOURS_MS ? observed.filter(item => item.at <= cutoff).pop() : null;
    const beginning = before || observed.find(item => item.at >= cutoff);
    if (!beginning || beginning.at >= end.at) return null;
    return {
      delta: current.population - beginning.village.population,
      from: beginning.village.population,
      to: current.population,
      baselineAt: beginning.at,
      finalAt: end.at,
      complete: Boolean(before)
    };
  }
  function chart(record, rangeMs, now = Date.now()) {
    const list = record.snapshots || [];
    const start = now - rangeMs;
    const inside = list.filter(s => s.at >= start && s.at <= now);
    if (rangeMs <= SIX_HOURS_MS) return inside;
    const anchor = list.filter(s => s.at <= start).pop();
    return anchor && inside.length ? [{ ...anchor, at: start }, ...inside] : inside;
  }
  function latestVillages(record, now = Date.now()) {
    const snapshots = record.snapshots || [];
    const latest = snapshots[snapshots.length - 1];
    if (!latest) return [];
    const previous = snapshots[snapshots.length - 2];
    const current = new Set(latest.villages.map(position));
    const recentAdditions = new Set((record.events || []).filter(event =>
      event.kind === 'village-added' && event.at > now - 7 * 86400000).map(event => event.coords));
    const villages = latest.villages.map(village => ({
      ...village,
      coords: position(village),
      status: recentAdditions.has(position(village)) ? 'new' : 'current',
      capital: latest.capitalConfirmed && latest.capital === position(village)
    }));
    const lastMissing = new Map();
    for (const event of record.events || []) {
      if (event.kind === 'village-missing') lastMissing.set(event.coords, event);
    }
    for (const [coords, missing] of lastMissing) {
      if (current.has(coords) || missing.status === 'resolved') continue;
      const [x, y] = coords.split('|');
      villages.push({
        x, y, name: missing.name, coords,
        population: numeric(missing.population),
        status: missing.status === 'confirmed' ? 'missing' : 'unverified', capital: false
      });
    }
    return villages;
  }
  window.APES_WATCHLIST_HISTORY = Object.freeze({
    key, load, read, seed, seedExisting, record, save, timeline, trend, villageTrend, chart, latestVillages,
    compareSnapshots, normalize, pruneAll,
    MAX_SNAPSHOTS, MAX_EVENTS, MAX_AGE_MS, MAX_PLAYERS
  });
})();
