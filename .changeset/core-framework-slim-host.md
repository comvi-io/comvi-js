---
"@comvi/core": minor
---

Core enablers for framework bindings running on the base `@comvi/core` instance.

- **`WrapperI18nInstance<D>`** — the instance surface a framework binding asks of the instance it is given
  (`I18nCoreInstance<D> & I18nCoreExtraApi`, exactly what `class I18n` implements). A base
  instance satisfies it with nothing composed. It is a type, so it costs nothing.
- **`missingCapability(name)`, `hasLoaderApi(instance)`, `hasPluginApi(instance)`** — the
  shared, loud boundary for an absent capability. The guards are structural and read public
  member names only, so property mangling cannot fool them. `missingCapability` builds the
  error a binding throws at a capability-acquisition call, in development **and** production,
  never a silent no-op: `[@comvi/core] This i18n instance has no loader capability. Compose it:
.use(attachLoader) from "@comvi/core/loader", or loader(map).`
- **`subscribeToRevision`, `REVISION_EVENTS` and `isVirtualNode`** are exported from
  `@comvi/core`, so a binding that reads reactivity events or sniffs virtual nodes reaches
  them without pulling ambient tag registration into its bundle.
- **`setLocale`'s race machinery moved to `@comvi/core/loader`** — staleness
  arbitration, mid-flight cancellation and the loading refcount only mean something when a
  load can be in flight. On any instance with the loader capability, behaviour is identical, down
  to the event order (`loadingStateChanged` → `localeChanged` → `loadingStateChanged`), and
  the signature is unchanged everywhere. The one delta is on an instance with no loader
  capability: a locale switch emits `localeChanged` alone, where it also used to emit a
  transient `loadingStateChanged` pair for a load that never happened.
