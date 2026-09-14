---
"@comvi/cli": patch
"@comvi/next": patch
"@comvi/nuxt": patch
"@comvi/vite-plugin": patch
---

The two packages 0.5 extracted so that shared code has one copy — locale routing (next, nuxt) and the declaration emitter (cli, vite-plugin) — stay internal to the repository instead of being published. Each of these four packages now carries the shared implementation inside its own build, so **none of them gained a runtime dependency**: next bundles the routing primitives, nuxt ships them vendored into its runtime, and cli and vite-plugin bundle the emitter along with its declarations, so their published `.d.ts` still declare `SchemaParam`, `KeySchema` and `ProjectSchema` themselves. Nothing about the four packages' APIs changes and nothing extra is installed; the release train is 12 packages on one version.
