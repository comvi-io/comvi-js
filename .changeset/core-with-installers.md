---
"@comvi/core": minor
---

**Added: `.with(installer)` — the composition pipe — plus the configured capability
installers `loader()`, `plugins()` and `devtools()`.** Composing a capability used to wrap
the construction expression; now it continues it.

```ts
const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: () => import("./uk.json") }),
);
```

That one expression replaces `attachLoader(...)`, `createImportMapLoader(map, ...)` and
`registerLoader(...)`.

`i18n.with(f)` **is** `f(i18n)` — no registry, no ordering rules, no capability semantics —
which is why it lives on the base class, is present on every host, and can never lie about
what an instance has. An **installer** is therefore any function of the host, so
`attachLoader`, `attachPlugins` and `attachDevtools` already are ones and
`.with(attachLoader)` works.

| installer            | attaches               | also configures                         |
| -------------------- | ---------------------- | --------------------------------------- |
| `loader(importMap?)` | `@comvi/core/loader`   | registers the import map                |
| `plugins()`          | `@comvi/core/plugins`  | nothing yet — the host takes no options |
| `devtools(options?)` | `@comvi/core/devtools` | `instanceId` / `exposeGlobal`           |

Each lives in its capability's own subpath, so its bytes ride that graph only. **Pick by
what you have:** `loader` names the import-map adapter statically, so referencing it pulls
that adapter in whether or not you pass a map — with a map that is what you want; with a
plain `LoaderFn`, use `.with(attachLoader)` and register it yourself.

Composing a capability a host already has is a no-op: no descriptors are copied, no own
property shadows the inherited prototype member, and registered state is kept.
Configuration is separate — `.with(loader(map))` on an already-composed host still registers
the map.

Plugin packages are unaffected, and now ALSO ship a lowercase installer each —
`fetchLoader`, `localeDetector`, `inContextEditor` — which composes the capabilities their
plugin needs and then routes into the same `use`. Nothing is removed: `attachLoader` /
`attachPlugins` / `attachDevtools` remain the low-level API, and every 0.4.x import path
still resolves. See the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.
