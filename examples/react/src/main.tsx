import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { I18nProvider } from "@comvi/react";
import { App } from "./App";
import { i18n } from "./i18n";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    {/* The provider starts `i18n.init()` and paints `fallback` until the first
        catalog is in, so no frame ever shows a raw key. */}
    <I18nProvider i18n={i18n} fallback={<p>Loading…</p>}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
