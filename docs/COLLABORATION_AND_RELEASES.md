# APES QoL collaboration and release policy

## Roles

- Anyone may inspect a public repository and propose changes using forks and Pull Requests.
- Contributors do not need write access to the upstream repository.
- The maintainer (`@hnetoservices-wq`) owns the integration and release decisions.
- CODEOWNERS requests review; it does **not** itself enforce approval. Enable branch rules in GitHub Settings.

## Integration branch transition

At the time this policy was introduced, `main` was behind the current development line and `release/2.0.192` was the active integration target. Keep branch targets explicit in PRs until the maintainer consolidates the development line and decides whether to promote it to `main` or change the default branch. Do not force-push or silently merge the historical chain of PRs.

## Recommended GitHub branch rules

In **Settings → Rules → Rulesets**, create an active branch ruleset targeting `main` and the active integration/release branch:

1. Require a Pull Request before merging.
2. For a single-maintainer repository, initially set required approving reviews to **0**. A PR author cannot approve their own PR, so requiring approval from the sole CODEOWNER could block the maintainer's own contributions. Add a trusted second reviewer or a deliberate maintainer bypass before requiring one approval and CODEOWNER review.
3. Require review conversations to be resolved; if required reviews are later enabled, dismiss stale approvals on new commits.
4. Require the `Extension checks` status check from the `APES extension checks` workflow **after it has run successfully at least once**.
5. Block force pushes and branch deletion.
6. Apply restrictions to administrators when appropriate so accidental direct pushes cannot bypass the process.

Do not add a required status check before verifying its exact name in GitHub's ruleset editor. Existing open PRs with stacked base branches may need to be rebased after the integration branch is consolidated.

## Contribution lifecycle

1. Open a Bug or Feature Issue, or start a narrowly scoped PR.
2. Submit a fork-based Pull Request, completing the PR checklist.
3. Automated tests and manifest validation run on the proposed code.
4. Maintainer reviews behavior, safety and compatibility.
5. Maintainer merges approved PRs at a deliberate point.
6. Passing CI does not automatically include the feature in a published build.

## Release lifecycle

1. Choose an exact commit from a reviewed integration/release branch.
2. Finish [release hardening](RELEASE_HARDENING_CHECKLIST.md), including in-game smoke tests and storage safety checks.
3. Update `manifest.json` version metadata deliberately and run CI.
4. Run **Actions → Prepare extension ZIP (manual review only)** on the selected branch.
5. Download the resulting ZIP artifact and manually inspect/test the unpacked extension.
6. Only the maintainer decides whether to create an annotated tag/GitHub Release and publish to Chrome Web Store, through a separate explicit manual process.

The packaging action **only** uploads a ZIP to the GitHub workflow artifacts. It cannot publish to Chrome Web Store and has read-only repository permissions. GitHub requires a manually dispatched workflow file to exist on the repository's default branch; while the default branch is behind, the maintainer may first need to integrate this workflow there.

## Licensing and security

A public repository without a LICENSE file is not automatically open source. Select and add a deliberate license before encouraging code reuse or substantial outside development. Do not upload sensitive screenshots, account data or credentials. Security vulnerabilities should follow [SECURITY.md](../SECURITY.md).
