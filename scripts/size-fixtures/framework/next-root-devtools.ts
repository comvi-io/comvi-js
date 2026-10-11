// Framework size fixture: the recommended Next path of `next-root-composed.ts`
// plus `.use(devtools())` — what a shared `i18n/config.ts` ships once the app
// opts in to the Comvi browser extension. `createNextI18n` composes no
// discovery on its own, so this is the one Next row whose graph carries
// `@comvi/core/devtools` and its editor loader; read against
// `fw-next-root-composed`, the difference is what the opt-in costs in Next.
import { createNextI18n, devtools, icuCompiler, loader, nextPlugin } from "@comvi/next";

const { i18n, routing } = createNextI18n({
  locales: ["en", "de"],
  defaultLocale: "en",
  compiler: icuCompiler,
  messages: { en: { greeting: "Hello, {name}!" } },
})
  .use(loader({ de: () => Promise.resolve({ default: { greeting: "Hallo, {name}!" } }) }))
  .use(nextPlugin(() => undefined, { runtime: "client" }))
  .use(devtools());

console.log(i18n.t("greeting" as never, { name: "world" } as never), routing.defaultLocale);
