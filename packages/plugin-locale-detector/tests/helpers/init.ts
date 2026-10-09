import { I18n } from "./composedInstance";
import type { LocaleDetectorOptions } from "../../src/index";
import { localeDetectorPlugin } from "../../src/index";

/** A composed host at `locale`, with no plugin registered yet. */
export function createI18n(locale: string = "en"): I18n {
  return new I18n({ locale, exposeGlobal: false });
}

/** The whole install path a consumer takes: `registerPlugin(localeDetectorPlugin(…))` then `init()`. */
export async function initWithPlugin(
  options: LocaleDetectorOptions = {},
  initialLocale: string = "en",
): Promise<I18n> {
  const i18n = createI18n(initialLocale);
  i18n.registerPlugin(localeDetectorPlugin(options));
  await i18n.init();

  return i18n;
}

/** The detector as narrowly as it is written, against the host this suite composes. */
type DetectorPlugin = (i18n: I18n) => () => void;

/**
 * `localeDetectorPlugin(options)` applied straight to a composed host, outside
 * `init()`, returning the plugin's cleanup.
 *
 * `I18nPlugin` is declared wider than this plugin is at both ends: its host is
 * the full composed surface, loader capability included, while the detector
 * reads `locale` and calls `registerLocaleDetector` and `on` only; and its
 * return spans four possibilities, while the detector always hands back a
 * synchronous cleanup. Naming the narrower shape once here keeps the call
 * sites free of per-call casts.
 */
export function installDetector(i18n: I18n, options: LocaleDetectorOptions = {}): () => void {
  return (localeDetectorPlugin(options) as unknown as DetectorPlugin)(i18n);
}
