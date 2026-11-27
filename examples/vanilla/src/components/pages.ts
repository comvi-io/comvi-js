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
import { footer, header, loadError, switcher } from "./header";

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
/** Whether `locale`'s own `account` catalog is in the instance. */
const loaded = (locale: string) =>
  i18n.has("profile.signed_in", { ns: "account", locale, fallback: false });
let loading: string | null = null;
/**
 * The locale whose `account` load failed; `load()` resolves with the Error then, and asks again
 * when called.
 */
let failed: string | null = null;
async function loadAccount(): Promise<void> {
  const locale = i18n.locale;
  if (loaded(locale) || loading === locale || failed === locale) return;
  loading = locale;
  const failure = await i18n.load("account");
  if (loading !== locale) return;
  loading = null;
  // A load a switch aborted resolves with nothing and loads nothing: `loaded()` stays false
  // and the render asks again.
  if (failure !== undefined) failed = locale;
  update({});
}

function retryAccount(): void {
  failed = null;
  void loadAccount();
  update({});
}

function accountRows(): HTMLElement[] {
  if (failed === i18n.locale) return [loadError(retryAccount)];
  if (!loaded(i18n.locale)) return [h("p", { class: "body" }, i18n.t("app.loading"))];
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
  void loadAccount();
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
