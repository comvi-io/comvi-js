import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { I18nProvider } from "@comvi/react";
import { Boot, routes } from "./App";
import { i18n } from "./i18n";

const router = createBrowserRouter(routes);

createRoot(document.getElementById("app")!).render(
  <StrictMode>
    {/* `loading` paints until the first catalogs are in, so no frame ever shows a
        raw key. Later loads (a page's namespace, a language switch) keep the app
        on screen. */}
    <I18nProvider i18n={i18n} loading={<Boot />}>
      <RouterProvider router={router} />
    </I18nProvider>
  </StrictMode>,
);
