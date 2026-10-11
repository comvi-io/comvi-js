// The DEV-CONDITIONS case for `@comvi/vue`: does a dev-only diagnostic
// actually reach a consumer who defines NOTHING?
//
// `__DEV__` is a build-time define of OUR build, never of the app's, so the
// only thing that can make an `IS_DEV`-guarded warning reachable is the
// package publishing a second artifact behind the `"development"` export
// condition. This app therefore defines no `__DEV__` (neither bundler config
// does) and lets the runner assert the late-compose warning's TEXT: present in
// the development bundle, absent in the production one. The warning lives on
// `VueI18n.use`, so building a host is what keeps it in the graph; the runner
// also asserts the root module is present, since an absence assertion on a
// module nobody imported would pass for the wrong reason.
import { createI18n, useI18n } from "@comvi/vue";

function assert(condition, label) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
}

assert(typeof createI18n === "function", "@comvi/vue exports createI18n");
assert(typeof useI18n === "function", "@comvi/vue exports useI18n");

const i18n = createI18n({
  locale: "en",
  exposeGlobal: false,
  messages: { en: { msg: "hello" } },
});
assert(i18n.t("msg") === "hello", "the host built from the resolved artifact translates");

console.log("BUNDLER_MATRIX_OK vue-dev-conditions");
