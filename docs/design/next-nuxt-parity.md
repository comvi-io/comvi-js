# Next and Nuxt: one behaviour contract, two adapters

Status: accepted · Date: 2026-09-17 · Amended 2026-10-04 · Owner decision(s): "код + доки" — the two
framework modules converge on semantics and keep their adapters, 17.09.2026; the parity contract
(what must match, what may differ, shared options share names), 03.10.2026; `head` on by default
in nuxt, `<html lang>` stays explicit in next, 04.10.2026

## Context

`@comvi/next` and `@comvi/nuxt` answer the same questions — which locale is this request, what does
this URL look like in that locale, what does a server helper hand back — for two hosts that have
almost nothing else in common. Next's middleware runs in an Edge isolate, once per cold start, on a
process-wide host; Nuxt's route middleware and Nitro utils run per request, with a host built for
that request. So the two packages were written separately, and separately they drifted.

The drift was not in the parts a reader would call framework-specific. It was in the answers:
`Accept-Language` was parsed and matched by two copies of the same twenty lines, and `q=0` — a
client refusing a language outright — was honoured in next from its first release and ignored in
nuxt until 0.5. The server helpers took the same namespace under two names (`ns` and `namespace`)
and returned two different shapes. None of that follows from Edge isolates or from Nitro. It follows
from having written the code twice.

The distinction this record first drew was **semantics versus adapter**: what the library decides,
against how a framework is told about it.

**Amended 2026-10-04.** The second drift was the server fallback chain. Next's `getI18n()` loaded
only the default namespace of the request locale and skipped the chain whenever the primary catalog
was cached; nuxt's SSR plugin, `loadTranslations()` and `useTranslation()` each loaded one locale and
never the chain. Both suites were green, and a key present only in a fallback catalog rendered as
the raw key in both packages. "Semantics versus adapter" was right but could not be tested against.
The owner replaced it with the contract below. Neither package is the reference implementation.

## Decision

### The parity contract (amended 2026-10-04)

Same behaviour under the same settings — always. The public API converges too, wherever the
framework itself does not force a difference. Every API difference that remains is named here and
justified by a framework constraint, never by history. One implementation is not required.

**Must match:** key fallback and the order locales are walked; namespace and fallback-chain
loading, on the server and after hydration; detection precedence — URL, then query, then cookie,
then headers; redirects, under the same routing policy; cookie control, and disabling persistence
altogether; the outcome of SSR, hydration and a locale change; behaviour when a catalog fails to
load.

**May differ, each because the framework forces it:** how the i18n instance is created and how long
it lives — Next evaluates modules once per process, Nitro builds per request; a Nuxt module against
a Next provider — Nuxt installs integrations as modules with codegen, Next has no module system and
is wired by imports; composables against hooks — Vue's and React's own reactivity vocabulary; a Nuxt
payload against Next `messages` — Nuxt serialises state through one payload, Next hands props across
the Server-to-Client boundary; framework navigation — each router's own link component and router;
internal caching, as long as requests are isolated; how the integration meets the server request —
an H3 event against a request store, because Next exposes no request object to a Server Component.
An item on this list is an exception that has to be re-justified when the framework changes, not a
licence.

**Shared options share names.** An option present in both has the same name, the same values and
the same default; existing divergences migrate, they are not grandfathered. A capability present in
both means the same thing in both. A capability present in one only — `pathnames` in next — is a
documented limitation of the other, not a difference. The corollary: a name is **not** shared when
the meaning differs, and the record below says so where it applies.

**How it is enforced:** one behaviour specification, one contract test matrix run against both
adapters, two adapters. A row cannot be fixed for one adapter while the other fails.

#### Open for alignment

Differences that exist today and are NOT forced by a framework. They are recorded, not resolved: a
follow-up audit decides each one, and this record changes when it does.

- the server helper names, `getI18n()` in next and `useTranslation(event)` in nuxt — the shape is
  already shared; the `event` argument is forced, the verb is not;
- the hand-off option names, `config` in next and `hostModule` in nuxt — the mechanisms are forced
  apart (instance module against factory), so the rule keeps the names apart today; whether both
  could take one name with one meaning is open;
- what the Next provider and middleware options and the Nuxt module options call the same things
  (cookie and detection options among them, where the names already partly agree on `cookieName`);
- `<html lang dir>` — the module writes it, the layout writes it; the next integration cannot reach
  the root element, but nothing stops a shared helper or a shared option name;
- the cookie names, `NEXT_LOCALE` and `i18n_locale` — justified below by ecosystem habit, which is
  history, not a framework constraint; kept for migration, and listed here so it is not mistaken
  for a forced difference.

