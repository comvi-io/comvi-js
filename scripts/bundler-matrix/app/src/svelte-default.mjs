// THE DEFAULT Svelte app on the 0.8 binding: every import from `@comvi/svelte`. The runner asserts
// that no core subpath (`/cdn`, `/plugins`, `/devtools`, `/format`) and not `@comvi/svelte/format`
// enter the module graph, in development as in production. `@comvi/core/internal` IS in it: it is
// the binding's seam. Vite only (`T.svelte` and the rune modules need a Svelte compiler).
// Vite compiles for the browser, and a client component needs a DOM to mount: the render is the
// e2e scenario's and the package's tests'; here the published graph builds, loads and translates.
// No top-level await.
import { createI18n, handover, setI18n, T, useI18n } from "@comvi/svelte";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

for (const [name, value] of Object.entries({ createI18n, handover, setI18n, T, useI18n })) {
  assertEqual(typeof value, "function", `@comvi/svelte exports ${name}`);
}

const i18n = createI18n({
  locale: "en",
  timeZone: "UTC",
  messages: {
    en: {
      hi: "Hello, {name}!",
      items: "{count, plural, one {# item} other {# items}}",
    },
  },
});

assertEqual(i18n.t("hi", { name: "Ann" }), "Hello, Ann!", "createI18n builds the instance");
assertEqual(i18n.t("items", { count: 2 }), "2 items", "ICU is in the base");
console.log("BUNDLER_MATRIX_OK svelte-default");
