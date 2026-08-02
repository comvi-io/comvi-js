// Phase-7 gating fixture: the slim composition chain resolved through the
// three PACKAGE SPECIFIERS (`@comvi/core/slim`, `@comvi/core/loader`,
// `@comvi/core/plugins`) out of the packed tarball, so this exercises the
// published exports map and the consumer bundler's tree-shaking — the axis
// the direct-dist canary (A6) cannot see.
//
// The capabilities live in separate chunks and reach into base-class state
// through terser-mangled `_`-prefixed members; if the exports map, the chunk
// graph or a bundler transform breaks that contract, one of the assertions
// below fails instead of printing the success marker.
//
// No top-level await: the webpack leg emits commonjs2, where a TLA module
// would change the emitted module shape rather than test the composition.
import { createI18n } from "@comvi/core/slim";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

async function main() {
  const store = {
    "en:default": { hello: "Hello" },
    "fr:default": { hello: "Bonjour" },
  };

  const order = [];
  const i18n = attachPlugins(attachLoader(createI18n({ locale: "en", exposeGlobal: false })));

  i18n.registerLoader(async (locale, ns) => store[`${locale}:${ns}`] ?? {});
  i18n.use((host) => {
    order.push("plugin");
    host.setPluginData("probe", "set");
    return () => order.push("cleanup");
  });
  i18n.onMissingKey(() => "from-callback");

  await i18n.init();

  assertEqual(order, ["plugin"], "plugins run at init");
  assertEqual(i18n.t("hello"), "Hello", "loader-fetched translation");
  assertEqual(i18n.getPluginData("probe"), "set", "plugin data survives init");
  assertEqual(i18n.t("absent"), "from-callback", "missing-key callback fallback");

  // Locale switch loads the active namespaces through the attached loader.
  await i18n.setLocaleAsync("fr");
  assertEqual(i18n.t("hello"), "Bonjour", "locale switch loads through the loader");

  // reloadTranslations must refetch, not resolve from the cache.
  store["fr:default"] = { hello: "Salut" };
  await i18n.reloadTranslations();
  assertEqual(i18n.t("hello"), "Salut", "reloadTranslations refetches");

  await i18n.destroy();
  assertEqual(order, ["plugin", "cleanup"], "plugin cleanup runs on destroy");
  assertEqual(i18n.getLoader(), undefined, "loader state reset after destroy");
  assertEqual(i18n.getPluginData("probe"), undefined, "plugin state reset after destroy");

  console.log("BUNDLER_MATRIX_OK slim-composition");
}

main().catch((error) => {
  console.error(`FAIL slim-composition: ${error?.stack || error}`);
  process.exit(1);
});
