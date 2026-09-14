---
"@comvi/core": minor
---

**`loader(importMap)` now REQUIRES the import map, so `attachLoader` is the one attach-only
loader installer.** One capability had three installers and a decision rule keyed on bundle
bytes the reader could not see: `loader` names the import-map adapter statically, so a bare
`loader()` was attach-only and still pulled ~111–124 B min+gz of adapter into the graph, and
the docs told you to weigh that against typing `attachLoader`. The rule is now one sentence:

- a static map of import functions → `.use(loader(map))`, which attaches **and** registers it;
- a plain `LoaderFn` → `.use(attachLoader)`, then `i18n.registerLoader(fn)`.

**Breaking for a 0.5 pre-release tree only.** A bare `loader()` is a compile error; nothing
in 0.4 could call it, because neither the installer nor `.use` existed there. A JS caller who
passes nothing gets a named error at the `loader()` call site — both forms in the message in
development, the bare code `E_LOADER_IMPORT_MAP` in production — rather than `undefined`
surfacing inside the import-map adapter on the first load.

The capability-absence error names the new pair: `[comvi] This i18n instance has no loader
capability. Compose it: .use(attachLoader) from "@comvi/core/loader", or loader(map).`

Bundle effect: the import-map adapter is in your graph only when you actually hand over a
map. The five `full-composite` size rows and the two nuxt host rows drop it, because a
composed-everything host that registers no map never needed it.
