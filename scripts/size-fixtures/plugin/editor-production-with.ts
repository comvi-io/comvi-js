// Informational: `.with(inContextEditor())` under the package's `production` export
// condition — which is the condition this gate always applies (`PRODUCTION_CONDITIONS`
// in scripts/size-check.mjs).
import { createI18n } from "@comvi/core";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

const i18n = createI18n({ locale: "en" }).with(inContextEditor());

console.log(i18n.t("hello" as never));
