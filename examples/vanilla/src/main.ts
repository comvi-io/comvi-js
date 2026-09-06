import { createElement, formatDate, formatNumber, getTextDirection } from "@comvi/core";
import type { TranslationResult } from "@comvi/core";
import { i18n, locales } from "./i18n";

const RELEASED = new Date("2026-09-01T00:00:00Z");
const root = document.getElementById("app")!;

let count = 2;

/**
 * The framework-agnostic half of rich text: `tRaw()` returns virtual nodes, and
 * this is the twenty lines a framework binding would otherwise write for you.
 */
function toDom(result: TranslationResult): Node[] {
  const parts = typeof result === "string" ? [result] : result;
  return parts.map((part) => {
    if (typeof part === "string") return document.createTextNode(part);
    if (part.type === "text") return document.createTextNode(part.text);
    if (part.type === "fragment") {
      const fragment = document.createDocumentFragment();
      fragment.append(...toDom(part.children));
      return fragment;
    }
    const element = document.createElement(part.tag);
    for (const [name, value] of Object.entries(part.props)) {
      element.setAttribute(name, String(value));
    }
    element.append(...toDom(part.children));
    return element;
  });
}

function section(heading: string, ...body: Array<Node | string>): HTMLElement {
  const el = document.createElement("section");
  const h2 = document.createElement("h2");
  h2.textContent = heading;
  const row = document.createElement("div");
  row.className = "row";
  row.append(...body);
  el.append(h2, row);
  return el;
}

function localeButton(code: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = code;
  button.setAttribute("aria-pressed", String(i18n.locale === code));
  // `setLocaleAsync` resolves once the catalog for the new locale has landed,
  // so there is no frame where the UI shows the old text under the new locale.
  button.onclick = () => {
    void i18n.setLocaleAsync(code).then(render);
  };
  return button;
}

function counterButton(label: string, delta: number): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  button.onclick = () => {
    count = Math.max(0, count + delta);
    render();
  };
  return button;
}

function render(): void {
  document.documentElement.lang = i18n.locale;
  // A free function from `@comvi/core` — the base host has no `dir` member;
  // the framework bindings expose a bound one built on top of this.
  document.documentElement.dir = getTextDirection(i18n.locale);

  const title = document.createElement("h1");
  title.textContent = i18n.t("app.title");

  const tagLine = document.createElement("span");
  tagLine.append(
    // 4 — a tag in the catalog, resolved by a handler passed as a param. The
    // handler is what makes `<link>` an `<a>`; without one the tag falls back
    // to its inner text.
    ...toDom(
      i18n.tRaw("docs.read_more", {
        link: ({ children }) =>
          createElement(
            "a",
            { href: "https://comvi.io/docs", target: "_blank", rel: "noreferrer" },
            typeof children === "string" ? [children] : children,
          ),
      }),
    ),
  );

  const fetched = document.createElement("code");
  fetched.textContent = i18n.t("loader.fetched", {
    locales: i18n.getLoadedLocales().join(", "),
  });

  root.replaceChildren(
    title,
    // 1 — locale switcher
    section(i18n.t("app.language"), ...locales.map(localeButton)),
    // 2 — a string with a parameter
    section("interpolation", i18n.t("greeting.hello", { name: "Ada" })),
    // 3 — an ICU plural, live on a counter
    section(
      "plural",
      counterButton("−", -1),
      counterButton("+", 1),
      i18n.t("cart.items", { count }),
    ),
    section("tag interpolation", tagLine),
    // 5 — date and number formatting. Free functions again: they take the host
    // as their first argument and read its current locale.
    section(
      "formatting",
      i18n.t("stats.summary", {
        views: formatNumber(i18n, 1234567),
        date: formatDate(i18n, RELEASED, { dateStyle: "long" }),
      }),
    ),
    // 6 — proof the loader is lazy: only the locales you visited are here
    section("lazy loading", fetched),
  );
}

// `init()` runs the plugins (the locale detector picks the starting locale) and
// loads the first catalog.
void i18n.init().then(render);
