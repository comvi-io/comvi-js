// Framework size fixture: the RECOMMENDED Next path — the composed root from
// `@comvi/next`, an import-map loader and a runtime-scoped plugin, every
// specifier the package root. `createNextI18n` composes ICU (its default
// `compiler`), the tag grammar, the loader and the plugin host, so this is the
// ceiling a shared `i18n/config.ts` ships to BOTH runtimes.
import { createNextI18n, loader, nextPlugin } from "@comvi/next";

const { i18n, routing } = createNextI18n({
  locales: ["en", "de"],
  defaultLocale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
})
  .use(loader({ de: () => Promise.resolve({ default: { greeting: "Hallo, {name}!" } }) }))
  .use(nextPlugin(() => undefined, { runtime: "client" }));

console.log(i18n.t("greeting" as never, { name: "world" } as never), routing.defaultLocale);
