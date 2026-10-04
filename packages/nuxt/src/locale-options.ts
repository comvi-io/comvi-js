import type {
  DetectBrowserLanguageOptions,
  LocaleCookieConfig,
  LocaleDetectionConfig,
  ResolveAcceptLanguage,
  ResolvedLocaleCookie,
  ResolvedLocaleDetection,
} from "./types";
import { DEFAULT_DETECTION_ORDER, DEFAULT_LOCALE_COOKIE } from "./runtime/defaults";

export interface LocaleOptionsInput {
  localeCookie?: LocaleCookieConfig;
  localeDetection?: false | LocaleDetectionConfig;
  /** The deprecated 0.4 spelling of both. */
  detectBrowserLanguage?: DetectBrowserLanguageOptions | false;
}

export interface ResolvedLocaleOptions {
  localeCookie: ResolvedLocaleCookie | false;
  localeDetection: ResolvedLocaleDetection | false;
  /** Build-time only: copied into `#build/comvi.detection` as source. */
  resolveAcceptLanguage?: ResolveAcceptLanguage;
  /** Set when the deprecated alias was used; the module prints it in dev. */
  warning?: string;
}

/**
 * Runtime config turns an `undefined` value into `""`, so an unset field must
 * be ABSENT from the resolved objects rather than present and undefined.
 */
function defined<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

/**
 * `localeCookie` and `localeDetection`, plus the deprecated
 * `detectBrowserLanguage`, resolved into the one shape the runtime reads.
 *
 * Build time only — the runtime never sees the alias. Each canonical option
 * that is given wins over the alias's half of it; `detectBrowserLanguage:
 * false` is both halves off. `redirectOnFirstVisit` and `fallbackLocale` have
 * no canonical spelling and are carried from the alias whatever else is set.
 */
export function resolveLocaleOptions(input: LocaleOptionsInput): ResolvedLocaleOptions {
  const alias = input.detectBrowserLanguage;
  const aliasObject = typeof alias === "object" && alias !== null ? alias : undefined;
  const cookieGiven = input.localeCookie !== undefined;
  const detectionGiven = input.localeDetection !== undefined;

  let localeCookie: ResolvedLocaleCookie | false;
  if (cookieGiven) {
    const cookie = input.localeCookie;
    const options = typeof cookie === "string" ? { name: cookie } : cookie || undefined;
    localeCookie = cookie === false ? false : defined({ ...DEFAULT_LOCALE_COOKIE, ...options });
  } else if (alias === false || aliasObject?.useCookie === false) {
    localeCookie = false;
  } else {
    localeCookie = defined({
      name: aliasObject?.cookieName ?? DEFAULT_LOCALE_COOKIE.name,
      maxAge: aliasObject?.cookieMaxAge ?? DEFAULT_LOCALE_COOKIE.maxAge,
      secure: aliasObject?.cookieSecure ?? DEFAULT_LOCALE_COOKIE.secure,
      sameSite: aliasObject?.sameSite ?? DEFAULT_LOCALE_COOKIE.sameSite,
      domain: aliasObject?.domain,
    });
  }

  const aliasOnly = {
    redirectOnFirstVisit: aliasObject?.redirectOnFirstVisit,
    fallbackLocale: aliasObject?.fallbackLocale,
  };
  let localeDetection: ResolvedLocaleDetection | false;
  let resolveAcceptLanguage: ResolveAcceptLanguage | undefined;
  if (detectionGiven) {
    const detection = input.localeDetection;
    resolveAcceptLanguage = detection ? detection.resolveAcceptLanguage : undefined;
    localeDetection =
      detection === false
        ? false
        : defined({
            order: [...(detection?.order ?? DEFAULT_DETECTION_ORDER)],
            queryParam: detection?.queryParam,
            headerName: detection?.headerName,
            ...aliasOnly,
          });
  } else if (alias === false) {
    localeDetection = false;
  } else {
    localeDetection = defined({
      order: [...DEFAULT_DETECTION_ORDER],
      queryParam: aliasObject?.queryParam,
      ...aliasOnly,
    });
  }

  let warning: string | undefined;
  if (alias !== undefined) {
    warning =
      cookieGiven || detectionGiven
        ? "[@comvi/nuxt] Both `detectBrowserLanguage` (deprecated) and `localeCookie`/`localeDetection` are set. `localeCookie` and `localeDetection` win. Drop `detectBrowserLanguage`: it is removed in 0.6."
        : "[@comvi/nuxt] `detectBrowserLanguage` is deprecated. Use `localeCookie` and `localeDetection`: the old option is removed in 0.6.";
  }

  return defined({ localeCookie, localeDetection, resolveAcceptLanguage, warning });
}

/**
 * The module's generated `#build/comvi.detection`: the app's
 * `resolveAcceptLanguage` copied in as source, since runtime config carries
 * JSON only. Method shorthand (`resolveAcceptLanguage(h) {…}`) is not an
 * expression on its own, so it is read back off an object literal.
 */
export function detectionTemplate(fn: ResolveAcceptLanguage | undefined): string {
  if (fn === undefined) {
    return "export const resolveAcceptLanguage = undefined;\n";
  }
  if (typeof fn !== "function") {
    throw new TypeError(
      "[@comvi/nuxt] `localeDetection.resolveAcceptLanguage` must be a function.",
    );
  }
  const source = Function.prototype.toString.call(fn);
  for (const expression of [`(${source})`, `Object.values({ ${source} })[0]`]) {
    try {
      // Parse only: the body is never run at build time. A bound or native
      // function's source is `function () { [native code] }`, which does not
      // parse, so it falls through to the error below.
      new Function(`return ${expression};`);
      return `export const resolveAcceptLanguage = ${expression};\n`;
    } catch {
      // Not this form; try the next.
    }
  }
  throw new TypeError(
    "[@comvi/nuxt] `localeDetection.resolveAcceptLanguage` could not be copied into the build. " +
      "Write it as a self-contained function expression: it cannot be a bound or native function.",
  );
}
