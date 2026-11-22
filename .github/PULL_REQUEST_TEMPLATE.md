## Summary

Describe what changes and why. Link the corresponding Issue if there is one.

Closes #

## Type

- [ ] Bug fix
- [ ] Feature or improvement
- [ ] Refactor / documentation / maintenance

## Scope and safety

- [ ] I kept the PR focused and documented any behavior changes.
- [ ] Storage remains isolated by server and logged-in player.
- [ ] No credentials, player secrets, private reports or unredacted fixtures are included.
- [ ] I did not add tracking, remote calls or manifest permissions without explicitly explaining them.
- [ ] I checked the relevant APES styling and manifest load order.

## Validation

- [ ] `npm ci --prefix tests --ignore-scripts`
- [ ] `node tools/validate-extension.mjs`
- [ ] `npm test --prefix tests`
- [ ] Manual in-game testing completed, or I explain why not below.

**Manual test steps and results:**

**Screenshots / before-and-after evidence (if UI changed):**

**Known limitations / migration risks:**

> CI is a guardrail, not proof of in-game compatibility. Do not include sensitive account information in screenshots or logs.
