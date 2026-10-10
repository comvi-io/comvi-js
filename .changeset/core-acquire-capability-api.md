---
"@comvi/core": minor
---

`@comvi/core/loader` now exports `acquireLoaderApi(instance)` and `@comvi/core/plugins` exports `acquirePluginsApi(instance)`: given an i18n instance, each returns the component-driveable slice of its capability — the loader's namespace-activation and reload members, the plugins capability's `onMissingKey` — or throws `missingCapability(...)` when the capability was never composed on, in development and in production alike. The returned bag is cached per instance, so two callers holding the same instance get the same function references.

This is the implementation the four framework bindings' `useI18nLoader()` / `useI18nPlugins()` used to carry a copy of each. It sits on the capability subpaths and not on the `@comvi/core` root, so an app that never acquires a capability does not carry the acquisition: `core-base` is unchanged to the byte.
