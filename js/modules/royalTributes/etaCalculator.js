/* APES QoL — Royal Tribute ETA calculation core.
 * Experimental research branch: not injected into the game until the live
 * AngularJS village model's resource/rate field names are verified.
 * No network calls, no storage, and no collection actions.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.APES = root.APES || {};
    root.APES.royalTributeEtaMath = api;
  }
})(typeof window !== 'undefined' ? window : {}, function () {
  'use strict';

  const NUMERIC = value => typeof value === 'number' && Number.isFinite(value);
  const THRESHOLD_PERCENT = 20; // Official Travian Kingdoms collection threshold.

  /**
   * Compute a conservative ETA from authoritative game-model inputs.
   *
   * current: sum of stored wood, clay, and iron tributes.
   * capacity: total tribute fund capacity for those resources.
   * productionPerHour: sum of wood/clay/iron tribute generated per hour.
   * canFetchTributes: game's own readiness flag; never override game state.
   * collectionAllowed: false for denied tributes.
   *
   * Returns null if data is insufficient, contradictory, or unverified.
   * This does not predict delivery time after clicking Collect.
   */
  function estimate(input) {
    if (!input || typeof input !== 'object') return null;
    const { current, capacity, productionPerHour, canFetchTributes, collectionAllowed } = input;
    const thresholdPercent = input.thresholdPercent === undefined ? THRESHOLD_PERCENT : input.thresholdPercent;
    if (!NUMERIC(current) || !NUMERIC(capacity) || !NUMERIC(productionPerHour)) return null;
    if (!NUMERIC(thresholdPercent) || thresholdPercent <= 0 || thresholdPercent > 100) return null;
    if (current < 0 || capacity <= 0 || current > capacity || productionPerHour < 0) return null;
    if (collectionAllowed === false) return { state: 'denied', seconds: null };
    if (canFetchTributes === true) return { state: 'ready', seconds: 0 };
    const threshold = capacity * thresholdPercent / 100;
    // If an otherwise valid model says the threshold is reached but game
    // has not enabled collection, another requirement may be blocking it.
    if (current >= threshold) return { state: 'blocked', seconds: null };
    if (productionPerHour === 0) return { state: 'stalled', seconds: null };
    const seconds = Math.ceil((threshold - current) * 3600 / productionPerHour);
    if (!Number.isSafeInteger(seconds) || seconds < 0) return null;
    return { state: 'estimated', seconds, threshold, remaining: threshold - current };
  }

  function formatCountdown(seconds) {
    if (!NUMERIC(seconds) || seconds < 0) return '—';
    const total = Math.ceil(seconds);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (days) return `${days}d ${hours}h ${minutes}m`;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  }

  return Object.freeze({ estimate, formatCountdown, THRESHOLD_PERCENT });
});
