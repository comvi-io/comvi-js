// Ambient channel through the /tags entry (plan §1.3 / amendment 1),
// retargeted to the FULL-COMPOSITE recipe by the single-entry convergence: the
// root is the base host now, so ambient tags and ICU are explicit imports.
//
// `@comvi/core/tags` registers tag syntax as a module top-level side effect that
// lives in dist/chunks/comvi-core-register-tags(.dev).js — the only files in
// core's `sideEffects` array. If a bundler mis-matches that array and strips
// the registration chunk, string-API t() renders the tags literally and this
// fixture fails.
import "@comvi/core/tags";
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

const i18n = createI18n({
  locale: "en",
  compiler: icuCompiler,
  translation: {
    en: {
      msg: "Click <link>here</link> now",
      files: "{count, plural, one {<b>#</b> file} other {<b>#</b> files}}",
    },
  },
});

assertEqual(
  i18n.t("msg", { link: ({ children }) => `[${children}]` }),
  "Click [here] now",
  "ambient tag rendering (registration side effect survived bundling)",
);

assertEqual(
  i18n.t("files", { count: 2, b: ({ children }) => `*${children}*` }),
  "*2* files",
  "tags compose with ICU plurals in the composed recipe",
);

console.log("BUNDLER_MATRIX_OK ambient");
