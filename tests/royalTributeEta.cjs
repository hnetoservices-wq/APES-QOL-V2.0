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
console.log('Tribute ETA calculation: 20% threshold, conservative rounding, readiness, denied, blocked, and invalid data verified.');
