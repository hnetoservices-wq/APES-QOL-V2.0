# APES QoL v2

APES QoL v2 is the next-generation architecture for the APES Travian Kingdoms browser extension.

The stable v1 extension remains in its original repository. This repository is the v2 development line and may contain alpha features.

## v2 goals

- A shared APES core instead of duplicated feature infrastructure.
- Server- and player-safe storage.
- A searchable Command Palette.
- A Village Overview Dashboard.
- Global Watchlist highlighting.
- A safe Storage Cleanup Manager.
- Gradual migration of existing v1 features without losing user data.

## Current phase

**2.0.0 alpha 1 — Foundation**

The first phase introduces shared context, storage, events, and action registration. Existing v1 features continue to run unchanged until they are migrated individually.

See [docs/V2_ARCHITECTURE.md](docs/V2_ARCHITECTURE.md) for the technical plan.
