import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { I18nProvider } from "@comvi/react";
import { App } from "./App";
import { i18n } from "./i18n";

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    {/* The provider calls `i18n.init()` on mount, which runs the plugins and
        loads the first catalog. */}
    {/* `fallback` paints until the lazy catalog is in, so no frame shows raw keys. */}
    <I18nProvider i18n={i18n} fallback={<p>Loading…</p>}>
      {/* The router knows nothing about the locale: it is not part of the
          path here, so a navigation keeps whatever the switcher chose. */}
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
);
