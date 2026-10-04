/**
 * The routing-policy contract `@comvi/next` and `@comvi/nuxt` share: the same
 * settings and the same request must produce the same answer in both.
 *
 * Every row runs through BOTH middlewares (next's `createMiddleware`, nuxt's
 * global route middleware) and BOTH server helpers (next's `getI18n()` after
 * its middleware, nuxt's `useTranslation(event)`), from thin fixtures:
 * `packages/next/tests/routing-policy-contract.test.ts` and
 * `packages/nuxt/tests/routing-policy-contract.test.ts`. A row cannot be fixed
 * for one adapter while the other fails. See `docs/design/next-nuxt-parity.md`.
 *
 * Settings use the shared vocabulary, `localeCookie` and `localeDetection`,
 * exactly as an app writes them. The one value the two packages may answer
 * differently is the DEFAULT cookie name (`NEXT_LOCALE` against `i18n_locale`,
 * allowed by the ADR), so a row that relies on it says {@link DEFAULT_COOKIE}
 * and each fixture substitutes its own.
 *
 * Out of the table on purpose: a prefixless NON-root path together with a
 * stored preference under `as-needed`. That is the documented known difference
 * (next redirects to the cookie locale, nuxt serves the default), pinned by the
 * two `parity-known-difference` tests until 0.6 gives it an option. Every
 * prefixless row here therefore requests `/`.
 *
 * Test data, so a workspace-package export like the other two tables: it
 * resolves from inside a Stryker sandbox.
 */

/** Stands for each framework's own default cookie name. */
export const DEFAULT_COOKIE = "<framework default>";

export type DetectionSource = "query" | "cookie" | "header" | "accept-language";

export interface RoutingPolicySettings {
  localeCookie?:
    | false
    | string
    | {
        name?: string;
        maxAge?: number;
        secure?: boolean;
        sameSite?: "lax" | "strict" | "none";
        domain?: string;
      };
  localeDetection?:
    | false
    | {
        order?: DetectionSource[];
        queryParam?: string;
        headerName?: string;
      };
}

export interface PolicyRequest {
  /** The path the browser asked for, without the query. */
  path: string;
  query?: Record<string, string>;
  /** Request cookies by name; {@link DEFAULT_COOKIE} names the framework's own. */
  cookies?: Record<string, string>;
  /** Request headers, lower-case names. */
  headers?: Record<string, string>;
}

/** Every row uses the same routing: four locales, `en` the default, `as-needed`. */
export const POLICY_LOCALES = ["en", "de", "fr", "uk"] as const;
export const POLICY_DEFAULT_LOCALE = "en";

// ---------------------------------------------------------------------------
// B6 — detection precedence: path > query > cookie > header > default
// ---------------------------------------------------------------------------

export interface DetectionCase {
  why: string;
  settings: RoutingPolicySettings;
  request: PolicyRequest;
  /** The locale the request renders in. */
  expected: string;
}

const QUERY = { localeDetection: { queryParam: "lang" } } as const;

