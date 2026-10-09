---
"@comvi/plugin-in-context-editor": patch
---

Fixes in the key selector, the standalone runtime and the manual lifecycle:

- The key selector, shown when one element carries several keys, opens next to the element on a
  scrolled page instead of off-screen.
- Key selector previews load through the API configuration of the editor that opened the selector,
  so they show the translation instead of "(Error loading)" or another project's value.
- Closing the key selector right after it opens leaves no document listeners behind.
- Standalone `activate()` returns `null` with a console error for an i18n instance created without
  the plugin capability, such as `createI18n().use(devtools())`, instead of throwing. Without an
  `instanceId` it picks an instance it can edit over one it cannot.
- Standalone `activate({ refreshMessages: false })` marks text the app rendered before activation;
  only the API refresh is skipped.
- Standalone `activate()` applies `highlightStyle`.
- Calling `init()` again stops the runtime the previous `init()` started, and `stop()` stops the
  current one.
- The `collectContext` documentation describes when collection runs and what it sends: the page
  origin, the keys on screen with their screen group, and structural and layout signals, never
  rendered text.
