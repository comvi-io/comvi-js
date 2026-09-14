"use client";

import { useEffect, useState } from "react";
import { T, useI18n } from "@comvi/next/client";
import { useLocalizedRouter, usePathname } from "@comvi/next/navigation";
import { locales } from "@/i18n/config";

const RELEASED = new Date("2026-09-01T00:00:00Z");

export function Demo() {
  // `useI18n()` subscribes this component to the instance, so everything below
  // re-renders when the locale changes.
  const { t, locale, isLoading, formatNumber, formatDate, getLoadedLocales } = useI18n();
  const [count, setCount] = useState(2);

  // The locale lives in the URL here, so the switcher NAVIGATES rather than
  // calling `setLocale`: `usePathname()` is the path with the locale prefix
  // already removed, and `useLocalizedRouter().push(path, locale)` puts the new
  // one back on. <I18nProvider locale> then syncs `i18n.locale` on arrival.
  const pathname = usePathname();
  const router = useLocalizedRouter();

  // Read AFTER mount, on purpose. On the server the host is one module-scope
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
      <section>
        <h2>{t("app.language")}</h2>
        <div className="row">
          {locales.map((code) => (
            <button
              key={code}
              aria-pressed={locale === code}
              onClick={() => {
                router.push(pathname, code);
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
        <p>{t("greeting.hello", { name: "Ada" })}</p>
      </section>

      {/* 3 — an ICU plural, live on a counter. The compiler is named once, in
          `src/i18n/config.ts`: no host enables ICU on its own. */}
      <section>
        <h2>plural</h2>
        <div className="row">
          <button onClick={() => setCount((n) => Math.max(0, n - 1))}>−</button>
          <button onClick={() => setCount((n) => n + 1)}>+</button>
          <span>{t("cart.items", { count })}</span>
        </div>
      </section>

      {/* 4 — <T> with a tag: the catalog holds <link>…</link>, the app decides
          what that renders as. */}
      <section>
        <h2>tag interpolation</h2>
        <p>
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
          `loadTranslations()`, and only the ones you asked for ever cross the
          hydration boundary. Switch language and watch the list grow. */}
      <section>
        <h2>lazy loading</h2>
        <p>
          <code>{t("loader.fetched", { locales: fetched.join(", ") })}</code>
        </p>
      </section>
    </>
  );
}