### Shared, with one implementation

- **Routing primitives.** `extractLocaleFromPath`, `stripLocalePrefix`, `buildLocalizedPath`,
  `splitPathAndSuffix`, `setQueryParamInSuffix` — segment-based locale matching, trailing-slash
  preservation, the `pathnames` slug lookup.
- **`Accept-Language` matching.** One `resolveAcceptLanguage`, whose rules are written out at the
  function: only the first parameter is read for `q`; an absent or unparseable `q` means most
  preferred; `q=0` and negative `q` are refusals and are DROPPED rather than ranked last (RFC 9110
  §12.4.2); a stable descending sort by `q`; then per tag, exact match, then base language, then a
  configured locale under that base language, all case-insensitively and in configuration order;
  `*` is not expanded; the CONFIGURED spelling is what comes back.
- **Locale semantics.** Which string is "the locale" for a request, and that it is passed explicitly
  into every lookup rather than being set on a host.
- **Server helper vocabulary.** `ns`, the word core's `t(key, { ns })` already uses. Nuxt's 0.4
  `namespace` is a deprecated alias through 0.5 and is removed in 0.6; passing both takes `ns` and
  warns once in dev.
- **Server helper result shape.** `{ t, hasTranslation, locale }` from both `getI18n()` and
  `useTranslation(event)`, with `locale` being the same binding `t` closes over.
- **Server fallback-chain loading** (amended 2026-10-04). Before the server translates, the
  namespace it needs is loaded for the request locale AND for every locale of the `fallbackLocale`
  chain, in the order core's lookup walks it. A primary catalog already in the cache does not skip
  the fallback loads. What the server could read for the render is what reaches the client, so
  hydration renders the same text and fetches nothing. A catalog that fails to load is reported
  through `loadError`, never thrown; the render continues and server and client agree on the raw
  key. Two constants belong to the contract, not to an adapter: a failed pair is attempted once per
  request (next keeps the set in the request store, nuxt on the per-request instance), and
  `onError` fires twice per failed load, because core reports a failing single-pair reload twice and
  offers no quieter load; `SSR_FALLBACK_ON_ERROR_PER_FAILED_LOAD = 2` is the one place to change the
  day core reports once. Shared here is the specification and the table, not the code: next's
  `loadChain` and nuxt's `loadCatalogs` are two implementations of one set of rows.

### Deliberately different, each with the framework constraint that forces it

- **Host lifetime.** Next has one shared host at module scope for the whole process, so the locale
  can never live on it ([next-runtimes.md](next-runtimes.md)); Nuxt builds a host per request and
  tears it down with the request ([ssr.md](ssr.md)). This is the deepest difference and it is the
  framework's, not ours. It is the "creation and lifecycle" row of the contract.
- **Instance hand-off** (amended 2026-10-04). Next: `withComvi({ config })` in `next.config` points
  the library at a module that exports an instance; the server helpers read that export at call
  time, after the `setI18n` cell, and `<ComviProvider>` from `@comvi/next/server` loads the chain and
  hands `locale` and plain `messages` to a library client half that imports the same module. Nuxt:
  `hostModule` names a module whose default export is a factory, called once per constructed
  instance — the client plugin and each server request — and required to return a fresh instance
  every call. Both are allowed: an instance module is what a process-wide instance wants, a factory
  is what a per-request instance wants, and the contract lets lifecycle differ. **The option names
  differ on purpose, today.** `config` and `hostModule` take different things, and the shared-options
  rule forbids one name for two meanings; the names are listed under "Open for alignment".
- **`<html lang dir>`** (amended 2026-10-04). Nuxt writes both attributes itself when the module
  option `head` is on, and it is on by default: the plugin owns the app's head and the route
  middleware owns the locale, so the module can. Next keeps `<html lang={locale}>` explicit in the
  root layout, because the app owns the element that carries the attribute and the library cannot
  reach it from inside `<body>`. The outcome is identical when either quick start is followed; who
  writes it is a documented difference under the "Nuxt module against Next provider" row. They
  become equal the day the next integration owns the root element, which the contract does not ask
  for.
- **Cookie names.** `NEXT_LOCALE` and `i18n_locale`. Both are what an app in that ecosystem already
  has — next-intl writes `NEXT_LOCALE`, nuxt-i18n writes `i18n_locale` — and a shared third name
  would break every app migrating to us for the sake of a consistency no user can see. This is the
  one entry here justified by migration rather than by a framework; see "Open for alignment".
