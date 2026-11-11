// The Next.js SERVER recipe of 0.8, resolved under `react-server` (what turns the entry's own
// `import "server-only"` into an empty module): `createGetI18n` from `@comvi/next/server`, and
// the payload from `handover()` of `@comvi/core/ssr`. The explicit locale reads no request API,
// so the bundle runs outside Next. The runner asserts that next's client half and the core
// subpaths the app does not name stay out of the graph.
import { createGetI18n } from "@comvi/next/server";
import { handover } from "@comvi/core/ssr";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

const getI18n = createGetI18n({
  locales: ["en", "uk"],
  defaultLocale: "en",
  timeZone: "UTC",
  fallbackLocale: "en",
  loader: async (locale) => {
    if (locale === "uk") throw new Error("404");
    return { hi: "Hello, {name}!" };
  },
  onError: () => {},
});

getI18n({ locale: "uk" }).then(({ t, i18n }) => {
  assertEqual(t("hi", { name: "Ann" }), "Hello, Ann!", "the fallback renders a failed locale");
  const payload = handover(i18n);
  assertEqual(
    JSON.stringify(payload.catalogs),
    '{"default":{"en":{"hi":"Hello, {name}!"},"uk":null}}',
    "the payload",
  );
  assertEqual(Object.getPrototypeOf(payload.catalogs), Object.prototype, "a plain object");
  console.log("BUNDLER_MATRIX_OK next-server-on-default");
});
