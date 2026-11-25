# Next and Nuxt: one behaviour contract, two adapters

Status: accepted · Date: 2026-09-17 · Amended 2026-10-04 (the parity contract), 2026-10-09 (an
explicit switch always wins), 2026-11-24 (`never` slugs in `@comvi/next`) · Rewritten for 0.8 on
2026-11-25: both packages now create an instance per request, and the 0.7 server helpers
(`createNextI18n`, `<ComviProvider>`, `setRequestLocale`, `loadMessages`) are gone. That version is in
git history.

## Context

`@comvi/next` and `@comvi/nuxt` answer the same questions: which locale is this request, what does
this URL look like in that locale, what does a server helper hand back. Next's middleware runs once
per request in its own runtime and a Server Component has no request object; Nuxt's route
middleware runs on the server and in the browser, and a Nitro route gets the H3 event. Written
separately, the two packages drifted in answers that no framework forces: `Accept-Language` with
`q=0` was honoured in one and ignored in the other, and the server helpers took the same option
under two names.

## Decision

### The parity contract

Same behaviour under the same settings. The public API converges wherever the framework does not
force a difference, and every remaining difference is named here with the constraint that forces it.
One implementation is not required; one specification is.

**Must match:** key fallback and the order locales are walked; namespace and fallback-chain loading,
on the server and after hydration; detection precedence (the URL, then query, then cookie, then
headers); redirects under the same routing policy; cookie control, and turning persistence off; the
outcome of a server render, a hydration and a locale change; behaviour when a catalog fails to load.

