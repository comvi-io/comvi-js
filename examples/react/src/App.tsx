import { useEffect, useState } from "react";
import { T, useI18n } from "@comvi/react";
import { locales } from "./i18n";

const RELEASED = new Date("2026-09-01T00:00:00Z");

export function App() {
  // Everything below the switcher re-renders on a locale change because
  // `useI18n()` subscribes this component to the instance.
  const { t, locale, setLocale, dir, isLoading, formatNumber, formatDate, getLoadedLocales } =
    useI18n();
  const [count, setCount] = useState(2);

  // `dir` is the binding's bound value; on a bare core host the free function
  // `getTextDirection(locale)` from `@comvi/core` answers the same question.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  return (
    <main>
      <h1>{t("app.title")}</h1>

      {/* 1 — locale switcher */}
      <section>
        <h2>{t("app.language")}</h2>
        <div className="row">
          {locales.map((code) => (
            <button
              key={code}
              data-testid={`locale-${code}`}
              aria-pressed={locale === code}
              onClick={() => {
                void setLocale(code);
              }}
            >
              {code}
            </button>
          ))}
          {isLoading && <code>{t("app.loading")}</code>}
        </div>
      </section>

      {/* 2 — a string with a parameter */}
      <section>
        <h2>interpolation</h2>
        <p data-testid="greeting">{t("greeting.hello", { name: "Ada" })}</p>
      </section>

      {/* 3 — an ICU plural, live on a counter */}
      <section>
        <h2>plural</h2>
        <div className="row">
          <button data-testid="cart-dec" onClick={() => setCount((n) => Math.max(0, n - 1))}>
            −
          </button>
          <button data-testid="cart-inc" onClick={() => setCount((n) => n + 1)}>
            +
          </button>
          <span data-testid="cart">{t("cart.items", { count })}</span>
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
              link: <a href="https://comvi.io/docs" target="_blank" rel="noreferrer" />,
            }}
          />
        </p>
      </section>

      {/* 5 — date and number formatting, interpolated as params */}
      <section>
        <h2>formatting</h2>
        <p>
          {t("stats.summary", {
            views: formatNumber(1234567),
            date: formatDate(RELEASED, { dateStyle: "long" }),
          })}
        </p>
      </section>

      {/* 6 — proof the loader is lazy: only the locales you visited are here.
          `getLoadedLocales()` is a plain call, with no `cacheRevision` read
          beside it as solid and svelte need: `useI18n()` has already subscribed
          this component to the revision store, so a catalog landing re-renders
          it and this line is re-read. */}
      <section>
        <h2>lazy loading</h2>
        <p>
          <code data-testid="fetched">
            {t("loader.fetched", { locales: getLoadedLocales().join(", ") })}
          </code>
        </p>
      </section>
    </main>
  );
}
