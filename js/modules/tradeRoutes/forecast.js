(() => {
  'use strict';

  const hour = 3600;
  const day = 24 * hour;

  function eventsForVillage(routes, villageId, clock, end) {
    const events = [];
    let unknownIncoming = false;
    let unknownOutgoing = false;
    for (const route of routes) {
      if (route.paused || (route.source !== villageId && route.target !== villageId)) continue;
      const outgoing = route.source === villageId;
      const known = Number.isFinite(route.minute) && Number.isInteger(route.repeats) &&
        (Number.isFinite(route.travelSeconds) || (outgoing && route.repeats === 1));
      if (!known) {
        if (outgoing) unknownOutgoing = true;
        else unknownIncoming = true;
        continue;
      }
      for (const departureHour of route.hours) {
        const offset = departureHour * hour + route.minute * 60 - clock;
        const first = ((offset % day) + day) % day;
        const repeatSpan = route.repeats > 1 ? 2 * route.travelSeconds * (route.repeats - 1) : 0;
        for (let start = first - Math.ceil((first + repeatSpan) / day) * day; start <= end; start += day) {
          for (let repeat = 0; repeat < route.repeats; repeat++) {
            const departure = start + (repeat ? 2 * route.travelSeconds * repeat : 0);
            const at = departure + (outgoing ? 0 : route.travelSeconds);
            if (departure >= 0 && at <= end) events.push({ at, kind: outgoing ? 'export' : 'import', route });
          }
        }
      }
    }
    return { events, unknownIncoming, unknownOutgoing };
  }

  function forecastResource({ stock, rate, cost, cycle, firstQueue = cycle, shipments, index, cycles = 3 }) {
    if (!Number.isFinite(rate) || !Number.isFinite(stock?.amount) ||
        !Number.isFinite(stock.capacity) || stock.capacity <= 0) return null;

    const events = [...shipments];
    for (let run = 0; run < cycles; run++) events.push({ at: firstQueue + run * cycle, kind: 'celebration' });
    // At equal times, protect the queue deadline and outgoing dispatch before crediting arrivals.
    const order = { celebration: 0, export: 1, import: 2 };
    events.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind]);

    function simulate(fraction) {
      let amount = Math.min(stock.amount, stock.capacity);
      let cursor = 0;
      let failure = null;
      let queue = 0;
      for (const event of events) {
        const available = Math.min(stock.capacity, amount + rate * (event.at - cursor) / hour);
        if (available < -1e-7 && !failure) {
          failure = { at: cursor + amount * hour / -rate, kind: 'empty', short: -available };
        }
        amount = Math.max(0, available);
        cursor = event.at;
        if (event.kind === 'import') {
          amount = Math.min(stock.capacity, amount + event.route.shipment[index]);
          continue;
        }
        const needed = event.kind === 'celebration' ? cost : Math.floor(event.route.shipment[index] * fraction);
        if (event.kind === 'celebration') queue++;
        if (amount + 1e-7 < needed && !failure) {
          failure = { at: cursor, kind: event.kind, short: needed - amount, queue };
        }
        amount = Math.max(0, amount - needed);
      }
      return failure;
    }

    const failure = simulate(1);
    if (!failure) return { failure: null, fraction: 1 };
    if (simulate(0)) return { failure, fraction: null };
    // Keep each existing departure and reduce this resource proportionally across routes.
    let low = 0;
    let high = 1;
    for (let step = 0; step < 26; step++) {
      const middle = (low + high) / 2;
      if (simulate(middle)) high = middle;
      else low = middle;
    }
    return { failure, fraction: low };
  }

  window.APES.tradeRouteForecast = Object.freeze({ eventsForVillage, forecastResource });
})();