**May differ, each because the framework forces it:** how the integration is installed (a Nuxt
module with codegen, Next imports the app writes); composables against hooks; the Nuxt payload
against props across Next's Server-to-Client boundary; each router's own link component; how the
integration meets the request (an H3 event against Next's request APIs).

**Shared options share names.** An option present in both has the same name, values and default. A
capability present in one only (`pathnames` in Next) is a documented limitation of the other. A name
is not shared when the meaning differs.

### Shared, with one implementation

- **Routing primitives.** `extractLocaleFromPath`, `stripLocalePrefix`, `buildLocalizedPath`,
  `splitPathAndSuffix`, `setQueryParamInSuffix`: segment-based locale matching, trailing-slash
  preservation, the `pathnames` slug lookup.
- **`Accept-Language` matching.** One `resolveAcceptLanguage`, whose rules are written out at the
  function: only the first parameter is read for `q`; an absent or unparseable `q` means most
  preferred; `q=0` and negative `q` are refusals and are dropped rather than ranked last (RFC 9110
  §12.4.2); a stable descending sort by `q`; then per tag, exact match, then base language, then a
  configured locale under that base language, all case-insensitively and in configuration order;
  `*` is not expanded; the configured spelling is what comes back.
- **The routing options schema.** `normalizeRoutingOptions(input, { cookieNameDefault })` decides the
  names, shapes and defaults of `locales`, `defaultLocale`, `localePrefix`, `localeCookie` and
  `localeDetection`; `findUnknownRoutingOptionKeys` makes a misspelt key a named error. Next's
  `createMiddleware` calls it; Nuxt's module calls the vendored copy at build time and writes the
  result into runtime config. The cookie name's default is the only input that differs.
  `localeCookie` is `false`, a name, or `{ name, maxAge, secure, sameSite, domain }`;
  `localeDetection` is `false` or `{ order, queryParam, headerName, resolveAcceptLanguage }`. The URL
  path always comes first, the default order is `query`, `cookie`, `accept-language`.
- **Error messages** open with the name of the package that writes them (`[@comvi/next]`,
  `[@comvi/nuxt]`); a sentence two packages share keeps its words and changes only the prefix.

### Deliberately different, each with the constraint that forces it

- **Server helper names.** `getI18n({ locale, ns })` in Next, `useTranslation(event, { ns, locale })`
  in Nuxt: an async Server Component may not call a `use*` function, and a Nitro util is a `use*`
  composable that takes the event. Both return `{ t, locale, dir, i18n }`, and both take `ns` and
  `locale`.
- **Who creates the request's instance.** Next: `createGetI18n(options)` in the app's server module,
  one instance per request through React `cache()`. Nuxt: the module, from the app's
  `comvi.i18n.ts` options, one per request, destroyed when the request ends. Both are per request
  ([ssr.md](ssr.md)).
- **`<html lang dir>`.** Nuxt writes both when the module option `head` is on (the default). Next
  keeps them in the root layout, which the app owns and the library cannot reach from inside
  `<body>`.
- **Cookie names.** `NEXT_LOCALE` and `i18n_locale`: what an app in each ecosystem already has
  (next-intl and nuxt-i18n). This one is justified by migration, not by a framework.

## Consequences

**One place to fix a matching bug, and three suites that see it.**
`tooling/test-utils/acceptLanguageTable.ts` is the input table, asserted against the shared function
(`packages/locale-routing/tests/accept-language.test.ts`), against Nuxt's `resolveAcceptLanguage` and
against Next's middleware end to end (`tests/accept-language-parity.test.ts` in both packages).

**The routing-policy table** (`tooling/test-utils/routingPolicyContract.ts`: detection precedence,
cookie control, the server helper's `ns` rule) runs against Nuxt's middleware and server helper in
`packages/nuxt/tests/routing-policy-contract.test.ts`. Next's middleware is covered by its own tests
(`middleware.test.ts`, `routing.test.ts`), not by this table.

**Sharing is by source, not by a published package.** `@comvi/locale-routing` is workspace-private:
Next's build inlines the source, and Nuxt commits a vendored copy under `runtime/_vendor/` because
`nuxt-module-build` transpiles `runtime/` file by file and leaves bare specifiers alone.
`packages/nuxt/tests/vendor-parity.test.ts` pins the copy byte for byte to the source
(`pnpm --filter @comvi/nuxt vendor` regenerates it).

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

**Not yet an option.** The difference belongs to a decision neither package lets an app make
today: whether a stored preference may redirect a prefixless URL. When it becomes an option, it gets
one name and one meaning in both packages, with per-framework defaults that keep today's behaviour.

### An explicit locale switch always wins (amended 2026-10-09)

The cookie is the record of the user's explicit choice, and a URL that names no locale — the
default locale's under `as-needed`, every URL under `never` — is resolved from it. A switch to such
a URL was therefore answered with the locale being LEFT: `/de` → `/` bounced back to `/de` in both
packages. Both now end a switch with the user on the locale they chose and the cookie saying so:

| what the user does                              | next                                                   | nuxt                                                       |
| ----------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| switches locale (router / link naming a locale) | lands on that locale's public URL; cookie records it   | the same                                                   |
| first visit, no cookie                          | detection, as before                                   | the same                                                   |
| direct visit to `/`, cookie says `de`           | redirected to `/de`, as before                         | the same                                                   |
| direct visit to `/about`, cookie says `de`      | redirected to `/de/about` (the known difference above) | serves `en`, keeps the cookie (the known difference above) |

**Correction (2026-11-24, `@comvi/next` only).** Under `never` with `pathnames`, a URL that is a
localized slug of exactly one locale (not a slug two locales share, not another page's key) names
that locale, ranked just before `accept-language` in `localeDetection.order`. So "resolved from the
cookie" still holds whenever the cookie is set (default order); a visitor without one gets the slug's locale rather
than a redirect to the default locale's URL, and with `localeDetection: false` the slug decides.
Nuxt has no `pathnames`, so its row is unchanged.

The mechanism differs because the middleware runs in different places. Nuxt's runs in the browser
on every navigation, so it can see the switch itself: a navigation from a locale-prefixed URL to
the same page without one is what `useSwitchLocalePath()` returns for the default locale, and
`<NuxtLinkLocale locale>` writes the cookie on click for every other target. Next's runs on the
server only, behind a client router cache keyed by URL: an unprefixed URL may already be cached as
the redirect an earlier prefetch was answered with, and a cached navigation sends no request at
all. So a next switch navigates to the locale-PREFIXED URL (`/en/about`, which the middleware
canonicalizes to `/about` and records), writes the cookie in the browser as well, and never
prefetches a link to another locale. Writing the cookie alone was tried first and failed in a real
Next 15 app for exactly the cache reason. Pinned by `packages/next/tests/locale-switch.test.tsx` and
`packages/nuxt/tests/locale-switch.test.ts`, both of which run the real middleware.

**The next middleware records a page the browser loads, not a client-router fetch (amended
2026-10-09).** Next 16 re-prefetches the links of the page being left after a navigation. Those
requests carry the new cookie to the old locale's URLs, and a middleware that records the locale of
every request moved the cookie back to the locale just left: observed in a real Next 16.4 build
after a clicked `<Link locale>` to the default locale. The middleware cannot tell a prefetch from a
navigation, because Next removes `Next-Router-Prefetch` from the request it hands to middleware.
What it can see is `Sec-Fetch-Dest`, so the rule is:

| request                                                                  | cookie written by the middleware                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------- |
| a document load (`Sec-Fetch-Dest: document`, or no such header at all)   | yes                                                      |
| a client-router fetch that is redirected away from a locale-prefixed URL | yes: the cookie carries the locale to the unprefixed URL |
| any other client-router fetch, prefetches included                       | no                                                       |

A client-side switch records itself in the browser instead: `useLocalizedRouter().push/replace`
with a locale and a clicked `<Link locale>` write the cookie, and without a `routing` prop they
write the default one (`NEXT_LOCALE`, default attributes). **Known consequence:** a client
navigation through a plain `next/link` or Next's own router to another locale's prefixed URL
bypasses the library, so it is recorded at the next document load of that locale, not at the click.

The same cache keeps the URL that was asked for when it answers a repeated switch, so the address
bar read `/en/about` over the right page. The routing provider replaces a prefix the mode does not
want with the public URL, which is the middleware's own redirect applied in the browser.

Verified in real builds on Next 15.5 and 16.4: three round trips through the router and through
`<Link locale>` end on the public URL with the cookie on the chosen locale, and a later visit to `/`
stays there. Pinned by `packages/next/tests/middleware-records-loads.test.ts`,
`locale-switch.test.tsx` and `canonical-url.test.tsx`.

## Alternatives rejected

- **A published shared package.** It would have to be versioned and supported for a surface no user
  should import. Workspace-private plus inlining gives one implementation with nothing to keep
  compatible.
- **Nuxt importing `@comvi/locale-routing` from `runtime/`.** The bare specifier would ship as is and
  fail to resolve in the app. The vendored copy is the inlining.
- **Leaving two `Accept-Language` matchers because they agreed.** They agreed on the day they were
  measured, not the release before.
- **Unifying the cookie name.** A consistency no user can observe, paid for by every migrating app.
- **Unifying the prefixless-path behaviour by picking one.** Either choice silently changes where
  half the apps redirect; it deserves an option, not a winner.
- **A shared framework-integration abstraction.** A middleware factory and a Nuxt module have
  different inputs, lifetimes and failure modes.
- **Taking one adapter as the reference.** A reference adapter is a second copy of the specification;
  the tables are the reference.

## Where it lives

- the shared primitives, `resolveAcceptLanguage`, `normalizeRoutingOptions`,
  `findUnknownRoutingOptionKeys` — `packages/locale-routing/src/index.ts`
- the vendored copy and its parity gate — `packages/nuxt/src/runtime/_vendor/locale-routing.ts`,
  `packages/nuxt/scripts/vendor-locale-routing.mjs`, `packages/nuxt/tests/vendor-parity.test.ts`
- the shared tables — `tooling/test-utils/acceptLanguageTable.ts`,
  `tooling/test-utils/routingPolicyContract.ts`
- locale resolution — `createMiddleware` in `packages/next/src/middleware/createMiddleware.ts`;
  `packages/nuxt/src/runtime/utils/resolve-locale.ts`, used by the route middleware and the Nitro utils
- the server helpers — `createGetI18n` in `packages/next/src/server/getI18n.ts`; `useTranslation` in
  `packages/nuxt/src/runtime/server/utils/useTranslation.ts`
- the error prefix rule — `tooling/test-utils/errorStems.ts`, asserted by
  `packages/nuxt/tests/error-stems.test.ts` (and by the editor, CLI and Vite plugin suites)
- the known difference, both halves — `packages/next/tests/parity-known-difference.test.ts`,
  `packages/nuxt/tests/parity-known-difference.test.ts`

## Related

[SSR across frameworks](ssr.md) · [`@comvi/next` README](../../packages/next/README.md) ·
[`@comvi/nuxt` README](../../packages/nuxt/README.md)
