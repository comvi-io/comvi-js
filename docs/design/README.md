# Design records

Contributor-facing decision records: why the library has the shape it has, and which alternatives
are already settled. **The user guide is the package READMEs and
[comvi.io/docs](https://comvi.io/docs/i18n).** Nothing here is needed to use Comvi i18n.

A record has a `Status` line and five sections: **Context**, **Decision**, **Consequences**,
**Alternatives rejected**, **Where it lives** (files and symbols, never line numbers). `ssr.md` also
carries the snapshot contract; `limitations.md` is a pointer to the public page.

A record states the current decision. A small change adds a dated line under `Status`; when a release
replaces a decision, the record is rewritten for it and its `Status` line says what it replaced, and
the earlier version stays in git history. When the code and a record disagree, one of them has a bug.

The instance is what `createI18n()` returns; everything it has is passed to `createI18n()`.

| Record                                     | The decision it records                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [composition.md](composition.md)           | everything is passed to `createI18n()`; each concern is its own subpath                  |
| [icu.md](icu.md)                           | one message syntax, built into the core: plural, select and selectordinal                |
| [rich-text.md](rich-text.md)               | tags are part of the syntax; markup comes only from handlers and mapped components       |
| [formatting.md](formatting.md)             | formatters are functions of the instance; `useFormat()` follows the locale on screen     |
| [namespaces.md](namespaces.md)             | who loads a namespace, what `isReady` / `isLoading` mean, when `missing_key` is reported |
| [reentrancy.md](reentrancy.md)             | what may call `setLocale()`, and what the instance guarantees when it does               |
| [ssr.md](ssr.md)                           | an instance per request; the browser starts from the server's snapshot                   |
| [catalog-store.md](catalog-store.md)       | one catalog store per server process, and none by default                                |
| [next-nuxt-parity.md](next-nuxt-parity.md) | one behaviour contract run against both adapters; what must match, what may differ       |
| [examples-e2e.md](examples-e2e.md)         | a locale switch shows only whole-language states, judged per delivered DOM batch         |
| [editor-loader.md](editor-loader.md)       | the site's `devtools()` puts the in-context editor on the page; the extension only asks  |
| [typegen.md](typegen.md)                   | one schema, one reader, one emitter, one Node API and one writer for typed translations  |
| [limitations.md](limitations.md)           | a pointer to the public limitations page                                                 |
