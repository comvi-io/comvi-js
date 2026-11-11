---
"@comvi/core": minor
"@comvi/next": minor
"@comvi/react": minor
"@comvi/cli": minor
"@comvi/vite-plugin": minor
---

**BREAKING** (0.8-internal) — `defaultParams` and `setDefaultParams()` are removed from the 0.8 API, with the matching option of the generators: `createI18n({ defaultParams })`, `i18n.setDefaultParams()`, `<I18nHandover defaultParams>` (and its `HandoverParams` type), the Next server configuration's and client `options`' `defaultParams`, typegen's `emitCatalogs`/`generate` `defaultParams`, the CLI's `.comvirc.json` `defaultParams` (now refused as an unknown field) and `comviTypes({ defaultParams })` of the Vite plugin. Every param a message uses is required in the generated types. Migration: pass the params to each `t(key, params)` call (an app may share one object of values or tag handlers and spread it into its calls); hand server data a Client Component needs to it as an ordinary prop. No replacement API.
