---
"@comvi/nuxt": patch
---

Internal typing fixes to the `#app` / `@nuxt/schema` shims. No published types change (`dist` is
byte-identical), and no runtime behaviour changes.

- **`declare module "@nuxt/schema"` no longer shadows the real package.** The block lived in
  `src/shims-nuxt.d.ts`, a global script file, so it was an ambient module _declaration_ rather
  than an augmentation: `@nuxt/kit`'s own declarations resolved through a stub of four empty
  interfaces, `defineNuxtModule` and `extendPages` degraded to `any`, and `src/module.ts` could
  not be type-checked at all — `tsconfig.typecheck.json` excluded it, which hid eight errors.
  The block is replaced by a module-scoped `src/shims-nuxt-schema.d.ts` whose only job is to put
  `@nuxt/schema` in the program so the real augmentation in `src/types.ts` has a target.
  `src/module.ts` is now type-checked, as are the two test suites that import it.
- **`defineNuxtPlugin` and `defineNuxtRouteMiddleware` keep their call signatures.** Both shims
  returned `unknown`, so the default export of every plugin and middleware module arrived
  without one and each consumer had to cast before invoking it. Both are now identity-typed,
  matching Nuxt's real signatures.
