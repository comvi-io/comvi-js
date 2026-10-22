import { createSignal } from "solid-js";
import { T, useI18n } from "@comvi/solid";
import { localePath } from "~/lib/i18n";

// What `<link>` in the catalog becomes: the translator places the tag, the app
// owns the element.
const components = {
  link: { tag: "a", props: { href: "https://comvi.io/docs/i18n/ssr" } },
};

export default function Home() {
  const { t, locale } = useI18n();
  const [count, setCount] = createSignal(1);

  return (
    <>
      <p data-testid="greeting">{t("greeting.hello", { name: "Ada" })}</p>
      <section class="card">
        <div class="counter">
          <button
            data-testid="cart-dec"
            aria-label={t("demo.plural.dec")}
            onClick={() => setCount((n) => Math.max(0, n - 1))}
          >
            −
          </button>
          <span data-testid="cart">{t("cart.items", { count: count() })}</span>
          <button
            data-testid="cart-inc"
            aria-label={t("demo.plural.inc")}
            onClick={() => setCount((n) => n + 1)}
          >
            +
          </button>
        </div>
        <p data-testid="read-more">
          <T i18nKey="docs.read_more" components={components} />
        </p>
        <p class="muted" data-testid="only-en">
          {t("fallback.only_en")}
        </p>
      </section>
      <p>
        <a data-testid="nav-about" href={localePath(locale(), "/about")}>
          {t("nav.about")}
        </a>
      </p>
    </>
  );
}
