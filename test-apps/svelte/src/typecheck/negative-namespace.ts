/**
 * Namespace names of the BUILT @comvi/svelte `useI18n(ns)` (`dist/*.d.ts`, through the workspace
 * link) against the catalogs `comvi typegen` generates from ../locales. Never imported by the
 * app: checked by `pnpm typecheck`, where every `@ts-expect-error` must fire on the call line.
 */
import { useI18n } from "@comvi/svelte";

declare const dynamic: string;
declare const either: "account" | "admin";
declare const oneWrong: "account" | "acount";

export function useNegativeNamespace() {
  // Controls: each compiles.
  useI18n();
  useI18n(undefined);
  useI18n("default").t("home.title");
  useI18n("account").t("title");
  useI18n("admin");
  useI18n(either);
  useI18n("account").isReady satisfies boolean;
  useI18n("account").isFetching satisfies boolean;

  // @ts-expect-error a namespace that does not exist
  useI18n("acount");
  // @ts-expect-error a namespace that does not exist, its state read
  useI18n("acount").isReady satisfies boolean;
  // @ts-expect-error a union with one undeclared name
  useI18n(oneWrong);
  // @ts-expect-error a plain string where namespaces are declared
  useI18n(dynamic);
}
