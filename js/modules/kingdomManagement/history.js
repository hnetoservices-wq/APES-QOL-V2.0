(() => {
  'use strict';
  const APES = window.APES;
  const OPTIONS = Object.freeze({ feature: 'kingdomManagement', key: 'snapshots', scope: 'server' });
  const FALLBACK_KEY = `apes_kingdom_management_snapshots_v1_${location.hostname}`;
  const METRICS = Object.freeze(['rank', 'villages', 'population', 'area', 'players', 'averageAttack', 'totalAttack', 'averageDefense', 'totalDefense', 'treasures', 'victoryPoints']);
  let snapshots = [];
  let filters = { tags: [], kingdomTags: {} };
  let loading = null;
  let writing = Promise.resolve();
  const clone = value => JSON.parse(JSON.stringify(value));
  const cleanTag = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  async function load() {
    if (!loading) loading = (async () => {
      const raw = APES?.storage?.get ? await APES.storage.get(OPTIONS, null) : JSON.parse(localStorage.getItem(FALLBACK_KEY) || 'null');
      snapshots = Array.isArray(raw?.snapshots) ? raw.snapshots.filter(item => item?.complete === true && item.server === location.hostname && Array.isArray(item.kingdoms)).sort((a, b) => b.scannedAt - a.scannedAt) : [];
      const tags = [];
      for (const value of Array.isArray(raw?.filters?.tags) ? raw.filters.tags : []) {
        if (typeof value !== 'string') continue;
        const tag = cleanTag(value);
        if (tag && tag.length <= 60 && !tags.some(item => item.toLocaleLowerCase() === tag.toLocaleLowerCase())) tags.push(tag);
      }
      const kingdomTags = Object.fromEntries(Object.entries(raw?.filters?.kingdomTags || {}).filter(([id, tag]) => /^\d+$/.test(id) && Number(id) > 0 && tags.includes(tag)));
      filters = { tags, kingdomTags };
      return clone(snapshots);
    })().catch(error => { loading = null; throw error; });
    await loading;
    return clone(snapshots);
  }
  async function write(next, nextFilters = filters) {
    const data = { version: 1, snapshots: next, filters: nextFilters };
    if (APES?.storage?.set) await APES.storage.set(OPTIONS, data);
    else localStorage.setItem(FALLBACK_KEY, JSON.stringify(data));
    snapshots = next;
    filters = nextFilters;
  }
  function mutate(task) {
    const pending = writing.then(async () => { await load(); return task(); });
    writing = pending.catch(() => {});
    return pending;
  }
  function append(snapshot) {
    return mutate(async () => {
      if (!snapshot?.complete || snapshot.server !== location.hostname || !snapshot.kingdoms?.length) throw new Error('Only completed kingdom scans can be saved.');
      await write([clone(snapshot), ...snapshots]);
      return clone(snapshots);
    });
  }
  function remove(id) {
    return mutate(async () => {
      await write(snapshots.filter(snapshot => snapshot.id !== id));
      return clone(snapshots);
    });
  }
  async function loadFilters() { await writing; await load(); return clone(filters); }
  function setFilter(value, kingdomId = null) {
    return mutate(async () => {
      const tag = cleanTag(value);
      if ((!tag && kingdomId === null) || tag.length > 60) throw new Error('Enter a tag between 1 and 60 characters.');
      if (kingdomId !== null && (!/^\d+$/.test(String(kingdomId)) || Number(kingdomId) <= 0)) throw new Error('Invalid kingdom ID.');
      const next = clone(filters);
      const existing = next.tags.find(item => item.toLocaleLowerCase() === tag.toLocaleLowerCase());
      const selected = existing || tag;
      if (tag && !existing) next.tags.push(tag);
      next.tags.sort((a, b) => a.localeCompare(b));
      if (kingdomId !== null) {
        if (selected) next.kingdomTags[kingdomId] = selected;
        else delete next.kingdomTags[kingdomId];
      }
      await write(snapshots, next);
      return clone(filters);
    });
  }
  function compare(earlier, later) {
    const a = new Map(earlier.kingdoms.map(row => [row.id, row]));
    const b = new Map(later.kingdoms.map(row => [row.id, row]));
    return [...new Set([...b.keys(), ...a.keys()])].map(id => {
      const before = a.get(id), after = b.get(id);
      return { id, before, after, status: !before ? 'New' : !after ? 'Missing' : 'Present',
        renamed: Boolean(before && after && before.name !== after.name),
        kingChanged: Boolean(before && after && (before.kingId !== after.kingId || before.king !== after.king)),
        changes: Object.fromEntries(METRICS.map(key => [key, Number.isFinite(before?.[key]) && Number.isFinite(after?.[key]) ? after[key] - before[key] : null])) };
    });
  }
  window.APES_KINGDOM_HISTORY = Object.freeze({ load, append, remove, loadFilters, setFilter, compare, METRICS });
})();
