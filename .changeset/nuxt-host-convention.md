---
"@comvi/nuxt": minor
---

`comvi.host.ts` is found by convention, `icu: true` reaches a host module, and a typed
`comvi.setup.ts` names one specifier.

- **`comvi.host.*` is auto-detected.** The module looks for `./comvi.host.*` under `srcDir`, then
  `rootDir`, the same way it already found `./comvi.setup`. `hostModule` stays the explicit
  override, and a set `hostModule` that does not resolve is still a build error. The detected
  path is logged at build time so a stray file that changed the host is visible, and a near
  miss (a `comvi.host.cjs` it found but could not resolve) is warned about, naming the file and
  the specifier it looked for. The host branch is still decided in codegen.
- **`icu: true` is no longer ignored when a host module exists.** It used to be dropped with a
  build-time warning. Now the module puts `compiler: icuCompiler` into the resolved options the
  factory receives — as the last key, so a factory that writes `createI18n({ ...options })` gets
  ICU and one that writes `createI18n({ ...options, compiler: mine })` keeps its own. With
  `icu: false` the generated module imports nothing from `@comvi/core/icu`, on both branches.
  `NuxtInstanceFactoryOptions` gained the matching `compiler?: MessageCompiler`.
- **`I18nLoaderApi` and `LoaderFn` are re-exported (type-only) from the `@comvi/nuxt` root**, so a
  hook typed `NuxtI18nSetup<I18n & I18nLoaderApi>` imports all three types from `@comvi/nuxt`,
  the package the app declared, instead of `@comvi/core` and `@comvi/core/loader`, which it did
  not.
- **The near-miss probe is exact.** It matched any entry starting with `comvi.setup`, so a
  `comvi.setup.d.ts`, a `comvi.setup.ts.bak` or a `comvi.setup/` directory was reported as the
  hook that failed to resolve. It now requires a regular file named `comvi.setup.<ext>` (one
  extension), and the new host probe has the same shape.

**Migrating a `comvi.setup.ts` that only registered an import-map loader.** A setup hook whose
whole body was `core.registerLoader(createImportMapLoader({ … }, () => core.getDefaultNamespace()))`
is what `loader(map)` from `@comvi/nuxt/host` already does — it attaches the loader capability AND
registers the map. Move the map into `comvi.host.ts` and delete the setup file:

```ts
// comvi.host.ts
import { createI18n, loader, type NuxtInstanceFactory } from "@comvi/nuxt/host";

export default ((options) =>
  createI18n(options).use(
    loader({
      en: () => import("./locales/en.json"),
      "en:admin": () => import("./locales/admin/en.json"),
    }),
  )) satisfies NuxtInstanceFactory;
```

That file needs no dependency the app did not install; the old setup file resolved
`@comvi/core/loader` only under a hoisted `node_modules`. A setup hook that does something else
(a plugin, a runtime-dependent decision) stays where it is, and can now type its context with
`import type { I18n, I18nLoaderApi, NuxtI18nSetup } from "@comvi/nuxt"`.
