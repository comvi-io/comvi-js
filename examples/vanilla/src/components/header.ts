import { i18n, locales } from "../i18n";
import { h } from "../dom";
import { state, update } from "../state";

function localeButton(code: string): HTMLButtonElement {
  const button = h(
    "button",
    { "data-testid": `locale-${code}`, "aria-pressed": String(i18n.locale === code) },
    code,
  );
  // `setLocale` resolves once the new catalog has landed, so the page never
  // shows old text under the new locale; `switching` covers the wait.
  button.onclick = () => {
    update({ switching: true });
    void i18n.setLocale(code).finally(() => update({ switching: false }));
  };
  return button;
}

/** The language buttons, with the loading note while a catalog is on its way. */
export function switcher(): HTMLElement {
  return h(
    "div",
    { class: "switcher-row" },
    h("span", { class: "label" }, i18n.t("app.language")),
    h(
      "div",
      { class: "switcher", role: "group", "aria-label": i18n.t("app.language") },
      ...locales.map(localeButton),
    ),
    // Last in the row, so its text appears and goes without moving anything.
    ...(state.switching ? [h("span", { class: "loading" }, i18n.t("app.loading"))] : []),
  );
}

export function header(): HTMLElement {
  return h(
    "header",
    {},
    h("h1", {}, i18n.t("app.title")),
    h("p", { class: "intro" }, i18n.t("demo.intro")),
    switcher(),
    h("p", { class: "note" }, i18n.t("demo.rtl.body")),
  );
}

export function footer(): HTMLElement {
  return h(
    "footer",
    {},
    h("a", { href: "https://comvi.io/docs/i18n" }, i18n.t("demo.footer.docs")),
    h(
      "a",
      { href: "https://github.com/comvi-io/comvi-js/tree/main/examples/vanilla" },
      i18n.t("demo.footer.source"),
    ),
    h("span", {}, i18n.t("demo.footer.install"), " ", h("code", {}, "npm i @comvi/core")),
  );
}
