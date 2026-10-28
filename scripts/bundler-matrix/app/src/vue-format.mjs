// `@comvi/vue/format` on the 0.8 binding: `useFormat()` in a rendered component. The runner
// asserts the subpath's module and core's `/format` are IN the graph, and — this being the
// Vue dev-conditions case — that the binding's dev-only diagnostic text is in the
// development bundle and not in the production one. No top-level await.
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createI18n } from "@comvi/vue";
import { useFormat } from "@comvi/vue/format";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

// A server render: the instance names its time zone (a development check).
const i18n = createI18n({ locale: "de", messages: { de: {} }, timeZone: "UTC" });
const Price = { setup: () => () => h("b", useFormat().number(1234.5)) };

renderToString(createSSRApp(Price).use(i18n)).then(
  (html) => {
    assertEqual(html, "<b>1.234,5</b>", "useFormat() formats in the app's locale");
    console.log("BUNDLER_MATRIX_OK vue-format");
  },
  (error) => {
    console.error(`FAIL vue-format: ${error?.stack || error}`);
    process.exit(1);
  },
);
