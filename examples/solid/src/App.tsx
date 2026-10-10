import { createEffect, Show, type ParentProps } from "solid-js";
import { useLocation } from "@solidjs/router";
import { useI18n } from "@comvi/solid";
import { LocaleSwitcher } from "./components/LocaleSwitcher";

/** The layout every route shares: header with the switcher, the page, footer. */
export function App(props: ParentProps) {
  const { t, locale, dir } = useI18n();
  const location = useLocation();
  const isStart = () => location.pathname === "/";

  createEffect(() => {
    document.documentElement.lang = locale();
    document.documentElement.dir = dir();
  });

  return (
    <main>
      <header>
        <h1>{t("app.title")}</h1>
        <p class="intro">{t(isStart() ? "demo.start.intro" : "demo.intro")}</p>
        <LocaleSwitcher />
      </header>

      {props.children}

      <Show when={!isStart()}>
        <footer>
          <a href="https://comvi.io/docs/i18n">{t("demo.footer.docs")}</a>
          <a href="https://github.com/comvi-io/comvi-js/tree/main/examples/solid">
            {t("demo.footer.source")}
          </a>
          <span class="install">
            {t("demo.footer.install")} <code>npm i @comvi/solid</code>
          </span>
        </footer>
      </Show>
    </main>
  );
}
