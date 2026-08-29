// Framework size fixture: the UPPER BOUND of the capabilities the svelte root exports,
// composed on one host from one specifier, plus <T>.
import {
  createI18n,
  devtools,
  icuCompiler,
  loader,
  plugins,
  setI18nContext,
  T,
  useI18n,
} from "@comvi/svelte";

const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(loader()).with(plugins());
i18n.addTranslations({ en: { greeting: "Hello, <b>{name}</b>!" } });
i18n.with(devtools());

console.log(i18n.t("greeting" as never, { name: "world" } as never), setI18nContext, useI18n, T);
