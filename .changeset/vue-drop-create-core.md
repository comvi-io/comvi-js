---
"@comvi/vue": minor
---

**BREAKING (breaking change on a 0.x minor): `@comvi/vue` no longer re-exports `createCore`.** After the `.use(installer)` pipe, `createI18nFromCore` is the only reason the alias existed, and both are the escape hatch for a host built elsewhere — which is built with `createI18n` from `@comvi/core` directly: the host is elsewhere by definition, so crossing the import boundary is more honest than a local alias. `import { createCore } from "@comvi/vue"` becomes `import { createI18n as createCore } from "@comvi/core"`; `createI18nFromCore` is unchanged.
