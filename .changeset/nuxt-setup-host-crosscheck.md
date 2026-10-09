---
"@comvi/nuxt": minor
---

A `comvi.setup` hook's host type is read from `comvi.host.ts` instead of asserted about it.

`NuxtI18nSetup<I18n & I18nLoaderApi>` was an unverified claim about a different file reached by a
string path: it compiled whether or not `comvi.host.ts` ever composed the loader, and a base host
carries no capability shim, so `core.registerLoader(...)` threw a raw `TypeError` on the first
call. The module now generates `.nuxt/types/comvi-host.ts`, which declares the host as
`ReturnType<typeof import("<your comvi.host>").default>` and publishes it through the new
`ComviNuxtInstanceRegistry` interface, so `NuxtI18nSetup` / `NuxtI18nSetupContext` default to the host
your factory actually returns — write the hook with no type argument at all and the capabilities you
composed are the ones that compile. Naming the host by hand stays supported for a factory this
package cannot see, and the generated file cross-checks that claim through the new
`CheckedNuxtI18nSetup<Host, Hook>`, so a hook that asks for a capability the factory never composed
is a build error naming both sides rather than a `TypeError` at request time. With no `comvi.host`
file the declaration names core's base `I18n`, which is what that branch really builds.
