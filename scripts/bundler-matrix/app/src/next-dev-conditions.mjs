// The DEV-CONDITIONS case for `@comvi/next`: does a dev-only diagnostic
// actually reach a consumer who defines NOTHING? See
// `vue-dev-conditions.mjs` for the full argument — `@comvi/next` had the
// same defect, with `__DEV__: false` baked into its only artifact family.
//
// The ROOT entry, not `/client`: the package's one `IS_DEV` diagnostic is the
// readable `E_USE_HOST_IDENTITY` message in `src/createNextI18n.ts`, and
// `createNextI18n` is exported from `./index` alone. `preserveModules` means
// the root resolves `dist/createNextI18n.js` or `dist/createNextI18n.dev.js`
// per condition; the runner asserts that module is in the graph and that its
// dev-only text is in the development bundle only.
//
// This fixture deliberately does NOT contain the diagnostic's text, not even
// in a comment: the runner's assertion greps the BUNDLE, and a copy of the
// string coming from the app's own source would make the production half of
// the claim pass for the wrong reason. It TRIGGERS the diagnostic instead and
// asserts the stable part — `error.code` — which both artifacts carry.
//
// `sentinels: "present"`: the composed root bare-imports `@comvi/core/tags`,
// as the 0.4 root did, so ambient tag registration is expected here.
import { createNextI18n } from "@comvi/next";

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

assert(typeof createNextI18n === "function", "@comvi/next exports createNextI18n");

const { i18n, routing, use } = createNextI18n({
  locales: ["en", "de"],
  defaultLocale: "en",
  messages: { en: { greeting: "Hello, {name}!" } },
});
assert(typeof i18n.t === "function", "createNextI18n builds a host");
assert(typeof use === "function", "the composed root carries the composition verb");
assertEqual(routing.defaultLocale, "en", "routing is resolved from the options");
assertEqual(i18n.t("greeting", { name: "world" }), "Hello, world!", "the host translates");

// The guarded diagnostic, executed: `.use` must hand back the host it was
// given, and the error it throws is the one module whose message differs
// between the two artifact families.
let thrown;
try {
  createNextI18n({ locales: ["en"], defaultLocale: "en" }).use(() => ({ notTheHost: true }));
} catch (error) {
  thrown = error;
}
assert(thrown instanceof Error, "a foreign return from .use throws");
assertEqual(thrown.code, "E_USE_HOST_IDENTITY", "the error carries the stable code");
assert(typeof thrown.message === "string" && thrown.message.length > 0, "the error has a message");

console.log("BUNDLER_MATRIX_OK next-dev-conditions");
