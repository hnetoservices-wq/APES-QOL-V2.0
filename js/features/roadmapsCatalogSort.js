(() => {
  'use strict';

  let queued = false;

  function sortMenu(menu) {
    if (!menu || menu.dataset.qolAlphabetized === '1') return;
    const options = [...menu.querySelectorAll(':scope > [data-building-option]')];
    if (options.length < 2) return;
    options
      .sort((left, right) => String(left.dataset.buildingOption || left.textContent || '').localeCompare(
        String(right.dataset.buildingOption || right.textContent || ''),
        undefined,
        { sensitivity: 'base' }
      ))
      .forEach(option => menu.appendChild(option));
    menu.dataset.qolAlphabetized = '1';
  }

  function sortAll() {
    document.querySelectorAll('[data-building-menu]').forEach(sortMenu);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sortAll();
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-building-picker]')) schedule();
  }, true);
  schedule();
})();
