---
"@comvi/nuxt": minor
---

New `@comvi/nuxt/host` subpath, so a `comvi.host.ts` can be written after installing
`@comvi/nuxt` and nothing else.

The documented host recipe composed `createI18n` from `@comvi/core` plus `@comvi/core/icu` and
`@comvi/core/loader`. None of those is a dependency of the APP — they are dependencies of this
package — so under pnpm's default layout the recipe did not resolve from a clean install, and the
error arrived as a module-resolution failure rather than a missing install. The new subpath
re-exports exactly the composition surface: `createI18n`, `icuCompiler`, `loader`,
`attachLoader`, `plugins`, `attachPlugins`, `devtools`, `definePlugin`, and the
`NuxtHostFactory` type.

```ts
// comvi.host.ts
import { createI18n, icuCompiler, loader, type NuxtHostFactory } from "@comvi/nuxt/host";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler }).use(
    loader({ de: () => import("./locales/de.json") }),
  )) satisfies NuxtHostFactory;
```

Named re-exports only, one hop straight from `@comvi/core` or one of its pure subpaths, and the
entry is gated by its own `scripts/size-budgets.json` row like every other published entry.
`flattenCatalog` is deliberately not re-exported: the base host flattens a nested catalog itself,
so pre-flattening by hand stays on the `@comvi/core` root. Additive — importing core's subpaths
directly still works for an app that declares `@comvi/core`.
