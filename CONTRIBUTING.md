# Contributing to APES QoL

Thank you for helping improve APES QoL, the community-built quality-of-life extension for Travian Kingdoms.

## Before you contribute

- Search existing Issues and Pull Requests to avoid duplicate work.
- Open a feature request before starting a large new tool, a major UI overhaul or a data migration.
- Keep each PR focused on one improvement or closely related bug fixes.
- Do not submit game credentials, session tokens, private player reports, unredacted account data or private server details. Remove personal details from screenshots and HTML fixtures.
- The repository is public, but **there is currently no LICENSE file**. Public visibility is not itself an open-source license. Please discuss a suitable license with the maintainer before submitting substantial third-party code or redistributing project code.

## Fork → branch → Pull Request

1. Fork the repository on GitHub and clone your fork.
2. Select the branch identified as the current integration target in the repository's open PRs or maintainer announcements. During the current branch transition, this is `release/2.0.192`; `main` may not yet contain the newest features.
3. Create a topic branch, such as `fix/smithy-calculator` or `feature/new-scanner`.
4. Change only the files needed for your contribution, and add or update relevant tests.
5. Run the checks below, then submit a Pull Request **to the integration branch** using the template.
6. Respond to review feedback. Only the maintainer decides when a contribution is merged and included in an official release.

```bash
npm ci --prefix tests --ignore-scripts
node tools/validate-extension.mjs
npm test --prefix tests
```

The `tests/` package installs test dependencies. The extension itself is loaded as a Chrome Manifest V3 unpacked extension and has no required build step.

## Project layout and design conventions

- `js/features/`: user-facing feature entry points
- `js/modules/<feature>/`: feature-specific implementations
- `js/core/`: shared bootstrap, context, actions and storage
- `js/ui/`: shared extension UI
- `css/features/` and `css/modules/`: feature-owned styles
- `tests/`: regression tests; `docs/`: architecture and release guidance

See [repository layout](docs/REPO_LAYOUT.md) and [v2 architecture](docs/V2_ARCHITECTURE.md).

Use APES-owned styling rather than Travian-native button classes. Match existing UI patterns and avoid injecting duplicate controls. Register new scripts and styles in `manifest.json` in the correct dependency order; moving scripts can change behavior.

### Data and gameplay safety (non-negotiable)

- Scope saved state to the correct Travian server and logged-in account.
- Never persist player-scoped data before the logged-in identity is resolved.
- Never erase or migrate legacy storage silently.
- Avoid duplicate or disruptive navigation scans; wait for confirmed rendered game state.
- Preserve existing tools' behavior unless the PR explicitly describes a justified change.
- Do not introduce telemetry, tracking, remote code execution, extra manifest permissions or new external network calls without a clearly documented need and maintainer approval.

## Evidence and review

For visible changes, attach before/after screenshots or a short recording, preferably with sensitive account details removed. For parser/scanner changes, supply sanitized example HTML and a regression test when possible. Explain how you checked that the feature works with multiple villages, servers or account states where relevant.

GitHub Actions will check manifest paths, JavaScript syntax and the existing test suite. Passing automated checks does not replace in-game testing or the [release hardening checklist](docs/RELEASE_HARDENING_CHECKLIST.md).

Be respectful in reviews. Disagreement about implementations is fine; harassment and personal attacks are not. The maintainer may close off-topic or abusive contributions.

## Security vulnerabilities

Do not file public exploit details or secrets. Follow [SECURITY.md](SECURITY.md).

## Releases

A merged PR is not automatically a release. The maintainer controls version numbers, package creation, GitHub releases and Chrome Web Store publication. The manual packaging workflow creates a review artifact only and never publishes to users.
