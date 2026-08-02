// Server-only exports for Next.js Server Components
export { setRequestLocale } from "./server/setRequestLocale";
export { getI18n } from "./server/getI18n";
export { getLocale } from "./server/getLocale";
export { setI18n } from "./server/cache";
export { loadTranslations } from "./server/loadTranslations";

// Root-free composed-host factory (framework-slim 0.5.0). Exported here and
// nowhere else: a server loader reached through the host factory can then
// never leak into the client graph.
export { createNextI18nFromHost } from "./server/createNextI18nFromHost";
export type {
  CreateNextI18nFromHostOptions,
  CreateNextI18nFromHostResult,
} from "./server/createNextI18nFromHost";
export type { NextServerHost } from "./server/hostTypes";

export type {
  GetI18nOptions,
  ServerI18n,
  TranslationFunction,
  HasTranslationOptions,
} from "./server/types";

export type { LoadTranslationsOptions, TranslationsResult } from "./server/loadTranslations";
