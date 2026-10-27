/**
 * @comvi/core/plugins — the locale detector and persistence that `@comvi/plugin-locale-
 * detector` provided (R3-11), over the one `negotiate()` (locale.ts).
 *
 * ```ts
 * import { createI18n } from "@comvi/core";
 * import { detect, persist } from "@comvi/core/plugins";
 *
 * const i18n = createI18n({
 *   locale: "en",
 *   plugins: [detect({ supported: ["en", "de", "pt-BR"] }), persist()],
 * });
 * ```
 *
 * `detect()` is a plugin (design §3.3): in `setup` — before the instance starts its first
 * loads — it switches to the first source in `order` that names a supported locale:
 * `query` (`?lang=`), `cookie` (`comvi_locale`), `storage` (localStorage `comvi_locale`),
 * `navigator` (`navigator.languages`). The answer is the supported entry AS SPELLED. So
 * nothing is loaded for the `locale` option when a source names another locale; `locale`
 * is the answer when none does (or the detected locale fails to load at all).
 * `persist()` writes every locale switch back (cookie by default, or localStorage).
 * Outside a browser both read and write nothing.
 */
import type { Plugin } from "./instance";
import { negotiate } from "./locale";

/** The cookie and storage key `detect()` reads and `persist()` writes. */
export const LOCALE_KEY = "comvi_locale";

export type DetectSource = "query" | "cookie" | "storage" | "navigator";

export interface DetectOptions {
  /** The locales the app has, as it spells them. */
  supported: readonly string[];
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

/**
 * The plugin that starts the instance in the first supported locale a source names. A
 * detected locale that fails to load entirely leaves the instance on its `locale` option,
 * which is then loaded.
 */
export const detect = ({
  supported,
  order = ["query", "cookie", "storage", "navigator"],
  query = "lang",
  key = LOCALE_KEY,
}: DetectOptions): Plugin => ({
  name: "detect",
  setup(i18n) {
    if (typeof document != "undefined")
      for (const s of order) {
        const hit = negotiate(read(s, query, key), supported);
        if (hit) {
          if (hit != i18n.locale)
            i18n.setLocale(hit).catch(() => i18n.setLocale(i18n.locale).catch(() => {}));
          return;
        }
      }
  },
});

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
