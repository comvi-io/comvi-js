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

// The `account` namespace loads when this page opens, for the locale on screen.
// Without a component there is nothing to hold it: `load()` loads it now and
// keeps nothing active, so a switch loads only the `default` namespace. When
// the page renders in a locale it has not loaded `account` for (a switch, or a
// visit after one), it loads it again and shows the loading row meanwhile —
// never the previous language's rows.
let account: string | null = null;
let loading: string | null = null;
function loadAccount(): void {
  const locale = i18n.locale;
  if (account === locale || loading === locale) return;
  loading = locale;
  // A failed catalog is reported to `onError`; the page still renders, with the
  // fallback language's rows (or the keys).
  void i18n
    .load("account")
    .catch(() => {})
    .then(() => {
      if (loading !== locale) return;
      loading = null;
      account = locale;
      update({});
    });
}

function accountRows(): HTMLElement[] {
  if (account !== i18n.locale) return [h("p", { class: "body" }, i18n.t("app.loading"))];
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
