---
"@comvi/core": minor
---

Three more capabilities moved out of the bare `@comvi/core/slim` core and into subpaths that compose them back. **`slim` 5,372 → 4,902 B min+gz (−470 B)**; combined with the class-fields change in this same release, **5,563 → 4,902 B (−661 B, −11.9%)**. The root `@comvi/core` entry composes all three back in, so **root behaviour is unchanged** — and the root graph still measures 8,385 B, 134 B below where it started.

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

Development mode warns, naming that hint, the first time a non-string leaf reaches a host that cannot flatten it. Prototype safety is unchanged and now unconditional: the cache always stores a prototype-less copy, so a catalog key can never resolve to an `Object.prototype` member. −156 B.

**Not affected:** `t()` / `tRaw()`, the template cache, the static and single-parameter fast paths, the parser's ICU grammar, and every event. A warm-`t()` micro-benchmark over the shipped bundles reads at or slightly under the previous numbers.
