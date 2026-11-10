(() => {
  'use strict';

  // Pure data helpers: keep the same player intelligence in every tab without
  // overwriting tab-specific notes and preferred secondary villages.
  function populationNumber(value) {
    const text = String(value ?? '').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/[^\d-]/g, '');
    const number = Number(text);
    return text && text !== '-' && Number.isFinite(number) ? number : null;
  }

  function villageKey(village) {
    if (!village) return '';
    const x = String(village.x ?? '').trim();
    const y = String(village.y ?? '').trim();
    if (x && y) return x + '|' + y;
    return String(village.id || '').trim();
  }

  function profileSignature(profile) {
    if (!profile) return '';
    const names = (profile.villages || []).map(village => [
      villageKey(village),
      String(village.name || '').trim(),
      Boolean(village.isCapital)
    ].join(':')).sort();
    return [String(profile.playerName || '').trim(), String(profile.population || '').trim(), ...names].join('||');
  }

  function validateProfile(profile, playerId) {
    if (!profile || String(profile.playerId) !== String(playerId)) return 'Profile identity mismatch.';
    if (!profile.playerName || profile.playerName.trim() === '' || profile.playerName.trim().toLowerCase() === 'unknown') return 'Player name did not load.';
    if (populationNumber(profile.population) === null) return 'Population did not load.';
    if (!Array.isArray(profile.villages) || !profile.villages.length) return 'Village list did not load.';
    const keys = new Set();
    for (const village of profile.villages) {
      if (!village || !String(village.name || '').trim()) return 'A village name is missing.';
      // Missing coordinates make village identity unreliable and can falsely
      // report a conquered/lost village. Leave stored snapshots untouched.
      if (!String(village.x ?? '').trim() || !String(village.y ?? '').trim()) return 'Village coordinates did not load.';
      const key = villageKey(village);
      if (keys.has(key)) return 'The profile has duplicate village coordinates.';
      keys.add(key);
    }
    return null;
  }

  function entriesInScope(tabs, tabId, allTabs) {
    const selected = allTabs ? tabs : tabs.filter(tab => tab.id === tabId);
    const map = new Map();
    selected.forEach(tab => (tab.entries || []).forEach(entry => {
      const id = String(entry.playerId || '').trim();
      if (id && !map.has(id)) map.set(id, entry);
    }));
    return Array.from(map.values());
  }

  function existingPlayer(tabs, playerId) {
    const matches = tabs.flatMap(tab => (tab.entries || []).filter(entry => String(entry.playerId) === String(playerId)));
    matches.sort((a, b) => Number(b.lastUpdatedAt || 0) - Number(a.lastUpdatedAt || 0));
    return matches[0] || null;
  }

  function synchronizePlayer(tabs, playerId, snapshot, now = Date.now(), calculateChanges = true) {
    const matches = tabs.flatMap(tab => (tab.entries || []).filter(entry => String(entry.playerId) === String(playerId)));
    if (!matches.length) return 0;
    const previous = existingPlayer(tabs, playerId);
    const previousVillages = Array.isArray(previous?.villages) ? previous.villages.length : null;
    const oldPopulation = populationNumber(previous?.population);
    const newPopulation = populationNumber(snapshot.population);
    const villageChange = calculateChanges && previousVillages !== null ? snapshot.villages.length - previousVillages : previous?.villageChange ?? null;
    const populationChange = calculateChanges && oldPopulation !== null && newPopulation !== null ? newPopulation - oldPopulation : previous?.populationChange ?? null;
    matches.forEach(entry => {
      entry.playerName = snapshot.playerName;
      entry.population = snapshot.population;
      entry.capital = snapshot.capital ? { ...snapshot.capital } : null;
      entry.capitalConfirmed = snapshot.capitalConfirmed === true;
      entry.villages = snapshot.villages.map(village => ({ ...village }));
      entry.lastUpdatedAt = now;
      entry.villageChange = villageChange;
      entry.populationChange = populationChange;

      if (entry.selected2ndId || entry.selected2ndCoords) {
        const selected = entry.villages.find(village =>
          (entry.selected2ndCoords && village.coords === entry.selected2ndCoords) ||
          (entry.selected2ndId && village.id === entry.selected2ndId));
        if (selected && !selected.isCapital) {
          entry.selected2ndId = selected.id;
          entry.selected2ndCoords = selected.coords;
          entry.selected2ndX = selected.x;
          entry.selected2ndY = selected.y;
        } else {
          entry.selected2ndId = '';
          entry.selected2ndCoords = '';
          entry.selected2ndX = '';
          entry.selected2ndY = '';
        }
      }
    });
    return matches.length;
  }

  function synchronizeExistingDuplicates(tabs) {
    const ids = new Set();
    tabs.forEach(tab => (tab.entries || []).forEach(entry => {
      if (entry.playerId) ids.add(String(entry.playerId));
    }));
    ids.forEach(id => {
      const latest = existingPlayer(tabs, id);
      if (!latest) return;
      const matches = tabs.reduce((sum, tab) => sum + (tab.entries || []).filter(entry => String(entry.playerId) === id).length, 0);
      if (matches > 1 && Array.isArray(latest.villages)) {
        synchronizePlayer(tabs, id, latest, Number(latest.lastUpdatedAt || 0), false);
      }
    });
  }

  window.APES_WATCHLIST_SCAN = Object.freeze({
    populationNumber, profileSignature, validateProfile, entriesInScope,
    existingPlayer, synchronizePlayer, synchronizeExistingDuplicates
  });
})();
