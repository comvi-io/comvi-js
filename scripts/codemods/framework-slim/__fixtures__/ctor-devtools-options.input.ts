// discovery left the constructor: `exposeGlobal` and
// `instanceId` are `devtools()` arguments now, and on a base host the two
// options are inert, so leaving them would be a SILENT loss of extension
// visibility. They move with their own source text — a shorthand stays a
// shorthand — onto the end of the chain, where discovery is installed last.
import { createI18n, I18n, loader } from "@comvi/react";

declare const __DEV__: boolean;

const exposeGlobal = __DEV__;

export const app = createI18n({
  locale: "en",
  exposeGlobal,
  instanceId: "app",
  translation: { en: { hello: "Hello" } },
});

export const dashboard = createI18n({ locale: "en", instanceId: "dashboard" })
  .with(loader());

// `createI18n(options)` IS `new I18n(options)`, so the class form migrates too.
export const widget = new I18n({ locale: "en", exposeGlobal: false });
