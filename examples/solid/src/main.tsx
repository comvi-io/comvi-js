import { render } from "solid-js/web";
import { Route, Router } from "@solidjs/router";
import { I18nProvider } from "@comvi/solid";
import { App } from "./App";
import { Home } from "./Home";
import { Account } from "./Account";
import { i18n } from "./i18n";

// The provider calls `i18n.init()` — which runs the plugins and loads the first
// catalog — and owns the signals every `useI18n()` below it reads. `fallback`
// paints until the lazy catalog is in, so no frame shows raw keys.
//
// The router sits inside the provider: `App` is the layout every route shares
// (header, switcher, footer), and the locale is not part of the path.
render(
  () => (
    <I18nProvider i18n={i18n} fallback={<p>Loading…</p>}>
      <Router root={App}>
        <Route path="/" component={Home} />
        <Route path="/about" component={Account} />
      </Router>
    </I18nProvider>
  ),
  document.getElementById("app")!,
);
