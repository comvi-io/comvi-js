---
"@comvi/core": minor
---

Core enablers for framework bindings on `@comvi/core/slim` (framework-slim P1). Additive to the public surface; the root entry's behavior is unchanged.

**`WrapperI18nHost<D>`** — the instance surface a framework binding demands of its host: `I18nCoreInstance<D> & I18nCoreExtraApi`, i.e. exactly what `class I18n` declares it implements. A bare slim instance satisfies it with no capability attached, so a wrapper can accept `createI18n({ ... })` from `@comvi/core/slim`, from `@comvi/core`, or from any `attach*` composition of the two. Exported from both entries (it is a type; it costs nothing). A type test pins the alias against the class's own `implements` clause, so a member added outside those two interfaces can never silently widen the host contract.

**`missingCapability(name)` + `hasLoaderApi(host)` / `hasPluginHostApi(host)`** — the shared, loud boundary for absent capabilities, exported from `@comvi/core/slim` and `@comvi/core`. The guards are structural and check every public member of `I18nLoaderApi` / `I18nPluginHostApi` (attach is all-or-nothing); they read public names only, never `_`-internals, so they are immune to property mangling. `missingCapability` builds the error a binding throws at a capability-acquisition call — in dev AND in prod, never a silent no-op:

```ts
// dev
[comvi] This i18n instance has no loader capability. Attach it: import { attachLoader } from "@comvi/core/loader" — or use the root "@comvi/core" entry.
// prod
[comvi] missing loader capability — attach @comvi/core/loader
```

**`@comvi/core/slim` additionally re-exports `subscribeToRevision`, `REVISION_EVENTS` and `isVirtualNode`** (plus the `RevisionEvent` / `RevisionEventSource` types). These already existed on the root entry, which is where the framework bindings import them from today — and that single import is enough to keep the root entry, and with it the ambient `register-tags` side effect, in every wrapper's bundle. Reaching them through `/slim` is what lets a binding drop off the root entry entirely. Measured: the additions cost **0 B** — `slim` stays at its measured size and the minified byte count of every core and framework size fixture is unchanged.

**`setLocaleAsync`'s race machinery moved to `@comvi/core/loader`.** The changeId staleness arbitration, the mid-flight cancellation and the loading refcount that bracket a locale switch only mean something when a load can be in flight, so they now live in the loader capability, which overrides `setLocaleAsync`. The root entry inherits the override through `extends` and `attachLoader` installs it on a slim instance, so **root and composed-slim behavior is unchanged**, down to the event order (`loadingStateChanged` → `localeChanged` → `loadingStateChanged`) and both race semantics. `setLocaleAsync` keeps its `Promise`-returning signature everywhere.

The one behavior delta is on a host with NO loader capability: a locale switch now emits `localeChanged` alone, where the in-flight 0.5.0 development tree also emitted a transient `loadingStateChanged` `true` → `false` pair for a load that never happened. `@comvi/core/slim` is new in 0.5.0, so no published API changes — this is recorded because framework bindings subscribe to those events. Reactivity is unaffected: `localeChanged` is part of `REVISION_EVENTS`. Measured: bare slim **5728 → 5641 B** min+gz (−87 B), `slim+/icu` −86 B, `slim+/tags` −84 B; the composed loader graph pays +2 B for the seam. A later golf pass in the same release — the dead flat-catalog fast path in `normalizeTranslationObject`, the unfoldable `typeof process` dev-mode probe, a redundant validator loop and a redundant defaults branch — took bare slim to **5563 B**.
