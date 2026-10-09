---
"@comvi/core": minor
"@comvi/react": minor
"@comvi/solid": minor
"@comvi/svelte": minor
"@comvi/vue": minor
"@comvi/next": minor
---

ICU is enabled ONLY through the constructor option `compiler: icuCompiler`

The `icu()` installer is removed, together with the compiler lock behind it: the
`E_COMPILER_LOCKED` error, its `CompilerLockedError` type and the
`_setCompilerBeforeIngestion` seam are gone. `icuCompiler` and the
`MessageCompiler` type stay where they were, on `@comvi/core/icu` and re-exported
by every binding root.

ICU is a compiler setting, not a capability with an API. Two enable forms whose
validity depended on where the catalog came from — `compiler:` for inline
catalogs, `.use(icu())` for remote ones, `E_COMPILER_LOCKED` when mixed — was a
rule readers had to learn for no benefit. One constructor option works
everywhere: inline, loader, CDN, API.

```ts
import { createI18n, icuCompiler } from "@comvi/vue"; // or react/solid/svelte/next client/core
const i18n = createI18n({ locale: "en", compiler: icuCompiler }).use(cdnLoader({ cdnUrl }));
```

Nothing else about composition changes, and no ordering rule is left in the
library. `.use(loader())`, `.use(plugins())`, `.use(devtools())` and a
plugin's own installer compose in any order. Vue keeps its own rule, which is
about the plugin queue rather than ICU: compose before `app.use(i18n)`. Nuxt's
`comvi.icu: true` already maps to `compiler: icuCompiler` and is unchanged.

Two smaller consequences. The development `E_ICU_SYNTAX` message now ends with
`Pass compiler: icuCompiler from "@comvi/core/icu" in the constructor options.`,
so anything asserting on the old hint text needs updating. And the production
error inventory shrinks by one here: after this change the identities that carry
a branchable `code` are `E_ICU_SYNTAX` and, on the Vue wrapper,
`E_USE_INSTANCE_IDENTITY`. `E_USE_NOT_INSTALLER` joins them with the `.use(installer)`
verb.

Migration: replace `createI18n(options).use(icu())` with
`createI18n({ ...options, compiler: icuCompiler })` and drop the `icu` import.
Code that branched on `code === "E_COMPILER_LOCKED"` has nothing left to catch.
