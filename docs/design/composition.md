# One entry per package, and `.use(installer)` is the only composition verb

Status: accepted · Date: 2026-09-14 · Owner decision(s): 0.5.0 single-entry convergence and the
one-verb rule; ICU as a constructor option, D1 29.08.2026, reaffirmed 14.09.2026
Amended 2026-10-04: one artifact for `@comvi/react`, `@comvi/solid` and `@comvi/svelte` (no
`development` build); see the last paragraph of Consequences.
Superseded in part 2026-10-27 (0.8 design R3-11, R3-14, R3-15): post-processors
(`registerPostProcessor`) and `devtools({ instanceId })` / `instanceId` / `exposeGlobal` are removed;
discovery is `plugins: [devtools()]` with the protocol-2 handle (`editor-loader.md`). The rest of
this page describes the 0.7 composition and is rewritten for 0.8 in lot 10.

## Context

The 0.4 root carried ICU, the loader, the plugin host, discovery and the tag grammar whether an app
used them or not, and a second entry, `@comvi/core/slim`, made picking a tier the reader's first
decision. The first 0.5 pre-release then shipped two composition verbs — `.with(installer)`, a
synchronous widening pipe, and `.use(plugin)`, a deferred queue — one letter apart, opposite timing.
Three constraints: a capability is in the bundle only because the app asked, the ask is visible at
the call site, one verb.

## Decision

- **One host entry per package.** A capability is an import you add, never an entry you switch to;
  `@comvi/core/slim` is deleted.
- **`.use(installer)` is the only composition verb**, and a pipe and nothing more: `i18n.use(f)`
  **is** `f(i18n)`. No registry, no ordering rules, no capability semantics.
- **An installer is any `(host) => host`**, checked by IDENTITY rather than shape: `.use(f)` throws
  `E_USE_NOT_INSTALLER` unless `f` handed back the object it was given, so the `attach*` functions
  are already installers.
- **A plugin goes to `registerPlugin`, never into `.use`**; an app's own inline plugin reaches the
  queue as `.use(definePlugin(fn))`, attaching the host and queuing one plugin in one call.
- **ICU is the `compiler` constructor option**, and no `.use(…)` composes it: a compiler must be in
  place before the first catalog is ingested, the only moment true of every host.
- **`loader(map)` requires its map; `attachLoader` is the attach-only installer**, so a bare
  `loader()` is a compile error and there is no third form to weigh.
- **`attachPlugins` and `attachDevtools` live on `@comvi/core/plugins` and `@comvi/core/devtools`
  only**, never on a binding root.
- **Compose before `init()`.** A later `.use` warns once per host, in development only.
- **The CDN global is the one composed build**, because a `<script src>` has no tree-shaking and so
  no byte choice to offer. Every constructor, `createNextI18n` included, leaves the compiler open.

## Consequences

A capability member is a compile error on the base host until its subpath is composed in, so one is
never discovered missing in production:

| Capability            | Subpath                                                 | Members                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Async loading         | `@comvi/core/loader` (`attachLoader`)                   | `registerLoader`, `getLoader`, `reloadMessages`, `addActiveNamespace(s)`, `removeActiveNamespace(s)`, `onLoadError`                                                                                    |
| Import-map loading    | `@comvi/core/loader`                                    | `createImportMapLoader`, and `loader(map)` to attach + register in one call                                                                                                                            |
| Plugin host           | `@comvi/core/plugins` (`plugins()`, `definePlugin(fn)`) | `registerPlugin`, `setPluginData`, `getPluginData`                                                                                                                                                     |
| Locale detection      | `@comvi/core/plugins`                                   | `registerLocaleDetector`, `getLanguageDetector`                                                                                                                                                        |
| Missing-key callbacks | `@comvi/core/plugins`                                   | `onMissingKey`                                                                                                                                                                                         |
| Post-processors       | `@comvi/core/plugins`                                   | `registerPostProcessor`                                                                                                                                                                                |
| Devtools discovery    | `@comvi/core/devtools` (`devtools()`)                   | `instanceId`, the `window.__COMVI__` queue protocol, removal on `destroy()`                                                                                                                            |
| ICU plural/select     | `@comvi/core/icu`                                       | `createI18n({ …, compiler: icuCompiler })`                                                                                                                                                             |
| Component-side access | `@comvi/core/loader`, `@comvi/core/plugins`             | `acquireLoaderApi(host)`, `acquirePluginsApi(host)`: the one implementation behind every binding's `useI18nLoader()` / `useI18nPlugins()`; throws the capability error when the host never composed it |
| Rich-text components  | `@comvi/core/rich-text`                                 | `prepareTranslation` / VirtualNode toolbox, plus `registerTagSyntax` for the ambient opt-in                                                                                                            |
| String-API tags       | `@comvi/core/tags`                                      | ambient registration plus the same rich-text toolbox, and `&lt;` / `&gt;` / `&amp;` and the `\<` escape                                                                                                |

