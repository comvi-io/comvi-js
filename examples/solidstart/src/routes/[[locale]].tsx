import { createEffect, For, type ParentProps } from "solid-js";
import { useLocation, useParams, type RouteDefinition } from "@solidjs/router";
import { I18nProvider, useI18n } from "@comvi/solid";
import { fallbackLocale, i18nFor, localePath, locales } from "~/lib/i18n";

// A first segment outside `locales` falls through to [...404].tsx.
export const route = {
  matchFilters: { locale: locales },
} satisfies RouteDefinition;

export default function LocaleLayout(props: ParentProps) {
  const params = useParams();
  const i18n = i18nFor(params.locale ?? fallbackLocale);

  // A client navigation to /uk: keeps the page on screen until uk's catalogs are in. On the
  // first run the instance is already in this locale, which costs nothing.
  // Only a real switch: the first render's locale is in place, and a switch would ask again for what
  // failed on the server.
  createEffect(() => {
    const locale = params.locale ?? fallbackLocale;
    if (locale != i18n.locale) i18n.setLocale(locale).catch(() => {});
  });

  return (
    <I18nProvider i18n={i18n}>
      <Shell>{props.children}</Shell>
    </I18nProvider>
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
