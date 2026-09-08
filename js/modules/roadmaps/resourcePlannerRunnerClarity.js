(() => {
  'use strict';

  const RUNNER_ID = 'qol-roadmap-runner';
  let queued = false;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function classNumber(element, expression) {
    const className = typeof element?.className === 'string'
      ? element.className
      : element?.getAttribute?.('class') || '';
    const match = String(className).match(expression);
    return match ? Number(match[1]) : null;
  }

  function runtime() {
    return window.APES?.roadmapsRunner?.getContextState?.()
      || window.APES?.roadmapsRunner?.getRawContextState?.()
      || null;
  }

  function parser() {
    return window.APES?.roadmapsResourcePlannerImports?.parse;
  }

  function currentInfo() {
    const rt = runtime();
    const parse = parser();
    if (!rt?.roadmap || !rt?.progress || !Array.isArray(rt.roadmap.steps) || typeof parse !== 'function') return null;
    const index = Math.max(0, Number(rt.progress.currentStep) || 0);
    const step = rt.roadmap.steps[index];
    const info = step?.type === 'instruction' ? parse(step.text) : null;
    if (!info) return null;
    return { rt, index, step, info };
  }

  function visibleLevels(typeId) {
    const root = document.querySelector('#villageViewRes');
    if (!root) return null;

    const fields = [];
    root.querySelectorAll('building-location').forEach(wrapper => {
      const marker = wrapper.querySelector('.buildingStatusButton[class*="type_"]');
      if (classNumber(marker, /type_(\d+)/i) !== Number(typeId)) return;
      const levelNode = wrapper.querySelector('.buildingLevel');
      const level = Number.parseInt(clean(levelNode?.textContent), 10);
      if (!Number.isFinite(level)) return;
      const locationId = classNumber(wrapper, /buildingLocation(\d+)/i)
        ?? classNumber(marker, /location_(\d+)/i)
        ?? 999;
      fields.push({ locationId, level: Math.max(0, level) });
    });

    if (!fields.length) return null;
    fields.sort((a, b) => Number(a.locationId) - Number(b.locationId));
    return fields.map(field => field.level);
  }

  function ensureDetection(panel) {
    const card = panel.querySelector('.qol-rmr-step-card');
    if (!card) return null;
    let node = card.querySelector('.qol-rmpi-detection');
    if (!node) {
      node = document.createElement('div');
      node.className = 'qol-rmpi-detection waiting';
      card.appendChild(node);
    }
    return node;
  }

  function nextCountInfo(current) {
    const parse = parser();
    if (typeof parse !== 'function') return null;
    const next = current.rt?.roadmap?.steps?.[current.index + 1];
    if (!next || next.type !== 'instruction') return null;
    const info = parse(next.text);
    return info?.mode === 'count' ? info : null;
  }

  function apply() {
    const panel = document.getElementById(RUNNER_ID);
    const current = currentInfo();
    if (!panel || !current || current.info.mode !== 'count') return;

    const info = current.info;
    const stepText = panel.querySelector('.qol-rmr-step-text');
    if (stepText) {
      stepText.textContent = `${info.resourceLabel} Fields → Level ${info.level}`;
    }

    const detection = ensureDetection(panel);
    const levels = visibleLevels(info.typeId);
    if (detection && levels && levels.length >= info.totalCount) {
      const atTarget = levels.slice(0, info.totalCount).filter(level => level >= info.level).length;
      const currentText = clean(detection.textContent);
      const safeToClarify = !detection.classList.contains('confirming')
        && !detection.classList.contains('complete')
        && (
          !currentText
          || /^Counting completed resource fields/i.test(currentText)
          || /^Waiting for live village data/i.test(currentText)
          || /^Loading /i.test(currentText)
          || /^\d+\/\d+ completed at Lv/i.test(currentText)
          || /^Current:/i.test(currentText)
        );

      if (safeToClarify) {
        detection.className = 'qol-rmpi-detection waiting';
        detection.textContent = `Current: ${atTarget}/${info.totalCount} completed at Lv ${info.level}+ · Target: ${info.requiredCount}/${info.totalCount}`;
      }
    }

    const next = nextCountInfo(current);
    const nextStrong = panel.querySelector('.qol-rmr-next strong');
    if (next && nextStrong) {
      nextStrong.textContent = `Target: ${next.requiredCount}/${next.totalCount} ${next.resourceLabel} Fields → Level ${next.level}`;
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      apply();
    });
  }

  function init() {
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.addEventListener('hashchange', () => setTimeout(schedule, 100));
    window.addEventListener('apes_roadmap_imported', () => setTimeout(schedule, 0));
    setInterval(schedule, 1000);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();