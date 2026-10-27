// Framework size fixture: THE DEFAULT React app — one `@comvi/react` specifier, bundled
// catalogs, the provider and useI18n() with t({name}).
import { createElement } from "react";
import { createI18n, I18nProvider, useI18n } from "@comvi/react";

const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello, {name}!" } } });

const Hello = () => createElement("h1", null, useI18n().t("greeting", { name: "Ann" }));

export const app = createElement(I18nProvider, { i18n }, createElement(Hello));
