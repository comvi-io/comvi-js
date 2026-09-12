// The DEV-CONDITIONS case for `@comvi/solid`: does a dev-only diagnostic
// actually reach a consumer who defines NOTHING? See
// `react-dev-conditions.mjs` for the full argument — this is the same claim on
// the solid binding, whose one `IS_DEV` diagnostic is the `<T raw>`
// deprecation.
//
// `T` is only REFERENCED, not rendered — rendering needs a DOM. The reference
// is load-bearing all the same: an absence assertion on a module nobody
// imported would pass for the wrong reason, which is why the runner also
// asserts the T chunk is present in the module graph.
import { createI18n, T, useI18n } from "@comvi/solid";

function assert(condition, label) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
}

const isComponent = (component) =>
  typeof component === "function" || (typeof component === "object" && component !== null);
assert(typeof createI18n === "function", "@comvi/solid exports createI18n");
assert(typeof useI18n === "function", "@comvi/solid exports useI18n");
assert(isComponent(T), "@comvi/solid exports T");

const i18n = createI18n({
  locale: "en",
  exposeGlobal: false,
  translation: { en: { msg: "hello" } },
});
assert(i18n.t("msg") === "hello", "the host built from the resolved artifact translates");

console.log("BUNDLER_MATRIX_OK solid-dev-conditions");
