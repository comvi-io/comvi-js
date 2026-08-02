---
"@comvi/core": minor
---

Three more capabilities moved out of the bare `@comvi/core/slim` core and into subpaths that compose them back. **`slim` 5,372 → 4,909 B min+gz (−463 B)**; combined with the class-fields change in this same release, **5,563 → 4,909 B (−654 B, −11.8%)**. The root `@comvi/core` entry composes all three back in, so **root behaviour is unchanged** — and the root graph still measures 8,397 B, 122 B below where it started.

**New `@comvi/core/devtools` — browser-extension discovery.** `instanceId`, the `window.__COMVI__` handshake (protocol v2: array → hook → v1 legacy registry → fresh queue) and the identity-based removal on `destroy()` are now a capability, not core. On a bare slim host `instanceId` is `undefined` and no global is touched; opt in with `attachDevtools(i18n, { instanceId, exposeGlobal })`, which takes the two options `createI18n` reads on root. −230 B.

```ts
import { createI18n } from "@comvi/core/slim";
import { attachDevtools } from "@comvi/core/devtools";

const i18n = attachDevtools(createI18n({ locale: "en" }));
```

The whole discovery protocol suite now runs against BOTH install surfaces — root and `attachDevtools` — so the two are pinned identical rather than assumed so.

**Tag-grammar escapes moved into the tag extension.** `&lt;`, `&gt;`, `&amp;` and `\<` exist to write a literal angle bracket inside a message that IS tag syntax, so they now decode exactly where `<` decodes. In a graph with no tag extension — bare slim, or slim + `/icu` — they stay literal text: `t("a &lt;b&gt;")` returns `"a &lt;b&gt;"`. Any tag extension brings them back: `import "@comvi/core/tags"` for the string API, or `tagInterpolation.extensions` per call. The root entry registers tag syntax itself, so root output is byte-identical. −84 B. **ICU apostrophe quoting is deliberately NOT part of this** — `'{literal}'` and `''` are core grammar and keep working on every entry, bare slim included.

**Nested-catalog flattening moved into the loader capability.** A loader hands back raw JSON, so turning `{ nav: { home } }` into `"nav.home"` is part of loading, not of the core. A bare slim host now stores catalogs as given: pass FLAT, dot-notation catalogs (`{ "nav.home": "Home" }`), optionally keyed `"locale:namespace"`. Nested input keeps working unchanged on the root entry and on any host with `attachLoader`; for a bare host there is a new pure export:

```ts
import { flattenCatalog } from "@comvi/core/loader";

i18n.addTranslations({ en: flattenCatalog({ nav: { home: "Home" } }) });
```

Development mode warns, naming that hint, the first time a non-string leaf reaches a host that cannot flatten it. Prototype safety is unchanged: the cache never stores an object that can resolve a catalog key to an `Object.prototype` member. A bare host copies the catalog you pass onto a prototype-less object; a host with the flattener gets one from the flattener itself and stores it directly, so neither pays for the other's guard. −156 B.

**Not affected:** `t()` / `tRaw()`, the template cache, the static and single-parameter fast paths, the parser's ICU grammar, and every event. Measured over the shipped bundles: a warm-`t()` micro-benchmark reads at or slightly under the previous numbers, and `createI18n({ translation })` construction is within 1% of 0.4.0 on both entries (root 374 → 370 ns/op on a small catalog, 21.0 → 21.0 µs on a 240-leaf one; slim is faster than 0.4.0 on every shape).
