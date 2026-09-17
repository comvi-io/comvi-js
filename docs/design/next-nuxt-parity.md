# Next and Nuxt: shared semantics, different adapters

Status: accepted · Date: 2026-09-17 · Owner decision(s): "код + доки" — the two framework modules
converge on semantics and keep their adapters, 17.09.2026

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

The distinction this record draws is therefore not "shared code" versus "duplicated code". It is
**semantics versus adapter**: what the library decides, against how a framework is told about it.

## Decision

**Shared, with one implementation:**

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

**Deliberately different, and staying so:**

- **Host lifetime.** Next has one shared host at module scope for the whole process, so the locale
  can never live on it ([next-runtimes.md](next-runtimes.md)); Nuxt builds a host per request and
  tears it down with the request ([ssr.md](ssr.md)). This is the deepest difference and it is the
  framework's, not ours.
- **Cookie names.** `NEXT_LOCALE` and `i18n_locale`. Both are what an app in that ecosystem already
  has — next-intl writes `NEXT_LOCALE`, nuxt-i18n writes `i18n_locale` — and a shared third name
  would break every app migrating to us for the sake of a consistency no user can see.
- **Integration.** Next is a set of imports the app writes itself (`createMiddleware`,
  `defineRouting`, `getI18n`); Nuxt is a module that generates files and auto-imports composables.
  There is no shared shape for "install the framework integration".

## Consequences

**One place to fix a matching bug, and three suites that see it.**
`tooling/test-utils/acceptLanguageTable.ts` is the single input table, asserted against the shared
function, against nuxt's `resolveAcceptLanguage`, and against next's middleware end to end. A row
cannot be changed for one framework without the other two going red. That is the guard the `q=0`
divergence did not have.

**Sharing is by source, not by a published package.** locale-routing is workspace-private and
nothing published names it: next's rolldown build inlines the source, and nuxt commits a vendored
copy under `runtime/_vendor/` because `nuxt-module-build` transpiles `runtime/` file by file and
leaves bare specifiers alone — a workspace import there would ship unresolvable.
`packages/nuxt/tests/vendor-parity.test.ts` pins the copy byte-for-byte to the source, so
regenerating (`pnpm --filter @comvi/nuxt vendor`) is never optional.

**The behavioural rows were already green when this work started.** By the time both packages had
the `q=0` filter, the two matchers agreed on all 45 rows of the table — so no input changed its
answer when the implementation was unified. Only the structural half of each test (no local parser,
the shared import present) was ever red. This is worth stating plainly: identical behaviour today is
not the same thing as one implementation, and it was identical behaviour that let the duplication
survive a release.

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
package currently lets an app make: whether a stored preference may redirect a prefixless URL. After
0.5 that becomes a single shared option with the same name and the same meaning in both, defaulting
per framework to what that ecosystem does today, so nothing breaks on upgrade. It is out of RC
because changing redirect behaviour during a release candidate is how apps get surprised, and
because the option wants a name chosen once for both rather than twice.

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

## Where it lives

- the shared primitives and `resolveAcceptLanguage`, with its rules — `packages/locale-routing/src/index.ts`
- the vendored copy and its parity gate — `packages/nuxt/src/runtime/_vendor/locale-routing.ts`,
  `packages/nuxt/scripts/vendor-locale-routing.mjs`, `packages/nuxt/tests/vendor-parity.test.ts`
- the shared input table — `tooling/test-utils/acceptLanguageTable.ts`
- next's locale resolution — `createMiddleware` in `packages/next/src/middleware/createMiddleware.ts`
- nuxt's locale resolution — `resolveAcceptLanguage` re-export in
  `packages/nuxt/src/runtime/utils/resolve-locale.ts`, used by the route middleware
  (`runtime/middleware/i18n.global.ts`) and the Nitro utils
  (`runtime/server/utils/useTranslation.ts`)
- the server helper shapes — `ServerI18n` in `packages/next/src/server/types.ts`,
  `UseTranslationResult` in `packages/nuxt/src/runtime/server/utils/useTranslation.ts`
- the known difference, both halves — `packages/next/tests/parity-known-difference.test.ts`,
  `packages/nuxt/tests/parity-known-difference.test.ts`

## Related

- [Next.js runtimes](next-runtimes.md) · [SSR across frameworks](ssr.md) ·
  [Composition](composition.md)
- [`@comvi/next` README](../../packages/next/README.md) · [`@comvi/nuxt` README](../../packages/nuxt/README.md)
