import { i18n, locales } from "../i18n";
import { h } from "../dom";
import { state, update } from "../state";

// `setLocale` resolves once the new catalog has landed, so the page never shows
// old text under the new locale; `switching` covers the wait. A failed switch
// keeps the current language on screen, reports the error through onError and
// resolves with it; calling setLocale() again asks the loader again. A switch a
// later click overtook resolves with nothing: the latest click owns the note.
let clicks = 0;
async function switchTo(code: string): Promise<void> {
  const click = ++clicks;
  update({ switching: true, failed: null });
  const failure = await i18n.setLocale(code);
  if (click !== clicks) return;
  update({ switching: false, failed: failure === undefined ? null : code });
}

function localeButton(code: string): HTMLButtonElement {
  const button = h(
    "button",
    { "data-testid": `locale-${code}`, "aria-pressed": String(i18n.locale === code) },
    code,
  );
  button.onclick = () => switchTo(code);
  return button;
}

/** What a failed load shows: the problem, in the language on screen, and a way to ask again. */
export function loadError(retry: () => void): HTMLElement {
  const button = h("button", { type: "button", "data-testid": "load-retry" }, i18n.t("app.retry"));
  button.onclick = retry;
  return h(
    "p",
    { class: "note", role: "alert", "data-testid": "load-error" },
    i18n.t("app.load_failed"),
    " ",
    button,
  );
}

/** The language buttons, with the loading note while a catalog is on its way. */
export function switcher(): HTMLElement {
  const failed = state.failed;
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
    ...(failed ? [loadError(() => switchTo(failed))] : []),
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
