import { hasLoaderApi } from "@comvi/core";
import type { TranslationValue } from "@comvi/core";
import type { NuxtServerHost } from "../../../types";
import type { H3Event } from "h3";
import { getRequestI18n } from "./request-i18n";

export interface LoadTranslationsOptions {
  /** Defaults to the default namespace. */
  namespaces?: string[];
}

/**
 * Translations result keyed by "locale:namespace"
 */
export type TranslationsResult = Record<string, Record<string, TranslationValue>>;

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));
const noLoaderWarnings = new WeakSet<NuxtServerHost>();

// Two distinct failures, two distinct sentences. The generated DEFAULT host is
// core's BASE host, so "no loader" has a second and likelier cause than "you
// forgot to register one": the capability is not on the host at all, and no
// amount of `comvi.setup` fixes that — the composition happens in the
// `hostModule` factory. Naming the wrong one would send a reader to the wrong
// file, so the capability probe below picks the message.
const NO_LOADER_CAPABILITY_MESSAGE =
  '[@comvi/nuxt] This i18n host has no loader capability, so SSR loaded nothing. The generated default host is core\'s base host — compose the loader in a `hostModule` factory: createI18n(options).with(loader(map)) from "@comvi/core" + "@comvi/core/loader", and set `comvi.hostModule` in nuxt.config.';
const NO_LOADER_REGISTERED_MESSAGE =
  "[@comvi/nuxt] No loader configured. Register one in comvi.setup via i18n.core.registerLoader(...) or i18n.core.use(...).";

const toPlainObject = (
  value: Record<string, TranslationValue>,
): Record<string, TranslationValue> => {
  // Server -> client payload serialization rejects null-prototype objects.
  return Object.fromEntries(Object.entries(value)) as Record<string, TranslationValue>;
};

const warnNoLoader = (i18n: NuxtServerHost, message: string): void => {
  if (noLoaderWarnings.has(i18n)) {
    return;
  }
  noLoaderWarnings.add(i18n);
  console.warn(message);
};

/**
 * Load translations for SSR/SSG using the configured i18n loader pipeline.
 */
export async function loadTranslations(
  event: H3Event,
  locale: string,
  options: LoadTranslationsOptions = {},
): Promise<TranslationsResult> {
  const i18n = await getRequestI18n(event, locale);
  const defaultNs = i18n.getDefaultNamespace();
  const namespaces = options.namespaces ?? [defaultNs];
  const loaderHost = hasLoaderApi(i18n) ? i18n : undefined;
  const hasLoader = loaderHost !== undefined && Boolean(loaderHost.getLoader());
  const result: TranslationsResult = {};

  for (const namespace of namespaces) {
    const cacheKey = `${locale}:${namespace}`;

    if (!i18n.hasLocale(locale, namespace) && loaderHost && hasLoader) {
      try {
        await loaderHost.reloadTranslations(locale, namespace);
      } catch (error) {
        const err = toError(error);
        console.warn(`[@comvi/nuxt] Failed to load ${locale}:${namespace}:`, err.message);
      }
    }

    if (i18n.hasLocale(locale, namespace)) {
      const translations = i18n.getTranslations(locale, namespace) as Record<
        string,
        TranslationValue
      >;
      result[cacheKey] = toPlainObject(translations);
    }
  }

  if (!hasLoader && Object.keys(result).length === 0) {
    warnNoLoader(i18n, loaderHost ? NO_LOADER_REGISTERED_MESSAGE : NO_LOADER_CAPABILITY_MESSAGE);
  }

  return result;
}
