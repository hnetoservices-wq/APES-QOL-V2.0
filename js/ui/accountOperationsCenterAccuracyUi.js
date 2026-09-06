(() => {
  'use strict';

  const A = window.APES_AOC_INTERNAL;
  const D = A?.data;
  const R = A?.rendering;
  if (!D || !R || R.__accuracyUiV1) return;
  R.__accuracyUiV1 = true;

  const baseRender = R.render?.bind(R);
  if (!baseRender) return;

  function ageLabel(age) {
    if (!Number.isFinite(age)) return 'missing';
    if (age < 60000) return '<1m';
    return D.duration(age);
  }

  function sourceLabel(state) {
    if (!state) return '';
    if (state.state === 'live') return 'Live snapshot';
    if (state.state === 'projected') return `Projected · ${ageLabel(state.age)} old`;
    if (state.state === 'stale') return `Stale projection · ${ageLabel(state.age)} old`;
    return 'No resource snapshot';
  }

  function decorate() {
    document.querySelectorAll(`#${D.OVERLAY_ID} [data-row-village-id]`).forEach(row => {
      const id = String(row.dataset.rowVillageId || '');
      const village = (D.snapshot?.villages || []).find(entry => String(entry.villageId) === id);
      if (!village) return;

      const state = D.resourceSnapshotState?.(village);
      const label = sourceLabel(state);
      const resourceCell = row.children?.[5];
      const summary = resourceCell?.querySelector?.('.apes-aoc2-resource-summary');
      if (summary && label) {
        const existing = String(summary.getAttribute('title') || '');
        if (!existing.startsWith('Source:')) summary.setAttribute('title', `Source: ${label}${existing ? `\n${existing}` : ''}`);
        summary.dataset.resourceSource = state?.state || 'missing';
      }

      const detail = document.querySelector(`#${D.OVERLAY_ID} [data-detail-village-id="${CSS.escape(id)}"]`);
      if (detail) {
        const sections = detail.querySelectorAll('.apes-aoc2-detail-grid > section');
        const resourcesHeading = sections?.[2]?.querySelector('h4');
        if (resourcesHeading && label) resourcesHeading.textContent = `Resources · ${label}`;
      }

      const accuracy = D.dataAccuracy?.(village);
      const trainingCell = row.children?.[1];
      if (trainingCell && accuracy?.training && accuracy.training !== 'identified' && accuracy.training !== 'idle') {
        trainingCell.setAttribute('title', accuracy.training === 'generic'
          ? 'Training is active, but Travian did not expose a trustworthy unit identifier in this cache snapshot.'
          : 'Training is active. Some queue entries are identified exactly; others are intentionally shown generically.');
      }

      const smithyCell = row.children?.[4];
      if (smithyCell && accuracy?.smithy && accuracy.smithy !== 'identified' && accuracy.smithy !== 'idle') {
        smithyCell.setAttribute('title', accuracy.smithy === 'generic'
          ? 'Smithy activity is detected, but the current cache snapshot does not expose a trustworthy unit identifier.'
          : 'Smithy activity is detected. APES only names the unit when Travian exposes a trustworthy identifier.');
      }
    });
  }

  R.render = () => {
    baseRender();
    decorate();
  };
})();
