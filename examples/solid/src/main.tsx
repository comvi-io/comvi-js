import { render } from "solid-js/web";
import { Route, Router } from "@solidjs/router";
import { I18nProvider } from "@comvi/solid";
import { App } from "./App";
import { Start } from "./pages/Start";
import { Features } from "./pages/Features";
import { Account } from "./pages/Account";
import { i18n } from "./i18n";

// `loading` shows until the first catalogs are in, so no frame renders a raw key.
// Later loads (a page's namespace, a language switch) keep the app on screen.
render(
  () => (
    <I18nProvider i18n={i18n} loading={<div class="boot" role="status" aria-busy="true" />}>
      <Router root={App}>
        <Route path="/" component={Start} />
        <Route path="/features" component={Features} />
        {/* The page loads its own namespace (pages/Account.tsx). */}
        <Route path="/about" component={Account} />
      </Router>
    </I18nProvider>
  ),
  document.getElementById("app")!,
);
