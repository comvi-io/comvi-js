// §7.2-4 — an inline catalog with ICU comma syntax takes the COMPILER in the
// same call. `.with(icu())` is NEVER appended to a translation-bearing
// constructor: the host locks its compiler on the first catalog it ingests, so
// a late installer would throw `E_COMPILER_LOCKED` (§2.1b).
import { createI18n } from "@comvi/react";

export const shop = createI18n({
  locale: "en",
  translation: {
    en: {
      "cart.items": "{count, plural, one {# item} other {# items}}",
      "cart.empty": "Your cart is empty",
    },
  },
});

// ICU QUOTING, not ICU syntax: `'{…}'` is literal text to the parser, the
// default compiler renders it, and nothing needs migrating.
export const docs = createI18n({
  locale: "en",
  translation: { en: { hint: "Write '{count, plural, …}' for a plural" } },
});

// `{param}` interpolation IS the default compiler's own syntax.
export const plain = createI18n({
  locale: "en",
  translation: { en: { hello: "Hello {name}" } },
});

// Catalog keys are never compiled as messages.
export const keyOnly = createI18n({
  locale: "en",
  translation: { en: { "{count, plural, one {x} other {y}}": "plain value" } },
});

// Escaped punctuation is runtime punctuation: the codemod decodes static
// literals before looking for ICU comma syntax.
export const escaped = createI18n({
  locale: "en",
  translation: { en: { items: "{count\u002c plural\u002c one {#} other {#}}" } },
});
