// Framework size fixture (single-entry P4): the DEFAULT Next.js CLIENT bundle.
// Host constructor, provider and hook all come from `@comvi/next/client`;
// `@comvi/core` is never named.
//
// RETARGETED from `next-client-slim-preset.ts` and ABSORBING the deleted
// `next-client-slim.ts`: that second fixture built the identical graph by
// naming `@comvi/core` for its constructor, which this entry's `createI18n`
// now IS, so the two rows measured one graph through two specifiers. One row,
// one recipe — the one the README documents.
//
// `@comvi/next/client` is next's only client surface and it is not a `/slim`
// entry: `createI18n` is the published 0.4.x name and denotes the BASE host,
// with the transitional second constructor name deleted.
//
// The capability re-exports this entry carries (icu/icuCompiler, attachLoader/
// flattenCatalog/loader, attachPlugins/plugins, attachDevtools/devtools) are
// unused here and are sentinel-asserted ABSENT from the module graph, together
// with core's tag-registration pair. Core's base entry is NOT among those
// sentinels and cannot be: it is what `createI18n` resolves to.
import { createI18n, I18nProvider, useI18n } from "@comvi/next/client";

const i18n = createI18n({ locale: "en" });

// Hydration path: the server-serialized catalog arrives as plain data.
i18n.addTranslations("en", { greeting: "Hello, {name}!" } as never);

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
