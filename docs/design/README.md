# Design records

Contributor-facing decision records: why the library has the shape it has, and which alternatives
are already settled. **The user guide is the package READMEs and [comvi.io/docs](https://comvi.io/docs/i18n/).**
Nothing here is needed to use Comvi i18n.

Each record carries a `Status` line and then five sections: **Context**, **Decision**,
**Consequences**, **Alternatives rejected**, **Where it lives** (symbols, never line numbers).
`limitations.md` and `ssr.md` are the two exceptions — they are user-facing pages, mirrored on the
site, and keep their own structure.

**A record is amended by a new dated line under `Status`, never silently rewritten.** These are the
decisions, not a description of the code; when the code and a record disagree, that is a bug in one
of them and worth saying so.

The vocabulary every record assumes — the host is what `createI18n` returns, and `.use(installer)`
is the one composition verb.

| Record                                     | The decision it records                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------- |
| [composition.md](composition.md)           | one entry per package, `.use(installer)` as the only composition verb           |
| [icu.md](icu.md)                           | ICU never enables itself, and its gaps fail loudly                              |
| [rich-text.md](rich-text.md)               | `<T>` renders structurally; string-API tags are an ambient opt-in               |
| [formatting.md](formatting.md)             | formatters are free functions, and every binding's formatters follow the locale |
| [next-runtimes.md](next-runtimes.md)       | one shared config module per runtime, nothing composed on the Edge              |
| [next-nuxt-parity.md](next-nuxt-parity.md) | one behaviour contract run against both adapters; what must match, what may differ |
| [ssr.md](ssr.md)                           | the four module-scope rules side by side (user-facing)                          |
| [limitations.md](limitations.md)           | everything the library does not do (user-facing)                                |
