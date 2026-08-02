// framework-slim gate (plan P5 step 2): a Next.js SERVER app that imports ONLY
// `createNextI18nFromHost` (+ the root-free server helpers) from
// `@comvi/next/server`, on a composed `@comvi/core/slim` + `attachLoader` host.
//
// The runner asserts, from the bundler's own module graph, that neither core's
// root entry nor its tag-registration chunks survive. `getI18n` is deliberately
// NOT imported: it reaches `next/headers` through `getLocale`, so its absence
// from this graph is also proved by the fact that this bundle builds and runs
// with `next` not installed at all.
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { createNextI18nFromHost, loadTranslations, setRequestLocale } from "@comvi/next/server";

function assert(condition, label) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

assert(typeof createNextI18nFromHost === "function", "@comvi/next/server exports the companion");
assert(typeof loadTranslations === "function", "@comvi/next/server exports loadTranslations");
assert(typeof setRequestLocale === "function", "@comvi/next/server exports setRequestLocale");

let hostCalls = 0;
const result = createNextI18nFromHost(
  () => {
    hostCalls += 1;
    return attachLoader(
      createI18n({
        locale: "en",
        exposeGlobal: false,
        translation: { en: { msg: "a <b>c</b> d" } },
      }),
    );
  },
  { locales: ["en", "de"], defaultLocale: "en" },
);

assertEqual(hostCalls, 0, "host factory is not called while assembling the result");
assertEqual(result.routing.localeCookie, "NEXT_LOCALE", "routing defaults are applied");

const i18n = result.i18n;
assertEqual(hostCalls, 1, "first result.i18n access resolves the host exactly once");
assert(result.i18n === i18n, "the resolved host is memoized");
assertEqual(hostCalls, 1, "later accesses reuse the memoized host");

assert(typeof i18n.reloadTranslations === "function", "the composed host carries the loader API");
assert(typeof i18n.use === "undefined", "slim + attachLoader has no plugin-host capability");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without a /tags import",
);

console.log("BUNDLER_MATRIX_OK next-server-on-slim");