export const DETECTION_PRECEDENCE_CASES: readonly DetectionCase[] = [
  {
    why: "the path wins over the query, the cookie and Accept-Language",
    settings: QUERY,
    request: {
      path: "/de/about",
      query: { lang: "fr" },
      cookies: { [DEFAULT_COOKIE]: "uk" },
      headers: { "accept-language": "fr" },
    },
    expected: "de",
  },
  {
    why: "the query wins over the cookie and Accept-Language",
    settings: QUERY,
    request: {
      path: "/",
      query: { lang: "fr" },
      cookies: { [DEFAULT_COOKIE]: "uk" },
      headers: { "accept-language": "de" },
    },
    expected: "fr",
  },
  {
    why: "the cookie wins over Accept-Language",
    settings: {},
    request: {
      path: "/",
      cookies: { [DEFAULT_COOKIE]: "uk" },
      headers: { "accept-language": "de" },
    },
    expected: "uk",
  },
  {
    why: "Accept-Language wins over the default",
    settings: {},
    request: { path: "/", headers: { "accept-language": "de" } },
    expected: "de",
  },
  {
    why: "the default locale when no source answers",
    settings: {},
    request: { path: "/" },
    expected: "en",
  },
  {
    why: "a configured header wins where the order puts it first",
    settings: { localeDetection: { order: ["header", "cookie"], headerName: "x-locale" } },
    request: { path: "/", cookies: { [DEFAULT_COOKIE]: "de" }, headers: { "x-locale": "uk" } },
    expected: "uk",
  },
  {
    why: "Accept-Language wins over the cookie where the order puts it first",
    settings: { localeDetection: { order: ["accept-language", "cookie"] } },
    request: {
      path: "/",
      cookies: { [DEFAULT_COOKIE]: "uk" },
      headers: { "accept-language": "de" },
    },
    expected: "de",
  },
  {
    why: "the query is not read when the order leaves it out",
    settings: { localeDetection: { order: ["cookie"], queryParam: "lang" } },
    request: { path: "/", query: { lang: "fr" }, cookies: { [DEFAULT_COOKIE]: "uk" } },
    expected: "uk",
  },
  {
    why: "the query is not read without queryParam",
    settings: {},
    request: { path: "/", query: { lang: "fr" } },
    expected: "en",
  },
  {
    why: "a path segment that is not a configured locale is not a locale",
    settings: {},
    request: { path: "/zz/about" },
    expected: "en",
  },
  {
    why: "a query naming an unsupported locale falls through to the cookie",
    settings: QUERY,
    request: { path: "/", query: { lang: "zz" }, cookies: { [DEFAULT_COOKIE]: "uk" } },
    expected: "uk",
  },
  {
    why: "a cookie naming an unsupported locale falls through to Accept-Language",
    settings: {},
    request: {
      path: "/",
      cookies: { [DEFAULT_COOKIE]: "zz" },
      headers: { "accept-language": "de" },
    },
    expected: "de",
  },
  {
    why: "a header naming an unsupported locale falls through to the cookie",
    settings: { localeDetection: { order: ["header", "cookie"], headerName: "x-locale" } },
    request: { path: "/", cookies: { [DEFAULT_COOKIE]: "uk" }, headers: { "x-locale": "zz" } },
    expected: "uk",
  },
  {
    why: "Accept-Language naming only unsupported locales leaves the default",
    settings: {},
    request: { path: "/", headers: { "accept-language": "ja, ko;q=0.8" } },
    expected: "en",
  },
  {
    why: "q=0 refuses a locale, and the next one is taken",
    settings: {},
    request: { path: "/", headers: { "accept-language": "de;q=0, fr;q=0.5" } },
    expected: "fr",
  },
  {
    why: "q=0 on the only match leaves the default",
    settings: {},
    request: { path: "/", headers: { "accept-language": "de;q=0" } },
    expected: "en",
  },
  {
    why: "detection off ignores the query, the cookie and Accept-Language",
    settings: { localeDetection: false },
    request: {
      path: "/",
      query: { lang: "fr" },
      cookies: { [DEFAULT_COOKIE]: "uk" },
      headers: { "accept-language": "de" },
    },
    expected: "en",
  },
  {
    why: "detection off still takes the locale from the path",
    settings: { localeDetection: false },
    request: { path: "/de/about", cookies: { [DEFAULT_COOKIE]: "uk" } },
    expected: "de",
  },
  {
    why: "localeCookie: false reads no cookie",
    settings: { localeCookie: false },
    request: {
      path: "/",
      cookies: { [DEFAULT_COOKIE]: "uk" },
      headers: { "accept-language": "de" },
    },
    expected: "de",
  },
  {
    why: "a renamed cookie is read by its new name only",
    settings: { localeCookie: "LANG" },
    request: { path: "/", cookies: { LANG: "uk", [DEFAULT_COOKIE]: "de" } },
    expected: "uk",
  },
];

// ---------------------------------------------------------------------------
// B8 — cookie control
// ---------------------------------------------------------------------------

export interface WrittenCookie {
  /** {@link DEFAULT_COOKIE} for the framework's own default name. */
  name: string;
  value: string;
  maxAge: number;
  sameSite: "lax" | "strict" | "none";
  secure: boolean;
  domain?: string;
}

export interface CookieCase {
  why: string;
  settings: RoutingPolicySettings;
  request: PolicyRequest;
  /** Evaluate with the framework's development flag on. */
  dev?: boolean;
  /** The cookie the response writes, or `null` for no cookie written. */
  expected: WrittenCookie | null;
  /** The locale both the middleware and the server helper resolve. */
  locale: string;
}

