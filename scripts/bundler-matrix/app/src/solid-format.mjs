// `@comvi/solid/format` on the 0.8 binding: `useFormat()` under the provider. The runner asserts
// the subpath's module and core's `/format` are IN the graph, and that the binding's dev-only
// diagnostic text is in the development bundle and not in the production one. No top-level await.
import { createComponent, createRoot } from "solid-js";
import { createI18n, I18nProvider } from "@comvi/solid";
import { useFormat } from "@comvi/solid/format";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

const i18n = createI18n({ locale: "de", messages: { de: {} }, timeZone: "UTC" });

let seen;
const Price = () => (seen = useFormat().number(1234.5));

createRoot((dispose) => {
  let node = createComponent(I18nProvider, {
    i18n,
    get children() {
      return createComponent(Price, {});
    },
  });
  while (typeof node === "function") node = node();
  dispose();
});

assertEqual(seen, "1.234,5", "useFormat() formats in the app's locale");
console.log("BUNDLER_MATRIX_OK solid-format");
