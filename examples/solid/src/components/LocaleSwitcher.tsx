import { For, Show } from "solid-js";
import { useI18n } from "@comvi/solid";
import { locales } from "../i18n";

export function LocaleSwitcher() {
  const { t, locale, setLocale, isLoading } = useI18n();

  return (
    <>
      <div class="switcher">
        <span class="eyebrow" id="language-label">
          {t("app.language")}
        </span>
        <div class="segmented" role="group" aria-labelledby="language-label">
          <For each={locales}>
            {(code) => (
              <button
                data-testid={`locale-${code}`}
                aria-pressed={locale() === code}
                onClick={() => void setLocale(code)}
              >
                {code.toUpperCase()}
              </button>
            )}
          </For>
        </div>
        <Show when={isLoading()}>
          <span class="status">{t("app.loading")}</span>
        </Show>
      </div>
      <p class="note">{t("demo.rtl.body")}</p>
    </>
  );
}
