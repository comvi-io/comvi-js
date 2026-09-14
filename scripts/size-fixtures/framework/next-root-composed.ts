// Framework size fixture: the RECOMMENDED Next path — the composed root from
// `@comvi/next`, an import-map loader and a runtime-scoped plugin, every
// specifier the package root. `createNextI18n` composes the tag grammar, the
// loader and the plugin host; the compiler is named here because the README's
// recommended path names it (its quickstart catalog carries a plural), so this
// row measures the DOCUMENTED path and not a cheaper one nobody is told to
// write. It is the ceiling a shared `i18n/config.ts` ships to BOTH runtimes.
//
// Dropping `compiler: icuCompiler` is what the row would weigh for an app with
// no ICU in its catalogs: 862 B min+gz less, measured 14.09.2026.
import { createNextI18n, icuCompiler, loader, nextPlugin } from "@comvi/next";

const { i18n, routing } = createNextI18n({
  locales: ["en", "de"],
  defaultLocale: "en",
  compiler: icuCompiler,
  translation: { en: { greeting: "Hello, {name}!" } },
})
  .use(loader({ de: () => Promise.resolve({ default: { greeting: "Hallo, {name}!" } }) }))
  .use(nextPlugin(() => undefined, { runtime: "client" }));

console.log(i18n.t("greeting" as never, { name: "world" } as never), routing.defaultLocale);
