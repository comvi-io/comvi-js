import { useState } from "react";
import { useI18n } from "@comvi/react";
import { locales } from "../i18n";
import { LoadError } from "./LoadError";

export function LocaleSwitcher() {
  const { t, locale, setLocale, isFetching } = useI18n();
  // The locale whose switch failed, if any: its catalog could not be loaded.
  const [failed, setFailed] = useState<string | null>(null);

  // A failed switch keeps the current language on screen, reports the error through
  // onError and rejects; calling setLocale() again asks the loader again.
  const switchTo = (code: string) => {
    setFailed(null);
    setLocale(code).catch(() => setFailed(code));
  };

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
              onClick={() => switchTo(code)}
            >
              {code}
            </button>
          ))}
        </div>
        {isFetching && <span className="status">{t("app.loading")}</span>}
      </div>
      {failed && <LoadError onRetry={() => switchTo(failed)} />}
      <p className="note">{t("demo.rtl.body")}</p>
    </>
  );
}
