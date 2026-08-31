# APES QoL 2.0

APES QoL 2.0 is the current generation of the APES Travian Kingdoms browser extension.

The original v1 extension remains in its own repository. This repository contains the v2 architecture and the actively maintained feature set.

## Current phase

**2.0.0-beta.1 — Public Beta**

APES QoL 2.0 is now feature-frozen for the first public beta. The core feature set, scoped storage, responsive toolbar, Command Palette, Account Operations Center, backup/storage tools and migrated gameplay features are in place.

Beta development should prioritize bug fixes, gameplay edge cases, storage safety, parser/navigation regressions and UI compatibility. Large new features should wait until after the beta stabilizes.

The manifest is the source of truth for the exact installed build and beta number.

## Beta expectations

- Back up APES data before testing major changes or imports.
- Report reproducible bugs with the feature name, expected result, actual result, server, browser and a screenshot or console error when available.
- Pay particular attention to multi-page scanners, village switching, server/account switching, backup/restore and features that interact with Travian navigation.
- A beta build may contain regressions that are not present in the stable v1 extension.

See [Beta 1 release notes](docs/BETA_1_RELEASE_NOTES.md) for the public-beta scope and [release hardening checklist](docs/RELEASE_HARDENING_CHECKLIST.md) for the smoke-test matrix.

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