**Three placements are not where a reader guesses.** `addActiveNamespace(s)` /
`removeActiveNamespace(s)` and `onLoadError` are on `/loader`, because activating a namespace and
emitting `loadError` only mean anything when something loads — the base host self-activates instead,
as `addMessages` activates the namespaces it carries. Discovery is on `/devtools`, so an app
shipping no extension integration carries no `window` protocol. Nested-catalog flattening is on no
subpath at all: it happens at the one place a catalog enters, composed or not.

**An option whose capability never arrived says so, once, at `init()`, in development only.** `ns`
with no loader names `.use(loader(map))`; `instanceId` or `exposeGlobal: true` with no discovery
names `.use(devtools({ instanceId }))`. At `init()` rather than in the constructor, because both are
legally composed in between. `exposeGlobal: false` is deliberately silent: it asks for the absence a
base host already delivers. The `postProcess` and `onMissingKey` **constructor options** stay
universal; only the runtime registration APIs are the capability's. And **composing twice is a
no-op while configuring twice is not**: `loader(map)` is the one installer that also configures, so
a second `loader(map)` on a composed host still registers its map.

### Installer or plugin: swapping the slots is loud both ways

```ts
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { cdnLoaderPlugin } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).use(attachLoader).use(plugins());
i18n.registerPlugin(
  cdnLoaderPlugin({ cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b" }),
);
```

Swapping the slots is a type error, and both halves are caught at runtime too.
`registerPlugin(cdnLoader(…))` throws `E_INSTALLER_AS_PLUGIN` at `init()`, before any capability is
attached. `.use(cdnLoaderPlugin(…))` throws
`E_USE_NOT_INSTALLER` — and `.use` calls the function before it checks, so an async plugin runs
outside `init()`'s drain loop and hands back a promise nobody awaits. The queue is what gives a
plugin `required`, `timeout`, `onError` and cleanup.

**`@comvi/react`, `@comvi/solid` and `@comvi/svelte` publish one artifact.** Each binding used to
ship a second build behind the `development` export condition (svelte through a `#dev-warn`
package import), and the only thing it carried was the `<T raw>` rename warning plus react's
`ssrInitialLocale` clash warning. 0.5 has no aliases, so both warnings went with the names, and a
development artifact with no development-only code is a byte-identical copy that only costs a build
and an exports-map entry. `@comvi/core`, `@comvi/vue` and `@comvi/next` keep theirs: each carries
real development-only diagnostics (core's readable errors, vue's late-`.use` warning, next's
readable `.use` identity error), and the bundler matrix proves each one reaches a development
bundle and stays out of a production one. A binding gets its development build back the day it
gains a genuine binding-level diagnostic that must not ship to production, together with a
bundler-matrix `*-dev-conditions` case asserting that diagnostic's text.

## Alternatives rejected

- **A full root beside a lean `@comvi/core/slim`** — made a tier the reader's first decision.
  Deleted; it never published.
- **`.with(installer)` beside `.use(plugin)`** — two verbs one letter apart, opposite timing, a coin
  toss at every call site. No alias survives.
- **A shape probe for installers** — a `*Plugin` factory is async, so calling one returns a Promise,
  which IS an object; the plugin would have run at composition time, rejection unhandled.
- **An `icu()` installer, and the two catalog-source-keyed enable forms `E_COMPILER_LOCKED` policed**
  — composable too late, after `messages` was walked, and a rule to learn for no benefit.
- **A bare attach-only `loader()`** — it names the import-map adapter statically, so it pulled
  ~111–124 B min+gz into a graph that registered no map: invisible bytes for a reader to weigh.
- **Installers returning a derived object** — refused, so `.use` can never lie about what an
  instance has.

## Where it lives

- `createI18n`, `class I18n` and `use` — `packages/core/src/index.ts`, `packages/core/src/core/i18n.ts`
- `loader`, `attachLoader`, `createImportMapLoader`, `acquireLoaderApi` — `.../src/loader.ts`;
  `plugins`, `definePlugin`, `attachPlugins`, `acquirePluginsApi` — `.../src/plugins.ts`;
  `devtools`, `attachDevtools` — `packages/core/src/devtools.ts`
- `WrapperI18nInstance` — `packages/core/src/types.ts`; `missingCapability`, `hasLoaderApi`,
  `hasPluginApi` — `packages/core/src/utils/capability.ts`
- `warnLateCompose` and its `warned` WeakSet — `packages/core/src/utils/lateCompose.ts`; the fully
  composed global — `packages/core/src/umd.ts`; `cdnLoader` / `cdnLoaderPlugin` —
  `packages/plugin-fetch-loader/src/cdn/installer.ts` and `.../cdn/loader.ts`

## Related

- [ICU](icu.md) · [Rich text](rich-text.md) · [Formatting](formatting.md) · [SSR](ssr.md) ·
  [Limitations](limitations.md)
