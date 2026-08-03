// framework-slim DX gate: the SINGLE-PACKAGE vue recipe. Every specifier in
// this file is `@comvi/vue/slim` — no `@comvi/core` anywhere.
//
// This case exists for ONE question the size fixtures cannot answer: does a
// named re-export hop through a `sideEffects: false` wrapper tree-shake in a
// REAL bundler, in DEVELOPMENT as well as production? `@comvi/vue/slim`
// re-exports the whole capability toolkit from core's pure subpaths; this app
// uses only the loader half. The runner asserts from the bundler's own module
// graph that the icu, plugins and devtools subpaths never enter it — and, as
// always, that core's tag-registration chunks do not. Core's base entry IS in
// the graph — the entry's own constructor is what this app builds on — so it is
// never what the assertion is about.
//
// fs-dx2 extends the case to the `.with(loader({…}))` form. Vue is the wrapper
// whose preset is a real function (it has a `VueI18n` to construct), so the
// pipe is exercised where it actually belongs here: on the CORE host, both
// through `createCore` and through the preset's own `i18n.core`.
//
// <T> rendering needs a renderer and is NOT exercised here. No top-level
// await: the webpack leg emits commonjs2.
import {
  attachLoader,
  createCore,
  createI18n,
  createI18nFromCore,
  flattenCatalog,
  loader,
  useI18n,
} from "@comvi/vue/slim";

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

assert(typeof createI18n === "function", "@comvi/vue/slim exports createI18n");
assert(typeof createCore === "function", "@comvi/vue/slim exports createCore");
assert(typeof createI18nFromCore === "function", "@comvi/vue/slim exports createI18nFromCore");
assert(typeof useI18n === "function", "@comvi/vue/slim exports useI18n");
assert(typeof attachLoader === "function", "@comvi/vue/slim re-exports attachLoader");
assert(typeof flattenCatalog === "function", "@comvi/vue/slim re-exports flattenCatalog");
assert(typeof loader === "function", "@comvi/vue/slim re-exports the loader() installer");

async function main() {
  // The one-call preset.
  const preset = createI18n({
    locale: "en",
    ssrLocale: "en",
    exposeGlobal: false,
    translation: { en: { plain: "hello", msg: "a <b>c</b> d" } },
  });

  assert(typeof preset.core.with === "function", "the pipe is on the preset's core host");
  assert(typeof preset.core.reloadTranslations === "undefined", "the preset builds a BARE host");
  assert("reloadTranslations" in preset === false, "VueI18n does not proxy loader capabilities");
  assertEqual(preset.t("plain"), "hello", "the preset host translates through the wrapper");
  assertEqual(
    preset.t("msg", { b: ({ children }) => `*${children}*` }),
    "a <b>c</b> d",
    "tag markup stays literal without a /tags import",
  );

  // THE DOCUMENTED RECIPE, in one expression: host + capability + import map,
  // then wrapped for vue. `createCore` is core's own constructor.
  const host = createCore({ locale: "en", exposeGlobal: false }).with(
    loader({
      en: async () => ({ default: { greeting: "Hello" } }),
      uk: async () => ({ default: { greeting: "Привіт" } }),
    }),
  );
  const wrapped = createI18nFromCore(host);

  assert(wrapped.core === host, "createI18nFromCore exposes the piped core");
  assert(typeof host.reloadTranslations === "function", "loader() composes the loader API");
  assert(typeof host.onMissingKey === "undefined", "loader() composes ONLY the loader API");
  assert(typeof host.getLoader() === "function", "loader(map) also REGISTERS the loader");

  await host.init();
  assertEqual(wrapped.t("greeting"), "Hello", "the piped import map loads at init");

  await host.setLocaleAsync("uk");
  assertEqual(wrapped.t("greeting"), "Привіт", "the piped import map loads on demand");

  // The low-level path stays supported and reaches the same capability.
  const manual = attachLoader(createCore({ locale: "en", exposeGlobal: false }));
  assert(typeof manual.reloadTranslations === "function", "attachLoader composes the loader API");
  assert(typeof manual.onMissingKey === "undefined", "attachLoader composes ONLY the loader API");
  assertEqual(
    JSON.stringify(flattenCatalog({ nav: { home: "Home" } })),
    JSON.stringify({ "nav.home": "Home" }),
    "flattenCatalog is core's flattener",
  );

  console.log("BUNDLER_MATRIX_OK vue-slim-preset");
}

main().catch((error) => {
  console.error(`FAIL vue-slim-preset: ${error?.stack || error}`);
  process.exit(1);
});
