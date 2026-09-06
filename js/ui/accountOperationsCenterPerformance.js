(() => {
  'use strict';

  const A = window.APES_AOC_INTERNAL;
  const D = A?.data;
  const R = A?.rendering;
  if (!D || !R || A.__performanceV1) return;
  A.__performanceV1 = true;

  const FALLBACK_FULL_RENDER_MS = 12000;
  let lastSignature = '';
  let lastFullRender = 0;
  let dirty = true;
  let fullRenders = 0;
  let lightRenders = 0;

  function queueSignature(village) {
    let build = [];
    let train = null;
    let smith = null;
    let party = null;
    let resourceShape = null;
    try {
      build = D.construction(village).map(item => [item.type, item.loc, item.level, item.end, item.waiting ? 1 : 0]);
      const t = D.training(village);
      train = [t.active ? 1 : 0, t.count, t.end, ...(t.entries || []).slice(0, 6).flatMap(item => [item.unitId, item.amount, item.end, item.buildingType])];
      const s = D.smithy(village);
      smith = [s.active ? 1 : 0, s.end, ...(s.entries || []).slice(0, 3).flatMap(item => [item.unitId, item.level, item.end])];
      const p = D.celebration(village);
      party = [p.active ? 1 : 0, p.type, p.end, p.ready ? 1 : 0];
      const scan = D.scanFor?.(village?.villageId);
      resourceShape = (scan?.resources || []).map(item => [item.key, item.capacity, item.production]);
    } catch (_) {}
    return [
      String(village?.villageId || ''),
      Number(village?.population) || 0,
      village?.isActive ? 1 : 0,
      JSON.stringify(build),
      JSON.stringify(train),
      JSON.stringify(smith),
      JSON.stringify(party),
      JSON.stringify(resourceShape),
      Number(D.intelStamp?.(village?.villageId)) || 0
    ].join('~');
  }

  function signature() {
    const settings = typeof D.getAocConfig === 'function' ? D.getAocConfig() : {};
    return [
      String(D.snapshot?.playerId ?? ''),
      String(D.snapshot?.activeVillageId ?? ''),
      JSON.stringify(settings),
      ...(D.snapshot?.villages || []).map(queueSignature)
    ].join('||');
  }

  const baseRender = R.render;
  R.render = (force = false, ...rest) => {
    const now = Date.now();
    const nextSignature = signature();
    const mustRender = force === true || dirty || nextSignature !== lastSignature || now - lastFullRender >= FALLBACK_FULL_RENDER_MS;
    if (!mustRender) {
      lightRenders += 1;
      R.updateCountdowns?.();
      A.actions?.renderTools?.();
      return;
    }
    dirty = false;
    lastSignature = nextSignature;
    lastFullRender = now;
    fullRenders += 1;
    return baseRender(force, ...rest);
  };

  R.forceRender = reason => {
    dirty = true;
    const overlay = document.getElementById(D.OVERLAY_ID);
    if (overlay?.classList.contains('open')) R.render(true);
    return reason;
  };

  window.addEventListener('apes_aoc_force_render', event => R.forceRender(event.detail?.reason || 'external'));
  window.addEventListener('qol_setting_changed', () => { dirty = true; });
  window.addEventListener('hashchange', () => { dirty = true; });

  // Browser-native row virtualization for large accounts. Off-screen rows are skipped by layout/paint.
  const style = document.createElement('style');
  style.id = 'apes-aoc-performance-styles';
  style.textContent = `
    #${D.OVERLAY_ID} .apes-aoc2-village-row{content-visibility:auto!important;contain-intrinsic-size:auto 76px!important;contain:layout paint style!important}
    #${D.OVERLAY_ID} .apes-aoc2-village-detail{content-visibility:auto!important;contain-intrinsic-size:auto 220px!important}
  `;
  document.head.appendChild(style);

  window.APES_AOC_PERFORMANCE = Object.freeze({
    version: 1,
    stats: () => ({ fullRenders, lightRenders, lastFullRender, villages: D.snapshot?.villages?.length || 0 }),
    force: reason => R.forceRender(reason || 'manual')
  });
})();