export const COOKIE_CONTROL_CASES: readonly CookieCase[] = [
  {
    why: "the defaults: a year, lax, secure, the framework's name",
    settings: {},
    request: { path: "/de/about" },
    locale: "de",
    expected: {
      name: DEFAULT_COOKIE,
      value: "de",
      maxAge: 31536000,
      sameSite: "lax",
      secure: true,
    },
  },
  {
    why: "every attribute of the localeCookie object",
    settings: {
      localeCookie: {
        name: "LANG",
        maxAge: 600,
        secure: false,
        sameSite: "strict",
        domain: ".example.com",
      },
    },
    request: { path: "/de/about" },
    locale: "de",
    expected: {
      name: "LANG",
      value: "de",
      maxAge: 600,
      sameSite: "strict",
      secure: false,
      domain: ".example.com",
    },
  },
  {
    why: "a localeCookie string renames the cookie and keeps the default attributes",
    settings: { localeCookie: "LANG" },
    request: { path: "/uk/about" },
    locale: "uk",
    expected: { name: "LANG", value: "uk", maxAge: 31536000, sameSite: "lax", secure: true },
  },
  {
    why: "localeCookie: false writes nothing",
    settings: { localeCookie: false },
    request: { path: "/de/about" },
    locale: "de",
    expected: null,
  },
  {
    why: "development drops Secure so localhost over HTTP keeps the cookie",
    settings: { localeCookie: { secure: true } },
    request: { path: "/de/about" },
    locale: "de",
    dev: true,
    expected: {
      name: DEFAULT_COOKIE,
      value: "de",
      maxAge: 31536000,
      sameSite: "lax",
      secure: false,
    },
  },
  {
    why: "nothing is written when the request cookie already holds the locale",
    settings: {},
    request: { path: "/de/about", cookies: { [DEFAULT_COOKIE]: "de" } },
    locale: "de",
    expected: null,
  },
  {
    why: "detection off still persists the path's locale",
    settings: { localeDetection: false },
    request: { path: "/fr/about" },
    locale: "fr",
    expected: {
      name: DEFAULT_COOKIE,
      value: "fr",
      maxAge: 31536000,
      sameSite: "lax",
      secure: true,
    },
  },
];

// ---------------------------------------------------------------------------
// B10 — the server helper's result and its `ns` option
// ---------------------------------------------------------------------------

/** The catalog every B10 row reads. `defaultNs` is `common`. */
export const HELPER_DEFAULT_NS = "common";
export const HELPER_CATALOGS: Record<string, Record<string, string>> = {
  "en:common": { title: "Common EN", onlyCommon: "yes" },
  "en:admin": { title: "Admin EN" },
  "de:common": { title: "Common DE", onlyCommon: "ja" },
  "de:admin": { title: "Admin DE" },
};

export interface HelperCase {
  why: string;
  /** The options object handed to `getI18n(…)` / `useTranslation(event, …)`. */
  options: { locale: string; ns?: string };
  /** Each call made on the result, and what it must return. */
  calls: ReadonlyArray<
    | { t: string; params?: { ns?: string }; expected: string }
    | { has: string; params?: { ns?: string; locale?: string }; expected: boolean }
  >;
}

/** The result's members, sorted: the shape both helpers return. */
export const HELPER_RESULT_KEYS = ["hasTranslation", "locale", "t"] as const;

export const SERVER_HELPER_CASES: readonly HelperCase[] = [
  {
    why: "no ns binds defaultNs",
    options: { locale: "de" },
    calls: [
      { t: "title", expected: "Common DE" },
      { has: "onlyCommon", expected: true },
    ],
  },
  {
    why: "ns binds that namespace into t() and hasTranslation()",
    options: { locale: "de", ns: "admin" },
    calls: [
      { t: "title", expected: "Admin DE" },
      { has: "onlyCommon", expected: false },
    ],
  },
  {
    why: "a per-call ns overrides the bound one",
    options: { locale: "en", ns: "admin" },
    calls: [
      { t: "title", params: { ns: "common" }, expected: "Common EN" },
      { has: "onlyCommon", params: { ns: "common" }, expected: true },
    ],
  },
  {
    why: "an empty ns counts as not given",
    options: { locale: "en", ns: "" },
    calls: [{ t: "title", expected: "Common EN" }],
  },
  {
    // `fr` has no catalog at all, so only the call's own locale can make this false.
    why: "hasTranslation takes a locale of its own",
    options: { locale: "en" },
    calls: [
      { has: "onlyCommon", expected: true },
      { has: "onlyCommon", params: { locale: "fr" }, expected: false },
    ],
  },
];
