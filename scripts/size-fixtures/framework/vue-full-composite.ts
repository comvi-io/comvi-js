// Framework size fixture: the UPPER BOUND of the capabilities the Vue root exports,
// composed on one host from one specifier, plus <T>.
import {
  createCore,
  createI18nFromCore,
  devtools,
  icuCompiler,
  loader,
  plugins,
  T,
  useI18n,
} from "@comvi/vue";

const core = createCore({ locale: "en", compiler: icuCompiler }).with(loader()).with(plugins());
core.addTranslations({ en: { greeting: "Hello, <b>{name}</b>!" } });
core.with(devtools());

const i18n = createI18nFromCore(core, { ssrLocale: "en" });

// Observable use keeps the whole instance graph live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n, T);
