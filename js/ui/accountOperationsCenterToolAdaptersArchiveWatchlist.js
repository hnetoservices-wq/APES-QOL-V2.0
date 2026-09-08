(() => {
  'use strict';

  const workspace = window.APES_AOC_WORKSPACE;
  if (!workspace || window.__APES_AOC_ARCHIVE_WATCHLIST_ADAPTERS_V1__) return;
  window.__APES_AOC_ARCHIVE_WATCHLIST_ADAPTERS_V1__ = true;

  function snapshotInlineStyle(element) {
    return element?.getAttribute('style');
  }

  function restoreInlineStyle(element, snapshot) {
    if (!element) return;
    if (snapshot === null || snapshot === undefined) element.removeAttribute('style');
    else element.setAttribute('style', snapshot);
  }

  function clearStandaloneGeometry(panel) {
    if (!panel) return;
    ['position', 'left', 'right', 'top', 'bottom', 'inset', 'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height', 'transform', 'z-index', 'resize'].forEach(property => {
      panel.style.removeProperty(property);
    });
  }

  function moveBackToBody(panel) {
    if (panel?.isConnected && panel.parentElement !== document.body) document.body.appendChild(panel);
  }

  function reportArchiveAdapter() {
    let panel = null;
    let originalStyle = null;

    function mount(host) {
      const api = window.APES_REPORT_ARCHIVE;
      panel = document.getElementById('qol-report-archive-panel');
      if (!api || !panel) throw new Error('Report Archive UI is unavailable.');

      originalStyle = snapshotInlineStyle(panel);

      // Use the feature's own open path so folders/reports are freshly rendered,
      // then convert only its presentation into an AOC-hosted panel.
      try { api.open?.(); } catch (_) {}
      panel = document.getElementById('qol-report-archive-panel');
      if (!panel) throw new Error('Report Archive panel could not be mounted.');

      clearStandaloneGeometry(panel);
      panel.classList.add('apes-aoc-embedded-tool', 'apes-aoc-embedded-report-archive');
      panel.setAttribute('data-apes-aoc-embedded', 'reportArchive');
      panel.setAttribute('aria-hidden', 'false');
      host.appendChild(panel);

      return unmount;
    }

    function unmount() {
      if (!panel) return;
      try { window.APES_REPORT_ARCHIVE?.close?.(); } catch (_) {}
      panel.classList.remove('apes-aoc-embedded-tool', 'apes-aoc-embedded-report-archive');
      panel.removeAttribute('data-apes-aoc-embedded');
      moveBackToBody(panel);
      restoreInlineStyle(panel, originalStyle);
      originalStyle = null;
      panel = null;
    }

    return { mount, unmount };
  }

  function watchlistAdapter() {
    let panel = null;
    let originalStyle = null;
    let routeListener = null;

    function ensureOpenAndFresh() {
      if (!panel) return;
      const hidden = window.getComputedStyle(panel).display === 'none';
      if (hidden) {
        // The standalone toggle calls the feature's own openWatchlistMenu(),
        // which refreshes tabs/table before showing the panel.
        document.getElementById('qol-watchlist-toggle')?.click();
      }
    }

    function mount(host) {
      panel = document.getElementById('qol-watchlist-container');
      if (!panel) throw new Error('Watchlists UI is unavailable.');

      originalStyle = snapshotInlineStyle(panel);
      ensureOpenAndFresh();
      clearStandaloneGeometry(panel);

      panel.classList.add('apes-aoc-embedded-tool', 'apes-aoc-embedded-watchlists');
      panel.setAttribute('data-apes-aoc-embedded', 'watchlists');
      panel.setAttribute('aria-hidden', 'false');
      host.appendChild(panel);

      // Player/profile and send-troops links are game navigation. Let the Watchlist
      // set the route first, then close the AOC so the destination is visible.
      routeListener = event => {
        if (!event.target.closest?.('.qol-route-link')) return;
        window.setTimeout(() => window.APES_ACCOUNT_OPERATIONS_CENTER?.close?.(), 0);
      };
      panel.addEventListener('click', routeListener, false);

      return unmount;
    }

    function unmount() {
      if (!panel) return;
      if (routeListener) panel.removeEventListener('click', routeListener, false);
      routeListener = null;
      panel.classList.remove('apes-aoc-embedded-tool', 'apes-aoc-embedded-watchlists');
      panel.removeAttribute('data-apes-aoc-embedded');
      moveBackToBody(panel);
      restoreInlineStyle(panel, originalStyle);
      // Embedded Watchlists should return to their normal closed standalone state.
      panel.style.setProperty('display', 'none');
      originalStyle = null;
      panel = null;
    }

    return { mount, unmount };
  }

  workspace.register('reportArchive', reportArchiveAdapter());
  workspace.register('watchlists', watchlistAdapter());
})();
