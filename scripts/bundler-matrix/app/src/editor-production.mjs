// The in-context editor composed onto the base host, through the PACKAGE
// SPECIFIER so the published exports map decides which entry the bundler sees:
//
//   production  -> dist/production.es.js — a no-op stub that imports nothing;
//   default     -> dist/index.es.js      — the real runtime, whose Core chunk
//                                          dynamically imports EditModal.
//
// The runner asserts the module graph in both directions (EditModal absent in
// production, present in development). This file asserts the half a graph
// cannot: that the two entries are interchangeable at the call site, so an app
// composing the editor behaves the same either way.
//
// No `window`/`document` at module scope, and none anywhere: every fixture runs
// under bare node. The editor's own browser runtime is guarded behind a
// `typeof window` check inside the plugin, so the development entry composes
// and initialises here without a DOM.
//
// No top-level await: the webpack leg emits commonjs2, where a TLA module
// would change the emitted module shape rather than test the composition.
import { createI18n } from "@comvi/core";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

/**
 * The development entry appends an invisible-character key encoding to every
 * translation it post-processes (that IS the editor: the browser runtime finds
 * a key by decoding the marker out of the rendered text). The production stub
 * registers no post-processor, so the same call returns the bare string. Both
 * are correct, so every text assertion here compares the visible characters.
 * The five markers are `@comvi/plugin-in-context-editor`'s `INVISIBLE_CHARS`.
 */
// Alternation, not a character class: U+200C/U+200D are joiners, and
// `no-misleading-character-class` rejects them inside `[…]`.
const visible = (value) => String(value).replace(/\u200B|\u200C|\u200D|\u2063|\u2064/g, "");

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

async function main() {
  const i18n = createI18n({
    locale: "en",
    exposeGlobal: false,
    // Flat by choice, not by rule: the base host flattens nested catalogs
    // itself, and this fixture deliberately composes no capability.
    messages: { en: { hello: "Hello", greeting: "Hi {name}" } },
  });

  // `.use(inContextEditor())` returns the host it was handed. Under the
  // production condition that is all it does; under the default condition it
  // has attached the plugin and devtools capabilities on the way through.
  const composed = i18n.use(inContextEditor({ apiKeyOverride: "bundler-matrix" }));
  assertEqual(composed === i18n, true, "inContextEditor returns the same host");

  await i18n.init();

  // Composing the editor must not disturb translation itself in either entry.
  assertEqual(visible(i18n.t("hello")), "Hello", "translation after composing the editor");
  assertEqual(
    visible(i18n.t("greeting", { name: "Ada" })),
    "Hi Ada",
    "params after composing the editor",
  );
  assertEqual(i18n.locale, "en", "locale after composing the editor");

  // Teardown is symmetric: the development entry registered a cleanup, the
  // production stub registered nothing, and neither may throw.
  await i18n.destroy();

  console.log("BUNDLER_MATRIX_OK editor-production");
}

main().catch((error) => {
  console.error(`FAIL editor-production: ${error?.stack || error}`);
  process.exit(1);
});
