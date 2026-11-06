// Framework size fixture: THE DEFAULT Svelte app: one `@comvi/svelte` specifier, bundled
// catalogs, setI18n() and useI18n() with t({name}).
import { createI18n, setI18n, useI18n } from "@comvi/svelte";

const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello, {name}!" } } });

// What a component's <script> runs.
export const setup = () => {
  setI18n(i18n);
  return useI18n().t("greeting", { name: "Ann" });
};
