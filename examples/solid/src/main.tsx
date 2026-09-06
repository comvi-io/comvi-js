import { render } from "solid-js/web";
import { I18nProvider } from "@comvi/solid";
import { App } from "./App";
import { i18n } from "./i18n";

// The provider calls `i18n.init()` — which runs the plugins and loads the first
// catalog — and owns the signals every `useI18n()` below it reads.
render(
  () => (
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  ),
  document.getElementById("app")!,
);
