/* Oasis Sniper Checker: conservative ranking evidence only.
 * Rank order alone never proves troops: a higher-placed player must have
 * LESS natural (village-only) influence than a lower-placed player.
 */
(() => {
  'use strict';
  function finiteInfluence(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }
  function evaluate(rows) {
    if (!Array.isArray(rows)) return [];
    const sorted = rows.map((row, index) => ({
      playerId: String(row.playerId || ''),
      name: String(row.name || ''),
      rank: index + 1,
      villageInfluence: finiteInfluence(row.villageInfluence),
      diagnostic: String(row.diagnostic || '')
    }));
    return sorted.map((row, index) => {
      // A lower-ranked player's total is at least its natural influence.
      // Thus being ranked above a higher natural value mathematically
      // requires positive troop influence (assuming published rank rules).
      const witness = sorted.slice(index + 1)
        .filter(other => other.villageInfluence !== null)
        .sort((a, b) => b.villageInfluence - a.villageInfluence)[0];
      const gap = witness && row.villageInfluence !== null
        ? Math.max(0, witness.villageInfluence - row.villageInfluence) : 0;
      return {
        ...row,
        proof: gap > 0,
        minimumInfluenceFromTroops: gap > 0 ? Math.max(0, Math.ceil(gap)) : null,
        strictOvertake: gap > 0 ? Math.floor(gap) + 1 : null,
        witness: gap > 0 ? witness.name : '',
        witnessRank: gap > 0 ? witness.rank : null,
        witnessBaseline: gap > 0 ? witness.villageInfluence : null,
        status: row.villageInfluence === null || (!witness && index < sorted.length - 1)
          ? 'unknown' : gap > 0 ? 'confirmed' : 'possible'
      };
    });
  }
  window.APES_OASIS_SNIPER_MATH = Object.freeze({ finiteInfluence, evaluate });
})();
