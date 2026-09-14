---
"@comvi/next": minor
---

`createNextI18n(…).use(installer)` is the one composition verb; runtime scoping moves onto
`nextPlugin` / `nextPluginLazy`; the four scoped delegates are deleted; `compiler` is an option;
`createNextI18nFromHost` builds its host eagerly.

**`use` is core's installer pipe now.** `result.use(f)` is `f(result.i18n)` and hands back the same
result with `i18n` retyped to what the installer widened the host to — the same contract as
`i18n.use(…)` on every host, with the same identity guard: an installer that returns a different
object, an async one, or a raw plugin throws `code: "E_USE_HOST_IDENTITY"` (reported over
`result.i18n`; a raw async plugin's rejection is swallowed so that error is the only report), and
all three are TypeScript errors first. The 0.4 `use(plugin, options)` — Next's own scoped
raw-plugin queue, one word away from the SDK's composition verb with the opposite timing — is gone.

**Scoping lives on the plugin form.** Two installers, exported from `@comvi/next`, `/client` and
`/server`:

```ts
nextPlugin(plugin, { runtime?: "client" | "server", environment?: "all" | "development" | "production", ...PluginOptions })
nextPluginLazy(load, { ...the same })   // load: () => Promise<plugin | { default: plugin }>, imported at most once
```

Each is `attachPlugins(host).registerPlugin(scoped, rest)` as an installer, so it attaches the plugin
host if the chain has not and sits anywhere in the chain before `init()`. `NextPluginOptions` is the
published options type; `LazyPluginModule` / `LazyPluginLoader` keep their names. `UsePluginOptions`
and `ScopedPluginOptions` are gone with the method they typed.

**Deleted, not deprecated:** `useClient`, `useServer`, `useClientLazy`, `useServerLazy` (the 0.6.0
removal pulled forward). The rename table:

| 0.4                                               | 0.5                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `.use(Plugin())`                                  | `.use(nextPlugin(Plugin()))`                                     |
| `.use(FetchLoader(o))`                            | `.use(fetchLoader(o))`                                           |
| `.use(Plugin(), { runtime, environment, …opts })` | `.use(nextPlugin(Plugin(), { runtime, environment, …opts }))`    |
| `.use(load, { lazy: true, …opts })`               | `.use(nextPluginLazy(load, { …opts }))`                          |
| `.useClient(p, o)` / `.useServer(p, o)`           | `.use(nextPlugin(p, { …o, runtime: "client" \| "server" }))`     |
| `.useClientLazy(l, o)` / `.useServerLazy(l, o)`   | `.use(nextPluginLazy(l, { …o, runtime: "client" \| "server" }))` |

Pick the installer where you write the call: `lazy` is no longer an option a value can decide at
runtime. `useClient` / `useServer` already fixed `runtime`, so drop it from the options when you
move such a call onto `nextPlugin`.

**`localeDetector()` must not be composed on this host.** It is process-wide on the App Router, so
the first request's headers would pin the locale for every later render; use
`nextPlugin(LocaleDetector(…), { runtime: "client" })`.

**`compiler?: MessageCompiler` on `CreateNextI18nOptions`**, defaulting to `icuCompiler` in 0.5
(the composed root keeps its published ICU behaviour), so ICU is the same single switch here as on
`createI18n` — pass your own compiler to opt out. The hardcode in the composed-host builder is
removed. `apiKey` / `devMode` are documented for what they are: forwarded to the host for a
fetch-loader plugin to read; this factory loads nothing on its own.

**`createNextI18nFromHost` is eager.** It promised `host()` would run lazily on first `result.i18n`
access while its documented example destructured `i18n` at module scope, hitting the getter at once.
`host()` now runs exactly once, inside the call, `i18n` is a plain field, and the once-cell's
factory / resolving / cycle / retry machinery is deleted. The two-source conflict is checked BEFORE
`host()` runs, and a throwing factory leaves nothing configured. No test depended on laziness for
anything but itself: the lazy-trigger, cycle and retry cases were rewritten to pin the eager
contract.

**The root carries the toolkit.** `icuCompiler`, `loader`, `attachLoader`, `plugins`,
`definePlugin`, `devtools` (and `DevtoolsOptions`) are now
re-exported from `@comvi/next` as well, because a shared `i18n/config.ts` is imported by both
runtimes and can name neither `/client` (`"use client"`) nor `/server` (`next/headers`). A new size
row, `fw-next-root-composed`, gates the recommended path.

Migration of the documented config file:

```diff
-import { createNextI18n } from "@comvi/next";
+import { createNextI18n, loader, nextPluginLazy } from "@comvi/next";

-export const nextI18n = createNextI18n({ ...routing, fallbackLocale: "en" });
-nextI18n.i18n.registerLoader({ en: () => import("./locales/en.json"), uk: () => import("./locales/uk.json") });
-nextI18n.useClientLazy(
-  () => import("@comvi/plugin-in-context-editor").then((m) => m.InContextEditorPlugin()),
-  { environment: "development", required: false },
-);
-export const { i18n } = nextI18n;
+export const { i18n } = createNextI18n({ ...routing, fallbackLocale: "en" })
+  .use(loader({ en: () => import("./locales/en.json"), uk: () => import("./locales/uk.json") }))
+  .use(
+    nextPluginLazy(
+      () => import("@comvi/plugin-in-context-editor").then((m) => m.InContextEditorPlugin()),
+      { runtime: "client", environment: "development", required: false },
+    ),
+  );
```
