import { i18n } from "../i18n";
import { h } from "../dom";
import { link } from "../router";
import { state, update } from "../state";
import {
  errorsCard,
  fallbackCard,
  formalityCard,
  formattingCard,
  interpolationCard,
  lazyCard,
  missingCard,
  namespacesLine,
  navigationCard,
  optionsCard,
  ordinalCard,
  pluralCard,
  selectCard,
  tagsCard,
} from "./cards";
import { footer, header, switcher } from "./header";

/** The whole integration on one screen: a title, a switcher, one translated line. */
export function startPage(): Node[] {
  return [
    h("header", {}, h("h1", {}, i18n.t("app.title")), switcher()),
    h("p", { class: "intro" }, i18n.t("demo.start.intro")),
    h(
      "p",
      { class: "widget", "data-testid": "greeting" },
      i18n.t("greeting.hello", { name: state.name }),
    ),
    h("p", {}, link("features", i18n.t("demo.start.cta"), "nav-features", "cta")),
  ];
}

export function featuresPage(): Node[] {
  return [
    header(),
    h("p", { class: "note" }, link("start", i18n.t("demo.start.back"), "nav-start")),
    interpolationCard(),
    pluralCard(),
    ordinalCard(),
    selectCard(),
    formalityCard(),
    tagsCard(),
    formattingCard(),
    optionsCard(),
    fallbackCard(),
    missingCard(),
    errorsCard(),
    navigationCard(),
    lazyCard(),
    footer(),
  ];
}

// The `account` namespace is loaded the first time this page opens. `load()`
// also keeps it active, so a later `setLocale` loads it together with the
// default namespace before the new locale applies.
let account: "idle" | "loading" | "ready" = "idle";
function loadAccount(): void {
  if (account !== "idle") return;
  account = "loading";
  // `load()` never rejects: a failed catalog is reported to `onError`, and the
  // page still renders with the account keys shown as any missing translation.
  void i18n.load("account").then(() => {
    account = "ready";
    update({});
  });
}

function accountRows(): HTMLElement[] {
  if (account !== "ready") return [h("p", { class: "body" }, i18n.t("app.loading"))];
  // Without a framework there is no `useI18n("account")`: each call names its namespace.
  return [
    h(
      "p",
      { class: "widget", "data-testid": "account-signed-in" },
      i18n.t("profile.signed_in", { ns: "account", name: state.name }),
    ),
    h(
      "p",
      { class: "widget", "data-testid": "account-devices" },
      i18n.t("profile.devices", { ns: "account", count: 3 }),
    ),
    // Only the English `account` catalog has this key: the fallback stays in the namespace.
    h(
      "p",
      { class: "widget", "data-testid": "account-only-en" },
      i18n.t("profile.only_en", { ns: "account" }),
    ),
  ];
}

export function aboutPage(): Node[] {
  loadAccount();
  return [
    header(),
    h(
      "section",
      { class: "card" },
      h("h2", { class: "eyebrow" }, i18n.t("demo.navigation.title")),
      h("p", { class: "widget", "data-testid": "about-body" }, i18n.t("about.body")),
      ...accountRows(),
      h("p", { class: "widget" }, link("features", i18n.t("nav.home"), "nav-home")),
    ),
    h(
      "section",
      { class: "card" },
      h("h2", { class: "eyebrow" }, i18n.t("demo.lazy.title")),
      h("p", { class: "body" }, i18n.t("demo.lazy.body")),
      h("div", { class: "network" }, namespacesLine()),
    ),
    footer(),
  ];
}
