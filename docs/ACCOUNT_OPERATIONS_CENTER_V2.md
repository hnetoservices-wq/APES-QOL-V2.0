# Account Operations Center — Replacement Plan

Status: Draft 1

## Goal

Replace the current Account Operations Center with a cleaner account-level dashboard based on the Excel wireframe. The center should answer two questions quickly:

1. What needs my attention across the account?
2. What can I do from here without opening every village manually?

The first implementation should prioritize readability, fast navigation, and reuse of data APES already has.

## Draft 1 layout

### Header
- `APES QoL 2.0 | Account Operations Center`
- Close control
- Small data-freshness indicator / refresh control

### Account overview
Primary summary cards:
- Villages
- Population
- Needs Attention
- Free Finishes

Recommended optional fifth card:
- Next Event

### Next Events
Account-wide horizontal event timeline.

Initial event types:
- Construction finishes
- Free-finish availability
- Training finishes
- Smithy finishes
- Celebrations finish
- Warehouse / granary full or empty estimates when resource data is available
- Building Alarm events

Later integrations can add incoming troop and merchant events without changing the layout.

### Village table
Draft column order:
1. Village
2. Training
3. Celebration
4. Construction
5. Smithy
6. Resources
7. Buildings
8. Attention

Controls:
- Search village
- Sort village order
- Current village row highlight
- Click village name to switch village
- Click actionable cell content to open the relevant village/building where possible

### Quick Actions — Current Village
- Hero Inventory
- Rally Point
- Chat
- Statistics
- Auction House
- Quest Book

Use APES-styled controls, not Travian native button classes.

### Enabled Tools
- Show APES features that are currently enabled and can be opened
- Clicking an item opens the tool
- User can reorder the list
- Persist order per server/player context
- Prefer keeping the Account Operations Center open underneath APES tools so closing the launched tool returns the user to the center

## Column behaviour

### Village
Show:
- Village name
- Coordinates
- Population
- Capital / City badges where relevant

### Training
Show active queues, total units queued, and the next finishing timer.

If a village has a training building but no active queue, show a compact Idle state.

### Celebration
Show:
- Small / Great celebration
- Remaining time
- None / Idle when Town Hall exists but no celebration is active

### Construction
Show up to two visible queued constructions with live countdowns.

More queued items can be exposed through a tooltip.

### Smithy
Show active research/upgrade and remaining time.

### Resources
Show account-operation information, not four large raw resource numbers.

Recommended compact state:
- Warehouse fill risk
- Granary fill/empty risk
- Crop production warning
- Time until full/empty where known
- Data age tooltip

Resource values may be projected from the last reliable village snapshot, so stale-data indication is mandatory.

### Buildings
Do not try to display every building.

Initial tracked-building set can reuse the current dashboard set, but the preferred design is user-configurable tracked buildings (for example Market, Barracks, Stable, Workshop, Town Hall, Residence/Palace, Treasury).

Show `Name Lvl X`; missing buildings may be omitted or shown as level 0 depending on the final display style.

### Attention
Derived summary of actionable conditions from the other columns.

Suggested severity groups:
- Critical: crop deficit, storage full/empty, future incoming threat integration
- Warning: storage near limit, free finish ready, construction/training idle where applicable
- Info: Town Hall or Smithy idle, stale resource data

The cell should show only the most important few badges and expose the full list in a tooltip/details view.

## Search and sorting

Search:
- Village name
- Coordinates

Initial sort options:
- Village/account order
- Needs attention
- Next event
- Construction finish
- Storage risk
- Population
- Alphabetical

Later option:
- User-defined drag order

## Data architecture

### Reuse existing Main-world bridge
`js/ui/villageDashboardBridge.js` already exposes account village data including:
- Village identity and population
- Construction queues
- Training queues
- Smithy queues
- Celebration state
- Building models
- Troop models

The replacement should continue using the existing `window.postMessage` bridge rather than introducing another account scanner.

### Current resource/building scan data
The current Account Operations Center stores resource snapshots by visiting villages and reading the resource HUD. For the replacement:

1. Keep compatibility with existing stored scan data initially.
2. Add passive capture whenever the user organically visits/switches village.
3. Retain a manual Refresh All / Scan All action only as a fallback for users who want every village updated immediately.
4. Investigate direct cache models later so the disruptive navigation scan can eventually be removed.

### Existing integrations
The replacement must preserve the public API:

```js
window.APES_ACCOUNT_OPERATIONS_CENTER = {
  open,
  close,
  toggle,
  refresh,
  scan,
  getVillages
};
```

This avoids breaking integrations such as Building Alarm while the UI is replaced.

For the first implementation, retain the current overlay id `apes-v2-village-overlay` until dependent integrations are migrated.

## Refactor plan

The current Account Operations Center lives inside `js/ui/villagePalette.js`. The replacement should separate responsibilities.

### Stage 1 — Structural split + shell
- Create dedicated `js/ui/accountOperationsCenter.js`
- Move Account Operations Center state/rendering into the dedicated controller
- Preserve public API and overlay id
- Keep existing bridge and data logic working
- Render the new Excel-style shell before adding new behaviour

### Stage 2 — Core live data
Populate:
- Villages
- Population
- Training
- Celebration
- Construction
- Smithy
- Buildings
- Account summary
- Next Events

### Stage 3 — Resources + Attention
- Reuse stored resource snapshots
- Add passive current-village capture
- Render resource risk state
- Build the Attention rules engine

### Stage 4 — Sidebar interactions
- Quick Actions
- Enabled Tools launcher
- Tool reordering and persistence
- Search
- Expanded sorting

### Stage 5 — Cross-feature integrations
- Building Alarm
- Incoming Resources
- Rally Point / incoming threat summaries
- CP / expansion readiness where useful

### Stage 6 — Polish
- Responsive layout
- Keyboard navigation
- Tooltips
- Empty/stale states
- Performance testing with large accounts
- Remove legacy Account Operations Center code after validation

## Compatibility rule

Do not rewrite or duplicate scanners unless the dashboard needs data that no existing APES feature or bridge can provide. The Account Operations Center should primarily be a consumer/aggregator of APES data.
