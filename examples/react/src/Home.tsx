import { useState } from "react";
import { Link } from "react-router";
import { T, useI18n } from "@comvi/react";
import { Card } from "./Card";

const RELEASED = new Date("2026-09-01T00:00:00Z");

export function Home({ name }: { name: string }) {
  const { t, formatNumber, formatDate, getLoadedLocales, getActiveNamespaces } = useI18n();
  const [count, setCount] = useState(2);

  return (
    <div className="cards">
      {/* A string with a parameter */}
      <Card feature="interpolation">
        <p className="widget" data-testid="greeting">
          {t("greeting.hello", { name })}
        </p>
      </Card>

      {/* An ICU plural, live on a counter */}
      <Card feature="plural">
        <div className="counter widget">
          <button data-testid="cart-dec" onClick={() => setCount((n) => Math.max(0, n - 1))}>
            −
          </button>
          <button data-testid="cart-inc" onClick={() => setCount((n) => n + 1)}>
            +
          </button>
          <span data-testid="cart">{t("cart.items", { count })}</span>
        </div>
      </Card>

      {/* <T> with a tag: the catalog holds <link>…</link>, the app decides what
          that renders as. The tag grammar travels per call, so plain `t()`
          elsewhere is unaffected. */}
      <Card feature="tags">
        <p className="widget" data-testid="read-more">
          <T
            i18nKey="docs.read_more"
            components={{
              link: <a href="https://comvi.io/docs" target="_blank" rel="noreferrer" />,
            }}
          />
        </p>
      </Card>

      {/* Date and number formatting, interpolated as params */}
      <Card feature="formatting">
        <p className="widget">
          {t("stats.summary", {
            views: formatNumber(1234567),
            date: formatDate(RELEASED, { dateStyle: "long" }),
          })}
        </p>
      </Card>

      {/* Proof the loader is lazy: only the locales you visited are here, and
          only the namespaces something activated. Plain calls: `useI18n()` has
          already subscribed this component, so a catalog landing re-renders it. */}
      <Card feature="lazy">
        <div className="net">
          <code data-testid="fetched">
            {t("loader.fetched", { locales: getLoadedLocales().join(", ") })}
          </code>
          <code>{t("demo.lazy.namespaces", { namespaces: getActiveNamespaces().join(", ") })}</code>
        </div>
      </Card>

      {/* Fallback: uk has no `fallback.only_en`, so uk renders the en text; a
          key no catalog has renders as the key itself */}
      <Card feature="fallback">
        <p className="widget" data-testid="fallback">
          {t("fallback.only_en")}
        </p>
        <p className="widget">
          <code data-testid="missing-key">{t("fallback.nowhere")}</code>
        </p>
      </Card>

      {/* A missing parameter renders as its own placeholder */}
      <Card feature="missing">
        <p className="widget" data-testid="missing-param">
          {t("greeting.hello", {})}
        </p>
      </Card>

      {/* A second route; the locale is not part of the path here */}
      <Card feature="navigation">
        <p className="widget">
          <Link data-testid="nav-about" to="/about">
            {t("demo.navigation.cta")}
          </Link>
        </p>
      </Card>
    </div>
  );
}
