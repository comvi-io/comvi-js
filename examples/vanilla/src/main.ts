import { createElement, formatDate, formatNumber, getTextDirection } from "@comvi/core";
import type { TranslationResult } from "@comvi/core";
import { i18n, locales, rtlLocale } from "./i18n";
import { currentRoute, link, onRouteChange } from "./router";

const RELEASED = new Date("2026-09-01T00:00:00Z");
const SOURCE = "https://github.com/comvi-io/comvi-js/tree/main/examples/vanilla";

// The greeting's `{name}`: "Ada", or `?name=…` from the address bar. Whatever
// arrives there is a parameter, and a parameter is rendered as text, never as
// markup: try `?name=<b>Grace</b>`.
const name = new URLSearchParams(location.search).get("name") ?? "Ada";
const root = document.getElementById("app")!;

let count = 2;
let isLoading = false;
let route = currentRoute();
onRouteChange((next) => {
  route = next;
  render();
});

// A second namespace, `account`, fetched the first time the Account page is
// shown. `addActiveNamespace` loads it for the current locale and keeps it
// active, so a later `setLocale` brings `account` along with the default
// namespace before the new locale applies. Until it settles its keys would
// render as themselves, so the rows wait. Settle, not succeed: a load that
// failed has already reached `onError`, and the keys then show as they would
// for any missing translation.
let accountRequested = false;
let accountReady = false;
function activateAccount(): void {
  if (accountRequested) return;
  accountRequested = true;
  const done = () => {
    accountReady = true;
    render();
  };
  i18n.addActiveNamespace("account").then(done, done);
}

/** `h("p", { class: "x" }, child, …)`: just enough of a DOM builder for one page. */
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  element.append(...children);
  return element;
}

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
    for (const [key, value] of Object.entries(part.props)) {
      element.setAttribute(key, String(value));
    }
    element.append(...toDom(part.children));
    return element;
  });
}

/** One feature: its name, one sentence about it, and the live widget. */
function card(feature: string, ...widget: Array<Node | string>): HTMLElement {
  return h(
    "section",
    { class: "card" },
    h("h2", { class: "eyebrow" }, i18n.t(`demo.${feature}.title`)),
    h("p", { class: "body" }, i18n.t(`demo.${feature}.body`)),
    ...widget,
  );
}

function localeButton(code: string): HTMLButtonElement {
  const button = h(
    "button",
    { "data-testid": `locale-${code}`, "aria-pressed": String(i18n.locale === code) },
    code,
  );
  // `setLocale` resolves once the catalog for the new locale has landed, so
  // there is no frame where the UI shows the old text under the new locale.
  // The gap before it resolves is a real fetch, and the framework examples
  // render `isLoading` through it: this is the hand-rolled equivalent.
  button.onclick = () => {
    isLoading = true;
    render();
    void i18n.setLocale(code).finally(() => {
      isLoading = false;
      render();
    });
  };
  return button;
}

function counterButton(label: string, delta: number, testId: string): HTMLButtonElement {
  const button = h("button", { class: "square", "data-testid": testId }, label);
  button.onclick = () => {
    count = Math.max(0, count + delta);
    render();
  };
  return button;
}

function header(): HTMLElement {
  // Not in the switcher: the right-to-left locale the e2e suite uses.
  const rtl = localeButton(rtlLocale);
  rtl.hidden = true;
  return h(
    "header",
    {},
    h("h1", {}, i18n.t("app.title")),
    h("p", { class: "intro" }, i18n.t("demo.intro")),
    h(
      "div",
      { class: "switcher-row" },
      h("span", { class: "label" }, i18n.t("app.language")),
      h(
        "div",
        { class: "switcher", role: "group", "aria-label": i18n.t("app.language") },
        ...locales.map(localeButton),
        rtl,
      ),
      // Last in the row, so its text appears and goes without moving anything.
      ...(isLoading ? [h("span", { class: "loading" }, i18n.t("app.loading"))] : []),
    ),
  );
}

function namespacesLine(): HTMLElement {
  return h(
    "div",
    {},
    i18n.t("demo.lazy.namespaces", { namespaces: i18n.getActiveNamespaces().join(", ") }),
  );
}

function footer(): HTMLElement {
  return h(
    "footer",
    {},
    h("a", { href: "https://comvi.io/docs/i18n" }, i18n.t("demo.footer.docs")),
    h("a", { href: SOURCE }, i18n.t("demo.footer.source")),
    h("span", {}, i18n.t("demo.footer.install"), " ", h("code", {}, "npm i @comvi/core")),
  );
}

