// Framework size fixture: the Next.js SERVER graph of the 0.8 recipe — `createGetI18n` from
// `@comvi/next/server` with a loader (an instance per request, React `cache()`) and the payload
// of `handover()` from `@comvi/core/ssr`.
import { createGetI18n } from "@comvi/next/server";
import { handover } from "@comvi/core/ssr";

const getI18n = createGetI18n({
  locales: ["en", "de"],
  defaultLocale: "en",
  timeZone: "UTC",
  loader: async () => ({ greeting: "Hello, {name}!" }),
});

export const page = getI18n({ locale: "en" }).then(({ t, i18n }) => [
  t("greeting", { name: "world" }),
  handover(i18n),
]);
