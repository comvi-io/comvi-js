/**
 * The ONE server fallback-chain contract, run against `@comvi/next` and
 * `@comvi/nuxt`.
 *
 * The contract: before the server translates, the namespace it needs is loaded
 * for the request locale AND for every locale of the `fallbackLocale` chain, in
 * the order core's lookup walks it. A primary catalog already in the cache does
 * not skip the fallback loads. What the server could read for a render is what
 * reaches the client, so hydration renders the same text. A catalog that fails
 * to load is reported through `loadError`, never thrown, and the render
 * continues, with server and client agreeing on the raw key.
 *
 * Each row is data only. The adapter suites run every row through a thin
 * fixture:
 * - `packages/next/tests/ssr-fallback-contract.test.tsx` — `setRequestLocale`
 *   + `getI18n()`, then `loadTranslations()`, then `<I18nProvider messages>`
 *   through `renderToString` and `hydrateRoot`;
 * - `packages/nuxt/tests/ssr-fallback-contract.test.ts` — the server
 *   `useTranslation()` and `loadTranslations()`, and the app plugin's SSR pass,
 *   payload and client hydration.
 *
 * One table, two adapters: a row added here runs against both, and a row
 * cannot be "fixed" for one adapter while the other fails. This file is a
 * workspace-package export for the same reason as `acceptLanguageTable.ts`: it
 * must resolve from inside a Stryker sandbox.
 *
 * Catalog pairs are spelled `locale:namespace` throughout, the key shape both
 * adapters hand the client.
 */

/** Every row configures this namespace as the host's default. */
export const SSR_FALLBACK_DEFAULT_NS = "common";

/** Configured locales for every row. */
export const SSR_FALLBACK_LOCALES = ["en", "de", "fr", "uk"] as const;

/** What the loader answers, per `locale:namespace`. A pair absent here loads as `{}`. */
export const SSR_FALLBACK_CATALOGS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "en:common": { greeting: "Hello", onlyEn: "English only" },
  "de:common": { greeting: "Hallo", onlyDe: "Nur Deutsch" },
  "fr:common": { greeting: "Bonjour" },
  "uk:common": { greeting: "Привіт" },
  "en:admin": { title: "Admin" },
  "de:admin": { title: "Verwaltung", onlyDeAdmin: "Nur Verwaltung" },
  "fr:admin": { title: "Administration" },
};

export interface SsrFallbackRequest {
  /** The locale the request renders in. */
  locale: string;
  /**
   * Key → the text the server renders AND the client renders after hydration.
   * A key that resolves nowhere renders as itself.
   */
  expect: Readonly<Record<string, string>>;
  /**
   * The catalogs the client receives for the row's namespace, exactly, in
   * core's lookup order: the request locale, then the fallback chain.
   */
  clientCatalogs: readonly string[];
}

export interface SsrFallbackCase {
  /** What the row pins. Becomes the test name. */
  name: string;
  defaultLocale: string;
  fallbackLocale: string | readonly string[];
  /** The namespace the requests translate. Defaults to {@link SSR_FALLBACK_DEFAULT_NS}. */
  ns?: string;
  /** Catalogs already in the server host's cache before any request. */
  cached?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Pairs whose load rejects. */
  failing?: readonly string[];
  /** Run concurrently, each in its own request scope. */
  requests: readonly SsrFallbackRequest[];
  /** A client navigation after hydrating `requests[0]`. */
  navigation?: SsrFallbackRequest;
  /** Pairs the loader must have been asked for. */
  fetched?: readonly string[];
  /** Pairs the loader must never have been asked for. */
  notFetched?: readonly string[];
  /** Pairs reported through `loadError`, as a set. Empty: nothing reported. */
  loadErrors: readonly string[];
}

