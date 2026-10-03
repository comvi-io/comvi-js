import { mount } from "svelte";
import App from "./App.svelte";
import { i18n } from "./i18n";

// `init()` runs the plugins and loads the first catalog. Mounting after it
// resolves means no frame shows a raw key; `setI18nContext` in App.svelte would
// start `init()` on its own, but the page would render keys until it landed.
void i18n.init().then(() => mount(App, { target: document.getElementById("app")! }));
