---
"@comvi/nuxt": minor
---

**BREAKING (0.x minor, WATCHDOG policy): the host under `@comvi/nuxt` is core's base host.** Nuxt is the one package this convergence did not repackage — every published entry, composable, component, middleware and server utility stays exactly where it was, and there was never a second host tier here to retire. What changed sits underneath all of them: the generated `#build/comvi.host` template builds core's base host, so ICU, async loading, the plugin host, devtools discovery and ambient tag syntax became things a Nuxt app composes rather than things it already had.

`nuxt-framework-slim.md` in this same release carries the recipe and the full 0.4 → 0.5 migration table: the `hostModule` factory, the resolved options it is called with, the server host types, and the codemod. This entry states the three contracts that are Nuxt's alone.

### The ICU timing rule, in Nuxt's shape

A Nuxt host is catalog-bearing by construction — the module hands the factory its resolved options including the render/request locale, and translations arrive from `nuxt.config`, from `comvi.setup` or from a loader — so ICU is selected with the **compiler option**, in the same call:

```ts
// comvi.host.ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import type { NuxtHostFactory } from "@comvi/nuxt";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler })) satisfies NuxtHostFactory;
```

`.with(icu())` is the installer form and it is **pre-ingestion only**: the compiler locks the moment any catalog reaches the host, and a later `icu()` throws with own `code === "E_COMPILER_LOCKED"` before mutating anything. `clearTranslations()` does not unlock it. Under the simple compiler an ICU template throws `E_ICU_SYNTAX` in development **and** in production — loudly, rather than rendering a plausible wrong plural.

### The capability toolkit is deliberately not re-exported here

Every other converged package re-exports core's installers so an app never names a capability subpath: `@comvi/react`, `@comvi/solid`, `@comvi/svelte` and `@comvi/vue` on their one entry, `@comvi/next` on its client and server entries. `@comvi/nuxt` does not, on purpose. Its published surface is a Nuxt module, not an application import; composition happens in `comvi.host.ts`, which is an ordinary app file and can name `createI18n` plus `icuCompiler` / `loader` / `plugins` / `devtools` from core's own pure subpaths directly. Relaying them through the module entry would put the whole toolkit in the build-time graph of every app, including the ones that compose nothing.

What `@comvi/nuxt` does publish for that file is the type vocabulary: `NuxtHostFactory`, `NuxtHostFactoryOptions`, `NuxtServerHost` and `NuxtServerLoaderHost`.

### Vue's convergence rides through into Nuxt

Nuxt's rendering layer is `@comvi/vue`: `comvi.setup` receives a `VueI18n`, and `<T>` — auto-imported, and re-exported from `@comvi/nuxt/runtime/components/T` — is vue's component verbatim. Vue's `<T>` moved onto the pure `@comvi/core/rich-text` seam in this release, so rendering rich text in a Nuxt app no longer switches string-API tag parsing on for every plain `t()` call behind your back. `t("Click <b>here</b>")` returns that markup as text: development warns the first time, production stays literal and never throws. Render `<T>`, which hands core the tag grammar per call, or turn tag syntax on deliberately with one `import "@comvi/core/tags"` in a Nuxt plugin.

The capability calls that used to sit on `VueI18n`'s proxies move to `i18n.core.*`, and the capability has to be composed in the host factory before that call resolves. See `vue-single-entry-convergence.md` for the wrapper break and `core-single-entry-convergence.md` for the core break both of these ride on.
