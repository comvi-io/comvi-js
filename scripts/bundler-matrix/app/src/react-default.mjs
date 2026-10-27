// THE DEFAULT React app on the 0.8 binding: every import from `@comvi/react`, rendered
// to a string. The runner asserts that no core subpath (`/cdn`, `/plugins`, `/devtools`,
// `/format`) and not `@comvi/react/format` enter the module graph, in development as in
// production. `@comvi/core/internal` IS in it: it is the binding's seam. No top-level
// await: the webpack leg emits commonjs2.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createI18n, I18nProvider, T, useI18n } from "@comvi/react";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

const i18n = createI18n({
  locale: "en",
  messages: {
    en: {
      hi: "Hello, {name}!",
      items: "{count, plural, one {# item} other {# items}}",
      terms: "Read the <link>terms</link>.",
    },
  },
});

const App = () =>
  createElement(
    "p",
    null,
    useI18n().t("hi", { name: "Ann" }),
    " ",
    useI18n().t("items", { count: 2 }),
    " ",
    createElement(T, {
      i18nKey: "terms",
      link: (chunks) => createElement("a", { href: "/terms" }, chunks),
    }),
  );

assertEqual(
  renderToStaticMarkup(createElement(I18nProvider, { i18n }, createElement(App))),
  '<p>Hello, Ann! 2 items Read the <a href="/terms">terms</a>.</p>',
  "the provider, useI18n() and <T> render",
);

console.log("BUNDLER_MATRIX_OK react-default");
// The browser build of react-dom/server (Vite resolves the browser condition) keeps a
// MessageChannel open: end the process once the assertions passed.
process.exit(0);
