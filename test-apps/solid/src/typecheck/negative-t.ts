/**
 * Negative types of the BUILT @comvi/solid (`dist/*.d.ts`, through the workspace link) against
 * the catalogs `comvi typegen` generates from ../locales: `t()` and `useI18n(ns)`. Never
 * imported by the app: checked by `pnpm typecheck`, where every `@ts-expect-error` must fire.
 */
import { useI18n } from "@comvi/solid";

export function negativeT() {
  const { t } = useI18n();
  const account = useI18n("account");
  // Controls: each compiles.
  t("home.title");
  t("home.intro", { name: "Ann" });
  t("plurals.items", { count: 2 });
  t("profile.heading", { ns: "account", name: "Ann" });
  account.t("profile.heading", { name: "Ann" });
  account.t("title");

  // @ts-expect-error a key the catalog lacks
  t("home.titel");
  // @ts-expect-error a key of another namespace on the default t
  t("profile.heading", { name: "Ann" });
  // @ts-expect-error a default-namespace key on the account t
  account.t("home.title");
  // @ts-expect-error a default-namespace key under { ns: "account" }
  t("home.title", { ns: "account" });
  // @ts-expect-error a namespace that does not exist, in { ns }
  t("home.title", { ns: "acount" });
  // @ts-expect-error a missing params object
  t("home.intro");
  // @ts-expect-error a missing params object on the account t
  account.t("profile.heading");
  // @ts-expect-error an empty params object
  t("home.intro", {});
  // @ts-expect-error a misspelt param leaves the required one out
  t("home.intro", { nmae: "Ann" });
  // @ts-expect-error a param the message lacks
  t("home.title", { name: "Ann" });
  // @ts-expect-error an extra param beside the right one
  t("home.intro", { name: "Ann", extra: 1 });
  // @ts-expect-error a count is a number
  t("plurals.items", { count: "2" });
  // @ts-expect-error a text param is not a boolean
  t("home.intro", { name: true });
  // @ts-expect-error a text param is not an object
  t("home.intro", { name: { first: "Ann" } });
  // @ts-expect-error a wrong param type on the account t
  account.t("profile.heading", { name: [1] });
}
