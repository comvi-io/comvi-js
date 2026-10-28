// `@comvi/react/format` on the 0.8 binding: `useFormat()` in a rendered component. The
// runner asserts the subpath's module and core's `/format` are IN the graph, and — this
// being the React dev-conditions case — that the binding's dev-only diagnostic text is in
// the development bundle and not in the production one. No top-level await.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createI18n, I18nProvider } from "@comvi/react";
import { useFormat } from "@comvi/react/format";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

const i18n = createI18n({ locale: "de", messages: { de: {} } });
const Price = () => createElement("b", null, useFormat().number(1234.5));

assertEqual(
  renderToStaticMarkup(createElement(I18nProvider, { i18n }, createElement(Price))),
  "<b>1.234,5</b>",
  "useFormat() formats in the provider's locale",
);

console.log("BUNDLER_MATRIX_OK react-format");
// The browser build of react-dom/server (Vite resolves the browser condition) keeps a
// MessageChannel open: end the process once the assertions passed.
process.exit(0);
