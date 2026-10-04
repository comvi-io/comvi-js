// The vue COMPOSED-HOST recipe — core's `createI18n` plus a configured
// capability, wrapped by `createI18nFromCore`. The host is built elsewhere by
// definition, so `@comvi/core` IS named here for its constructor (there is no
// `createCore` alias on `@comvi/vue`); everything else comes from `@comvi/vue`.
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
// Core's base entry IS in the graph — it is the host's constructor.
//
// <T> rendering needs a renderer and is NOT exercised here. No top-level await:
// the webpack leg emits commonjs2.
import { createI18n as createCore } from "@comvi/core";
import { attachLoader, createI18n, createI18nFromCore, loader, useI18n } from "@comvi/vue";

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
assert(typeof createI18nFromCore === "function", "@comvi/vue exports createI18nFromCore");
assert(typeof useI18n === "function", "@comvi/vue exports useI18n");
assert(typeof attachLoader === "function", "@comvi/vue re-exports attachLoader");
assert(typeof loader === "function", "@comvi/vue re-exports the loader(map) installer");

async function main() {
  // THE DOCUMENTED RECIPE, in one expression: host + capability + import map,
  // then wrapped for vue. `createCore` is core's own `createI18n`.
  const host = createCore({ locale: "en", exposeGlobal: false }).use(
    loader({
      en: async () => ({ default: { greeting: "Hello" } }),
      uk: async () => ({ default: { greeting: "Привіт" } }),
    }),
  );
  const wrapped = createI18nFromCore(host, { ssrLocale: "en" });

  assert(wrapped.core === host, "createI18nFromCore exposes the piped core");
  assert(typeof host.reloadMessages === "function", "loader(map) composes the loader API");
  assert(typeof host.onMissingKey === "undefined", "loader(map) composes ONLY the loader API");
  assert(typeof host.getLoader() === "function", "loader(map) also REGISTERS the loader");

  await host.init();
  assertEqual(wrapped.t("greeting"), "Hello", "the piped import map loads at init");

  await host.setLocale("uk");
  assertEqual(wrapped.t("greeting"), "Привіт", "the piped import map loads on demand");

  // The preset's own host takes the same pipe — the vue-specific half.
  const preset = createI18n({ locale: "en", exposeGlobal: false });
  assert(preset.core.use(attachLoader) === preset.core, "the pipe returns the preset's own host");
  assert(
    typeof preset.core.reloadMessages === "function",
    "the preset host gains the capability it was piped",
  );

  // The low-level path stays supported and reaches the same capability.
  const manual = attachLoader(createCore({ locale: "en", exposeGlobal: false }));
  assert(typeof manual.reloadMessages === "function", "attachLoader composes the loader API");
  assert(typeof manual.onMissingKey === "undefined", "attachLoader composes ONLY the loader API");
  // Nested catalogs are BASE behaviour (C1): no `flattenCatalog` hop, and the
  // binding root no longer re-exports one.
  const nested = createCore({ locale: "en", exposeGlobal: false });
  nested.addMessages({ en: { nav: { home: "Home" } } });
  assertEqual(nested.t("nav.home"), "Home", "a base host flattens a nested catalog");

  console.log("BUNDLER_MATRIX_OK vue-composed");
}

main().catch((error) => {
  console.error(`FAIL vue-composed: ${error?.stack || error}`);
  process.exit(1);
});
