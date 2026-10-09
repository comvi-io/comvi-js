---
"@comvi/core": minor
"@comvi/vue": minor
"@comvi/react": minor
"@comvi/solid": minor
"@comvi/svelte": minor
"@comvi/next": minor
"@comvi/nuxt": minor
"@comvi/plugin-fetch-loader": minor
"@comvi/plugin-locale-detector": minor
"@comvi/plugin-in-context-editor": minor
---

**`.use(installer)` is the ONE composition verb.** 0.5 shipped two verbs for two contracts — `.with(installer)`, a synchronous widening pipe on the base host, and `.use(plugin)`, a deferred queue on the plugin-host capability. Two verbs one letter apart, with opposite timing, is a coin toss at every call site, and `with` needed explaining every time. `use` does not: Vue's `app.use(plugin)` calls `install(app)` synchronously and hands the app back for chaining, and Express's `app.use` and i18next's `.use(module)` are synchronous registration too. So `use` is now the only verb, and it means what every reader already thinks it means.

```ts
import { createI18n, icuCompiler, definePlugin } from "@comvi/vue";
import { cdnLoader } from "@comvi/plugin-fetch-loader";
import { localeDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en", fallbackLocale: "en", compiler: icuCompiler })
  .use(cdnLoader({ cdnUrl }))
  .use(localeDetector({ order: ["querystring", "navigator"] }))
  .use(
    definePlugin((i18n) => {
      /* my own plugin */
    }),
  );

createApp(App).use(i18n).mount("#app"); // vue's own `use`, unchanged
```

### The renames

| 0.5 (before)                | 0.5 (now)                              | What it is                                               |
| --------------------------- | -------------------------------------- | -------------------------------------------------------- |
| `host.with(installer)`      | `host.use(installer)`                  | the composition pipe, on the BASE host                   |
| `VueI18n.with(installer)`   | `VueI18n.use(installer)`               | the same pipe on vue's wrapper, running on `i18n.core`   |
| `host.use(plugin, options)` | `host.registerPlugin(plugin, options)` | the deferred plugin queue, on the plugin-host capability |
| —                           | `definePlugin(fn, options?)`           | NEW: registers your own inline plugin through `.use`     |
| `E_WITH_HOST_IDENTITY`      | `E_USE_INSTANCE_IDENTITY`              | vue: the installer returned a different object           |
| `WithHostIdentityError`     | `UseInstanceIdentityError`             | the exported type for that error                         |
| `E_INSTALLER_NESTED_USE`    | `E_INSTALLER_AS_PLUGIN`                | an installer was registered as a plugin                  |
| —                           | `E_USE_NOT_INSTALLER`                  | NEW: `.use(f)` got something that is not an installer    |

`registerPlugin` lines up with the neighbours it sits beside on that capability — `registerLoader`, `registerLocaleDetector`, `registerPostProcessor` — and it is no longer a composition verb, so nothing reads as if it belonged in a `.use` chain. `definePlugin(fn)` is `attachPlugins(host).registerPlugin(fn, options)` wrapped as an installer: it attaches the plugin host if the chain has not already and queues exactly one plugin, so an app never touches the raw queue. It is exported from `@comvi/core/plugins` and re-exported by every binding root (`@comvi/react`, `@comvi/solid`, `@comvi/svelte`, `@comvi/vue`, `@comvi/next/client`, `@comvi/next/server`) beside `plugins`; the low-level `attachPlugins` stays on `@comvi/core/plugins` alone. `plugins()` attaches the plugin HOST; `definePlugin(fn)` registers ONE plugin on it.

`E_USE_NOT_INSTALLER` is what makes one verb safe. The rule is IDENTITY: **an installer widens the instance in place and returns the instance it was given**, so `.use(f)` throws unless `f` handed back that same object. A shape probe ("did it return an object?") would not have been enough — `fetchLoaderPlugin(…)` and friends are async functions, so calling one returns a Promise, which is an object; the plugin would have run at composition time with its rejection unhandled. Identity catches sync and async raw plugins alike, and `.use` — core's and vue's alike — also swallows the rejection an already-invoked async plugin left behind, so the actionable error is the only thing you see. In development the message states the rule, NAMES what came back (`typeof`, and whether an object was thenable — which is what separates "you passed an async plugin" from "you passed nothing"), and names both ways out; in production it is the bare code. This is the same rule vue's wrapper has always enforced over `i18n.core`, reported there under the wrapper's own code and with the same development wording, so the branchable `code` set is now three: `E_ICU_SYNTAX`, `E_USE_INSTANCE_IDENTITY`, `E_USE_NOT_INSTALLER`.

