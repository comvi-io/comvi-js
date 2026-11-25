import { createSignal, For, Show } from "solid-js";
import { useI18n } from "@comvi/solid";
import { locales } from "../i18n";
import { LoadError } from "./LoadError";

export function LocaleSwitcher() {
  const { t, locale, setLocale, isLoading } = useI18n();
  // The locale whose switch failed, if any: its catalog could not be loaded.
  const [failed, setFailed] = createSignal<string | null>(null);

  // A failed switch keeps the current language on screen, reports the error through
  // onError and rejects; calling setLocale() again asks the loader again.
  const switchTo = (code: string) => {
    setFailed(null);
    setLocale(code).catch(() => setFailed(code));
  };

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
                onClick={() => switchTo(code)}
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
      <Show when={failed()}>{(code) => <LoadError onRetry={() => switchTo(code())} />}</Show>
      <p class="note">{t("demo.rtl.body")}</p>
    </>
  );
}
