/**
 * @comvi/core/plugins — the locale detector and persistence that `@comvi/plugin-locale-
 * detector` provided (R3-11), over the one `negotiate()` (locale.ts).
 *
 * ```ts
 * import { createI18n } from "@comvi/core";
 * import { detect, persist } from "@comvi/core/plugins";
 *
 * const supported = ["en", "de", "pt-BR"];
 * const i18n = createI18n({
 *   locale: detect({ supported, fallback: "en" }),
 *   plugins: [persist()],
 * });
 * ```
 *
 * `detect()` returns the start locale (so nothing is loaded for a locale that is about to
 * change): the first source in `order` that names a supported locale wins — `query`
 * (`?lang=`), `cookie` (`comvi_locale`), `storage` (localStorage `comvi_locale`),
 * `navigator` (`navigator.languages`). The answer is the supported entry AS SPELLED.
 * `persist()` writes every locale switch back (cookie by default, or localStorage).
 * Outside a browser both read and write nothing; `detect()` answers `fallback`.
 */
import type { Plugin } from "./instance";
import { negotiate } from "./locale";

/** The cookie and storage key `detect()` reads and `persist()` writes. */
export const LOCALE_KEY = "comvi_locale";

export type DetectSource = "query" | "cookie" | "storage" | "navigator";

export interface DetectOptions {
  /** The locales the app has, as it spells them. */
  supported: readonly string[];
  /** The answer when no source matches. Default: `supported[0]`. */
  fallback?: string;
  /** Sources, most trusted first. Default `["query", "cookie", "storage", "navigator"]`. */
  order?: readonly DetectSource[];
  /** The query parameter. Default `"lang"`. */
  query?: string;
  /** The cookie and localStorage key. Default `"comvi_locale"`. */
  key?: string;
}

const readCookie = (name: string): string | undefined => {
  for (const c of document.cookie.split(";")) {
    const i = c.indexOf("=");
    if (c.slice(0, i).trim() == name) return decodeURIComponent(c.slice(i + 1).trim());
  }
};

/** Reads one source; a source that throws (blocked storage, sandboxed cookies) reads nothing. */
const read = (source: DetectSource, query: string, key: string): readonly string[] => {
  try {
    const v =
      source == "query"
        ? new URLSearchParams(location.search).get(query)
        : source == "cookie"
          ? readCookie(key)
          : source == "storage"
            ? localStorage.getItem(key)
            : navigator.languages && navigator.languages.length
              ? navigator.languages
              : navigator.language;
    return v ? ([] as string[]).concat(v) : [];
  } catch {
    return [];
  }
};

/** The start locale: the first source in `order` that names a supported locale. */
export const detect = ({
  supported,
  fallback = supported[0],
  order = ["query", "cookie", "storage", "navigator"],
  query = "lang",
  key = LOCALE_KEY,
}: DetectOptions): string => {
  if (typeof document != "undefined")
    for (const s of order) {
      const hit = negotiate(read(s, query, key), supported);
      if (hit) return hit;
    }
  return fallback;
};

export interface PersistOptions {
  /** Where the locale goes. Default `"cookie"`. */
  to?: "cookie" | "storage";
  /** The cookie or localStorage key. Default `"comvi_locale"`. */
  key?: string;
  /** Cookie lifetime in seconds. Default one year. */
  maxAge?: number;
  /** Cookie path. Default `"/"`. */
  path?: string;
  /** Cookie domain. */
  domain?: string;
}

/** A plugin that writes every locale switch to a cookie (or localStorage). */
export const persist = ({
  to = "cookie",
  key = LOCALE_KEY,
  maxAge = 31536000,
  path = "/",
  domain,
}: PersistOptions = {}): Plugin => ({
  name: "persist",
  setup(i18n) {
    let last = i18n.locale;
    return i18n.on(() => {
      if (i18n.locale == last || typeof document == "undefined") return;
      last = i18n.locale;
      try {
        if (to == "storage") localStorage.setItem(key, last);
        else
          document.cookie =
            `${key}=${encodeURIComponent(last)}; path=${path}; max-age=${maxAge}; SameSite=Lax` +
            (domain ? `; domain=${domain}` : "") +
            (location.protocol == "https:" ? "; Secure" : "");
      } catch {
        /* blocked storage: nothing to persist into */
      }
    });
  },
});
