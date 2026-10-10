# Kingdom Management

Open the crown in the APES toolbar, or open Kingdom Management under Tools in the Account Operations Center. The feature toggle is in the Kingdom Management section of settings; the Command Palette also includes the tool.

On first use, select **Scan Kingdoms**. APES locks game interaction and reports the ranking and page being scanned. **Cancel scan** or Escape stops the scan. On completion or cancellation, APES restores the original game route, unless another operation has already changed it.

The standalone window starts smaller, can be dragged by its header, and can be resized from its bottom-right corner. During scanning, the results window is hidden and a compact progress card sits in a corner, leaving the native statistics table visible behind the interaction lock. The original window size and position are retained when scanning finishes. AOC embedding retains the workspace's fixed sizing.

All action controls, including the crown launcher, use APES-styled `div` elements with `role="button"`, keyboard activation with Enter/Space, and explicit disabled states. Do not replace them with native `button` elements: the game decorates those elements and can interfere with the tool. The regression tests watch for native buttons even during temporary scan and render states.

The scanner opens page 1 of each Kingdoms statistics tab by URL and advances through its native pager: Population, Size, Attacker, Defender and Victory Points. It tolerates transient URL rewrites and omitted default parameters, and verifies page numbers from the rendered pager even when pagination leaves the URL unchanged. It waits for the active tab, current page, increasing ranks and stable rendered rows before proceeding. Hidden ancestor tabs are excluded. It joins records by kingdom ID rather than names or ranking positions. Repeated IDs, invalid cells, unfinished pages or incomplete pagination fail the scan instead of saving a partial result. Navigation/loading errors identify the ranking, requested page, observed URL context and rendered page where available.

The table contains population rank, kingdom, king, villages, population, area, player count, average and total attack points, average and total defense points, treasures and victory points. VP and treasure totals are read separately from weekly changes. Click column headings to sort, or search by kingdom or king. A dash means that a kingdom was not listed in that ranking; missing statistics are never converted to zero. The population ranking supplies the displayed rank and king.

Every successful scan creates a separate timestamped snapshot, even when values are unchanged. Snapshots are stored per server using APES storage and included in backup/restore and Storage Manager. Failed or cancelled scans leave existing snapshots intact. History has no automatic deletion limit; individual snapshots can be deleted from Results after confirmation.

The **Comparison** tab accepts an earlier and a later snapshot. It shows later values and numerical changes, including rank changes, and flags new/missing kingdoms, renames and king changes. Missing kingdoms retain their last known values. A negative rank change indicates an improved rank. A numerical change is only shown when both snapshots contain that statistic.

A scan records statistics sequentially over its displayed start/end interval, rather than at one server instant. Rankings can change during a scan; if this causes duplicated kingdoms across pages, retry the scan. Snapshot metadata retains the scanned page counts and coverage for each ranking.

Run `npm install --prefix tests` and `node tests/kingdomManagement.cjs` for sanitized native-markup and simulated navigation tests. Live-game smoke checks should cover all page counts, cancellation, reopening saved snapshots, and standalone/AOC views on both regular and Halloween servers.
