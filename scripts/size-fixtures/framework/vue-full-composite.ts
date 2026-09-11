// Framework size fixture: the UPPER BOUND of the capabilities the Vue root exports,
// composed on one instance through the wrapper pipe, plus <T>. This is the
// shipped recipe: `createI18n(options).use(…)`, one specifier.
import { createI18n, devtools, icuCompiler, loader, plugins, T, useI18n } from "@comvi/vue";

const i18n = createI18n({ locale: "en", compiler: icuCompiler, ssrLocale: "en" })
  .use(loader())
  .use(plugins());
i18n.addTranslations({ en: { greeting: "Hello, <b>{name}</b>!" } });
i18n.use(devtools());

// Observable use keeps the whole instance graph live for the bundler.
console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n, T);
