import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { I18nProvider } from "@comvi/react";
import { App } from "./App";
import { i18n } from "./i18n";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    {/* `loading` paints until the first catalog is in, so no frame ever shows a
        raw key. No catalog means no words yet, so it is a wordless spinner. */}
    <I18nProvider i18n={i18n} loading={<div className="boot" role="status" aria-busy="true" />}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
