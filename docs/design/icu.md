# One message syntax, built into the core: plural, select and selectordinal

Status: accepted · Date: 2026-11-25 · Rewritten for 0.8. The 0.5–0.7 record ("ICU never enables
itself", `compiler: icuCompiler` from `@comvi/core/icu`) described an opt-in compiler that 0.8
removed; that version is in git history.

## Context

`count === 1 ? "item" : "items"` is wrong in Ukrainian, Polish, Arabic and many other locales,
which have three to six plural categories. ICU MessageFormat is the syntax translation platforms
already speak. Up to 0.7 the compiler was opt-in, so the same catalog rendered correctly under one
instance and literally under another, depending on a constructor option.

## Decision

- **One syntax, always on.** Every message is parsed by the core's own compiler: `{name}`,
  `{n, plural, …}` (with `offset:`, `=N` selectors and `#`), `{n, selectordinal, …}`,
  `{x, select, …}`, apostrophe quoting (`'{literal}'`, `''`) and tags (`<b>…</b>`, see
  [rich-text.md](rich-text.md)). There is no compiler option and no subpath to import.
- **Plural categories come from `Intl.PluralRules`** for the locale being rendered.
- **No formatting arguments.** `{x, number}`, `{x, date}` and `{x, time}` are not part of the
  syntax; values are formatted in code ([formatting.md](formatting.md)).
- **A broken message renders its key and reports.** A syntax error, an unsupported argument type
  and a message nested deeper than 200 levels each render the key and report `syntax` through
  `onError`, in development and in production. Development adds a message that says what is wrong.
  Nothing throws out of `t()`.
- **A plural argument that is not a number** is a `missing_param` report; development names the
  value it got.

```ts title="src/plural.ts"
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "uk",
  messages: {
    uk: {
      messages:
        "{count, plural, one {# повідомлення} few {# повідомлення} many {# повідомлень} other {# повідомлення}}",
    },
  },
});

i18n.t("messages", { count: 22 }); // "22 повідомлення", the "few" form
i18n.t("messages", { count: 5 }); // "5 повідомлень", the "many" form
```

## Consequences

- A catalog renders the same under every instance and in every package.
- A typo in a message shows the key on screen and one `syntax` report, rather than a plausible
  wrong sentence.

## Alternatives rejected

- **An opt-in compiler (0.5–0.7).** It made a catalog's meaning depend on the instance that read
  it.
- **The `number`, `date` and `time` argument types.** A second grammar, an option table and a
  skeleton parser, for what `Intl` does in code.
- **Rendering broken syntax literally.** The key is shorter, obviously wrong, and is what `missing`
  renders for every other unavailable text.

## Where it lives

`packages/core/src/compile/icu.ts` (plural, select, selectordinal), `packages/core/src/compile/scanner.ts`
(the message scanner, tags, the depth limit), `packages/core/src/compile/cache.ts`, `packages/core/src/errors.ts`
(`I18nErrorCode`).
