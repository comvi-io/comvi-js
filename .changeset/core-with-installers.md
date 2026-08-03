---
"@comvi/core": minor
---

**Added: `.with(installer)` — the composition pipe — plus configured capability installers `loader()`, `plugins()` and `devtools()`.**

Composing a capability used to wrap the construction expression instead of continuing it. Now it reads left to right:

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { loader } from "@comvi/core/loader";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(
  loader({ uk: () => import("./uk.json") }),
);
```

That one expression replaces three statements: `attachLoader(...)`, `createImportMapLoader(map, ...)` and `registerLoader(...)`.

### `.with` is a pipe and nothing more

`i18n.with(f)` **is** `f(i18n)`. No registry, no ordering rules, no capability semantics — which is why it can live on the base class, is present on every host, and can never lie about what an instance has. The installer's own return type decides the result: `loader()` widens the host with `I18nLoaderApi`, `(i) => i` widens nothing. It is typed as the widest honest shape, `(host) => value`, so it costs nothing today and takes a branded installer tomorrow.

An **installer** is therefore any function of the host — `attachLoader`, `attachPlugins` and `attachDevtools` already are ones, and `.with(attachLoader)` works.

### The configured installers

| installer            | attaches               | also configures                                      |
| -------------------- | ---------------------- | ---------------------------------------------------- |
| `loader(importMap?)` | `@comvi/core/loader`   | registers the import map (adapter + live default-ns) |
| `plugins()`          | `@comvi/core/plugins`  | nothing yet — the host takes no options              |
| `devtools(options?)` | `@comvi/core/devtools` | `instanceId` / `exposeGlobal`                        |

Each lives in its capability's own subpath, so its bytes ride that graph only — a base `@comvi/core` app that composes nothing pays nothing.

**Pick the installer by what you have.** `loader` names the import-map adapter statically, so referencing it pulls that adapter in whether or not you pass a map: measured **+124 B** min+gz on the composed core-base graph, **+111 B** on the next server graph. With an import map, use `loader(map)` — you need the adapter anyway. With a plain `LoaderFn`, use `.with(attachLoader)` and register it yourself; that is **+2 B** over calling `attachLoader(host)` directly.

### Composing twice is a no-op

Installing a capability a host already has changes nothing: no descriptors are copied, no own property shadows the inherited prototype member, and registered state is kept. That covers a second `.with(loader())` on a host that already has it, and every `.with(…)` on the internal composite (which the CDN global ships) — its reflective contract is unchanged. Configuration is separate: `.with(loader(map))` on an already-composed host still registers the map.

Plugin packages are unaffected and work as they always have — compose the host, then `use` them (`createI18n({…}).with(loader()).with(plugins())`, then `i18n.use(FetchLoader({…}))`). That is the current recipe, not the final one: plugin packages will become directly `.with`-able in a follow-up.

### Measured

`.with` is on the base class, so every graph pays for it exactly once: **+8 B** min+gz on the base host (4909 → 4917) and **+7 B** on the fully composed graph (8397 → 8404), measured when this change landed. Nothing else in core moved.

Nothing is removed. `attachLoader` / `attachPlugins` / `attachDevtools` remain the low-level API the installers delegate to, and every 0.4.x and DX-pass import path still resolves. See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.

> Rewritten in place at the single-entry convergence (same release): the ICU
> compiler is imported from `@comvi/core/icu` (it was never on the root, and the
> root is the base host now), and the no-op claims are stated against
> "a host that already has the capability" rather than against a
> batteries-included root, which no longer exists. See
> `core-single-entry-convergence.md` for that break.
