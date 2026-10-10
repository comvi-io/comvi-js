import { getTextDirection } from "@comvi/core";
import { i18n } from "./i18n";
import { aboutPage, featuresPage, startPage } from "./components/pages";
import { currentRoute, onRouteChange } from "./router";
import { subscribe } from "./state";

const root = document.getElementById("app")!;

const pages = { start: startPage, features: featuresPage, about: aboutPage };

let shown = currentRoute();
const focusable = () => [...root.querySelectorAll<HTMLElement>("a, button, input")];

function render(): void {
  // The page is rebuilt on every change. Note which control had the focus, by
  // position, and give it back, so keyboard users stay where they were.
  const route = currentRoute();
  const focused = route === shown ? focusable().indexOf(document.activeElement as HTMLElement) : -1;
  shown = route;
  document.documentElement.lang = i18n.locale;
  // `rtl` for Arabic: the stylesheet uses logical properties, so the layout mirrors.
  document.documentElement.dir = getTextDirection(i18n.locale);
  root.replaceChildren(...pages[route]());
  if (focused >= 0) focusable()[focused]?.focus();
}

subscribe(render);
onRouteChange(render);
// `init()` lets the locale detector pick the starting locale and loads its catalog.
void i18n.init().then(render);
