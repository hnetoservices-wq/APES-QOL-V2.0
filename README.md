# APES QoL v2

APES QoL v2 is the current development line of the APES Travian Kingdoms browser extension.

The original v1 extension remains in its own repository. This repository contains the v2 architecture and the actively maintained feature set.

## Current phase

**2.0.0 — Release hardening**

The manifest is the source of truth for the exact alpha/build number. The project has moved beyond the original foundation phase: shared core services, scoped storage, the responsive toolbar, Command Palette, Account Operations Center, backup/storage tools and the migrated feature set are already in place.

Current work should prioritize stability, storage safety, parser/navigation regression checks, stale-code cleanup and release metadata over adding large new features.

## v2 architecture goals

- Shared APES core services instead of duplicated feature infrastructure.
- Server- and player-safe storage.
- APES-owned controls instead of Travian-native button styling.
- Responsive toolbar ownership from one UI layer.
- Searchable registered actions through the Command Palette.
- Account-wide operational data through the Account Operations Center.
- Backup/restore and selective storage management.
- Compatibility with legacy APES data without silently deleting it.

## Release safety rules

- Never mix saved data between Travian servers or logged-in players.
- Never write player-scoped data until the logged-in player identity is resolved.
- Never delete legacy storage automatically during migration.
- Never deduplicate game movements using player, village and timestamp alone.
- Scanners must wait for confirmed rendered state before parsing or moving to the next page.
- Shared UI must use APES-owned classes and controls.

See [docs/V2_ARCHITECTURE.md](docs/V2_ARCHITECTURE.md) for implementation details.
