(() => {
  'use strict';

  // MAIN-world, read-only: uses Travian's existing Village cache and DOM.
  // No requests, game API calls, clicks, mouseovers or persistence.
  const FLAG = '__APES_QOL_ROYAL_TRIBUTE_COUNTDOWN__';
  const FEATURE_STORAGE_KEY = 'qol_royalTributeCountdown';
  const ROW_SELECTOR = '.tributeVillages tr[ng-repeat*="village in tributeVillages"]';
  const LABEL_CLASS = 'qol-royal-tribute-eta';
  if (window[FLAG]) return;
  window[FLAG] = true;

  function isEnabled() {
    try {
      return window.localStorage?.getItem(FEATURE_STORAGE_KEY) !== 'false';
    } catch (_) {
      return true;
    }
  }

  function villageDataFor(row) {
    const id = row.querySelector('td.playerColumn [villageid]')?.getAttribute('villageid');
    if (!id || !/^\d+$/.test(id)) return null;
    const record = window.Cache?.c?.[`Village:${id}`];
    return record?.data ?? record ?? null;
  }

  function gameStatus(data, nowSeconds) {
    const calculator = window.APES?.royalTributeEtaMath;
    if (typeof calculator?.readVillageStatus !== 'function') {
      return { state: 'unknown', seconds: null };
    }
    return calculator.readVillageStatus(data, nowSeconds);
  }

  function describe(status, calculator) {
    switch (status.state) {
      case 'ready': return { text: 'Ready to collect', tone: 'ready', title: 'The game permits tribute collection now.' };
      case 'denied': return { text: 'Collection unavailable', tone: 'unavailable', title: 'Tribute collection is not permitted for this village.' };
      case 'on_way': return { text: 'Collection underway', tone: 'in-progress', title: 'Tributes are already on their way.' };
      case 'pending': return { text: 'Awaiting game update', tone: 'pending', title: 'The predicted time has passed, but the game has not enabled collection yet.' };
      case 'stalled': return { text: 'Production stopped', tone: 'unavailable', title: 'No tribute production is reported.' };
      case 'game_eta':
      case 'estimated': {
        const seconds = status.seconds;
        if (!Number.isFinite(seconds) || seconds < 0) {
          return { text: 'Time unavailable', tone: 'unavailable', title: 'No usable tribute collection time.' };
        }
        const label = calculator.formatCountdown(seconds);
        const gameTime = Number.isFinite(status.at)
          ? new Date(status.at * 1000).toLocaleString()
          : '';
        return {
          text: (status.state === 'estimated' ? 'Est. ' : '') + label + ' until collectible',
          tone: status.state === 'estimated' ? 'estimated' : 'countdown',
          title: status.state === 'estimated'
            ? 'Estimated from current tribute fund and hourly tribute production. Changes in production can change this time.'
            : 'Based on Travian Kingdoms\' own predicted tribute availability time.' + (gameTime ? ' Predicted: ' + gameTime : '')
        };
      }
      default:
        return { text: 'Time unavailable', tone: 'unavailable', title: 'Tribute timing data is not currently available.' };
    }
  }

  function tick() {
    const rows = document.querySelectorAll(ROW_SELECTOR);
    if (!rows.length) return;
    const enabled = isEnabled();
    const nowSeconds = Date.now() / 1000;
    for (const row of rows) {
      const host = row.querySelector('td.collect');
      if (!host) continue;
      let label = host.querySelector('.' + LABEL_CLASS);
      if (!enabled) {
        label?.remove();
        continue;
      }

      // A disconnected governor has no active tribute collection widget.
      if (host.classList.contains('notConnected') || !host.querySelector('.collectTributesContainer')) {
        label?.remove();
        continue;
      }
      const data = villageDataFor(row);
      if (!data) {
        label?.remove();
        continue;
      }
      const calculator = window.APES?.royalTributeEtaMath;
      const status = gameStatus(data, nowSeconds);
      const display = describe(status, calculator || {});
      if (!label) {
        label = document.createElement('div');
        label.className = LABEL_CLASS;
        label.setAttribute('aria-live', 'off');
        // Append directly to the collection cell, outside Travian's controls.
        host.appendChild(label);
      }
      if (label.textContent !== display.text) label.textContent = display.text;
      if (label.dataset.tone !== display.tone) label.dataset.tone = display.tone;
      if (label.title !== display.title) label.title = display.title;
    }
  }

  // One-second read-only updates; the game refreshes its models independently.
  // UI remains correct when Chrome throttles timers in background tabs.
  window.setInterval(tick, 1000);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick, { once: true });
  } else {
    tick();
  }
})();
