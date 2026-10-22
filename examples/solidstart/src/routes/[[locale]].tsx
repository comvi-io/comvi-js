import { createEffect, createResource, For, Show, type ParentProps } from "solid-js";
import { useLocation, useParams, type RouteDefinition } from "@solidjs/router";
import { createI18n, I18nProvider, icuCompiler, useI18n } from "@comvi/solid";
import { catalogLoader, fallbackLocale, loadI18n, localePath, locales } from "~/lib/i18n";

// A first segment outside `locales` falls through to [...404].tsx.
export const route = {
  matchFilters: { locale: locales },
} satisfies RouteDefinition;

export default function LocaleLayout(props: ParentProps) {
  const params = useParams();
  // Keyed on the URL's locale: a link to /uk loads uk's payload. The fetcher
  // is an arrow so the previous payload is not posted back to the server.
  const [data] = createResource(
    () => params.locale ?? fallbackLocale,
    (locale) => loadI18n(locale),
    { deferStream: true },
  );

  return (
    <Show when={data()} keyed>
      {(ready) => {
        const i18n = createI18n({
          locale: ready.locale,
          fallbackLocale,
          compiler: icuCompiler,
          messages: ready.messages,
        }).use(catalogLoader());
        return (
          <I18nProvider i18n={i18n} ssrLocale={ready.locale}>
            <Shell>{props.children}</Shell>
          </I18nProvider>
        );
      }}
    </Show>
  );
}

function Shell(props: ParentProps) {
  const { t, locale, dir } = useI18n();
  const params = useParams();
  const location = useLocation();

  createEffect(() => {
    document.documentElement.lang = locale();
    document.documentElement.dir = dir();
  });

  // This page's path without its locale prefix, for the switcher's links.
  const path = () =>
    (params.locale ? location.pathname.slice(params.locale.length + 1) : location.pathname) || "/";

  return (
    <main>
      <header>
        <h1>{t("app.title")}</h1>
        <nav class="switcher" aria-label={t("app.language")}>
          <For each={locales}>
            {(code) => (
              <a
                href={localePath(code, path())}
                data-testid={`locale-${code}`}
                aria-current={locale() === code ? "page" : undefined}
              >
                {code}
              </a>
            )}
          </For>
        </nav>
      </header>
      {props.children}
    </main>
  );
}
