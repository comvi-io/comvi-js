// Framework size fixture (framework-slim DX pass): the SINGLE-PACKAGE
// quickstart for a Next.js CLIENT bundle. Host constructor, provider and hook
// all come from `@comvi/next/client`; `@comvi/core` is never named.
//
// `@comvi/next/client` is not a `/slim` entry — it is next's only client
// surface, and its published `createI18n` was 0.4's batteries-included
// constructor, so the bare host got a name of its own, `createSlimI18n`.
// Since the single-entry convergence both names denote the SAME base
// constructor (P4 deletes the duplicate). Measured against
// `fw-next-client-slim`, which builds the identical graph from `@comvi/core`
// directly.
//
// The four capability re-exports this entry carries (icuCompiler,
// attachLoader/flattenCatalog, attachPlugins, attachDevtools) are unused here
// and are sentinel-asserted ABSENT from the module graph, together with core's
// tag-registration pair. Core's base entry is NOT among those sentinels and
// cannot be: it is what `createSlimI18n` resolves to.
import { createSlimI18n, I18nProvider, useI18n } from "@comvi/next/client";

const i18n = createSlimI18n({ locale: "en" });

// Hydration path: the server-serialized catalog arrives as plain data.
i18n.addTranslations("en", { greeting: "Hello, {name}!" } as never);

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
