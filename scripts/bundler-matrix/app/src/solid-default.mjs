// THE DEFAULT Solid app on the 0.8 binding: every import from `@comvi/solid`, run through the
// provider, useI18n() and the bound <T>. The runner asserts that no core subpath (`/cdn`,
// `/plugins`, `/devtools`, `/format`) and not `@comvi/solid/format` enter the module graph, in
// development as in production. `@comvi/core/internal` IS in it: it is the binding's seam.
// Webpack (target node) resolves solid-js's server build and Vite its browser build: the
// binding is one build for both. No DOM: `t()` and the provider run, <T>'s nodes are not
// inserted anywhere. No top-level await: the webpack leg emits commonjs2.
import { createComponent, createRoot } from "solid-js";
import { createI18n, I18nProvider, T, useI18n } from "@comvi/solid";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

// A server render on the webpack leg: the instance names its time zone (a development check).
const i18n = createI18n({
  locale: "en",
  timeZone: "UTC",
  catalogs: {
    default: {
      en: {
        hi: "Hello, {name}!",
        items: "{count, plural, one {# item} other {# items}}",
      },
    },
    shop: { en: { buy: "Buy <b>now</b>" } },
  },
});

let seen;
const App = () => {
  const { t, locale, isReady } = useI18n();
  const shop = useI18n("shop");
  seen = [
    t("hi", { name: "Ann" }),
    t("items", { count: 2 }),
    locale(),
    isReady(),
    typeof shop.T,
    typeof T,
  ];
  return seen[0];
};

createRoot((dispose) => {
  // `<Show>` hands back an accessor in the browser build: reading it runs the children.
  let node = createComponent(I18nProvider, {
    i18n,
    get children() {
      return createComponent(App, {});
    },
  });
  while (typeof node === "function") node = node();
  dispose();
});

assertEqual(
  JSON.stringify(seen),
  JSON.stringify(["Hello, Ann!", "2 items", "en", true, "function", "function"]),
  "<I18nProvider>, useI18n() and the bound <T>",
);
console.log("BUNDLER_MATRIX_OK solid-default");
