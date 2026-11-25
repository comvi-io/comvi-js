/**
 * Namespace names of the BUILT @comvi/core `i18n.ns(name)` (`dist/*.d.ts`, through the workspace
 * link) against the catalogs `comvi typegen` generates from ./locales. Never imported by the
 * app: checked by `pnpm typecheck`, where every `@ts-expect-error` must fire on the call line.
 */
import { createI18n } from "@comvi/core";

declare const dynamic: string;
declare const either: "account" | "admin";
declare const oneWrong: "account" | "acount";

const i18n = createI18n({ locale: "en" });

// Controls: each compiles, and `t` is typed by its namespace's keys.
export const title: string = i18n.ns("account")("title");
export const home: string = i18n.ns("default")("home.title");
i18n.ns("admin");
i18n.ns(either);
// @ts-expect-error a key of another namespace: the bound t is typed by "account"
i18n.ns("account")("home.title");

// @ts-expect-error a namespace that does not exist
i18n.ns("acount");
// @ts-expect-error a namespace that does not exist, its t called
i18n.ns("acount")("title");
// @ts-expect-error a union with one undeclared name
i18n.ns(oneWrong);
// @ts-expect-error a plain string where namespaces are declared
i18n.ns(dynamic);
