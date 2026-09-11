---
"@comvi/next": minor
---

`createNextI18n(...)` plugin registration is consolidated into a single `registerPlugin()` method. Runtime scoping and lazy loading now go through options:

```typescript
const nextI18n = createNextI18n({ locales: ["en", "de"], defaultLocale: "en" })
  // Runs in both runtimes (unchanged)
  .registerPlugin(MyPlugin())
  // Was: .useServer(MyServerPlugin())
  .registerPlugin(MyServerPlugin(), { runtime: "server" })
  // Was: .useClient(MyClientPlugin(), { environment: "development" })
  .registerPlugin(MyClientPlugin(), { runtime: "client", environment: "development" })
  // Was: .useServerLazy(() => import("./server-plugin"))
  .registerPlugin(() => import("./server-plugin"), { runtime: "server", lazy: true })
  // Was: .useClientLazy(() => import("@comvi/plugin-in-context-editor").then((m) => m.InContextEditorPlugin()), { required: false })
  .registerPlugin(
    () => import("@comvi/plugin-in-context-editor").then((m) => m.InContextEditorPlugin()),
    {
      runtime: "client",
      lazy: true,
      required: false,
    },
  );
```

New capabilities of the unified signature:

- `lazy: true` without `runtime` — a lazily imported plugin that runs in both runtimes.
- `environment: "development" | "production"` without `runtime` — environment-only scoping (previously required picking a runtime via `useClient`/`useServer`).
- All remaining option properties (`required`, `timeout`, …) are forwarded to `i18n.registerPlugin()` as before.

**Deprecated:** `useClient`, `useServer`, `useClientLazy`, and `useServerLazy` still work as thin delegates to the new `registerPlugin()` but are deprecated and will be removed in 0.6.0. Migrate using the mapping above.

The new `UsePluginOptions` type is exported alongside `ScopedPluginOptions`, `LazyPluginModule`, and `LazyPluginLoader` from the package root.
