(() => {
  'use strict';

  const A = window.APES_AOC_INTERNAL;
  const D = A?.data;
  if (!D || D.__intelligenceLayerV1) return;
  D.__intelligenceLayerV1 = true;

  const baseInsight = D.insight;
  const RECENT_MS = 10 * 60 * 1000;
  const state = new Map();
  const recent = new Map();

  function config() {
    return typeof D.getAocConfig === 'function' ? D.getAocConfig() : {
      showInformational: true,
      showIncomingAttacks: true,
      showIncomingResources: true,
      showOutgoings: true
    };
  }

  function alarmData(villageId) {
    try {
      const alarms = JSON.parse(localStorage.getItem('qol_building_alarms') || '[]');
      if (!Array.isArray(alarms)) return [];
      const now = Date.now() / 1000;
      return alarms.filter(alarm => String(alarm?.villageId || '') === String(villageId))
        .filter(alarm => Number(alarm?.finishAt) > now)
        .sort((a, b) => Number(a.alarmAt) - Number(b.alarmAt));
    } catch (_) {
      return [];
    }
  }

  function alarmLabel(alarm) {
    const name = String(alarm?.buildingName || 'Construction').trim();
    const levels = String(alarm?.levelText || '').match(/\d+/g) || [];
    if (levels.length >= 2) return `${name} ${levels[0]} → ${levels.at(-1)}`;
    if (levels.length === 1) return `${name} → ${levels[0]}`;
    return name;
  }

  function severity(alert) {
    if (alert?.[1] === 'danger') return 4;
    if (alert?.[1] === 'warn') return 3;
    if (alert?.[1] === 'ready') return 2;
    return 1;
  }

  function dedupeAlerts(alerts) {
    const seen = new Set();
    return alerts.filter(alert => {
      const key = `${String(alert?.[4] || '')}|${String(alert?.[0] || '').toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function dedupeEvents(events) {
    const seen = new Set();
    return events.filter(event => {
      const key = `${event.id}|${event.kind || ''}|${String(event.label || '').toLowerCase()}|${Math.round(Number(event.at || 0) / 10000)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function recentKey(id, kind) {
    return `${id}:${kind}`;
  }

  function rememberRecent(id, kind, label, score = 55, actionable = true) {
    recent.set(recentKey(id, kind), { label, until: Date.now() + RECENT_MS, score, actionable, kind });
  }

  function addTransitions(village, insight, alerts) {
    const id = String(village?.villageId || '');
    if (!id) return;
    const current = {
      construction: insight.build.some(item => item.end > Date.now() || item.waiting),
      training: Boolean(insight.train.active),
      smithy: Boolean(insight.smith.active),
      celebration: Boolean(insight.party.active)
    };
    const previous = state.get(id);
    if (previous) {
      if (previous.construction && !current.construction) rememberRecent(id, 'constructionComplete', 'Construction finished', 58, true);
      if (previous.training && !current.training) rememberRecent(id, 'trainingComplete', 'Training completed', 52, true);
      if (previous.smithy && !current.smithy) rememberRecent(id, 'smithyComplete', 'Smithy upgrade completed', 48, true);
      if (previous.celebration && !current.celebration) rememberRecent(id, 'celebrationComplete', 'Celebration finished', 50, true);
    }
    state.set(id, current);

    const now = Date.now();
    [...recent.entries()].forEach(([key, item]) => {
      if (item.until <= now) {
        recent.delete(key);
        return;
      }
      if (!key.startsWith(`${id}:`)) return;
      alerts.push([item.label, 'ready', item.score, item.actionable, item.kind]);
    });
  }

  function addAlarmIntelligence(village, insight, alerts) {
    const nowSeconds = Date.now() / 1000;
    const hasFreeFinish = alerts.some(alert => alert?.[4] === 'freeFinish');
    alarmData(village?.villageId).forEach(alarm => {
      const ready = alarm?.triggered === true || Number(alarm?.alarmAt) <= nowSeconds;
      if (!ready || hasFreeFinish) return;
      alerts.push([`Alarm ready: ${alarmLabel(alarm)}`, 'ready', 78, true, 'alarm']);
    });
  }

  function addIntel(village, insight, alerts, events) {
    if (typeof D.intelFor !== 'function') return;
    const c = config();
    const intel = D.intelFor(village?.villageId);
    const now = Date.now();

    if (c.showIncomingAttacks !== false && intel?.incomingMovements?.items?.length) {
      const hostile = intel.incomingMovements.items
        .filter(item => ['attack', 'siege', 'raid'].includes(item.category))
        .filter(item => !Number.isFinite(Number(item.eta)) || Number(item.eta) >= now - 5000)
        .sort((a, b) => (Number(a.eta) || Infinity) - (Number(b.eta) || Infinity));
      if (hostile.length) {
        const first = hostile[0];
        const tone = first.category === 'siege' || first.category === 'attack' ? 'danger' : 'warn';
        const etaText = Number.isFinite(Number(first.eta)) ? D.duration(Number(first.eta) - now) : first.remaining || '';
        const extra = hostile.length > 1 ? ` · +${hostile.length - 1}` : '';
        alerts.push([`${first.category === 'siege' ? 'Siege' : first.category === 'raid' ? 'Raid' : 'Incoming attack'} ${etaText}${extra}`.trim(), tone, first.category === 'siege' ? 130 : 120, true, 'incomingAttack']);
        hostile.slice(0, 2).forEach(item => {
          if (!Number.isFinite(Number(item.eta)) || Number(item.eta) <= now) return;
          events.push({
            at: Number(item.eta),
            id: String(village.villageId),
            name: village.name,
            label: `${item.category === 'siege' ? 'Siege' : item.category === 'raid' ? 'Raid' : 'Attack'} from ${item.enemy || item.originVillage || 'unknown'}`,
            kind: 'incomingAttack'
          });
        });
      }
    }

    if (c.showIncomingResources !== false && intel?.incomingResources?.items?.length) {
      const shipments = intel.incomingResources.items
        .filter(item => !Number.isFinite(Number(item.eta)) || Number(item.eta) >= now - 5000)
        .sort((a, b) => (Number(a.eta) || Infinity) - (Number(b.eta) || Infinity));
      if (shipments.length) {
        const total = shipments.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
        const firstEta = Number(shipments[0]?.eta);
        const etaText = Number.isFinite(firstEta) ? ` · ${D.duration(firstEta - now)}` : '';
        alerts.push([`${shipments.length} resource shipment${shipments.length === 1 ? '' : 's'} · ${D.int(total)}${etaText}`, 'info', 9, false, 'incomingResources']);
        shipments.slice(0, 2).forEach(item => {
          if (!Number.isFinite(Number(item.eta)) || Number(item.eta) <= now) return;
          events.push({
            at: Number(item.eta),
            id: String(village.villageId),
            name: village.name,
            label: `${D.int(item.total)} resources arrive`,
            kind: 'incomingResources'
          });
        });
      }

      const overflow = typeof D.intelResourceOverflow === 'function' ? D.intelResourceOverflow(village) : [];
      if (overflow.length) {
        const first = overflow.sort((a, b) => a.eta - b.eta)[0];
        const resourceName = D.RESOURCES.find(item => item.key === first.key)?.name || first.key;
        alerts.push([`${resourceName} overflow +${D.int(first.overflow)} on arrival`, 'warn', 82, true, 'incomingOverflow']);
      }
    }

    if (c.showOutgoings !== false && intel?.outgoings?.items?.length) {
      const active = intel.outgoings.items.filter(item => !Number.isFinite(Number(item.eta)) || Number(item.eta) >= now - 5000);
      if (active.length) alerts.push([`${active.length} outgoing movement${active.length === 1 ? '' : 's'}`, 'info', 6, false, 'outgoings']);
    }
  }

  D.insight = village => {
    const insight = baseInsight(village);
    let alerts = [...(insight.alerts || [])];
    let events = [...(insight.events || [])].map(event => ({ ...event, kind: event.kind || '' }));

    addTransitions(village, insight, alerts);
    addAlarmIntelligence(village, insight, alerts);
    addIntel(village, insight, alerts, events);

    // If a free finish is already actionable now, do not duplicate it in the timeline as "Free finish ready".
    if (alerts.some(alert => alert?.[4] === 'freeFinish')) {
      events = events.filter(event => !/^Free finish ready:/i.test(String(event.label || '')));
    }

    alerts = dedupeAlerts(alerts);
    const c = config();
    if (c.showInformational === false) alerts = alerts.filter(alert => alert?.[3] || alert?.[1] !== 'info');
    alerts.sort((left, right) => severity(right) - severity(left) || Number(right?.[3]) - Number(left?.[3]) || Number(right?.[2] || 0) - Number(left?.[2] || 0));
    events = dedupeEvents(events).filter(event => Number(event.at) >= Date.now() - 1000).sort((a, b) => a.at - b.at);

    const actionableAlerts = alerts.filter(alert => alert?.[3]);
    const score = alerts.reduce((sum, alert) => sum + (alert?.[3] ? Number(alert?.[2] || 0) : Math.min(Number(alert?.[2] || 0), 9)), 0);

    return {
      ...insight,
      alerts,
      events,
      actionableAlerts,
      needsAttention: actionableAlerts.length > 0,
      score,
      next: events[0]?.at ?? Infinity
    };
  };

  window.APES_AOC_INTELLIGENCE = Object.freeze({
    version: 1,
    clearRecent() {
      recent.clear();
      state.clear();
      window.dispatchEvent(new CustomEvent('apes_aoc_force_render', { detail: { reason: 'intelligence-reset' } }));
    }
  });
})();
