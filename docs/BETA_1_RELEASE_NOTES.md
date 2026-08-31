# APES QoL 2.0 Beta 1

**Version:** 2.0.0-beta.1  
**Chrome build:** 2.0.0.74  
**Status:** Public Beta

Beta 1 freezes the APES QoL 2.0 feature set and opens the v2 branch to wider real-world testing. Functionally, this release promotes the alpha.80 gameplay baseline into the first public beta rather than adding another round of new features.

## What changes in v2

APES QoL 2.0 is a broader rebuild of the extension rather than a simple continuation of v1. The main differences are shared core services, safer server/player-scoped storage, a responsive toolbar, the G command palette, account-wide operational views, persistent feature data, backup/restore tools and substantially expanded scanners/planners.

## Major Beta 1 areas

### Core and navigation

- Responsive APES toolbar with overflow handling.
- G command palette for enabled feature actions.
- Keyboard navigation and gameplay shortcuts.
- Server/player-scoped storage infrastructure.
- Backup, restore and storage-management tools.

### Account and village management

- Account Operations Center with village attention, construction, training, smithy, celebrations, troops and building access.
- Building Alarm with Account Operations Center timeline integration.
- Resource Upgrade Planner with persistent per-village roadmaps and live Pending / Queued / Complete tracking.
- Resource Capacity Timer.
- CP Manager, Trade Route Optimizer and Expansion Readiness tools.

### Kingdom and map tools

- Oasis & Cropper Scanner with persistent scan data, cropper/oasis analysis, map visual aids and Tag Team sections.
- Secret Society Scanner with multiple societies, history comparison, notes and Player Dossier access.
- Watchlists with player tracking and change history.
- Distance & Arrival Calculator.

### Rally Point and reports

- Rally Point Parser and unified scan flows for incoming, outgoing and resource movements.
- Rally Point History and scan-to-scan change tracking.
- Incoming Resources summaries.
- Report Archive with folders, search and shared-report support.
- Send Troops Enhanced.

### Economy and utility tools

- NPC Calculator with storage-aware troop planning, multi-pass execution plans and direct NPC market filling.
- Auction House Scanner with multi-page scanning, sorting and direct listing navigation.
- Checklists.
- IGM Enhancer.
- Chat Silencer.

### Cosmetic and convenience

- Visual Tribe Skins.
- Themes and shared APES UI styling.
- Village palette and other navigation conveniences.

## Beta 1 focus

From Beta 1 onward, the priority is stability rather than feature expansion. Testing should focus on:

- clean installs;
- switching villages repeatedly;
- switching Travian servers/accounts;
- multi-page scanners;
- SPA navigation while APES windows remain open;
- backup and restore;
- persistent per-village data;
- browser zoom and smaller window sizes;
- disabling and re-enabling individual features.

## Reporting a beta issue

A useful report should include:

1. Feature name.
2. What you were doing immediately before the problem.
3. Expected behaviour.
4. Actual behaviour.
5. Travian server and browser.
6. Screenshot or screen recording when useful.
7. Console error, if one appears.

Avoid clearing APES storage before reporting a persistence problem unless the test specifically requires it.

## Release policy

Large new features are frozen during the public beta. Beta updates should primarily contain bug fixes, compatibility fixes, scanner/navigation hardening, storage corrections and UI fixes discovered by testers.
