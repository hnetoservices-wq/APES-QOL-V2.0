# Account Operations Center V2 — completed implementation pass

This document records the completed implementation pass for the APES QoL Account Operations Center after the Excel-led redesign.

## Architecture

The Account Operations Center is intentionally a consumer of APES and Travian data rather than a second monolithic scanner.

### Core
- `js/ui/accountOperationsCenterData.js` — base account/village models, passive resource capture, projections, alerts and events.
- `js/ui/accountOperationsCenterAccuracy.js` — strict queue identification and resource-source accuracy layer.
- `js/ui/accountOperationsCenterActions.js` — Quick Actions and Enabled Tools.
- `js/ui/accountOperationsCenterRender.js` — shell, overview, events, village table and expanded village drawer.
- `js/ui/accountOperationsCenter.js` — lifecycle, H/Esc, bridge refresh and public API.

### Intelligence / completed stages
- `js/ui/accountOperationsCenterIntel.js` — consumes rendered results from the existing Rally Point / Incoming Resources scanners and stores normalized village intelligence without initiating a new scan.
- `js/ui/accountOperationsCenterIntelligence.js` — severity ordering, recent-completion detection, Building Alarm awareness, incoming military/resource intelligence and overflow prediction.
- `js/ui/accountOperationsCenterSettings.js` — AOC settings, tracked buildings, density, alert visibility, scanner intelligence visibility, sort and expanded-row persistence.
- `js/ui/accountOperationsCenterVillageActions.js` — context-sensitive Attention/Event actions and expanded village shortcuts.
- `js/ui/accountOperationsCenterPerformance.js` — semantic rerender gating, in-place countdown updates and browser-native row virtualization.

## Stage 3 — Data accuracy

Implemented:
- Strict unit identification; numeric array indexes are not treated as troop IDs.
- Training-building inference is limited to trustworthy tribe/unit/building combinations.
- Smithy falls back to generic text instead of guessing.
- Sequential construction queues use queue ordering and `lvlNext` where available.
- Unidentified celebrations display `Celebration`, not an assumed Small Celebration.
- Resources expose Live / Projected / Stale / Missing source states.

## Stage 4 — Attention & event intelligence

Implemented:
- Severity ordering: danger/critical first, warnings next, ready/action states next, informational last.
- Needs Attention counts actionable issues only.
- Recent transitions are retained temporarily: construction finished, training completed, Smithy completed and celebration finished.
- Building Alarm ready state feeds Attention while the existing Building Alarm integration continues to own alarm timeline rendering.
- Free-finish-ready timeline duplication is suppressed when the state is already actionable in Attention.
- Attention stays capped to three visible rows; when more exist the third row becomes `+N more`.

## Stage 5 — Military & logistics awareness

Implemented without adding another account scanner:
- The latest visible APES Incoming scanner results are captured per village.
- The latest visible APES Incoming Resources results are captured per village.
- The latest visible APES Outgoing scanner results are captured per village.
- Scanner intelligence expires after six hours and is isolated per server/player.
- Incoming attack/siege/raid data feeds Attention and Next Events.
- Incoming resources feed Attention and Next Events.
- Incoming resources are combined with projected storage/production to warn when a shipment is expected to overflow a resource store.
- Outgoing movements can appear as an informational summary.

Important: military/logistics intelligence reflects the latest APES Rally Point scan. The AOC does not silently scan the Rally Point in the background.

## Stage 6 — Village actions

Implemented:
- Actionable Attention badges are clickable.
- Native AOC events are context-sensitive where a specific target can be resolved.
- Expanded village drawer includes shortcuts for Village, Rally Point, Marketplace, active training building, Town Hall, Smithy and Resource Planner where available.
- Navigation actions open the relevant village/building; APES tools are opened through their existing controls so the AOC remains underneath.

## Stage 7 — Personalization

Implemented through the AOC cog:
- Comfortable / Compact density.
- Default sort.
- Show/hide informational notices.
- Show/hide incoming attacks.
- Show/hide incoming resources/overflow intelligence.
- Show/hide outgoing movement summary.
- Configurable tracked buildings.
- Remember expanded village.
- Existing Enabled Tools drag ordering remains supported.
- Scanner intelligence can be cleared independently.
- AOC settings can be reset independently.

## Stage 8 — Performance & polish

Implemented:
- Snapshot refresh can continue frequently without rebuilding the entire table every time.
- Full DOM rerenders are triggered immediately by semantic queue/account/intelligence/settings changes and otherwise fall back periodically for projected resource values.
- Countdown values continue updating in place each second.
- Passive resource capture timestamps no longer force a full table rebuild every 2.5 seconds.
- Village rows use browser `content-visibility`/containment to reduce layout and paint cost on large accounts.
- Existing hover freeze remains in place, preventing resource tooltips from blinking while the table is being read.
- Existing loading/empty/search states remain intact.
- Old `villagePalette.js` is not loaded by the manifest; the compatibility API remains available from the modular AOC.

## Public diagnostic APIs

For live debugging from DevTools:

```js
APES_AOC_DATA_ACCURACY?.inspect(villageId)
APES_AOC_INTEL?.inspect(villageId)
APES_AOC_SETTINGS?.get()
APES_AOC_PERFORMANCE?.stats()
```

These APIs are diagnostic only and allow the remaining live-game edge cases to be inspected without adding temporary UI or speculative parsers.

## Live verification matrix

After reloading the extension, verify at least:
1. Barracks + Stables active in the same village.
2. Great Barracks / Great Stables where available.
3. Workshop queue.
4. Smithy upgrade.
5. Two sequential construction entries on the same building.
6. Small Celebration.
7. Big Celebration.
8. Negative crop and crop-empty ETA.
9. Storage nearing full.
10. Building Alarm free-finish event.
11. Incoming attack scan.
12. Incoming Resources scan that would overflow storage.
13. AOC settings persistence after refresh.
14. APES tool launched from Enabled Tools while AOC remains underneath.
15. Large-account scrolling and resource-hover stability.
