APES QoL repository layout

JavaScript
- js/features/: top-level, user-facing APES tools/features only.
- js/modules/<feature>/: implementation modules that belong to one feature.
- js/helpers/: generic JavaScript utilities shared by multiple unrelated features. Do not put one-feature modules here.
- js/ui/: global APES shell/chrome such as menus, toolbars, storage/backup surfaces and other shared UI infrastructure.
- js/core/: bootstrap, context, storage and other application-wide runtime services.

CSS
- css/features/: primary styles for user-facing features.
- css/modules/<feature>/: styles owned by feature-internal modules.
- css/helpers/: generic shared style fixes/utilities.
- css/style.css and css/v2.css remain global application styles.

Rules
- Keep feature load order explicit in manifest.json.
- Moving a file between folders must preserve its manifest load order unless the dependency itself is intentionally changed.
- Prefer purpose-based module names (editor.js, runner.js, history.js) over development-stage names.
- A new file belongs in features only if it represents a tool or feature a user can identify/use directly.
