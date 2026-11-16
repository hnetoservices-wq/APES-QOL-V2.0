(() => {
  'use strict';

  // Read the same timing data as Travian's route timeline when Angular exposes it.
  document.addEventListener('apes_read_trade_route_timing', event => {
    const card = event.target;
    if (!card.matches?.('.routeContainer')) return;
    card.removeAttribute('data-apes-route-timing');
    const model = window.angular?.element(card)?.scope?.()?.route?.data;
    if (!model) return;
    const timing = {};
    for (const key of ['duration', 'minutesOffset', 'recurrences']) {
      const value = model[key];
      if (value != null && value !== '' && Number.isFinite(Number(value))) timing[key] = Number(value);
    }
    card.setAttribute('data-apes-route-timing', JSON.stringify(timing));
  });
})();
