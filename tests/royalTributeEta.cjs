'use strict';
const assert = require('node:assert/strict');
const math = require('../js/modules/royalTributes/etaCalculator.js');

// Source: Cookix / Rage tooltip (user screenshot, 28 Oct 2026).
const sample = math.estimate({
  current: 1739,
  capacity: 11813,
  productionPerHour: 64 + 65 + 64,
  canFetchTributes: false,
  collectionAllowed: true
});
assert.equal(math.THRESHOLD_PERCENT, 20);
assert.equal(sample.state, 'estimated');
assert.equal(sample.seconds, Math.ceil(((0.20 * 11813) - 1739) * 3600 / 193));
assert.ok(sample.seconds > 3 * 3600 && sample.seconds < 3.5 * 3600);

assert.deepEqual(math.estimate({ current: 200, capacity: 1000, productionPerHour: 10, canFetchTributes: true }), { state: 'ready', seconds: 0 });
assert.equal(math.estimate({ current: 201, capacity: 1000, productionPerHour: 10, canFetchTributes: false }).state, 'blocked');
assert.equal(math.estimate({ current: 100, capacity: 1000, productionPerHour: 0, canFetchTributes: false }).state, 'stalled');
assert.equal(math.estimate({ current: 100, capacity: 1000, productionPerHour: 100, collectionAllowed: false }).state, 'denied');
for (const bad of [
  { current: 1, capacity: 0, productionPerHour: 10 },
  { current: -1, capacity: 1000, productionPerHour: 10 },
  { current: 9999, capacity: 1000, productionPerHour: 10 },
  { current: 100, capacity: 1000, productionPerHour: -2 },
  { current: NaN, capacity: 1000, productionPerHour: 10 },
  { current: 100, capacity: 1000, productionPerHour: Infinity }
]) assert.equal(math.estimate(bad), null);
assert.equal(math.formatCountdown(0), '0s');
assert.equal(math.formatCountdown(11628), '3h 13m');
assert.equal(math.formatCountdown(86461), '1d 0h 1m');
assert.equal(math.formatCountdown(NaN), '—');

const snapshot = {
  tributeSum: 119,
  tributesRequiredToFetch: 1890,
  tributeProduction: 262,
  calculatedTributes: { '1': 43, '2': 38, '3': 38 },
  timeUntilTributeFetch: 1793207817.1852214,
  canFetchTributes: false,
  allowTributeCollection: 1,
  tributesOnTheirWay: false
};
const now = 1793183504.922;
const actual = math.readVillageStatus(snapshot, now);
assert.equal(actual.state, 'game_eta');
assert.equal(actual.at, snapshot.timeUntilTributeFetch);
assert.equal(actual.seconds, 24313);
assert.equal(math.formatCountdown(actual.seconds), '6h 45m');
assert.deepEqual(math.readVillageStatus({ ...snapshot, canFetchTributes: true }, now), { state: 'ready', seconds: 0 });
assert.deepEqual(math.readVillageStatus({ ...snapshot, allowTributeCollection: 0 }, now), { state: 'denied', seconds: null });
assert.deepEqual(math.readVillageStatus({ ...snapshot, tributesOnTheirWay: true }, now), { state: 'on_way', seconds: null });
assert.equal(math.readVillageStatus({ ...snapshot, timeUntilTributeFetch: now - 1 }, now).state, 'pending');
assert.equal(math.readVillageStatus({ ...snapshot, timeUntilTributeFetch: snapshot.timeUntilTributeFetch * 1000 }, now).seconds, 24313);
const noGameTime = { ...snapshot, timeUntilTributeFetch: null };
assert.equal(math.readVillageStatus(noGameTime, now).state, 'estimated');
assert.equal(math.readVillageStatus(noGameTime, now).seconds, Math.ceil((1890 - 119) / 262 * 3600));
assert.equal(math.readVillageStatus({ ...noGameTime, tributeProduction: 0 }, now).state, 'stalled');
assert.equal(math.readVillageStatus({ ...noGameTime, tributeSum: 1900 }, now).state, 'pending');
assert.equal(math.readVillageStatus({ ...noGameTime, tributeSum: undefined }, now).state, 'unknown');

console.log('Tribute ETA calculation: 20% threshold, conservative rounding, readiness, denied, blocked, and invalid data verified.');
