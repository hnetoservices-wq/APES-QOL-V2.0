# APES QoL v2 architecture

## Migration rule

Existing features remain operational while v2 services are introduced. A feature is migrated only after its current storage, UI, and behavior are documented and a compatibility path exists.

## Core load order

1. `js/core/bootstrap.js`
2. `js/core/context.js`
3. `js/core/storage.js`
4. `js/core/actions.js`
5. Existing keys, UI, and feature scripts

## Shared services

### APES.events

A small event bus for communication between features without direct dependencies.

### APES.context

Provides current server, player, and village identity. Context is read at call time because Travian is a single-page application and the active village can change without a reload.

### APES.storage

Creates keys with explicit scope:

```text
apes:v2:global:{feature}:{key}
apes:v2:{server}:server:{feature}:{key}
apes:v2:{server}:{playerId}:{feature}:{key}
```

No v1 key is deleted automatically. Migration adapters will copy validated data into v2 storage and retain the original until the user confirms cleanup.

### APES.actions

A central action registry. Existing and future features register commands here. The Command Palette will search and execute these actions.

## Planned phases

1. Foundation and storage inventory
2. Command Palette
3. Storage Cleanup Manager
4. Watchlist highlighting
5. Village Overview Dashboard
6. Feature-by-feature migration and v1 compatibility cleanup

## Safety rules

- Never mix data between servers or players.
- Never deduplicate game movements using player, village, and timestamp alone.
- Never delete legacy storage during an automatic migration.
- Shared UI uses APES-owned classes and controls, not Travian-native button classes.
- Scans lock interaction and wait for confirmed rendered state before parsing.
