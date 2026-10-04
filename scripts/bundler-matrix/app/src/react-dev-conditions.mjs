// The DEV-CONDITIONS case for `@comvi/react`: does a dev-only diagnostic
// actually reach a consumer who defines NOTHING?
//
// `__DEV__` is a build-time define of OUR build, never of the app's, so the
// only thing that can make an `IS_DEV`-guarded warning reachable is the
// package publishing a second artifact behind the `"development"` export
// condition. This app therefore defines no `__DEV__` (neither bundler config
// does), imports `T` so the chunk carrying the `<T raw>` deprecation is in the
// graph either way, and lets the runner assert the warning TEXT: present in
// the development bundle, absent in the production one. Before the
// `development` condition existed, both bundles were silent.
//
// `T` is only REFERENCED, not rendered — rendering needs a DOM. The reference
// is load-bearing all the same: an absence assertion on a module nobody
// imported would pass for the wrong reason, which is why the runner also
// asserts the T chunk is present in the module graph.
import { createI18n, T, useI18n } from "@comvi/react";

function assert(condition, label) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
}

const isComponent = (component) =>
  typeof component === "function" || (typeof component === "object" && component !== null);
assert(typeof createI18n === "function", "@comvi/react exports createI18n");
assert(typeof useI18n === "function", "@comvi/react exports useI18n");
assert(isComponent(T), "@comvi/react exports T");

const i18n = createI18n({
  locale: "en",
  exposeGlobal: false,
  messages: { en: { msg: "hello" } },
});
assert(i18n.t("msg") === "hello", "the host built from the resolved artifact translates");

console.log("BUNDLER_MATRIX_OK react-dev-conditions");
