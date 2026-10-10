"use client";

import { useEffect, useState } from "react";
import { T, useI18n } from "@comvi/next/client";
import { Link } from "@comvi/next/navigation";
import { Namespaces } from "./Namespaces";

const RELEASED = new Date("2026-09-01T00:00:00Z");

// The counter outlives a locale switch, which here is a navigation to another
// URL and remounts this page. The value is kept in sessionStorage; the first
// mount is a hydration of server HTML that says 2, so it starts at 2 and
// restores after mount, and every later (client-side) mount reads it at once.
const COUNT_KEY = "comvi-example-count";
let hydrated = false;
function storedCount(): number {
  const stored = sessionStorage.getItem(COUNT_KEY);
  const count = stored === null ? Number.NaN : Number(stored);
  return Number.isInteger(count) && count >= 0 ? count : 2;
}

function useCount() {
  const [count, setCount] = useState(() => (hydrated ? storedCount() : 2));
  useEffect(() => {
    if (hydrated) return;
    hydrated = true;
    setCount(storedCount());
  }, []);
  const change = (delta: number) =>
    setCount((n) => {
      const next = Math.max(0, n + delta);
      sessionStorage.setItem(COUNT_KEY, String(next));
      return next;
    });
  return [count, change] as const;
}

/** Shows a tag from the catalog as the translator wrote it, `<link>` and all. */
function TagQuote({ children }: { children?: React.ReactNode }) {
  return (
    <code>
      {"<link>"}
      {children}
      {"</link>"}
    </code>
  );
}

export function Demo() {
  // `useI18n()` subscribes this component to the instance, so everything below
  // re-renders when the locale changes.
  const { t, locale, isLoading, formatNumber, formatDate, getLoadedLocales } = useI18n();
  const [count, change] = useCount();

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
  // the process rather than of this page: rendering it during SSR would print
  // one list on the server and a different one in the browser.
  const [fetched, setFetched] = useState<string[]>([]);
  useEffect(() => {
    setFetched(getLoadedLocales());
  }, [locale, isLoading, getLoadedLocales]);

  return (
    <>
      {/* A string with a parameter. */}
      <section className="card">
        <h2 className="eyebrow">{t("demo.interpolation.title")}</h2>
        <p className="body">{t("demo.interpolation.body")}</p>
        <p className="widget" data-testid="greeting">
          {t("greeting.hello", { name })}
        </p>
      </section>

      {/* An ICU plural, live on a counter. The compiler is named once, in
          `src/i18n/config.ts`: no instance enables ICU on its own. */}
      <section className="card">
        <h2 className="eyebrow">{t("demo.plural.title")}</h2>
        <p className="body">{t("demo.plural.body")}</p>
        <div className="widget counter">
          <button className="square" data-testid="cart-dec" onClick={() => change(-1)}>
            −
          </button>
          <span data-testid="cart">{t("cart.items", { count })}</span>
          <button className="square" data-testid="cart-inc" onClick={() => change(1)}>
            +
          </button>
        </div>
      </section>

      {/* <T> with a tag: the catalog holds <link>…</link>, the app decides what
          that renders as. The card's own sentence quotes the tag, so its
          `<link>` is rendered as code. */}
      <section className="card">
        <h2 className="eyebrow">{t("demo.tags.title")}</h2>
        <p className="body">
          <T i18nKey="demo.tags.body" components={{ link: <TagQuote /> }} />
        </p>
        <p className="widget" data-testid="read-more">
          <T
            i18nKey="docs.read_more"
            components={{
              link: <a href="https://comvi.io/docs" target="_blank" rel="noreferrer" />,
            }}
          />
        </p>
      </section>

      {/* Date and number formatting, interpolated as params. */}
      <section className="card">
        <h2 className="eyebrow">{t("demo.formatting.title")}</h2>
        <p className="body">{t("demo.formatting.body")}</p>
        <p className="widget">
          {t("stats.summary", {
            views: formatNumber(1234567),
            date: formatDate(RELEASED, { dateStyle: "long" }),
          })}
        </p>
      </section>

      {/* Proof the loader is lazy: only the locales this browser has visited
          are here. Each catalog is a dynamic `import()` the SERVER resolves in
          `loadMessages()`, and only the ones you asked for ever cross the
          hydration boundary. Switch language and watch the list grow. */}
      <section className="card">
        <h2 className="eyebrow">{t("demo.lazy.title")}</h2>
        <p className="body">{t("demo.lazy.body")}</p>
        <div className="network">
          <div data-testid="fetched">{t("loader.fetched", { locales: fetched.join(", ") })}</div>
          <Namespaces />
        </div>
      </section>

      {/* Fallback: uk has no `fallback.only_en`, so uk renders the en text; a
          key no catalog has renders as the key itself. */}
      <section className="card">
        <h2 className="eyebrow">{t("demo.fallback.title")}</h2>
        <p className="body">{t("demo.fallback.body")}</p>
        <p className="widget" data-testid="fallback">
          {t("fallback.only_en")}
        </p>
        <p className="widget">
          <code data-testid="missing-key">{t("fallback.nowhere")}</code>
        </p>
      </section>

      {/* A missing parameter renders as its own placeholder. */}
      <section className="card">
        <h2 className="eyebrow">{t("demo.missing.title")}</h2>
        <p className="body">{t("demo.missing.body")}</p>
        <p className="widget" data-testid="missing-param">
          {t("greeting.hello", {})}
        </p>
      </section>

      {/* A second page; <Link> keeps the current locale in the URL. */}
      <section className="card">
        <h2 className="eyebrow">{t("demo.navigation.title")}</h2>
        <p className="body">{t("demo.navigation.body")}</p>
        <p className="widget">
          <Link data-testid="nav-about" href="/about">
            {t("demo.navigation.cta")}
          </Link>
        </p>
      </section>
    </>
  );
}
