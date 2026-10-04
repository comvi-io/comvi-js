// A Next.js SERVER app on a composed BASE + `attachLoader` host, built from a
// SINGLE package: every specifier is `@comvi/next/server`, the capability
// toolkit included, because `NextServerHost = WrapperI18nHost & I18nLoaderApi`
// makes the loader mandatory for SSR.
//
// The runner asserts, from the bundler's own module graph, that core's
// tag-registration chunks do not survive, that next's own composed builder
// (`createNextI18n.js`) never enters, and that the three capability subpaths
// this recipe does NOT use stay out too. Core's base entry IS in the graph:
// `createI18n` is its export.
//
// `getI18n` is deliberately NOT imported: it reaches `next/headers` through
// `getLocale`, so its absence from this graph is also proved by the fact that
// this bundle builds and runs with `next` not installed at all.
import {
  attachLoader,
  createI18n,
  createNextI18nFromHost,
  loadMessages,
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
assert(typeof loadMessages === "function", "@comvi/next/server exports loadMessages");
assert(typeof setRequestLocale === "function", "@comvi/next/server exports setRequestLocale");
assert(typeof createI18n === "function", "@comvi/next/server exports createI18n");
assert(typeof attachLoader === "function", "@comvi/next/server re-exports attachLoader");

let hostCalls = 0;
const result = createNextI18nFromHost(
  () => {
    hostCalls += 1;
    return attachLoader(
      createI18n({
        locale: "en",
        exposeGlobal: false,
        messages: { en: { msg: "a <b>c</b> d" } },
      }),
    );
  },
  { locales: ["en", "de"], defaultLocale: "en" },
);

// Construction is EAGER (N2): `host()` runs exactly once, inside the call, and
// `i18n` is the instance it returned — a plain field, not a resolving getter.
assertEqual(hostCalls, 1, "host factory runs exactly once, inside createNextI18nFromHost");
assertEqual(result.routing.localeCookie, "NEXT_LOCALE", "routing defaults are applied");

const i18n = result.i18n;
assert(result.i18n === i18n, "the host is a plain field");
assertEqual(hostCalls, 1, "later accesses run nothing");

assert(typeof i18n.reloadMessages === "function", "the composed host carries the loader API");
assert(
  typeof i18n.registerPlugin === "undefined",
  "base + attachLoader has no plugin-host capability",
);
assert(typeof i18n.use === "function", "…but the composition verb is on the base host");
assertEqual(
  i18n.t("msg", { b: ({ children }) => `*${children}*` }),
  "a <b>c</b> d",
  "tag markup stays literal without a /tags import",
);

console.log("BUNDLER_MATRIX_OK next-server-on-default");
