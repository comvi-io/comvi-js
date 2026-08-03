// Phase-7 gating fixture: the slim composition chain resolved through the
// three PACKAGE SPECIFIERS (`@comvi/core`, `@comvi/core/loader`,
// `@comvi/core/plugins`) out of the packed tarball, so this exercises the
// published exports map and the consumer bundler's tree-shaking — the axis
// the direct-dist canary (A6) cannot see.
//
// The capabilities live in separate chunks and reach into base-class state
// through terser-mangled `_`-prefixed members; if the exports map, the chunk
// graph or a bundler transform breaks that contract, one of the assertions
// below fails instead of printing the success marker.
//
// fs-dx2 adds the `.with(installer)` half: the SAME two capabilities composed
// through the pipe and the configured `loader()` / `plugins()` factories,
// resolved through the same published subpaths. Both halves stay — `attach*`
// is the low-level API the factories delegate to, and each is now gated in
// four bundler×mode combinations.
//
// No top-level await: the webpack leg emits commonjs2, where a TLA module
// would change the emitted module shape rather than test the composition.
import { createI18n } from "@comvi/core";
import { attachLoader, loader } from "@comvi/core/loader";
import { attachPlugins, plugins } from "@comvi/core/plugins";

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

  // ── the same composition through `.with(…)` (fs-dx2) ────────────────────
  const piped = createI18n({ locale: "en", exposeGlobal: false })
    .with(
      loader({
        en: async () => ({ default: { hello: "Hello" } }),
        "fr:default": async () => ({ hello: "Bonjour" }),
      }),
    )
    .with(plugins());

  const pipedOrder = [];
  piped.use((host) => {
    pipedOrder.push("plugin");
    host.setPluginData("probe", "set");
    return () => pipedOrder.push("cleanup");
  });

  await piped.init();
  assertEqual(piped.t("hello"), "Hello", "loader(map) registers through the pipe");
  assertEqual(pipedOrder, ["plugin"], "plugins() hosts plugins through the pipe");
  assertEqual(piped.getPluginData("probe"), "set", "plugin data survives the pipe");

  await piped.setLocaleAsync("fr");
  assertEqual(piped.t("hello"), "Bonjour", "the piped import map loads on demand");

  // Composing a capability the host already has must change nothing.
  const registered = piped.getLoader();
  assertEqual(piped.with(loader()) === piped, true, "a second loader() is a no-op");
  assertEqual(piped.getLoader() === registered, true, "the no-op keeps the registered loader");

  await piped.destroy();
  assertEqual(pipedOrder, ["plugin", "cleanup"], "piped plugin cleanup runs on destroy");

  console.log("BUNDLER_MATRIX_OK base-composition");
}

main().catch((error) => {
  console.error(`FAIL base-composition: ${error?.stack || error}`);
  process.exit(1);
});
