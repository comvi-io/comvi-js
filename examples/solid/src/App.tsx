import { createEffect, For, Show, type ParentProps } from "solid-js";
import { useI18n } from "@comvi/solid";
import { locales, rtlLocale } from "./i18n";

/** The layout every route shares: header with the switcher, the page, footer. */
export function App(props: ParentProps) {
  // `useI18n()` builds its signals from the provider's, so it MUST be called
  // inside a component (a reactive context) — never at module scope.
  const { t, locale, setLocale, dir, isLoading } = useI18n();

  createEffect(() => {
    document.documentElement.lang = locale();
    document.documentElement.dir = dir();
  });

  return (
    <main>
      <header>
        <h1>{t("app.title")}</h1>
        <p class="intro">{t("demo.intro")}</p>
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
          {/* Not in the switcher: the right-to-left locale the e2e suite uses. */}
          <button
            hidden
            data-testid={`locale-${rtlLocale}`}
            onClick={() => void setLocale(rtlLocale)}
          >
            {rtlLocale}
          </button>
          <Show when={isLoading()}>
            <span class="status">{t("app.loading")}</span>
          </Show>
        </div>
      </header>

      {props.children}

      <footer>
        <a href="https://comvi.io/docs/i18n">{t("demo.footer.docs")}</a>
        <a href="https://github.com/comvi-io/comvi-js/tree/main/examples/solid">
          {t("demo.footer.source")}
        </a>
        <span class="install">
          {t("demo.footer.install")} <code>npm i @comvi/solid</code>
        </span>
      </footer>
    </main>
  );
}