The rule is also stated in the TYPE: `use<T extends this>(installer: (host: this) => T): T`, so all three misuses — a derived object, an async installer, an installer that returns nothing — are compile errors, while every widening installer still infers and widens. The runtime guard stays for JS and `any`-typed callers. Vue's `use` keeps its `T extends WrapperI18nInstance<D>` bound, which already refuses the same three shapes.

One consequence for hand-written installers: a step that returned a DERIVED object (`.use((i18n) => ({ i18n, dispose }))`) is no longer a valid installer. Widen in place and return the host, and keep whatever else you built beside the chain.

Everything else keeps its name: `loader()`, `plugins()`, `devtools()`, `attachLoader`, `attachPlugins`, `attachDevtools`, `fetchLoader()`, `cdnLoader()`, `localeDetector()`, `inContextEditor()`, `icuCompiler`, the `compiler:` option, `useI18n()`, `useI18nLoader()`, `useI18nPlugins()`, `createI18nFromCore`, `createNextI18nFromInstance`, Nuxt's `i18nModule`. (`@comvi/vue`'s `createCore` alias is gone — see `vue-drop-create-core.md`; `attachPlugins` / `attachDevtools` keep their names on `@comvi/core/plugins` / `@comvi/core/devtools`, off the binding roots — see `roots-drop-attach-pair.md`.) (`createNextI18n(...).use` becomes the same installer pipe in wave 2 — see the `@comvi/next` entry.) Vue's `app.use(i18n)` and Nuxt's `nuxtApp.use` were never ours and are untouched.

### Migration

```diff
- import { createI18n, icuCompiler, loader, plugins } from "@comvi/react";
- import { LocaleDetector } from "@comvi/plugin-locale-detector";
+ import { createI18n, icuCompiler, loader, definePlugin } from "@comvi/react";
+ import { localeDetector } from "@comvi/plugin-locale-detector";

  export const i18n = createI18n({ locale: "en", compiler: icuCompiler })
-   .with(loader({ uk: () => import("./uk.json") }))
-   .with(plugins())
-   .use(LocaleDetector({ order: ["navigator"] }))
-   .use((i18n) => {
-     track(i18n.locale);
-   });
+   .use(loader({ uk: () => import("./uk.json") }))
+   .use(localeDetector({ order: ["navigator"] }))
+   .use(
+     definePlugin((i18n) => {
+       track(i18n.locale);
+     }),
+   );
```

Three mechanical steps, in this order:

1. `.with(` → `.use(` everywhere, including on vue's `VueI18n`.
2. Every remaining `host.use(rawPlugin)` → `host.registerPlugin(rawPlugin)`. A "raw plugin" is a function that returns nothing or a cleanup function: your own inline plugin, or a `*Plugin` factory's result (`localeDetectorPlugin()`, `fetchLoaderPlugin()`, `inContextEditorPlugin()`).
3. Prefer composing instead of queuing: an inline plugin becomes `.use(definePlugin(fn))`, and a plugin package's `*Plugin` factory becomes its bare-name installer in the chain (`localeDetector()`, `fetchLoader()`, `cdnLoader()`, `inContextEditor()`).

No `with` alias survives anywhere, and the old error identities are gone: a `catch` that branched on `E_WITH_HOST_IDENTITY` or `E_INSTALLER_NESTED_USE`, or a type import of `WithHostIdentityError`, must be updated. Step 2 has no compile error on a host typed as `any`, and a raw plugin left in `.use()` now throws `E_USE_NOT_INSTALLER` at composition time — loudly, with the fix in the message — rather than running at the wrong moment.
