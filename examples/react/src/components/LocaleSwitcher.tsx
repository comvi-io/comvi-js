import { useState } from "react";
import { useI18n } from "@comvi/react";
import { locales } from "../i18n";
import { LoadError } from "./LoadError";

export function LocaleSwitcher() {
  const { t, locale, setLocale, isFetching } = useI18n();
  // The locale whose switch failed, if any: its catalog could not be loaded.
  const [failed, setFailed] = useState<string | null>(null);

  // A failed switch keeps the current language on screen, reports the error through
  // onError and resolves with it; calling setLocale() again asks the loader again. A
  // switch a later click overtook resolves with nothing.
  const switchTo = async (code: string) => {
    setFailed(null);
    const failure = await setLocale(code);
    if (failure !== undefined) setFailed(code);
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
