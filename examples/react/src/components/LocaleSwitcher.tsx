import { useI18n } from "@comvi/react";
import { locales } from "../i18n";

export function LocaleSwitcher() {
  const { t, locale, setLocale, isLoading } = useI18n();

  return (
    <>
      <div className="switcher-row">
        <span className="label" id="language-label">
          {t("app.language")}
        </span>
        <div className="switcher" role="group" aria-labelledby="language-label">
          {locales.map((code) => (
            <button
              key={code}
              data-testid={`locale-${code}`}
              aria-pressed={locale === code}
              onClick={() => void setLocale(code)}
            >
              {code}
            </button>
          ))}
        </div>
        {isLoading && <span className="status">{t("app.loading")}</span>}
      </div>
      <p className="note">{t("demo.rtl.body")}</p>
    </>
  );
}
