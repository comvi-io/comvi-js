# ICU never enables itself, in any package, and its gaps fail loudly

Status: accepted · Date: 2026-09-14 · Owner decision(s): D1 ICU opt-in, 29.08.2026, reaffirmed
14.09.2026 (`createNextI18n` was the last constructor to default the compiler; that default is gone)
Sources: the neighbour behaviour below was verified by execution on 2026-09-14 under Node 24 —
i18next 26.4.2, i18next-icu 2.4.4, use-intl 4.14.5, @formatjs/intl 4.2.1, intl-messageformat
11.2.15, @lingui/core 6.7.0, @tolgee/core and @tolgee/format-icu 7.2.1, vue-i18n 11.4.10 — and the
build-time halves from each CLI's own source at `main`, fetched the same day.

## Context

`count === 1 ? "item" : "items"` works in English and silently ships broken grammar in Polish,
Ukrainian, Arabic, Welsh and 30+ other locales, which have 3, 4, sometimes 6 distinct plural
categories a binary if/else cannot express.
[ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) is the
standard syntax for them, and it is the syntax Crowdin, Lokalise and Phrase already speak. The 0.4 root compiled it for every app, used or not. Making it opt-in bought the
bytes back but opened the real question: if any one constructor turns ICU on by itself, a catalog
that renders correctly under that host renders literally under every other.

## Decision

- **No constructor in the repo enables ICU.** Not `createI18n`, not `createNextI18n`, and nuxt's
  `comvi.icu` defaults to `false`.
- **One enable form: `compiler: icuCompiler` from `@comvi/core/icu`**, a constructor field held for
  the instance's life, covering every catalog source — inline, `addTranslations`, a loader merge,
  the CDN, the API.
- **The CDN global is the one composed exception**, because a `<script src>` has no tree-shaking and
  therefore no byte choice to offer.
- **`plural`, `selectordinal` and `select`, each with a choice list, are the whole of what the
  compiler implements.** The `number`, `date` and `time` argument types and the plural `offset:`
  form are not implemented and not on the roadmap.
- **Unimplemented syntax fails loudly, never plausibly.** An ICU message (`{count, plural, …}`)
  fails in development at ingestion, before anything renders. Inline, it throws `E_ICU_SYNTAX` at
  the call that carries the catalog; over a loader it fails that namespace's load instead —
  `E_ICU_SYNTAX` reaches `onLoadError`, the namespace stays empty, and `init()` rejects with
  `[i18n] Failed to load all namespaces …`, not with `E_ICU_SYNTAX`, when that was the only
  namespace. In production it renders the message text literally and reports the error through
  `onError` (`console.error` when no handler is set).
- **`E_ICU_SYNTAX` owns exactly two fields**, `code` and `argumentType`. Key, namespace and locale
  arrive through the report context; catalog source stays the app's own telemetry.

## Consequences

Name it once and the whole grammar is live. CLDR categories come from native
[`Intl.PluralRules`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules),
so `few` versus `many` is right without a table of your own:

```json title="src/locales/messages.json"
{
  "en": {
    "messages": "{count, plural, one {# message} other {# messages}}",
    "rank": "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
    "salutation": "{gender, select, female {Welcome, madam} male {Welcome, sir} other {Welcome}}"
  },
  "uk": {
    "messages": "{count, plural, one {# повідомлення} few {# повідомлення} many {# повідомлень} other {# повідомлення}}"
  }
}
```

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import translation from "./locales/messages.json";

const i18n = createI18n({ locale: "uk", compiler: icuCompiler, translation });

