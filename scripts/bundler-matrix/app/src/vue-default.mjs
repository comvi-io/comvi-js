// THE DEFAULT Vue app on the 0.8 binding: every import from `@comvi/vue`, rendered to a
// string with `app.use(i18n)`, useI18n(), the bound <T> of useI18n(ns) and the exported <T>
// with a slot. The runner asserts that no core subpath (`/cdn`, `/plugins`, `/devtools`,
// `/format`) and not `@comvi/vue/format` enter the module graph, in development as in
// production. `@comvi/core/internal` IS in it: it is the binding's seam. No top-level
// await: the webpack leg emits commonjs2.
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { createI18n, T, useI18n } from "@comvi/vue";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

// A server render: the instance names its time zone (a development check).
const i18n = createI18n({
  locale: "en",
  timeZone: "UTC",
  catalogs: {
    default: {
      en: {
        hi: "Hello, {name}!",
        items: "{count, plural, one {# item} other {# items}}",
        terms: "Read the <link>terms</link>.",
      },
    },
    shop: { en: { buy: "Buy <b>now</b>" } },
  },
});

const App = {
  setup() {
    const { t } = useI18n();
    const shop = useI18n("shop");
    return () =>
      h("p", [
        t("hi", { name: "Ann" }),
        " ",
        t("items", { count: 2 }),
        " ",
        h(
          T,
          { i18nKey: "terms" },
          { link: ({ children }) => h("a", { href: "/terms" }, children) },
        ),
        " ",
        h(shop.T, { i18nKey: "buy", b: (c) => h("b", c) }),
      ]);
  },
};

renderToString(createSSRApp(App).use(i18n)).then(
  (html) => {
    assertEqual(
      html.replace(/<!--[[\]]-->/g, ""),
      '<p>Hello, Ann! 2 items Read the <a href="/terms">terms</a>. Buy <b>now</b></p>',
      "app.use(i18n), useI18n(), <T> and the bound <T> render",
    );
    console.log("BUNDLER_MATRIX_OK vue-default");
  },
  (error) => {
    console.error(`FAIL vue-default: ${error?.stack || error}`);
    process.exit(1);
  },
);