function homePage(): Node[] {
  // A tag in the catalog, resolved by a handler passed as a param. The handler
  // is what makes `<link>` an `<a>`; without one the tag falls back to its
  // inner text.
  const readMore = h(
    "p",
    { class: "widget", "data-testid": "read-more" },
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
  // The card's own sentence quotes the `<link>` tag. Tags are ambient here (see
  // i18n.ts), so the quote gets a handler too: it shows the tag as code.
  const tagsBody = h(
    "p",
    { class: "body" },
    ...toDom(
      i18n.tRaw("demo.tags.body", {
        link: ({ children }) =>
          createElement("code", {}, [
            "<link>",
            ...(typeof children === "string" ? [children] : children),
            "</link>",
          ]),
      }),
    ),
  );

  return [
    header(),
    // A string with a parameter.
    card(
      "interpolation",
      h("p", { class: "widget", "data-testid": "greeting" }, i18n.t("greeting.hello", { name })),
    ),
    // An ICU plural, live on a counter.
    card(
      "plural",
      h(
        "div",
        { class: "widget counter" },
        counterButton("−", -1, "cart-dec"),
        h("span", { "data-testid": "cart" }, i18n.t("cart.items", { count })),
        counterButton("+", 1, "cart-inc"),
      ),
    ),
    h(
      "section",
      { class: "card" },
      h("h2", { class: "eyebrow" }, i18n.t("demo.tags.title")),
      tagsBody,
      readMore,
    ),
    // Free functions: they take the instance as their first argument and read
    // its current locale.
    card(
      "formatting",
      h(
        "p",
        { class: "widget" },
        i18n.t("stats.summary", {
          views: formatNumber(i18n, 1234567),
          date: formatDate(i18n, RELEASED, { dateStyle: "long" }),
        }),
      ),
    ),
    // Proof the loader is lazy: only the locales you visited are here.
    card(
      "lazy",
      h(
        "div",
        { class: "network" },
        h(
          "div",
          { "data-testid": "fetched" },
          i18n.t("loader.fetched", { locales: i18n.getLoadedLocales().join(", ") }),
        ),
        namespacesLine(),
      ),
    ),
    // uk has no `fallback.only_en`, so uk renders the en text; a key no
    // catalog has renders as the key itself.
    card(
      "fallback",
      h("p", { class: "widget", "data-testid": "fallback" }, i18n.t("fallback.only_en")),
      h(
        "p",
        { class: "widget" },
        h("code", { "data-testid": "missing-key" }, i18n.t("fallback.nowhere")),
      ),
    ),
    // A missing parameter renders as its own placeholder.
    card(
      "missing",
      h("p", { class: "widget", "data-testid": "missing-param" }, i18n.t("greeting.hello", {})),
    ),
    // A second page; the locale is not part of the path here.
    h(
      "section",
      { class: "card" },
      h("h2", { class: "eyebrow" }, i18n.t("demo.navigation.title")),
      h("p", { class: "body" }, i18n.t("demo.navigation.body")),
      h("p", { class: "widget" }, link("about", i18n.t("demo.navigation.cta"), "nav-about")),
    ),
    footer(),
  ];
}

function aboutPage(): Node[] {
  // A second namespace. There is no `useI18n("account")` without a framework:
  // every call names the namespace in `{ ns }`.
  activateAccount();
  const account = accountReady
    ? [
        h(
          "p",
          { class: "widget", "data-testid": "account-signed-in" },
          i18n.t("profile.signed_in", { ns: "account", name }),
        ),
        h(
          "p",
          { class: "widget", "data-testid": "account-devices" },
          i18n.t("profile.devices", { ns: "account", count: 3 }),
        ),
        // Only `account/en.json` has this key: the fallback chain is walked
        // inside the same namespace, once that namespace's en catalog is in.
        h(
          "p",
          { class: "widget", "data-testid": "account-only-en" },
          i18n.t("profile.only_en", { ns: "account" }),
        ),
      ]
    : [h("p", { class: "body" }, i18n.t("app.loading"))];
  return [
    header(),
    h(
      "section",
      { class: "card" },
      h("h2", { class: "eyebrow" }, i18n.t("demo.navigation.title")),
      h("p", { class: "widget", "data-testid": "about-body" }, i18n.t("about.body")),
      ...account,
      h("p", { class: "widget" }, link("home", i18n.t("nav.home"), "nav-home")),
    ),
    card("lazy", h("div", { class: "network" }, namespacesLine())),
    footer(),
  ];
}

function render(): void {
  document.documentElement.lang = i18n.locale;
  // A free function from `@comvi/core`; the framework bindings expose a bound
  // one built on top of it.
  document.documentElement.dir = getTextDirection(i18n.locale);
  root.replaceChildren(...(route === "about" ? aboutPage() : homePage()));
}

// `init()` runs the plugins (the locale detector picks the starting locale) and
// loads the first catalog.
void i18n.init().then(render);
