import { createElement, formatDate, formatNumber, getTextDirection } from "@comvi/core";
import type { TranslationResult, VirtualNode } from "@comvi/core";
import { i18n, missedKeys } from "../i18n";
import { h, toDom } from "../dom";
import { link } from "../router";
import { formalities, genders, state, update } from "../state";

const RELEASED = new Date("2026-09-01T00:00:00Z");

type Feature =
  | "interpolation"
  | "plural"
  | "ordinal"
  | "select"
  | "formality"
  | "tags"
  | "formatting"
  | "lazy"
  | "fallback"
  | "missing"
  | "errors"
  | "options"
  | "navigation";

/** One feature: its name, a sentence about it, and the live widget. */
export function card(feature: Feature, ...widget: Node[]): HTMLElement {
  return h(
    "section",
    { class: "card" },
    h("h2", { class: "eyebrow" }, i18n.t(`demo.${feature}.title`)),
    h("p", { class: "body" }, i18n.t(`demo.${feature}.body`)),
    ...widget,
  );
}

const children = (value: TranslationResult): Array<string | VirtualNode> =>
  typeof value === "string" ? [value] : value;

export function interpolationCard(): HTMLElement {
  // A parameter is always rendered as text, never as markup: try `<b>Grace</b>`.
  const greeting = h(
    "p",
    { class: "widget", "data-testid": "greeting" },
    i18n.t("greeting.hello", { name: state.name }),
  );
  const input = h("input", { class: "field", "data-testid": "name-input", value: state.name });
  // Only the greeting changes while typing: re-rendering the page would take
  // the focus away from the input.
  input.oninput = () => {
    state.name = input.value;
    greeting.textContent = i18n.t("greeting.hello", { name: state.name });
  };
  return card(
    "interpolation",
    h("label", { class: "field-label" }, i18n.t("demo.interpolation.label"), input),
    greeting,
  );
}

function stepButton(label: string, delta: number, testId: string): HTMLButtonElement {
  const button = h("button", { class: "square", "data-testid": testId }, label);
  button.onclick = () => update({ count: Math.max(0, state.count + delta) });
  return button;
}

export function pluralCard(): HTMLElement {
  return card(
    "plural",
    h(
      "div",
      { class: "widget counter" },
      stepButton("−", -1, "cart-dec"),
      h("span", { "data-testid": "cart" }, i18n.t("cart.items", { count: state.count })),
      stepButton("+", 1, "cart-inc"),
    ),
  );
}

export function ordinalCard(): HTMLElement {
  return card(
    "ordinal",
    h(
      "p",
      { class: "widget", "data-testid": "ordinal" },
      i18n.t("demo.ordinal.message", { n: state.count }),
    ),
  );
}

export function selectCard(): HTMLElement {
  const options = genders.map((gender) => {
    const button = h(
      "button",
      { class: "chip", "aria-pressed": String(state.gender === gender) },
      i18n.t(`demo.select.${gender}`),
    );
    button.onclick = () => update({ gender });
    return button;
  });
  return card(
    "select",
    h("div", { class: "options" }, ...options),
    h(
      "p",
      { class: "widget", "data-testid": "select-message" },
      i18n.t("demo.select.message", { gender: state.gender }),
    ),
  );
}

export function formalityCard(): HTMLElement {
  const options = formalities.map((formality) => {
    const button = h(
      "button",
      { class: "chip", "aria-pressed": String(state.formality === formality) },
      i18n.t(`demo.formality.${formality}`),
    );
    button.onclick = () => update({ formality });
    return button;
  });
  return card(
    "formality",
    h("div", { class: "options" }, ...options),
    h(
      "p",
      { class: "widget", "data-testid": "formality-message" },
      i18n.t("demo.formality.message", { formality: state.formality }),
    ),
  );
}

export function tagsCard(): HTMLElement {
  // The handler decides what `<link>` becomes; the translator decides where it goes.
  const readMore = toDom(
    i18n.tRaw("docs.read_more", {
      link: ({ children: inner }) =>
        createElement(
          "a",
          { href: "https://comvi.io/docs", target: "_blank", rel: "noreferrer" },
          children(inner),
        ),
    }),
  );
  return card("tags", h("p", { class: "widget", "data-testid": "read-more" }, ...readMore));
}

export function formattingCard(): HTMLElement {
  const price = new Intl.NumberFormat(i18n.locale, { style: "currency", currency: "EUR" }).format(
    1234.5,
  );
  return card(
    "formatting",
    h(
      "p",
      { class: "widget" },
      i18n.t("stats.summary", {
        // Free functions: they take the instance and read its current locale.
        views: formatNumber(i18n, 1234567),
        date: formatDate(i18n, RELEASED, { dateStyle: "long" }),
      }),
    ),
    h("p", { class: "widget" }, i18n.t("demo.formatting.price", { price })),
  );
}

export function namespacesLine(): HTMLElement {
  return h(
    "div",
    {},
    i18n.t("demo.lazy.namespaces", { namespaces: i18n.getActiveNamespaces().join(", ") }),
  );
}

export function lazyCard(): HTMLElement {
  return card(
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
  );
}

export function fallbackCard(): HTMLElement {
  return card(
    "fallback",
    // Ukrainian has no `fallback.only_en`, so it renders the English text.
    h("p", { class: "widget", "data-testid": "fallback" }, i18n.t("fallback.only_en")),
    // No catalog has this key, so it renders as itself.
    h(
      "p",
      { class: "widget" },
      h("code", { "data-testid": "missing-key" }, i18n.t("fallback.nowhere")),
    ),
  );
}

export function missingCard(): HTMLElement {
  return card(
    "missing",
    h("p", { class: "widget", "data-testid": "missing-param" }, i18n.t("greeting.hello", {})),
  );
}

export function navigationCard(): HTMLElement {
  return card(
    "navigation",
    h("p", { class: "widget" }, link("about", i18n.t("demo.navigation.cta"), "nav-about")),
  );
}

/** Each loaded language's name, read from that language's catalog with the `locale` call option. */
export function optionsCard(): HTMLElement {
  const rows = i18n.getLoadedLocales().map((code) =>
    h(
      "li",
      { lang: code, dir: getTextDirection(code) },
      i18n.t("demo.options.inOwn", {
        name: i18n.t("demo.options.name", { locale: code }),
        locale: code,
      }),
    ),
  );
  return card("options", h("ul", { class: "widget languages" }, ...rows));
}

/** Rendered after the fallback card, so the miss that card just caused is counted. */
export function errorsCard(): HTMLElement {
  return card(
    "errors",
    h(
      "p",
      { class: "widget", "data-testid": "missing-count" },
      i18n.t("demo.errors.count", { count: missedKeys.size }),
    ),
  );
}
