# ICU MessageFormat: what is implemented, and why the gaps fail loudly

Design note. The package READMEs show the one line that turns ICU on. This file is the reasoning and
the full grammar reference behind it.

The host is the object `createI18n` returns: it holds the catalog, the current locale and `t()`.

## Why ICU at all

`count === 1 ? "item" : "items"` works in English. It silently ships broken grammar in Polish,
Ukrainian, Arabic, Welsh, and 30+ other locales, which have 3, 4, sometimes 6 distinct plural
categories that a binary if/else cannot express.
[ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) is the
standard syntax for handling them, and it is the syntax Crowdin, Lokalise, Phrase, and every major
TMS already speak. Comvi i18n parses it via native
[`Intl.PluralRules`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules),
so every CLDR plural category is correct by default.

## One option, every catalog source

ICU is an opt-in compiler rather than a default. Name it once in the constructor options, with
`compiler: icuCompiler` from `@comvi/core/icu`, and the whole grammar below is live for every
catalog source: inline, a loader, the CDN, the API.

**No constructor in the repo enables it for you** — `createNextI18n` included, and nuxt's
`comvi.icu` defaults to `false`. The one exception is the CDN global, which is fully composed
because a `<script src>` has no tree-shaking and therefore no byte choice to offer. See
[why it is a constructor option and not an installer](composition.md#why-icu-is-a-constructor-option-and-not-an-installer).

### What the neighbours do when ICU formatting fails

The production half of that answer — render the message text literally, report it, keep rendering —
is the majority behaviour in this corner of the ecosystem rather than a Comvi invention. i18next does
it both with and without its ICU plugin, a Lingui production build does it because the build strips
the message compiler, FormatJS does it whenever the descriptor carries no `defaultMessage`, and
next-intl does it in production for a missing argument. Two libraries substitute something else
instead: next-intl renders the message KEY for a malformed message, and Tolgee prints the word
`invalid`. One does not degrade at all — vue-i18n throws out of the `t()` call, in development and
production alike, so the render that asked for the message fails.

The development half is where Comvi is genuinely alone: it throws when the CATALOG IS LOADED, and
every other library here — vue-i18n included — waits until something calls `t()`. The reason is
coverage, not strictness. A throw at the call site only finds the ICU keys a developer actually
rendered, so a plural on a page nobody opened ships. A throw at ingestion walks every message in the
catalog, including the branches and the tags inside one, so the missing `compiler` is reported once,
at startup, for keys the app has not reached yet.

## Plurals across languages

```json title="src/locales/messages.json"
{
  "en": { "messages": "{count, plural, one {# message} other {# messages}}" },
  "uk": {
    "messages": "{count, plural, one {# повідомлення} few {# повідомлення} many {# повідомлень} other {# повідомлення}}"
  },
  "ar": {
    "messages": "{count, plural, zero {لا توجد رسائل} one {رسالة واحدة} two {رسالتان} few {# رسائل} many {# رسالة} other {# رسالة}}"
  }
}
```

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import translation from "./locales/messages.json";

const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation });

i18n.t("messages", { count: 0 }); // ar: "لا توجد رسائل"      (zero form)
i18n.t("messages", { count: 1 }); // en: "1 message"            uk: "1 повідомлення"
i18n.t("messages", { count: 5 }); // en: "5 messages"           uk: "5 повідомлень"          ar: "5 رسائل"
i18n.t("messages", { count: 22 }); // uk: "22 повідомлення"  ← the "few" form, NOT the "many" form
```

A naive English-style `count === 1 ? singular : plural` picks one Ukrainian form and ships it for
every count, which is grammatically wrong for half your traffic.

## Ordinals (1st, 2nd, 3rd…)

```json title="src/locales/rank.json"
{ "rank": "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}" }
```

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import en from "./locales/rank.json";

const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation: { en } });

i18n.t("rank", { place: 1 }); // "1st"
i18n.t("rank", { place: 22 }); // "22nd"
i18n.t("rank", { place: 113 }); // "113th"
```

## Select (gender, role, status)

```json title="src/locales/salutation.json"
{ "salutation": "{gender, select, female {Welcome, madam} male {Welcome, sir} other {Welcome}}" }
```

```ts
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import en from "./locales/salutation.json";

const i18n = createI18n({ locale: "en", compiler: icuCompiler, translation: { en } });

i18n.t("salutation", { gender: "female" }); // "Welcome, madam"
i18n.t("salutation", { gender: "male" }); // "Welcome, sir"
i18n.t("salutation", { gender: "other" }); // "Welcome"
```

## Unsupported argument types

Those three argument types are the whole of what the compiler implements
(`packages/core/src/core/translate/compile-icu.ts`). The `number`, `date` and `time` argument types
are not supported and are not on the roadmap, and neither is the plural `offset:` form. Each one
fails with `E_ICU_SYNTAX` instead of rendering something wrong: format the value in code and pass it
as a plain `{param}`, or quote the braces (`'{'…'}'`) to keep the text literal; for the plural
`offset:` form, drop `offset:` and write the branches out.

A malformed choice list for a type that IS implemented gets its own message naming the list, so
"unsupported type" and "you forgot `other {…}`" never read as the same problem.

## ICU syntax on the default compiler is never silent

`{count, plural, …}` on the default compiler is never rendered as a plural, and never rendered
plausibly-wrong. Development throws `E_ICU_SYNTAX` at ingestion. Production renders the braced
segment **literally** and reports `E_ICU_SYNTAX` for it. A plural that silently renders as something
plausible reads fine in review and wrong to a user. A literal `{count, plural, …}` on the page is
visibly broken and takes nothing down with it.

The error has only two own fields: a stable `code` and an `argumentType` (`"plural"`, `"select"`,
`"selectordinal"`, or the parsed token such as `"number"` / `"date"` / `"other"`, for which the
message explicitly does NOT claim shipped ICU support). Catalog source stays
**application-supplied telemetry**: add it at your own boundary. What the host itself knows goes
into the report context: `{ source: "compile", key, namespace, locale }`.

### Fail-loud in development, fail-soft in production

Development is EAGER: ingesting a catalog walks its string leaves, so a bad template throws where it
entered, before a single render. The throw always lands where the template is COMPILED, so a
template that never passes through ingestion, such as a per-call `params.fallback`, throws at its
first compile instead.

Production is LAZY: on the compilation that hits ICU syntax the segment renders literally and
`E_ICU_SYNTAX` is reported through `onError`, or through `console.error` when no handler is
configured. That report is best-effort, per process, and never fires on cached renders (the parsed
template IS cached, so a hot key costs one report, not one per render).

The dev walk costs the production bundle **0 B**: it sits behind the `__DEV__` guard, and a dist
test asserts the identifier occurs in no production artifact.

### A non-numeric plural argument is a different error

Passing a value that is not a number where a `plural` or `selectordinal` argument expects one is a
render-time problem rather than a syntax one, and it reports `E_INVALID_PLURAL_PARAM`
(`packages/core/src/core/translate/compile-icu.ts`) naming the parameter and the type it got.

## Apostrophe quoting is core grammar, not ICU

`'{literal}'` and `''` work on every graph, the bare base host included. They are not part of the
ICU compiler and do not need it.

## Related

- [Composition](composition.md) · [Rich text](rich-text.md) · [Formatting](formatting.md) ·
  [Limitations](limitations.md)
- [MIGRATION.md §0 (ICU row)](../../MIGRATION.md)
