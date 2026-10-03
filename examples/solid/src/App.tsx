import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { T, useI18n } from "@comvi/solid";
import { locales, rtlLocale } from "./i18n";

const RELEASED = new Date("2026-09-01T00:00:00Z");

type View = "home" | "about";
const viewFromPath = (): View => (location.pathname === "/about" ? "about" : "home");

export function App() {
  // `useI18n()` builds its signals from the provider's, so it MUST be called
  // inside a component (a reactive context) — never at module scope.
  const {
    t,
    locale,
    setLocale,
    dir,
    isLoading,
    cacheRevision,
    formatNumber,
    formatDate,
    getLoadedLocales,
  } = useI18n();
  const [count, setCount] = createSignal(2);

  // A second view, so the locale can be seen surviving a navigation. No router
  // dependency: `history.pushState` and `popstate` are the whole of it, and
  // `vite preview` serves index.html for /about on a reload.
  const [view, setView] = createSignal(viewFromPath());
  const onPop = () => setView(viewFromPath());
  window.addEventListener("popstate", onPop);
  onCleanup(() => window.removeEventListener("popstate", onPop));
  const go = (to: View) => (event: MouseEvent) => {
    event.preventDefault();
    history.pushState(null, "", to === "about" ? "/about" : "/");
    setView(to);
  };

  createEffect(() => {
    document.documentElement.lang = locale();
    document.documentElement.dir = dir();
  });

  return (
    <main>
      <h1>{t("app.title")}</h1>

      {/* 1 — locale switcher */}
      <section>
        <h2>{t("app.language")}</h2>
        <div class="row">
          <For each={locales}>
            {(code) => (
              <button
                data-testid={`locale-${code}`}
                aria-pressed={locale() === code}
                onClick={() => void setLocale(code)}
              >
                {code}
              </button>
            )}
          </For>
          {/* Not in the switcher: the right-to-left locale the e2e suite uses. */}
          <button
            hidden
            data-testid={`locale-${rtlLocale}`}
            onClick={() => void setLocale(rtlLocale)}
          >
            {rtlLocale}
          </button>
          <Show when={isLoading()}>
            <code>{t("app.loading")}</code>
          </Show>
        </div>
      </section>

      <Show
        when={view() === "about"}
        fallback={
          <>
            {/* 2 — a string with a parameter */}
            <section>
              <h2>interpolation</h2>
              <p data-testid="greeting">{t("greeting.hello", { name: "Ada" })}</p>
            </section>

            {/* 3 — an ICU plural, live on a counter */}
            <section>
              <h2>plural</h2>
              <div class="row">
                <button data-testid="cart-dec" onClick={() => setCount((n) => Math.max(0, n - 1))}>
                  −
                </button>
                <button data-testid="cart-inc" onClick={() => setCount((n) => n + 1)}>
                  +
                </button>
                <span data-testid="cart">{t("cart.items", { count: count() })}</span>
              </div>
            </section>

            {/* 4 — <T> with a tag: the catalog holds <link>…</link>, the app decides
          what that renders as. The tag grammar travels per call, so plain
          `t()` elsewhere is unaffected. */}
            <section>
              <h2>tag interpolation</h2>
              <p data-testid="read-more">
                <T
                  i18nKey="docs.read_more"
                  components={{
                    link: {
                      tag: "a",
                      props: { href: "https://comvi.io/docs", target: "_blank", rel: "noreferrer" },
                    },
                  }}
                />
              </p>
            </section>

            {/* 5 — date and number formatting. The formatters take the locale as
          their last argument; passing `locale()` is what subscribes this
          expression to a locale change. */}
            <section>
              <h2>formatting</h2>
              <p>
                {t("stats.summary", {
                  views: formatNumber(1234567, undefined, locale()),
                  date: formatDate(RELEASED, { dateStyle: "long" }, locale()),
                })}
              </p>
            </section>

            {/* 6 — proof the loader is lazy: only the locales you visited are here.
          `getLoadedLocales()` is a plain call, so read `cacheRevision()` to
          depend on the catalog landing. */}
            <section>
              <h2>lazy loading</h2>
              <p>
                <code data-testid="fetched">
                  {(() => {
                    void cacheRevision();
                    return t("loader.fetched", { locales: getLoadedLocales().join(", ") });
                  })()}
                </code>
              </p>
            </section>

            {/* 7 — a second view; the locale is not part of the path here */}
            <section>
              <h2>navigation</h2>
              <p>
                <a data-testid="nav-about" href="/about" onClick={go("about")}>
                  {t("nav.about")}
                </a>
              </p>
            </section>

            {/* 8 — fallback: uk has no `fallback.only_en`, so uk renders the en text;
          a key no catalog has renders as the key itself */}
            <section>
              <h2>fallback</h2>
              <p data-testid="fallback">{t("fallback.only_en")}</p>
              <p>
                <code data-testid="missing-key">{t("fallback.nowhere")}</code>
              </p>
            </section>

            {/* 9 — a missing parameter renders as its own placeholder */}
            <section>
              <h2>missing parameter</h2>
              <p data-testid="missing-param">{t("greeting.hello", {})}</p>
            </section>
          </>
        }
      >
        <section>
          <h2>navigation</h2>
          <p data-testid="about-body">{t("about.body")}</p>
          <p>
            <a data-testid="nav-home" href="/" onClick={go("home")}>
              {t("nav.home")}
            </a>
          </p>
        </section>
      </Show>
    </main>
  );
}
