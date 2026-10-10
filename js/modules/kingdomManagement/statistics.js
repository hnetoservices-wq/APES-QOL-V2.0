(() => {
  'use strict';
  const PREFIX = 'Statistics.TableHeader.Tooltip.';
  const STAGES = Object.freeze([
    { tab: 'Population', label: 'Total Kingdom Population', fields: { rank: 'Rank', villages: 'TotalVillages', population: 'TotalPopulation' } },
    { tab: 'Size', label: 'Total Kingdom Area', fields: { area: 'TotalArea' } },
    { tab: 'Attacker', label: 'Kingdom Attacker Points', fields: { players: 'CountPlayers', averageAttack: 'Attacker.AVGPoints', totalAttack: 'Attacker.Points' } },
    { tab: 'Defender', label: 'Kingdom Defender Points', fields: { averageDefense: 'Defender.AVGPoints', totalDefense: 'Defender.Points' } },
    { tab: 'VictoryPoints', label: 'Kingdom Treasures and Victory Points', fields: { treasures: 'VictoryPoints.TotalTreasures', victoryPoints: 'VictoryPoints.TotalPoints' } }
  ]);
  const clean = value => String(value ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
  function count(value) {
    const text = clean(value);
    if (!/^[\d\s.,]+$/.test(text)) return null;
    const number = Number(text.replace(/[^\d]/g, ''));
    return Number.isSafeInteger(number) ? number : null;
  }
  function readPage(stage, doc = document) {
    const roots = [...doc.querySelectorAll(`.loadedTab.tab${stage.tab}.currentTab`)];
    for (const root of roots) {
      if (root.classList.contains('hiddenTab')) continue;
      const table = [...root.querySelectorAll('table')].find(element => element.querySelector(`th[tooltip-translate="${PREFIX}Kingdom"]`));
      if (!table) continue;
      const columns = {};
      let index = 0;
      table.querySelectorAll('thead th').forEach(header => {
        columns[header.getAttribute('tooltip-translate')] = index;
        index += Number(header.getAttribute('colspan')) || 1;
      });
      if (Object.values(stage.fields).some(key => !Number.isInteger(columns[PREFIX + key]))) return null;
      const rows = [];
      const seen = new Set();
      for (const row of table.querySelectorAll('tbody tr')) {
        const cells = [...row.children];
        const link = cells[columns[PREFIX + 'Kingdom']]?.querySelector('[kingdomid]');
        const id = link?.getAttribute('kingdomid');
        if (!id || !/^\d+$/.test(id) || Number(id) <= 0 || seen.has(id)) return null;
        const result = { id, name: clean(link.textContent), ranking: count(cells[columns[PREFIX + 'Rank']]?.textContent) };
        if (!result.name || !result.ranking) return null;
        if (stage.tab === 'Population') {
          const king = cells[columns[PREFIX + 'King']]?.querySelector('[playerid]');
          if (!king || !clean(king.textContent)) return null;
          result.king = clean(king.textContent);
          result.kingId = king.getAttribute('playerid') || '';
        }
        for (const [key, column] of Object.entries(stage.fields)) {
          const cell = cells[columns[PREFIX + column]];
          // The VP table has colspan headers and separate weekly deltas.
          // Its tooltip contains the full point total when a bonus is shown.
          const total = key === 'victoryPoints' ? cell?.getAttribute('tooltip-data')?.match(/totalPoints\s*:\s*([\d.,\s]+)/i)?.[1] : null;
          result[key] = count(total ?? cell?.textContent);
          if (result[key] === null) return null;
        }
        seen.add(id);
        rows.push(result);
      }
      const pager = root.querySelector('.tg-pagination');
      const pages = [...(pager?.querySelectorAll('li.number') || [])].map(node => ({ page: count(node.textContent), disabled: node.classList.contains('disabled') }));
      const page = pages.find(item => item.page && item.disabled)?.page;
      const next = pager?.querySelector('li.nextPage');
      if (!page || !next || !rows.length || rows.some((row, i) => i && row.ranking <= rows[i - 1].ranking)) return null;
      const lastPage = Math.max(page, ...pages.map(item => item.page || 0));
      const hasNext = !next.classList.contains('disabled') && !next.querySelector('.disabled');
      return { rows, page, lastPage, hasNext, signature: JSON.stringify(rows) };
    }
    return null;
  }
  window.APES_KINGDOM_STATISTICS = Object.freeze({ STAGES, readPage, clean, count });
})();
