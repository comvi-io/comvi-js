// The 0.8 core on its own: `createI18n` from `@comvi/core`, ICU plural and rich-text tags
// (both always in the base, R3-11), nothing else. The runner asserts from the bundlers'
// module graphs that the `/cdn`, `/plugins`, `/devtools`, `/format` and `/internal`
// subpaths stay out, in development as in production, and that the development condition
// resolves core's development artifact (its dev-only diagnostic text) and production does
// not. No top-level await: the webpack leg emits commonjs2.
import { createI18n } from "@comvi/core";

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

const i18n = createI18n({
  locale: "en",
  messages: {
    en: {
      items: "{count, plural, one {# item} other {# items}}",
      msg: "a <b>c</b> d",
    },
  },
  onError: () => {},
});

assertEqual(i18n.t("items", { count: 1 }), "1 item", "ICU plural selects `one`");
assertEqual(i18n.t("items", { count: 5 }), "5 items", "ICU plural selects `other`");
assertEqual(i18n.t("msg"), "a c d", "a tag without a handler renders its children");
assertEqual(
  i18n.t("msg", { b: (chunks) => ({ bold: chunks }) }),
  ["a ", { bold: ["c"] }, " d"],
  "a tag handler's result is a rich part",
);
assertEqual(Object.keys(i18n).length, 13, "the instance has its 13 members");

console.log("BUNDLER_MATRIX_OK core-default");
