---
"@comvi/core": minor
---

Core enablers for framework bindings on the base `@comvi/core` host (framework-slim P1). Additive to the public surface at the time it landed; the single-entry convergence in this same release then made that base host the root.

**`WrapperI18nHost<D>`** — the instance surface a framework binding demands of its host: `I18nCoreInstance<D> & I18nCoreExtraApi`, i.e. exactly what `class I18n` declares it implements. A base host satisfies it with no capability composed on, so a wrapper accepts `createI18n({ ... })` from `@comvi/core` or any `attach*` / `.with(…)` composition of it. Exported from the root (it is a type; it costs nothing). A type test pins the alias against the class's own `implements` clause, so a member added outside those two interfaces can never silently widen the host contract.

**`missingCapability(name)` + `hasLoaderApi(host)` / `hasPluginHostApi(host)`** — the shared, loud boundary for absent capabilities, exported from the `@comvi/core` root. The guards are structural and check every public member of `I18nLoaderApi` / `I18nPluginHostApi` (attach is all-or-nothing); they read public names only, never `_`-internals, so they are immune to property mangling. `missingCapability` builds the error a binding throws at a capability-acquisition call — in dev AND in prod, never a silent no-op:

```ts
// dev
[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) from "@comvi/core/loader", or the lower-level attachLoader.
// prod
[comvi] missing loader capability — attach @comvi/core/loader
```

**The root re-exports `subscribeToRevision`, `REVISION_EVENTS` and `isVirtualNode`** (plus the `RevisionEvent` / `RevisionEventSource` types), so a binding that reads reactivity events or sniffs virtual nodes reaches them from the one entry — and, since that entry is side-effect-free, without pulling ambient tag registration into its bundle. Measured: the additions cost **0 B** — `slim` stays at its measured size and the minified byte count of every core and framework size fixture is unchanged.

**`setLocaleAsync`'s race machinery moved to `@comvi/core/loader`.** The changeId staleness arbitration, the mid-flight cancellation and the loading refcount that bracket a locale switch only mean something when a load can be in flight, so they now live in the loader capability, which overrides `setLocaleAsync`. The internal composite inherits the override through `extends` and `attachLoader` installs it on a base host, so **behaviour is identical on both install surfaces**, down to the event order (`loadingStateChanged` → `localeChanged` → `loadingStateChanged`) and both race semantics. `setLocaleAsync` keeps its `Promise`-returning signature everywhere.

The one behavior delta is on a host with NO loader capability: a locale switch now emits `localeChanged` alone, where the in-flight 0.5.0 development tree also emitted a transient `loadingStateChanged` `true` → `false` pair for a load that never happened. Recorded because framework bindings subscribe to those events. Reactivity is unaffected: `localeChanged` is part of `REVISION_EVENTS`. Measured: base host **5728 → 5641 B** min+gz (−87 B), `slim+/icu` −86 B, `slim+/tags` −84 B; the composed loader graph pays +2 B for the seam. A later golf pass in the same release — the dead flat-catalog fast path in `normalizeTranslationObject`, the unfoldable `typeof process` dev-mode probe, a redundant validator loop and a redundant defaults branch — took base host to **5563 B**.

> Rewritten in place at the single-entry convergence (same release): the separate
> base-host subpath this changeset was written against no longer exists, and
> `@comvi/core`'s root IS that base host — so every specifier above names the
> root, and every "the root has it already" claim reads against the base host.
> The 0.4 composed root survives only as a recipe (`.with(loader())`,
> `.with(plugins())`, `.with(devtools())`, `compiler: icuCompiler` from
> `@comvi/core/icu`, `import "@comvi/core/tags"`); see
> `core-single-entry-convergence.md` for the break and the migration.
