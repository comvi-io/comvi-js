"use client";

import { useI18n } from "@comvi/next/client";
import { useLocalizedRouter, usePathname } from "@comvi/next/navigation";
import { locales } from "@/i18n/routing";

export function LocaleSwitcher() {
  const { t, locale, isLoading } = useI18n();

  // The locale lives in the URL, so switching navigates: `usePathname()` is the
  // path without its locale prefix, and `push(path, locale)` adds the new one.
  const pathname = usePathname();
  const router = useLocalizedRouter();

  return (
    <div className="switcher-row">
      <span className="label">{t("app.language")}</span>
      <div className="switcher" role="group" aria-label={t("app.language")}>
        {locales.map((code) => (
          <button
            key={code}
            data-testid={`locale-${code}`}
            aria-pressed={locale === code}
            onClick={() => router.push(pathname, code)}
          >
            {code}
          </button>
        ))}
      </div>
      {/* Last in the row, so its text appears and goes without moving anything. */}
      {isLoading && <span className="loading">{t("app.loading")}</span>}
    </div>
  );
}
