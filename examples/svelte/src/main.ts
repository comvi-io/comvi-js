import { mount } from "svelte";
import App from "./App.svelte";
import { i18n } from "./i18n";

// The page shows a wordless spinner (index.html) until the first catalogs are in,
// so no frame ever shows a raw key. Later loads (a page's namespace, a language
// switch) keep the app on screen.
const target = document.getElementById("app")!;
i18n.ready.then(() => {
  target.replaceChildren();
  mount(App, { target });
});