- **Integration.** Next is a set of imports the app writes itself (`createMiddleware`,
  `defineRouting`, `getI18n`, `withComvi`); Nuxt is a module that generates files and auto-imports
  composables. There is no shared shape for "install the framework integration"; what the two
  integrations call their options is a separate, open question.

## Consequences

**One place to fix a matching bug, and three suites that see it.**
`tooling/test-utils/acceptLanguageTable.ts` is the single input table, asserted against the shared
function, against nuxt's `resolveAcceptLanguage`, and against next's middleware end to end. A row
cannot be changed for one framework without the other two going red. That is the guard the `q=0`
divergence did not have.

**One place to fix a fallback bug, and two suites that see it** (amended 2026-10-04).
`tooling/test-utils/ssrFallbackContract.ts` is the second shared table: nine rows of data, from a
cached primary with the fallback absent, through a namespace first needed during the render, to one
catalog failing and two concurrent locales. Each adapter runs every row through a thin fixture of
its own — next through `getI18n()`, `loadTranslations()` and `<I18nProvider messages>` rendered and
hydrated; nuxt through the Nitro utils and the app plugin's SSR pass with its payload — and both
assert that hydration fetches nothing and that `onError` fired exactly
`SSR_FALLBACK_ON_ERROR_PER_FAILED_LOAD` times per `loadError`. Before the table existed, the same
situations were green in two unrelated suites and wrong in both packages.

**Sharing is by source, not by a published package.** locale-routing is workspace-private and
nothing published names it: next's rolldown build inlines the source, and nuxt commits a vendored
copy under `runtime/_vendor/` because `nuxt-module-build` transpiles `runtime/` file by file and
leaves bare specifiers alone — a workspace import there would ship unresolvable.
`packages/nuxt/tests/vendor-parity.test.ts` pins the copy byte-for-byte to the source, so
regenerating (`pnpm --filter @comvi/nuxt vendor`) is never optional. The fallback table is test
data, so it is a workspace-package export instead, like the `Accept-Language` table.

**The behavioural rows were already green when this work started.** By the time both packages had
the `q=0` filter, the two matchers agreed on all 45 rows of the table — so no input changed its
answer when the implementation was unified. Only the structural half of each test (no local parser,
the shared import present) was ever red. This is worth stating plainly: identical behaviour today is
not the same thing as one implementation, and it was identical behaviour that let the duplication
survive a release. The fallback table is the counter-example: both packages were wrong in the same
way, and only a shared specification showed it.

### The one behavioural difference that remains

With `localePrefix: "as-needed"` and `defaultLocale: "en"`, a request for `/about` carrying a
`de` locale cookie:

| package | what happens                                                 |
| ------- | ------------------------------------------------------------ |
| next    | redirects to `/de/about`                                     |
| nuxt    | serves `en` at `/about`, and leaves the `de` cookie in place |

Neither is wrong. They encode two ecosystems' habits. In a next-intl app the stored preference is
authoritative and an unprefixed URL is somewhere to be redirected from, so next resolves the cookie
and then rewrites the URL to match. In a nuxt-i18n app an unprefixed non-root path IS the default
locale's URL — that is what "as-needed" means there — so nuxt treats `/about` as a request for `en`
and, because the user did not ask to change anything, does not overwrite their preference either.
The root path is the case where both agree: `/` implies no locale, so both redirect to `/de`.

Both halves are pinned by a test — `packages/next/tests/parity-known-difference.test.ts` and
`packages/nuxt/tests/parity-known-difference.test.ts` — naming this record, so the paragraph above
cannot go stale without a suite going red.

**Plan: one option, one name, one meaning, after RC.** The difference belongs to a decision neither
package currently lets an app make: whether a stored preference may redirect a prefixless URL. The
plan after 0.5 is a single shared option with the same name and the same meaning in both, defaulting
per framework to what that ecosystem does today, so nothing would break on upgrade. It is out of RC
because changing redirect behaviour during a release candidate is how apps get surprised, and
because the option wants a name chosen once for both rather than twice.

**Amended 2026-10-04.** Under the contract this is the "redirects under the same routing policy" row
with the policy not yet expressible: the two defaults ARE two policies, so the row does not apply
until the option exists. Once it does, the known-difference tests become two configurations of one
shared row, and the shared-options rule carries the per-framework defaults. Reading and writing the
cookie as separate controls, and a no-cookie mode, follow the same path.

## Alternatives rejected

- **A published shared package.** locale-routing would have to be versioned, documented and
  supported for a surface no user should import. Workspace-private plus inlining gives the same one
  implementation with nothing to keep compatible.