i18n.t("messages", { count: 22 }); // "22 повідомлення"  ← the "few" form, NOT the "many" form
i18n.t("messages", { count: 5 }); // "5 повідомлень"     ← the "many" form
```

**The dev-only preflight costs the production bundle 0 B.** Development is EAGER: ingesting a
catalog walks its string leaves, so a bad template throws where it entered, and one that bypasses
ingestion — a per-call `params.fallback` — throws at its first compile. That walk sits behind the
`__DEV__` guard, and a dist test asserts the identifier occurs in no production artifact. Production
is LAZY, fail-soft and cached, so a hot key costs one report, not one per render; both error texts
and the ways out are in [MIGRATION.md §0.2](../../MIGRATION.md).

### What the neighbours do when ICU formatting fails

The production half of that answer — render the message text literally, report it, keep rendering —
is the majority behaviour in this corner of the ecosystem rather than a Comvi invention. i18next does
it both with and without its ICU plugin, a Lingui production build does it because the build strips
the message compiler, FormatJS does it whenever the descriptor carries no `defaultMessage`, and
next-intl does it in production for a missing argument. Two libraries substitute something else
instead: next-intl renders the message KEY for a malformed message, and Tolgee prints the word
`invalid`. One does not degrade at all — vue-i18n 11.4.10 throws out of the `t()` call, in
development and production alike, so the render that asked for the message fails.

The development half is narrower than it looks, so state the axis precisely: no other library here
validates a catalog **at runtime, at catalog load** — every one of them, vue-i18n included, waits
until something calls `t()`. Two catch the same class earlier instead, at build time in their own
CLI: `@lingui/cli` parses every message while compiling a catalog and collects the failures, and
`@formatjs/cli`'s verify step parses each message with `@formatjs/icu-messageformat-parser` and
reports the ones that do not. So the claim is not that Comvi catches what nobody catches; it is
where in the cycle the catch sits, and at what coverage. A throw at `t()` only finds the ICU keys a
developer actually rendered, so a plural on a page nobody opened ships. A throw at ingestion walks
every message in the catalog, including the branches and the tags inside one, so a missing
`compiler` is reported once, at startup, for keys the app has not reached yet — without the separate
build step the other two need.

**A non-numeric plural argument is a different error.** A value that is not a number where `plural`
or `selectordinal` expects one is a render-time problem rather than a syntax one, and it reports
`E_INVALID_PLURAL_PARAM`, naming the parameter and the type it got.

**Apostrophe quoting is core grammar, not ICU:** `'{literal}'` and `''` work on every graph, the
bare base host included.

## Alternatives rejected

- **ICU on by default in the framework packages** — one host quietly compiling a grammar every other
  host refuses is a difference that only surfaces when a catalog moves between them.
- **An `icu()` installer** — composable too late, after `translation` was walked, failing as a
  catalog that renders literally for reasons nothing in the chain shows.
- **Two enable forms keyed on catalog source** (`compiler:` inline, `.use(icu())` remote,
  `E_COMPILER_LOCKED` when mixed) — a rule readers had to learn for no benefit.
- **The `number`, `date` and `time` argument types** — a second format grammar, a currency table and
  a skeleton parser, to do worse what `Intl` does. [Formatting](formatting.md#alternatives-rejected).
- **Rendering unsupported syntax plausibly** — a plausibly wrong plural reads fine in review and
  wrong to a user; a literal `{count, plural, …}` is visibly broken and takes nothing down with it.
- **Catalog source on the error object** — the host does not know it. Only `code` and `argumentType`
  are its own; the rest is `{ source: "compile", key, namespace, locale }`.

## Where it lives

- `icuCompiler` and the `MessageCompiler` type — `packages/core/src/icu.ts`
- the compiler, `E_ICU_SYNTAX`, `E_INVALID_PLURAL_PARAM` — `.../src/core/translate/compile-icu.ts`
- the `compiler` option on `I18nOptions` — `packages/core/src/types.ts`; nuxt's `icu` module option
  — `packages/nuxt/src/module.ts`; the CDN global that always carries ICU — `packages/core/src/umd.ts`

## Related

- [Composition](composition.md) · [Rich text](rich-text.md) · [Formatting](formatting.md) ·
  [Limitations](limitations.md) · [MIGRATION.md §0 (ICU row)](../../MIGRATION.md)
