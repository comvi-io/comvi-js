// an inline catalog with ICU comma syntax takes the COMPILER in the
// same call. That is the only enable form there is: ICU is a compiler setting,
// so nothing is ever appended to the chain for it and the same option serves a
// catalog that arrives later from a loader.
import { createI18n, icuCompiler } from "@comvi/react";

export const shop = createI18n({
  locale: "en",
  translation: {
    en: {
      "cart.items": "{count, plural, one {# item} other {# items}}",
      "cart.empty": "Your cart is empty",
    },
  },
  compiler: icuCompiler,
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
  compiler: icuCompiler,
});
