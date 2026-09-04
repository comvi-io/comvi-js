---
"@comvi/core": minor
---

**BREAKING (breaking change on a 0.x minor): `clearTranslations(undefined, ns)` no longer
deactivates the namespace.** Every form of `clearTranslations(locale?, namespace?)` now clears
CONTENT only. Deactivation is the new `removeActiveNamespace(ns)` on the loader capability.

The namespace-scoped clear deactivated because nothing else could: there was no public way to
stop serving a namespace, so the one call had to mean both things. That made the two scopes
disagree — a scopeless clear kept intent, a named one dropped it — and it made "drop this
namespace's catalogs and fetch them again" impossible to express.

| call                               | 0.5.0-rc before                     | now                                 |
| ---------------------------------- | ----------------------------------- | ----------------------------------- |
| `clearTranslations()`              | content of every scope; intent kept | unchanged                           |
| `clearTranslations(locale)`        | content of that locale; intent kept | unchanged                           |
| `clearTranslations(locale, ns)`    | content of that scope; intent kept  | unchanged                           |
| `clearTranslations(undefined, ns)` | content **and** deactivates `ns`    | content only — `ns` stays active    |
| `removeActiveNamespace(ns)`        | did not exist                       | deactivates `ns`, cancels its loads |

Migration: call `removeActiveNamespace(ns)` where you relied on the scoped clear to stop loading
a namespace — add `clearTranslations(undefined, ns)` alongside it if you also want its catalogs
gone.

`removeActiveNamespace(namespace)` and `removeActiveNamespaces(namespaces)` ship on
`@comvi/core/loader` beside `addActiveNamespace(s)`. They drop the namespace from
`getActiveNamespaces()`, so a locale switch never fetches it again and `reloadTranslations()`
fetches only what is still active, and they cancel whatever load is in flight for it so a late
response cannot repopulate the cache.

One exception, worth knowing before you rely on the absolute version: `reloadTranslations()` with
NOTHING active left falls back to the DEFAULT namespace. So if the namespace you removed was the
last active one AND it was the default namespace, a reload brings its content back — while
`getActiveNamespaces()` stays empty. Remove the last active namespace when it is not the default
and the reload fetches the default namespace instead, never the one you removed. A locale switch
has no such fallback and fetches nothing at all.
They are synchronous — nothing is fetched — and they leave the catalogs already in the cache
alone, so the namespace keeps resolving until you clear it. Both emit `configChanged` with the
new `namespaceDeactivated` source, which is what makes a binding reading `getActiveNamespaces()`
re-render.
