// framework-slim DX gate: the SINGLE-PACKAGE react recipe. Every specifier in
// this file is `@comvi/react/slim` — no `@comvi/core` anywhere.
//
// This case exists for ONE question the size fixtures cannot answer: does a
// named re-export hop through a `sideEffects: false` wrapper tree-shake in a
// REAL bundler, in DEVELOPMENT as well as production? `@comvi/react/slim`
// re-exports the whole capability toolkit from core's pure subpaths; this app
// uses only the loader half. The runner asserts from the bundler's own module
// graph that the icu, plugins and devtools subpaths never enter it — and, as
// always, that neither the root entry nor core's tag-registration chunks do.
//
// fs-dx2 extends the case to the `.with(loader({…}))` form: the host, the
// capability install, the import-map adapter and the registration are now ONE
// expression, and it has to survive four bundler×mode combinations with the
// unused subpaths still pruned. The low-level `attachLoader` path is asserted
// alongside it, because it stays the supported API for a plain `LoaderFn`.
//
// <T> rendering needs a DOM and is NOT exercised here (same documented skip as
// wrappers.mjs). No top-level await: the webpack leg emits commonjs2.
import {
  attachLoader,
  createI18n,
  flattenCatalog,
  I18nProvider,
  loader,
  useI18n,
  useI18nLoader,
  useI18nPlugins,
} from "@comvi/react/slim";

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

const isComponent = (c) => typeof c === "function" || (typeof c === "object" && c !== null);
assert(typeof createI18n === "function", "@comvi/react/slim exports createI18n");
assert(typeof useI18n === "function", "@comvi/react/slim exports useI18n");
assert(isComponent(I18nProvider), "@comvi/react/slim exports I18nProvider");
assert(typeof useI18nLoader === "function", "@comvi/react/slim exports useI18nLoader");
assert(typeof useI18nPlugins === "function", "@comvi/react/slim exports useI18nPlugins");
assert(typeof attachLoader === "function", "@comvi/react/slim re-exports attachLoader");
assert(typeof flattenCatalog === "function", "@comvi/react/slim re-exports flattenCatalog");
assert(typeof loader === "function", "@comvi/react/slim re-exports the loader() installer");

async function main() {
  const bare = createI18n({
    locale: "en",
    exposeGlobal: false,
    translation: { en: { msg: "a <b>c</b> d" } },
  });

  assert(typeof bare.with === "function", "the pipe is on every host");
  assert(typeof bare.reloadTranslations === "undefined", "the preset builds a BARE slim host");
  assert(typeof bare.onMissingKey === "undefined", "the preset builds a BARE slim host");
  assertEqual(
    bare.t("msg", { b: ({ children }) => `*${children}*` }),
    "a <b>c</b> d",
    "tag markup stays literal without a /tags import",
  );

  // THE DOCUMENTED RECIPE, in one expression: host + capability + import map.
  const i18n = createI18n({ locale: "en", exposeGlobal: false }).with(
    loader({
      en: async () => ({ default: { greeting: "Hello" } }),
      uk: async () => ({ default: { greeting: "Привіт" } }),
    }),
  );

  assert(typeof i18n.reloadTranslations === "function", "loader() composes the loader API");
  assert(typeof i18n.onMissingKey === "undefined", "loader() composes ONLY the loader API");
  assert(typeof i18n.getLoader() === "function", "loader(map) also REGISTERS the loader");

  await i18n.init();
  assertEqual(i18n.t("greeting"), "Hello", "the piped import map loads at init");

  await i18n.setLocaleAsync("uk");
  assertEqual(i18n.t("greeting"), "Привіт", "the piped import map loads on demand");

  // The low-level path stays supported and reaches the same capability.
  const manual = attachLoader(createI18n({ locale: "en", exposeGlobal: false }));
  assert(typeof manual.reloadTranslations === "function", "attachLoader composes the loader API");
  assert(typeof manual.onMissingKey === "undefined", "attachLoader composes ONLY the loader API");
  assertEqual(
    JSON.stringify(flattenCatalog({ nav: { home: "Home" } })),
    JSON.stringify({ "nav.home": "Home" }),
    "flattenCatalog is core's flattener",
  );

  console.log("BUNDLER_MATRIX_OK react-slim-preset");
}

main().catch((error) => {
  console.error(`FAIL react-slim-preset: ${error?.stack || error}`);
  process.exit(1);
});
