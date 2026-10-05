"use client";

import { useI18n } from "@comvi/next/client";
import { useLocalizedRouter, usePathname } from "@comvi/next/navigation";
import { locales, rtlLocale } from "@/i18n/config";

/** The locale switcher, shared by the demo page and the second page. */
export function LocaleSwitcher() {
  const { t, locale, isLoading } = useI18n();

  // The locale lives in the URL here, so the switcher NAVIGATES rather than
  // calling `setLocale`: `usePathname()` is the path with the locale prefix
  // already removed, and `useLocalizedRouter().push(path, locale)` puts the new
  // one back on. <I18nProvider locale> then syncs `i18n.locale` on arrival.
  const pathname = usePathname();
  const router = useLocalizedRouter();

  return (
    <section>
      <h2>{t("app.language")}</h2>
      <div className="row">
        {locales.map((code) => (
          <button
            key={code}
            data-testid={`locale-${code}`}
            aria-pressed={locale === code}
            onClick={() => {
              router.push(pathname, code);
            }}
          >
            {code}
          </button>
        ))}
        {/* Not in the switcher: the right-to-left locale the e2e suite uses. */}
        <button
          hidden
          data-testid={`locale-${rtlLocale}`}
          onClick={() => {
            router.push(pathname, rtlLocale);
          }}
        >
          {rtlLocale}
        </button>
        {isLoading && <code>{t("app.loading")}</code>}
      </div>
    </section>
  );
}
