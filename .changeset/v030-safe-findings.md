---
"@comvi/cli": patch
"@comvi/svelte": patch
"@comvi/react": patch
---

Polish from the v0.3 review (no behavior change to existing valid usage):

- **cli:** warn (and ignore) when a `.comvirc.json` carries the deprecated `languages` field — it was renamed to `locales`. Mirrors the existing `defaultNsName` deprecation warning.
- **svelte:** tighten `TProps.params` from `Record<string, unknown>` to `TranslationParams`, matching `@comvi/solid` and what `tRaw` actually accepts.
- **react:** document the `useSetLocaleTransition()` and `useFormatters()` hooks in the README.
