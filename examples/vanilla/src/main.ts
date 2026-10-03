import { createElement, formatDate, formatNumber, getTextDirection } from "@comvi/core";
import type { TranslationResult } from "@comvi/core";
import { i18n, locales } from "./i18n";

const RELEASED = new Date("2026-09-01T00:00:00Z");
const root = document.getElementById("app")!;

let count = 2;
let isLoading = false;

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

/** A prose row: a heading and a paragraph, as in the four framework examples. */
function section(heading: string, body: Node | string, testId?: string): HTMLElement {
  const el = document.createElement("section");
  const h2 = document.createElement("h2");
  h2.textContent = heading;
  const p = document.createElement("p");
  if (testId) p.dataset.testid = testId;
  p.append(body);
  el.append(h2, p);
  return el;
}

/** The two rows that hold controls, which the shared stylesheet lays out flat. */
function controlSection(heading: string, ...body: Array<Node | string>): HTMLElement {
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
  button.dataset.testid = `locale-${code}`;
  button.setAttribute("aria-pressed", String(i18n.locale === code));
  // `setLocaleAsync` resolves once the catalog for the new locale has landed,
  // so there is no frame where the UI shows the old text under the new locale.
  // The gap before it resolves is a real fetch, and the other four examples
  // render `isLoading` through it — this is the hand-rolled equivalent, set
  // before the promise and cleared when it settles.
  button.onclick = () => {
    isLoading = true;
    render();
    void i18n.setLocaleAsync(code).finally(() => {
      isLoading = false;
      render();
    });
  };
  return button;
}

function counterButton(label: string, delta: number, testId: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  button.dataset.testid = testId;
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
  fetched.dataset.testid = "fetched";
  fetched.textContent = i18n.t("loader.fetched", {
    locales: i18n.getLoadedLocales().join(", "),
  });

  const cart = document.createElement("span");
  cart.dataset.testid = "cart";
  cart.textContent = i18n.t("cart.items", { count });

  const switcher: Array<Node | string> = locales.map(localeButton);
  if (isLoading) {
    const loading = document.createElement("code");
    loading.textContent = i18n.t("app.loading");
    switcher.push(loading);
  }

  root.replaceChildren(
    title,
    // 1 — locale switcher
    controlSection(i18n.t("app.language"), ...switcher),
    // 2 — a string with a parameter
    section("interpolation", i18n.t("greeting.hello", { name: "Ada" }), "greeting"),
    // 3 — an ICU plural, live on a counter
    controlSection(
      "plural",
      counterButton("−", -1, "cart-dec"),
      counterButton("+", 1, "cart-inc"),
      cart,
    ),
    section("tag interpolation", tagLine, "read-more"),
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
