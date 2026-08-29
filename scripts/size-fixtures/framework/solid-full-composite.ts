// Framework size fixture: the UPPER BOUND of the capabilities the Solid root exports,
// composed on one host from one specifier, plus <T>.
import {
  createI18n,
  devtools,
  I18nProvider,
  icuCompiler,
  loader,
  plugins,
  T,
  useI18n,
} from "@comvi/solid";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(loader()).with(plugins());
i18n.addTranslations({ en: { greeting: "Hello, <b>{name}</b>!" } });
i18n.with(devtools());

// Observable use keeps the whole instance graph live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n, T);
