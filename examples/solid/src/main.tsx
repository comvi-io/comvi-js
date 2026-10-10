import { render } from "solid-js/web";
import { Route, Router } from "@solidjs/router";
import { I18nProvider } from "@comvi/solid";
import { App } from "./App";
import { Start } from "./pages/Start";
import { Features } from "./pages/Features";
import { Account } from "./pages/Account";
import { i18n } from "./i18n";

// The provider starts loading the first catalog and shows `fallback` until it
// is in, so no frame renders a raw key.
render(
  () => (
    <I18nProvider i18n={i18n} fallback={<div class="boot" role="status" aria-busy="true" />}>
      <Router root={App}>
        <Route path="/" component={Start} />
        <Route path="/features" component={Features} />
        <Route path="/about" component={Account} />
      </Router>
    </I18nProvider>
  ),
  document.getElementById("app")!,
);
