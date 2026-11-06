// `@comvi/svelte/format` on the 0.8 binding. The runner asserts the subpath's module and core's
// `/format` are IN the graph and `T.svelte` is not: the subpath reaches the instance through the
// binding's cell alone. Vite only, and no render: see svelte-default.mjs. No top-level await.
import { createI18n } from "@comvi/core";
import { formatNumber } from "@comvi/core/format";
import { useFormat } from "@comvi/svelte/format";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

assertEqual(typeof useFormat, "function", "@comvi/svelte/format exports useFormat");
// The formatter a `useFormat()` wraps takes the real instance (a `TypeError` otherwise).
const i18n = createI18n({ locale: "de", messages: { de: {} } });
assertEqual(formatNumber(i18n, 1234.5), "1.234,5", "the formatter under useFormat()");
console.log("BUNDLER_MATRIX_OK svelte-format");
