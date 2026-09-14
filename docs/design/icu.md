# ICU never enables itself, in any package, and its gaps fail loudly

Status: accepted · Date: 2026-09-14 · Owner decision(s): D1 ICU opt-in, 29.08.2026, reaffirmed
14.09.2026 (`createNextI18n` was the last constructor to default the compiler; that default is gone)

## Context

`count === 1 ? "item" : "items"` works in English and silently ships broken grammar in Polish,
Ukrainian, Arabic, Welsh and 30+ other locales, which have 3, 4, sometimes 6 distinct plural
categories a binary if/else cannot express.
[ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) is the
standard syntax for them, and it is the syntax Crowdin, Lokalise, Phrase, and every major TMS
already speak. The 0.4 root compiled it for every app, used or not. Making it opt-in bought the
bytes back but opened the real question: if any one constructor turns ICU on by itself, a catalog
that renders correctly under that host renders literally under every other.

## Decision

- **No constructor in the repo enables ICU.** Not `createI18n`, not `createNextI18n`, and nuxt's
  `comvi.icu` defaults to `false`.
- **One enable form: `compiler: icuCompiler` from `@comvi/core/icu`**, a constructor field held for
  the instance's life, covering every catalog source — inline, `addTranslations`, a loader merge,
  the CDN, the API.
- **The UMD global is the one composed exception**, because a `<script src>` has no tree-shaking and
  therefore no byte choice to offer.
- **`plural`, `selectordinal` and `select`, each with a choice list, are the whole of what the
  compiler implements.** The `number`, `date` and `time` argument types and the plural `offset:`
  form are not implemented and not on the roadmap.
- **Unimplemented syntax fails loudly, never plausibly.** Development throws `E_ICU_SYNTAX` at
  ingestion; production renders the braced segment literally and reports `E_ICU_SYNTAX`.
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
  — `packages/nuxt/src/module.ts`; the global that always carries ICU — `packages/core/src/umd.ts`

## Related

- [Composition](composition.md) · [Rich text](rich-text.md) · [Formatting](formatting.md) ·
  [Limitations](limitations.md) · [MIGRATION.md §0 (ICU row)](../../MIGRATION.md)
