// The DEV-CONDITIONS case for `@comvi/svelte`: does a dev-only diagnostic
// actually reach a consumer who defines NOTHING? See
// `react-dev-conditions.mjs` for the full argument.
//
// Svelte reaches it a DIFFERENT way, and this fixture is what proves the
// difference works. `svelte-package` substitutes no defines and copies
// `T.svelte` to `dist/` as source, so there is no second artifact to put
// behind the package's `"development"` export condition — and `dist/T.svelte`
// is reached RELATIVELY from `dist/index.js`, so a root condition could not
// switch it anyway. The warning therefore lives in `#dev-warn`, a PACKAGE
// IMPORTS entry whose `development` branch is the real implementation and
// whose `default` branch is a no-op that does not contain the text at all.
//
// VITE LEG ONLY (`bundlers: ["vite"]` in the runner): importing `T` pulls
// `dist/T.svelte`, and the webpack leg deliberately has no svelte loader —
// every other svelte case depends on webpack pruning that re-export WITHOUT
// resolving it. Vite runs the standard consumer svelte plugin, so the
// `.svelte` file is compiled here exactly as in a real app.
//
// `T` is only REFERENCED, not rendered — rendering needs a DOM. The reference
// is load-bearing all the same: an absence assertion on a module nobody
// imported would pass for the wrong reason, which is why the runner also
// asserts `dist/T.svelte` is present in the module graph.
import { createI18n, T, useI18n } from "@comvi/svelte";

function assert(condition, label) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
}

const isComponent = (component) =>
  typeof component === "function" || (typeof component === "object" && component !== null);
assert(typeof createI18n === "function", "@comvi/svelte exports createI18n");
assert(typeof useI18n === "function", "@comvi/svelte exports useI18n");
assert(isComponent(T), "@comvi/svelte exports T");

const i18n = createI18n({
  locale: "en",
  exposeGlobal: false,
  messages: { en: { msg: "hello" } },
});
assert(i18n.t("msg") === "hello", "the host built from the resolved artifact translates");

console.log("BUNDLER_MATRIX_OK svelte-dev-conditions");
