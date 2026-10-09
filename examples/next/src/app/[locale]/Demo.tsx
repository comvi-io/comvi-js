"use client";

import { useEffect, useState } from "react";
import { T, useI18n } from "@comvi/next/client";
import { Link } from "@comvi/next/navigation";
import { LocaleSwitcher } from "./LocaleSwitcher";

const RELEASED = new Date("2026-09-01T00:00:00Z");

export function Demo() {
  // `useI18n()` subscribes this component to the instance, so everything below
  // re-renders when the locale changes.
  const { t, locale, isLoading, formatNumber, formatDate, getLoadedLocales } = useI18n();
  const [count, setCount] = useState(2);

  // The greeting's `{name}`: "Ada", or `?name=…` from the address bar, read
  // after mount because these pages are prerendered and the server never sees
  // the query. Whatever arrives there is a parameter, and a parameter is
  // rendered as text, never as markup: try `?name=<b>Grace</b>`.
  const [name, setName] = useState("Ada");
  useEffect(() => {
    const fromQuery = new URLSearchParams(location.search).get("name");
    if (fromQuery !== null) setName(fromQuery);
  }, []);

  // A marker for the e2e suite: set once React has hydrated this tree, so a
  // test can tell the server's HTML from the live page.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  // Read AFTER mount, on purpose. On the server the instance is one module-scope
  // instance shared by every request, so its loaded-catalog set is a property of
  // the process rather than of this page — rendering it during SSR would print
  // one number on the server and a different one in the browser.
  const [fetched, setFetched] = useState<string[]>([]);
  useEffect(() => {
    setFetched(getLoadedLocales());
  }, [locale, isLoading, getLoadedLocales]);

  return (
    <>
      {/* 1 — locale switcher */}
      <LocaleSwitcher />

      {/* 2 — a string with a parameter */}
      <section>
        <h2>interpolation</h2>
        <p data-testid="greeting">{t("greeting.hello", { name })}</p>
      </section>

      {/* 3 — an ICU plural, live on a counter. The compiler is named once, in
          `src/i18n/config.ts`: no instance enables ICU on its own. */}
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
          what that renders as. */}
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

      {/* 6 — proof the loader is lazy: only the locales this browser has visited
          are here. Each catalog is a dynamic `import()` the SERVER resolves in
          `loadMessages()`, and only the ones you asked for ever cross the
          hydration boundary. Switch language and watch the list grow. */}
      <section>
        <h2>lazy loading</h2>
        <p>
          <code data-testid="fetched">{t("loader.fetched", { locales: fetched.join(", ") })}</code>
        </p>
      </section>

      {/* 7 — a second page; <Link> keeps the current locale in the URL */}
      <section>
        <h2>navigation</h2>
        <p>
          <Link data-testid="nav-about" href="/about">
            {t("nav.about")}
          </Link>
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
  );
}
