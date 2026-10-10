import { getTextDirection } from "@comvi/core";
import { i18n } from "./i18n";
import { aboutPage, homePage } from "./components/pages";
import { currentRoute, onRouteChange } from "./router";
import { subscribe } from "./state";

const root = document.getElementById("app")!;

function render(): void {
  document.documentElement.lang = i18n.locale;
  // `rtl` for Arabic: the stylesheet uses logical properties, so the layout mirrors.
  document.documentElement.dir = getTextDirection(i18n.locale);
  root.replaceChildren(...(currentRoute() === "about" ? aboutPage() : homePage()));
}

subscribe(render);
onRouteChange(render);
// `init()` lets the locale detector pick the starting locale and loads its catalog.
void i18n.init().then(render);
