// framework-slim gate (plan P5 step 2, retargeted by the DX pass): a Next.js
// SERVER app on a composed slim + `attachLoader` host, built from a SINGLE
// package. Every specifier here is `@comvi/next/server` — the constructor and
// the capability toolkit included, because `NextServerHost = WrapperI18nHost &
// I18nLoaderApi` makes the loader mandatory for SSR and an app should not have
// to reach past its framework package to satisfy that.
//
// The runner asserts, from the bundler's own module graph, that core's
// tag-registration chunks do not survive, that next's own composed builder
// (`createNextI18n.js`) never enters, and that the three capability subpaths
// this recipe does NOT use stay out too — the re-export hop has to pay for
// itself here exactly as on the client entry. Core's base entry IS in the
// graph: `createSlimI18n` is its `createI18n`, re-exported.
// `getI18n` is deliberately NOT imported: it reaches `next/headers` through
// `getLocale`, so its absence from this graph is also proved by the fact that
// this bundle builds and runs with `next` not installed at all.
import {
  attachLoader,
  createNextI18nFromHost,
  createSlimI18n,
  loadTranslations,
  setRequestLocale,
} from "@comvi/next/server";

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
assert(typeof createSlimI18n === "function", "@comvi/next/server exports createSlimI18n");
assert(typeof attachLoader === "function", "@comvi/next/server re-exports attachLoader");

let hostCalls = 0;
const result = createNextI18nFromHost(
  () => {
    hostCalls += 1;
    return attachLoader(
      createSlimI18n({
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
