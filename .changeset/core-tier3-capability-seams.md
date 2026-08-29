---
"@comvi/core": minor
---

Three more capabilities moved out of the base core into subpaths that compose them back.

**`@comvi/core/devtools` — browser-extension discovery.** `instanceId`, the
`window.__COMVI__` handshake and the identity-based removal on `destroy()` are a capability
now, not core. On a base host `instanceId` is `undefined` and no global is touched; opt in
with `attachDevtools(i18n, { instanceId, exposeGlobal })`, which takes the two options the
0.4 root read off `createI18n`.

**Tag-grammar escapes moved into the tag extension.** `&lt;`, `&gt;`, `&amp;` and `\<` exist
to write a literal angle bracket inside a message that IS tag syntax, so they decode exactly
where `<` decodes. With no tag extension they stay literal: `t("a &lt;b&gt;")` returns
`"a &lt;b&gt;"`. Any tag extension brings them back and the output is then byte-identical to
before. **ICU apostrophe quoting is deliberately NOT part of this** — `'{literal}'` and `''`
are core grammar and keep working everywhere.

**Nested-catalog flattening moved into the loader capability**, because a loader is what
hands back raw JSON. A base host stores catalogs as given, so pass flat dot-notation
catalogs, optionally keyed `"locale:namespace"` — or use the pure export:

```ts
import { flattenCatalog } from "@comvi/core/loader";

i18n.addTranslations({ en: flattenCatalog({ nav: { home: "Home" } }) });
```

Development warns, naming that hint, the first time a non-string leaf reaches a host that
cannot flatten it. Prototype safety is unchanged. **Not affected:** `t()` / `tRaw()`, the
template cache, the fast paths, the parser's ICU grammar, and every event.
