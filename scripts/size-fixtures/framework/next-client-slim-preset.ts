// Framework size fixture (framework-slim DX pass): the SINGLE-PACKAGE
// quickstart for a Next.js CLIENT bundle. Host constructor, provider and hook
// all come from `@comvi/next/client`; `@comvi/core` is never named.
//
// `@comvi/next/client` is not a `/slim` entry — it is next's only client
// surface and its published `createI18n` is the ROOT constructor — so the slim
// host has its own name, `createSlimI18n`. Measured against
// `fw-next-client-slim`, which builds the identical graph from
// `@comvi/core/slim` directly.
//
// The four capability re-exports this entry carries (icuCompiler,
// attachLoader/flattenCatalog, attachPlugins, attachDevtools) are unused here
// and are sentinel-asserted ABSENT from the module graph, alongside the root
// entry the sibling `createI18n` export names.
import { createSlimI18n, I18nProvider, useI18n } from "@comvi/next/client";

const i18n = createSlimI18n({ locale: "en" });

// Hydration path: the server-serialized catalog arrives as plain data.
i18n.addTranslations("en", { greeting: "Hello, {name}!" } as never);

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
