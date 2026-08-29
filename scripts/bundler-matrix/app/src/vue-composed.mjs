// The vue COMPOSED-HOST recipe — `createCore` plus a configured capability,
// wrapped by `createI18nFromCore`. Every specifier is `@comvi/vue`.
//
// The question it answers: does a named re-export hop through a
// `sideEffects: false` wrapper tree-shake in a REAL bundler, in DEVELOPMENT as
// well as production, when the app DOES call one of the re-exported
// capabilities? This app uses only the loader half, and the runner asserts from
// the bundler's own module graph that the icu, plugins and devtools subpaths
// never enter it — nor core's tag-registration chunks.
//
// Vue keeps a case of its own because it is the one binding with TWO
// construction paths on one entry: the wrapper preset (`vue-default`) and this
// injected-host escape hatch, whose exact host type survives into `i18n.core`.
// Core's base entry IS in the graph — `createCore` is its constructor.
//
// <T> rendering needs a renderer and is NOT exercised here. No top-level await:
// the webpack leg emits commonjs2.
import {
  attachLoader,
  createCore,
  createI18n,
  createI18nFromCore,
  flattenCatalog,
  loader,
  useI18n,
} from "@comvi/vue";

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

assert(typeof createI18n === "function", "@comvi/vue exports createI18n");
assert(typeof createCore === "function", "@comvi/vue exports createCore");
assert(typeof createI18nFromCore === "function", "@comvi/vue exports createI18nFromCore");
assert(typeof useI18n === "function", "@comvi/vue exports useI18n");
assert(typeof attachLoader === "function", "@comvi/vue re-exports attachLoader");
assert(typeof flattenCatalog === "function", "@comvi/vue re-exports flattenCatalog");
assert(typeof loader === "function", "@comvi/vue re-exports the loader() installer");

async function main() {
  // THE DOCUMENTED RECIPE, in one expression: host + capability + import map,
  // then wrapped for vue. `createCore` is core's own constructor.
  const host = createCore({ locale: "en", exposeGlobal: false }).with(
    loader({
      en: async () => ({ default: { greeting: "Hello" } }),
      uk: async () => ({ default: { greeting: "Привіт" } }),
    }),
  );
  const wrapped = createI18nFromCore(host, { ssrLocale: "en" });

  assert(wrapped.core === host, "createI18nFromCore exposes the piped core");
  assert(typeof host.reloadTranslations === "function", "loader() composes the loader API");
  assert(typeof host.onMissingKey === "undefined", "loader() composes ONLY the loader API");
  assert(typeof host.getLoader() === "function", "loader(map) also REGISTERS the loader");

  await host.init();
  assertEqual(wrapped.t("greeting"), "Hello", "the piped import map loads at init");

  await host.setLocaleAsync("uk");
  assertEqual(wrapped.t("greeting"), "Привіт", "the piped import map loads on demand");

  // The preset's own host takes the same pipe — the vue-specific half.
  const preset = createI18n({ locale: "en", exposeGlobal: false });
  assert(preset.core.with(attachLoader) === preset.core, "the pipe returns the preset's own host");
  assert(
    typeof preset.core.reloadTranslations === "function",
    "the preset host gains the capability it was piped",
  );

  // The low-level path stays supported and reaches the same capability.
  const manual = attachLoader(createCore({ locale: "en", exposeGlobal: false }));
  assert(typeof manual.reloadTranslations === "function", "attachLoader composes the loader API");
  assert(typeof manual.onMissingKey === "undefined", "attachLoader composes ONLY the loader API");
  assertEqual(
    JSON.stringify(flattenCatalog({ nav: { home: "Home" } })),
    JSON.stringify({ "nav.home": "Home" }),
    "flattenCatalog is core's flattener",
  );

  console.log("BUNDLER_MATRIX_OK vue-composed");
}

main().catch((error) => {
  console.error(`FAIL vue-composed: ${error?.stack || error}`);
  process.exit(1);
});
