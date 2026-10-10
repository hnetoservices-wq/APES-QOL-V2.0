(() => {
  'use strict';
  const APES = window.APES;
  const OPTIONS = Object.freeze({ feature: 'kingdomManagement', key: 'snapshots', scope: 'server' });
  const FALLBACK_KEY = `apes_kingdom_management_snapshots_v1_${location.hostname}`;
  const METRICS = Object.freeze(['rank', 'villages', 'population', 'area', 'players', 'averageAttack', 'totalAttack', 'averageDefense', 'totalDefense', 'treasures', 'victoryPoints']);
  let snapshots = [];
  let loading = null;
  const clone = value => JSON.parse(JSON.stringify(value));
  async function load() {
    if (!loading) loading = (async () => {
      const raw = APES?.storage?.get ? await APES.storage.get(OPTIONS, null) : JSON.parse(localStorage.getItem(FALLBACK_KEY) || 'null');
      snapshots = Array.isArray(raw?.snapshots) ? raw.snapshots.filter(item => item?.complete === true && item.server === location.hostname && Array.isArray(item.kingdoms)).sort((a, b) => b.scannedAt - a.scannedAt) : [];
      return clone(snapshots);
    })().catch(error => { loading = null; throw error; });
    await loading;
    return clone(snapshots);
  }
  async function write(next) {
    const data = { version: 1, snapshots: next };
    if (APES?.storage?.set) await APES.storage.set(OPTIONS, data);
    else localStorage.setItem(FALLBACK_KEY, JSON.stringify(data));
    snapshots = next;
  }
  async function append(snapshot) {
    await load();
    if (!snapshot?.complete || snapshot.server !== location.hostname || !snapshot.kingdoms?.length) throw new Error('Only completed kingdom scans can be saved.');
    await write([clone(snapshot), ...snapshots]);
    return clone(snapshots);
  }
  async function remove(id) {
    await load();
    await write(snapshots.filter(snapshot => snapshot.id !== id));
    return clone(snapshots);
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
  window.APES_KINGDOM_HISTORY = Object.freeze({ load, append, remove, compare, METRICS });
})();
