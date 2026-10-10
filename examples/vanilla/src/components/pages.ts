import { i18n } from "../i18n";
import { h } from "../dom";
import { link } from "../router";
import { update } from "../state";
import {
  errorsCard,
  fallbackCard,
  formattingCard,
  interpolationCard,
  lazyCard,
  missingCard,
  name,
  namespacesLine,
  navigationCard,
  ordinalCard,
  pluralCard,
  selectCard,
  tagsCard,
} from "./cards";
import { footer, header } from "./header";

export function homePage(): Node[] {
  return [
    header(),
    interpolationCard(),
    pluralCard(),
    ordinalCard(),
    selectCard(),
    tagsCard(),
    formattingCard(),
    lazyCard(),
    fallbackCard(),
    errorsCard(),
    missingCard(),
    navigationCard(),
    footer(),
  ];
}

// The `account` namespace is loaded the first time this page opens.
// `addActiveNamespace` also keeps it active, so a later `setLocale` loads it
// together with the default namespace before the new locale applies.
let account: "idle" | "loading" | "ready" = "idle";
function loadAccount(): void {
  if (account !== "idle") return;
  account = "loading";
  // Settled, not only succeeded: a failed load already went to `onError`, and
  // its keys then show as any missing translation would.
  const done = () => {
    account = "ready";
    update({});
  };
  i18n.addActiveNamespace("account").then(done, done);
}

function accountRows(): HTMLElement[] {
  if (account !== "ready") return [h("p", { class: "body" }, i18n.t("app.loading"))];
  // Without a framework there is no `useI18n("account")`: each call names its namespace.
  return [
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
      h("p", { class: "widget" }, link("home", i18n.t("nav.home"), "nav-home")),
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
