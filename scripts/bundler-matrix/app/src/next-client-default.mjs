// The Next.js CLIENT recipe of 0.8: `<I18nProvider payload>` from `@comvi/next/client`
// renders a server payload (`handover()` of `@comvi/core/ssr`) for components that read
// through `@comvi/react`. Rendered to a string; the runner asserts that next's server half
// and the core subpaths the app does not name stay out of the graph. No top-level await: the
// webpack leg emits commonjs2.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@comvi/next/client";
import { useI18n } from "@comvi/react";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

const payload = {
  locale: "uk",
  timeZone: "UTC",
  serverNow: 0,
  catalogs: {
    default: { uk: { items: "{count, plural, one {# товар} few {# товари} other {# товарів}}" } },
    admin: { uk: null, en: { title: "Admin" } },
  },
};

function App() {
  const { t } = useI18n();
  const admin = useI18n("admin");
  return createElement("p", null, t("items", { count: 2 }), " ", admin.t("title"));
}

assertEqual(
  renderToStaticMarkup(
    createElement(I18nProvider, { payload, options: { fallbackLocale: "en" } }, createElement(App)),
  ),
  "<p>2 товари Admin</p>",
  "the payload renders, a failed slot through its fallback",
);

console.log("BUNDLER_MATRIX_OK next-client-default");
process.exit(0);
