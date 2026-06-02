---
"@comvi/nuxt": patch
---

Declare `h3` as a direct dependency: the Nitro server utilities import `getCookie`/`getHeader` from `h3` at runtime, and it was previously only transitively available via `@nuxt/kit`. Also register composable auto-imports explicitly and give the module a nameable `NuxtModule` type, so the published `.d.ts` ships stable `#imports` types and a portable default-export type. No public API or runtime-behaviour change.
