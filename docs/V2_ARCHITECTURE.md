# APES QoL v2 architecture

## Current status

v2 is in release hardening. The original foundation phases are complete enough that new work should favor stability, scoped persistence, regression prevention and cleanup over broad feature expansion.

## Migration rule

Existing features remain operational while shared v2 services are introduced. A feature is migrated only after its storage, UI and behavior are understood and a compatibility path exists.

Legacy data is not deleted automatically. Validated migrations may copy legacy data into v2 storage, while cleanup remains an explicit user action through APES storage tools.

## Load order

MAIN-world bridges load first when they need access to Travian runtime state:

1. `js/core/playerIdentityBridge.js`
2. `js/ui/villageDashboardBridge.js`
3. Other MAIN-world bridges

The isolated extension world then loads:

1. `js/core/bootstrap.js`
2. `js/core/context.js`
3. `js/core/storage.js`
4. `js/core/actions.js`
5. `js/core/ui.js`
6. Keybinds, shared UI and feature modules

## Shared services

### APES.events

Small event bus for communication without unnecessary direct feature dependencies.

### APES release metadata

`js/core/bootstrap.js` reads the installed manifest and exposes the current version through `APES.version` / `APES.release`. UI version badges are synchronized from that value so old hard-coded alpha labels cannot drift from the manifest.

### APES.context

Provides current server, player and village identity. Context is read at call time because Travian is a single-page application.

The logged-in player id must come from own-account state. It must never be inferred from a generic player profile link because another player's profile may be open on screen.

### Player identity bridge

`js/core/playerIdentityBridge.js` runs in Travian's MAIN world, derives the logged-in player id from the active own-village cache and publishes only that numeric id to the shared DOM.

### APES.storage

Creates explicit namespaces:

```text
apes:v2:global:{feature}:{key}
apes:v2:{server}:server:{feature}:{key}
apes:v2:{server}:{playerId}:{feature}:{key}
```

Player-scoped `get`, `set` and `remove` wait for a resolved numeric player id. They must fail rather than read/write an `unknown` player namespace.

### APES.actions

Central action registry used by the Command Palette and feature integrations.

### Responsive toolbar

`js/ui/toolbar.js` owns visible toolbar geometry. Feature modules may create historical source controls, but the responsive toolbar captures them and renders stable proxy controls. Features should not compete for visible toolbar positioning.

### Account Operations Center bridge

`js/ui/villageDashboardBridge.js` exposes a sanitized read-only snapshot of the logged-in player's own village cache. Cross-feature planners should reuse this snapshot instead of adding redundant navigation scans where possible.

## Integration modules

A separate integration module is acceptable when it genuinely joins two independently stable features—for example Building Alarm events inside Account Operations Center. Patch files whose only job is to repair one canonical feature should instead be folded back into that feature during hardening.

Current integration files should therefore be reviewed individually before consolidation; do not merge them merely to reduce file count if doing so increases regression risk.

## Release-hardening priorities

1. Player/server storage isolation.
2. Manifest-driven version and release metadata.
3. Remove orphaned/dead files and abandoned-feature references.
4. Confirm Settings, toolbar and registered actions use consistent feature names and keys.
5. Regression-test multi-page scanners and route transitions.
6. Consolidate patch-only modules into canonical feature files where safe.
7. Verify backup/restore and storage cleanup understand both legacy APES prefixes and `apes:v2:` keys.

## Safety rules

- Never mix data between servers or players.
- Never persist player-scoped data under an unresolved identity.
- Never deduplicate game movements using player, village and timestamp alone.
- Never delete legacy storage during an automatic migration.
- Shared UI uses APES-owned classes and controls, not Travian-native button classes.
- Scans lock interaction where required and wait for confirmed rendered state before parsing.
- Cross-feature integrations should consume existing cached state before adding another scanner.