export const SSR_FALLBACK_CASES: readonly SsrFallbackCase[] = [
  {
    name: "defaultLocale ≠ fallbackLocale, key only in the fallback → the fallback text",
    defaultLocale: "en",
    fallbackLocale: "de",
    requests: [
      {
        locale: "fr",
        expect: { onlyDe: "Nur Deutsch", greeting: "Bonjour" },
        clientCatalogs: ["fr:common", "de:common"],
      },
    ],
    loadErrors: [],
  },
  {
    name: "primary catalog already cached, fallback absent → the fallback is loaded, not skipped",
    defaultLocale: "en",
    fallbackLocale: "de",
    cached: { "fr:common": { greeting: "Bonjour" } },
    requests: [
      {
        locale: "fr",
        expect: { onlyDe: "Nur Deutsch", greeting: "Bonjour" },
        clientCatalogs: ["fr:common", "de:common"],
      },
    ],
    fetched: ["de:common"],
    notFetched: ["fr:common"],
    loadErrors: [],
  },
  {
    name: "key only in the last catalog of a multi-step chain → resolved",
    defaultLocale: "uk",
    fallbackLocale: ["de", "en"],
    cached: { "fr:common": { greeting: "Bonjour" } },
    requests: [
      {
        locale: "fr",
        expect: { onlyEn: "English only", onlyDe: "Nur Deutsch" },
        clientCatalogs: ["fr:common", "de:common", "en:common"],
      },
    ],
    fetched: ["de:common", "en:common"],
    loadErrors: [],
  },
  {
    name: "a non-default namespace → its fallback is loaded for that namespace",
    defaultLocale: "en",
    fallbackLocale: "de",
    ns: "admin",
    cached: { "fr:admin": { title: "Administration" } },
    requests: [
      {
        locale: "fr",
        expect: { onlyDeAdmin: "Nur Verwaltung", title: "Administration" },
        clientCatalogs: ["fr:admin", "de:admin"],
      },
    ],
    fetched: ["de:admin"],
    notFetched: ["fr:admin"],
    loadErrors: [],
  },
  {
    name: "the direct server helper without a prior loadTranslations() → resolves through the chain",
    defaultLocale: "en",
    fallbackLocale: "de",
    requests: [
      {
        locale: "fr",
        expect: { onlyDe: "Nur Deutsch" },
        clientCatalogs: ["fr:common", "de:common"],
      },
    ],
    fetched: ["fr:common", "de:common"],
    loadErrors: [],
  },
  {
    name: "SSR → hydration → client navigation → the fallback text survives each step",
    defaultLocale: "en",
    fallbackLocale: "de",
    requests: [
      {
        locale: "fr",
        expect: { onlyDe: "Nur Deutsch", greeting: "Bonjour" },
        clientCatalogs: ["fr:common", "de:common"],
      },
    ],
    navigation: {
      locale: "uk",
      expect: { onlyDe: "Nur Deutsch", greeting: "Привіт" },
      clientCatalogs: ["uk:common", "de:common"],
    },
    loadErrors: [],
  },
  {
    name: "one fallback catalog fails to load → reported, the render continues, SSR and client agree",
    defaultLocale: "en",
    fallbackLocale: "de",
    failing: ["de:common"],
    requests: [
      {
        locale: "fr",
        expect: { onlyDe: "onlyDe", greeting: "Bonjour" },
        clientCatalogs: ["fr:common"],
      },
    ],
    loadErrors: ["de:common"],
  },
  {
    name: "concurrent requests in different locales → no locale or catalog leaks",
    defaultLocale: "en",
    fallbackLocale: "de",
    requests: [
      {
        locale: "fr",
        expect: { greeting: "Bonjour", onlyDe: "Nur Deutsch", onlyEn: "onlyEn" },
        clientCatalogs: ["fr:common", "de:common"],
      },
      {
        locale: "uk",
        expect: { greeting: "Привіт", onlyDe: "Nur Deutsch", onlyEn: "onlyEn" },
        clientCatalogs: ["uk:common", "de:common"],
      },
    ],
    loadErrors: [],
  },
];
