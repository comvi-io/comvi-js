---
"@comvi/nuxt": minor
---

A `comvi.setup` hook's instance type is read from `comvi.i18n.ts` instead of asserted about it.

`NuxtI18nSetup<I18n & I18nLoaderApi>` was an unverified claim about a different file reached by a
string path: it compiled whether or not `comvi.i18n.ts` ever composed the loader, and a base instance
carries no capability shim, so `core.registerLoader(...)` threw a raw `TypeError` on the first
call. The module now generates `.nuxt/types/comvi-i18n.ts`, which declares the instance as
`ReturnType<typeof import("<your comvi.i18n>").default>` and publishes it through the new
`ComviNuxtInstanceRegistry` interface, so `NuxtI18nSetup` / `NuxtI18nSetupContext` default to the instance
your factory actually returns — write the hook with no type argument at all and the capabilities you
composed are the ones that compile. Naming the instance by hand stays supported for a factory this
package cannot see, and the generated file cross-checks that claim through the new
`CheckedNuxtI18nSetup<Instance, Hook>`, so a hook that asks for a capability the factory never composed
is a build error naming both sides rather than a `TypeError` at request time. With no `comvi.i18n`
file the declaration names core's base `I18n`, which is what that branch really builds.
