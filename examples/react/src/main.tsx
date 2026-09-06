import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@comvi/react";
import { App } from "./App";
import { i18n } from "./i18n";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    {/* The provider calls `i18n.init()` on mount, which runs the plugins and
        loads the first catalog. */}
    <I18nProvider i18n={i18n}>
      <App />
    </I18nProvider>
  </StrictMode>,
);
