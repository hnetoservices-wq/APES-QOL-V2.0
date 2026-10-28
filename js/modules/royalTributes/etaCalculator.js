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


  function isTrue(value) {
    return value === true || value === 1 || value === '1';
  }

  // The live TK cache exposes timeUntilTributeFetch as a Unix timestamp in
  // seconds. This value is preferred over any independent production estimate.
  function readVillageStatus(data, nowSeconds = Date.now() / 1000) {
    if (!data || typeof data !== 'object' || !NUMERIC(nowSeconds)) {
      return { state: 'unknown', seconds: null };
    }
    if (data.allowTributeCollection === false || data.allowTributeCollection === 0) {
      return { state: 'denied', seconds: null };
    }
    if (isTrue(data.tributesOnTheirWay)) {
      return { state: 'on_way', seconds: null };
    }
    if (isTrue(data.canFetchTributes)) {
      return { state: 'ready', seconds: 0 };
    }
    let timestamp = Number(data.timeUntilTributeFetch);
    // Future-proof against game worlds reporting milliseconds.
    if (Number.isFinite(timestamp) && timestamp > 1e12) timestamp /= 1000;
    if (Number.isFinite(timestamp) && timestamp >= 946684800 && timestamp <= 4102444800) {
      if (timestamp <= nowSeconds) {
        // The client's collection flag has not yet been refreshed.
        return { state: 'pending', seconds: null, at: timestamp };
      }
      return {
        state: 'game_eta',
        seconds: Math.ceil(timestamp - nowSeconds),
        at: timestamp
      };
    }

    // Fallback only when the game does not provide a valid timestamp:
    // derive from *tribute* fields, never ordinary village storage/production.
    const current = Number(data.tributeSum);
    const needed = Number(data.tributesRequiredToFetch);
    const perHour = Number(data.tributeProduction);
    if (!NUMERIC(current) || !NUMERIC(needed) || !NUMERIC(perHour) ||
        current < 0 || needed <= 0 || perHour < 0) {
      return { state: 'unknown', seconds: null };
    }
    if (current >= needed) return { state: 'pending', seconds: null };
    if (perHour === 0) return { state: 'stalled', seconds: null };
    const seconds = Math.ceil((needed - current) / perHour * 3600);
    if (!Number.isSafeInteger(seconds) || seconds < 0) {
      return { state: 'unknown', seconds: null };
    }
    return { state: 'estimated', seconds, at: nowSeconds + seconds };
  }

  return Object.freeze({ estimate, formatCountdown, readVillageStatus, THRESHOLD_PERCENT });
});
