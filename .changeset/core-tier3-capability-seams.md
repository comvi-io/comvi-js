---
"@comvi/core": minor
---

Two more capabilities moved out of the base core into subpaths that compose them back.

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

**Nested-catalog flattening is NOT one of them.** It briefly moved into the loader
capability in 0.5.0 development, and it moved back: every host flattens a nested catalog
itself, unconditionally, at the one place a catalog enters. `{ nav: { home } }` and
`{ "nav.home": … }` are the same catalog in the constructor, in `addMessages()` and in a
loader result:

```ts
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });
i18n.addMessages({ en: { nav: { home: "Home" } } }); // -> "nav.home"
```

A non-string leaf is coerced with `String()` and a `null`/`undefined` leaf is dropped, each
with a development warning, on every host. Prototype safety is unchanged. **Not affected:**
`t()` / `tRaw()`, the template cache, the fast paths, the parser's ICU grammar, and every
event.
