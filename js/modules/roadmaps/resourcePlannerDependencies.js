/* APES QoL: prerequisite safety for imported Resource Upgrade Planner Roadmaps.
 * Ensures Bakery never appears before Grain Mill Level 5 on a planned route
 * whose starting Grain Mill level is known or inferable from its upgrade chain.
 * Does not mutate unrelated, manually-authored Roadmaps.
 */
(() => {
  'use strict';

  const MILL_ID = 8;
  const BAKERY_ID = 9;
  const REQUIRED_MILL_LEVEL = 5;

  const buildingId = step => {
    if (!step || step.type !== 'building') return 0;
    const id = Number(step.buildingId);
    if (id === MILL_ID || id === BAKERY_ID) return id;
    const name = String(step.building || '').trim().toLowerCase();
    if (name === 'grain mill') return MILL_ID;
    if (name === 'bakery') return BAKERY_ID;
    return 0;
  };
  const level = step => Number(step?.level);
  const isResourceRoadmap = (id, roadmap) =>
    String(id || '').startsWith('custom_resources_') ||
    /^Imported from APES Resource Upgrade Planner\b/i.test(String(roadmap?.description || ''));

  function startingMillLevel(roadmap) {
    const saved = roadmap?.resourcePlannerStartBuildings?.mill;
    if (saved !== undefined && saved !== null && saved !== '') {
      const n = Number(saved);
      return Number.isInteger(n) && n >= 0 && n <= 5 ? n : null;
    }
    // Legacy imports had no startState metadata. Their first explicit Grain
    // Mill upgrade (e.g. Lv 3) establishes the previous completed level (2).
    const first = roadmap?.steps?.find(step => buildingId(step) === MILL_ID);
    const n = level(first);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n - 1 : null;
  }

  function inspect(id, roadmap) {
    if (!isResourceRoadmap(id, roadmap) || !Array.isArray(roadmap?.steps))
      return { relevant: false, valid: true, changed: false };
    const firstBakery = roadmap.steps.findIndex(step => buildingId(step) === BAKERY_ID);
    if (firstBakery < 0) return { relevant: true, valid: true, changed: false };
    const baseline = startingMillLevel(roadmap);
    if (baseline === null) return {
      relevant: true, valid: false, unverifiable: true, changed: false,
      reason: 'Cannot verify Grain Mill level for Bakery without a starting village snapshot.'
    };
    let mill = baseline;
    for (let i = 0; i < firstBakery; i++) {
      const step = roadmap.steps[i];
      if (buildingId(step) !== MILL_ID) continue;
      const next = level(step);
      if (Number.isInteger(next) && next === mill + 1) mill = next;
      // A later level appearing before its earlier upgrades cannot establish
      // prerequisite completion; don't accept it as a shortcut.
    }
    if (mill >= REQUIRED_MILL_LEVEL)
      return { relevant: true, valid: true, changed: false };
    return {
      relevant: true, valid: false, changed: false, baseline, current: mill,
      missing: Array.from({ length: REQUIRED_MILL_LEVEL - mill }, (_, i) => mill + i + 1),
      firstBakery,
      reason: 'Bakery requires Grain Mill Level 5 before its first upgrade.'
    };
  }

  function repair(id, roadmap) {
    const check = inspect(id, roadmap);
    if (!check.relevant || check.valid || check.unverifiable)
      return check;
    const original = roadmap.steps;
    const bakery = original[check.firstBakery];
    const moves = [];
    const missing = [];
    const used = new Set();
    for (const wanted of check.missing) {
      const idx = original.findIndex((step, i) =>
        i > check.firstBakery && !used.has(i) &&
        buildingId(step) === MILL_ID && level(step) === wanted);
      if (idx !== -1) {
        used.add(idx);
        moves.push(original[idx]);
      } else {
        // A missing prerequisite is inserted, not simply implied. The player
        // must build it before the Bakery step can be followed.
        const id = window.APES?.roadmapsStableIds?.newStepId?.() ||
          'step_rup_dependency_' + wanted + '_' + Date.now().toString(36) +
          '_' + Math.random().toString(36).slice(2, 10);
        moves.push({
          id, type: 'building', building: 'Grain Mill', buildingId: MILL_ID,
          level: wanted, exact: true
        });
        missing.push(wanted);
      }
    }
    // Preserve existing step objects/IDs and relative order for all unrelated
    // upgrades. Only relocate later prerequisite steps or insert missing ones.
    const filtered = original.filter((step, index) => !used.has(index));
    const at = filtered.indexOf(bakery);
    if (at < 0) throw new Error('Bakery step disappeared during prerequisite repair.');
    filtered.splice(at, 0, ...moves);
    roadmap.steps = filtered;
    const after = inspect(id, roadmap);
    if (!after.valid) throw new Error('Unable to resolve imported Bakery prerequisite.');
    return { relevant: true, valid: true, changed: true, inserted: missing, relocated: used.size };
  }

  window.APES = window.APES || {};
  window.APES.resourcePlannerDependencies = Object.freeze({
    inspect, repair, startingMillLevel, isResourceRoadmap
  });
})();
