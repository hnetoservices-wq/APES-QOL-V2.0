const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = { APES: {} };
vm.runInNewContext(fs.readFileSync(require.resolve('../js/modules/tradeRoutes/forecast.js'), 'utf8'), { window });
const { eventsForVillage, forecastResource } = window.APES.tradeRouteForecast;
const cycle = 3600;
const outgoing = {
  source: 'home', target: 'feed', hours: [0], minute: 15, repeats: 1,
  travelSeconds: null, shipment: [3000]
};
const incoming = {
  source: 'supply', target: 'home', hours: [0], minute: 0, repeats: 1,
  travelSeconds: 1800, shipment: [2500]
};

const input = { stock: { amount: 4000, capacity: 20000 }, rate: 1000, cost: 5000, cycle, index: 0, cycles: 1 };
const forecast = routes => {
  const timing = eventsForVillage(routes, 'home', 0, cycle);
  return forecastResource({ ...input, shipments: timing.events });
};
assert.equal(forecast([outgoing, incoming]).failure.kind, 'celebration');
assert.equal(Math.floor(3000 * forecast([outgoing, incoming]).fraction), 2500);
assert.equal(Math.floor(3000 * forecast([outgoing, { ...incoming, travelSeconds: 5400 }]).fraction), 0);
assert.equal(forecast([outgoing, { ...incoming, travelSeconds: null }]).failure.kind, 'celebration');
assert.equal(forecastResource({ ...input, firstQueue: 1800, shipments: [] }).failure.short, 500);

const late = eventsForVillage([{ ...outgoing, hours: [23], minute: -30, repeats: 2, travelSeconds: 5400 }], 'home', 0, 3 * cycle);
assert.equal(late.events.length, 1, 'Includes a repeat dispatched after midnight from a previous-day route');
assert.equal(late.events[0].at, 5400);
assert.equal(eventsForVillage([{ ...outgoing, minute: null }], 'home', 0, cycle).unknownOutgoing, true);
console.log('Trade forecast checks shipment timing, send limits, unknown arrivals, and overnight repeats.');
