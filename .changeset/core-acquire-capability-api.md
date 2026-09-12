---
"@comvi/core": minor
---

`@comvi/core/loader` now exports `acquireLoaderApi(host)` and `@comvi/core/plugins` exports `acquirePluginsApi(host)`: given a host, each returns the component-driveable slice of its capability — the loader's namespace-activation and reload members, the plugin host's `onMissingKey` — or throws `missingCapability(...)` when the capability was never composed on, in development and in production alike. The returned bag is cached per host, so two callers holding the same host get the same function references.

This is the implementation the four framework bindings' `useI18nLoader()` / `useI18nPlugins()` used to carry a copy of each. It sits on the capability subpaths and not on the `@comvi/core` root, so an app that never acquires a capability does not carry the acquisition: `core-base` is unchanged to the byte.