- **Nuxt importing `@comvi/locale-routing` directly from `runtime/`.** `nuxt-module-build`
  transpiles file by file with no bundling step, so the bare specifier ships as-is and fails to
  resolve in the consuming app. The committed vendored copy IS the inlining.
- **Leaving the two `Accept-Language` matchers alone because they agreed.** They agreed on the day
  they were measured. They had not agreed for the release before that, and nothing would have told
  us when they stopped.
- **Unifying the cookie name.** A consistency no user can observe, paid for by every app whose
  existing `NEXT_LOCALE` or `i18n_locale` we would strand.
- **Unifying the prefixless-path behaviour now, by picking one.** Either choice silently changes
  where half the users' apps redirect, mid-RC, to settle a question that deserves an option rather
  than a winner.
- **A shared framework-integration abstraction.** A middleware factory and a Nuxt module have
  different inputs, different lifetimes and different failure modes; the common denominator would be
  a layer that hides both without simplifying either.
- **Taking next as the reference and conforming nuxt to it** (amended 2026-10-04). Next had the
  cached-primary bug too. A reference adapter is a second copy of the specification, and the two
  would drift exactly as the two matchers did. The table is the reference.
- **One shared fallback implementation instead of one shared table** (amended 2026-10-04). The
  failed-pair set lives in a request store in next and on the instance in nuxt, and only nuxt has to
  intercept a namespace activated during the render. Same rows, a third lifetime abstraction to
  share the code.
- **One name, `config`, for the instance module and the factory module** (amended 2026-10-04). A
  reader moving between the two would pass an instance where a factory is required, or the reverse.
- **Writing `<html lang>` from next's `<ComviProvider>`** (amended 2026-10-04). It renders inside
  `<body>`; the attribute sits on the element the app's root layout returns. Owning that element
  means owning the layout, the shared-integration abstraction rejected above.

## Where it lives

- the shared primitives and `resolveAcceptLanguage`, with its rules — `packages/locale-routing/src/index.ts`
- the vendored copy and its parity gate — `packages/nuxt/src/runtime/_vendor/locale-routing.ts`,
  `packages/nuxt/scripts/vendor-locale-routing.mjs`, `packages/nuxt/tests/vendor-parity.test.ts`
- the shared tables — `tooling/test-utils/acceptLanguageTable.ts` and
  `tooling/test-utils/ssrFallbackContract.ts`, the latter run by `tests/ssr-fallback-contract.test.*`
  in `packages/next` and `packages/nuxt`
- next's chain load — `loadChain` in `packages/next/src/server/loadTranslations.ts`, called from
  `getI18n.ts`; nuxt's — `loadCatalogs` in `runtime/utils/load-catalogs.ts`, called from
  `runtime/plugin.ts` (which also wraps `addActiveNamespaces` once per instance) and from the two
  Nitro utils under `runtime/server/utils/`
- next's locale resolution — `createMiddleware` in `packages/next/src/middleware/createMiddleware.ts`
- nuxt's locale resolution — `resolveAcceptLanguage` re-export in
  `packages/nuxt/src/runtime/utils/resolve-locale.ts`, used by the route middleware
  (`runtime/middleware/i18n.global.ts`) and the Nitro utils
- the server helper shapes — `ServerI18n` in `packages/next/src/server/types.ts`,
  `UseTranslationResult` in `packages/nuxt/src/runtime/server/utils/useTranslation.ts`
- the instance hand-off, next (landing in 0.5) — `withComvi` in `packages/next/src/plugin.ts`,
  `resolveServerI18n` in `packages/next/src/server/cache.ts`, `<ComviProvider>` in
  `packages/next/src/server/ComviProvider.tsx`; nuxt — `hostModule` and `NuxtHostFactory` in
  `packages/nuxt/src/types.ts`
- `<html lang dir>`, nuxt (landing in 0.5) — the `head` option in `packages/nuxt/src/types.ts`, applied
  from `runtime/plugin.ts` through `runtime/utils/html-attrs.ts`; next — the layout in
  `packages/next/README.md` and the `<ComviProvider>` doc comment
- the known difference, both halves — `packages/next/tests/parity-known-difference.test.ts`,
  `packages/nuxt/tests/parity-known-difference.test.ts`

## Related

- [Next.js runtimes](next-runtimes.md), including its 2026-10-04 amendment on the instance
  hand-off · [SSR across frameworks](ssr.md) · [Composition](composition.md)
- [`@comvi/next` README](../../packages/next/README.md) · [`@comvi/nuxt` README](../../packages/nuxt/README.md)
