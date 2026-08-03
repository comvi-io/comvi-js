---
"@comvi/core": minor
---

Three more capabilities moved out of the base core and into subpaths that compose them back. **The base host 5,372 → 4,909 B min+gz (−463 B)**; combined with the class-fields change in this same release, **5,563 → 4,909 B (−654 B, −11.8%)**. Measured at the tier-3 commit, where the 0.4 composed root still composed all three back in, so that root's behaviour was unchanged — and its graph still measured 8,397 B, 122 B below where it started.

**New `@comvi/core/devtools` — browser-extension discovery.** `instanceId`, the `window.__COMVI__` handshake (protocol v2: array → hook → v1 legacy registry → fresh queue) and the identity-based removal on `destroy()` are now a capability, not core. On a base host `instanceId` is `undefined` and no global is touched; opt in with `attachDevtools(i18n, { instanceId, exposeGlobal })`, which takes the two options the 0.4 root read off `createI18n`. −230 B.

```ts
import { createI18n } from "@comvi/core";
import { attachDevtools } from "@comvi/core/devtools";

const i18n = attachDevtools(createI18n({ locale: "en" }));
```

The whole discovery protocol suite now runs against BOTH install surfaces — the internal composite and `attachDevtools` — so the two are pinned identical rather than assumed so.

**Tag-grammar escapes moved into the tag extension.** `&lt;`, `&gt;`, `&amp;` and `\<` exist to write a literal angle bracket inside a message that IS tag syntax, so they now decode exactly where `<` decodes. In a graph with no tag extension — a base host, with or without `/icu` — they stay literal text: `t("a &lt;b&gt;")` returns `"a &lt;b&gt;"`. Any tag extension brings them back: `import "@comvi/core/tags"` for the string API, or `tagInterpolation.extensions` per call, and output is then byte-identical to before this change. −84 B. **ICU apostrophe quoting is deliberately NOT part of this** — `'{literal}'` and `''` are core grammar and keep working on every entry, base host included.

**Nested-catalog flattening moved into the loader capability.** A loader hands back raw JSON, so turning `{ nav: { home } }` into `"nav.home"` is part of loading, not of the core. A base host now stores catalogs as given: pass FLAT, dot-notation catalogs (`{ "nav.home": "Home" }`), optionally keyed `"locale:namespace"`. Nested input keeps working on any host with the loader capability composed on (and on the internal composite the CDN global ships); for a base host there is a new pure export:

```ts
import { flattenCatalog } from "@comvi/core/loader";

i18n.addTranslations({ en: flattenCatalog({ nav: { home: "Home" } }) });
```

Development mode warns, naming that hint, the first time a non-string leaf reaches a host that cannot flatten it. Prototype safety is unchanged: the cache never stores an object that can resolve a catalog key to an `Object.prototype` member. A bare host copies the catalog you pass onto a prototype-less object; a host with the flattener gets one from the flattener itself and stores it directly, so neither pays for the other's guard. −156 B.

**Not affected:** `t()` / `tRaw()`, the template cache, the static and single-parameter fast paths, the parser's ICU grammar, and every event. Measured over the shipped bundles: a warm-`t()` micro-benchmark reads at or slightly under the previous numbers, and `createI18n({ translation })` construction is within 1% of 0.4.0 on both graphs measured at the time (composed root 374 → 370 ns/op on a small catalog, 21.0 → 21.0 µs on a 240-leaf one; the base host is faster than 0.4.0 on every shape).

> Rewritten in place at the single-entry convergence (same release): the separate
> base-host subpath this changeset was written against no longer exists, and
> `@comvi/core`'s root IS that base host — so every specifier above names the
> root, and every "the root has it already" claim reads against the base host.
> The 0.4 composed root survives only as a recipe (`.with(loader())`,
> `.with(plugins())`, `.with(devtools())`, `compiler: icuCompiler` from
> `@comvi/core/icu`, `import "@comvi/core/tags"`); see
> `core-single-entry-convergence.md` for the break and the migration.
