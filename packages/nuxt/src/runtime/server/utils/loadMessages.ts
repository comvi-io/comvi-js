import { hasLoaderApi } from "@comvi/core";
import type { TranslationValue } from "@comvi/core";
import type { NuxtServerHost } from "../../../types";
import type { H3Event } from "h3";
import { getRequestI18n } from "./request-i18n";
import { loadCatalogs } from "../../utils/load-catalogs";

export interface LoadMessagesOptions {
  /** Defaults to the default namespace. */
  namespaces?: string[];
}

/**
 * Translations result keyed by "locale:namespace"
 */
export type MessagesMap = Record<string, Record<string, TranslationValue>>;

const noLoaderWarnings = new WeakSet<NuxtServerHost>();

// Two distinct failures, two distinct sentences. The generated DEFAULT host is
// core's BASE host, so "no loader" has a second and likelier cause than "you
// forgot to register one": the capability is not on the host at all, and no
// amount of `comvi.setup` fixes that — the composition happens in the
// `hostModule` factory. Naming the wrong one would send a reader to the wrong
// file, so the capability probe below picks the message.
const NO_LOADER_CAPABILITY_MESSAGE =
  '[@comvi/nuxt] This i18n host has no loader capability, so SSR loaded nothing. The generated default host is core\'s base host — compose the loader in a `hostModule` factory: createI18n(options).use(loader(map)) from "@comvi/core" + "@comvi/core/loader", and set `comvi.hostModule` in nuxt.config.';
// The host HAS the loader capability here, so the fix is the REGISTRATION, not
// the composition — and it may only name shapes the docs teach.
// `registerPlugin(...)` is not one of them: the plugin host is a SEPARATE
// composition, absent on the generated default host, so a message naming it
// would send a reader to a member that is usually not there. `comvi.setup`'s
// context destructures `core` because `context.i18n` is a union of `VueI18n`
// and the bare host. `attachLoader` is the ONE attach-only composition core
// publishes — `loader(map)` requires its map and therefore always registers —
// so it is the only one this sentence has to name.
const NO_LOADER_REGISTERED_MESSAGE =
  "[@comvi/nuxt] No loader registered, so SSR loaded nothing. This i18n host has the loader " +
  "capability: pass the import map where you compose it — " +
  "createI18n(options).use(loader(map)) in your `hostModule` factory — or, on a host " +
  "composed with .use(attachLoader), register a LoaderFn from " +
  "comvi.setup: (({ core }) => { core.registerLoader(fn); }).";

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
 *
 * The result holds the requested locale AND every locale of the
 * `fallbackLocale` chain, for each requested namespace, keyed
 * `locale:namespace`.
 */
export async function loadMessages(
  event: H3Event,
  locale: string,
  options: LoadMessagesOptions = {},
): Promise<MessagesMap> {
  const i18n = await getRequestI18n(event, locale);
  const defaultNs = i18n.getDefaultNamespace();
  const namespaces = options.namespaces ?? [defaultNs];
  const loaderHost = hasLoaderApi(i18n) ? i18n : undefined;
  const hasLoader = loaderHost !== undefined && Boolean(loaderHost.getLoader());
  // The client hydrates from these catalogs, so ship every catalog the server
  // render could have read: the requested locale, then its fallback chain in
  // the order core's lookup walks it. A cached primary catalog says nothing
  // about the fallbacks, so each pair is checked on its own.
  await loadCatalogs(i18n, namespaces, locale);
  const locales = [...new Set([locale, ...i18n.getFallbackLocales()])];

  const result: MessagesMap = {};
  for (const loc of locales) {
    for (const namespace of namespaces) {
      if (i18n.hasLocale(loc, namespace)) {
        const translations = i18n.getMessages(loc, namespace) as Record<string, TranslationValue>;
        result[`${loc}:${namespace}`] = toPlainObject(translations);
      }
    }
  }

  if (!hasLoader && Object.keys(result).length === 0) {
    warnNoLoader(i18n, loaderHost ? NO_LOADER_REGISTERED_MESSAGE : NO_LOADER_CAPABILITY_MESSAGE);
  }

  return result;
}
