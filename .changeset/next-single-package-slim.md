---
"@comvi/next": minor
---

**Added: the capability toolkit on both `@comvi/next/client` and `@comvi/next/server`.** A
next app no longer names `@comvi/core` to build a host on either side of the boundary.

| export                                     | on   | what it is                                                   |
| ------------------------------------------ | ---- | ------------------------------------------------------------ |
| `createI18n`                               | both | core's base host constructor, the same binding on each entry |
| `icu`, `icuCompiler`                       | both | the installer and the compiler                               |
| `loader`, `attachLoader`, `flattenCatalog` | both | from core's pure `/loader` subpath                           |
| `plugins`, `attachPlugins`                 | both | from core's pure `/plugins` subpath                          |
| `devtools`, `attachDevtools`               | both | from core's pure `/devtools` subpath                         |

`CompilerLockedError` and `DevtoolsOptions` come with them as types. The server entry
carries the toolkit because `NextServerHost = WrapperI18nHost & I18nLoaderApi` makes the
loader **mandatory** for SSR — the one host an app cannot avoid composing should not take a
second package to compose.

One constructor name on two entries: the client/server split is a RUNTIME split — which
helpers are reachable — never a host-tier split. The semantics of that name changed in this
release; `next-single-entry-convergence.md` leads with the break and carries the migration
table.

`@comvi/next/server` exports **no** composed constructor and no tag entry, because a server
graph reaching for the 0.4 composed recipe would pull in ICU and core's ambient
tag-registration chunk. The published composed host stays exactly where it was —
`createNextI18n` from `@comvi/next`.

The re-exports cost nothing: they are **named** re-exports of core's own bindings, from
core's pure subpaths only — never `export *`, and never through `@comvi/react` — so the
capability entries an app never calls stay out of its graph. `@comvi/core/tags` is
deliberately not among them.
