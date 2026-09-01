import { I18n } from "./composedHost";
import type { LocaleDetectorOptions } from "../../src/index";
import { LocaleDetector } from "../../src/index";

/** A composed host at `locale`, with no plugin registered yet. */
export function createI18n(locale: string = "en"): I18n {
  return new I18n({ locale, exposeGlobal: false });
}

/** The whole install path a consumer takes: `.use(LocaleDetector(…))` then `init()`. */
export async function initWithPlugin(
  options: LocaleDetectorOptions = {},
  initialLocale: string = "en",
): Promise<I18n> {
  const i18n = createI18n(initialLocale);
  i18n.use(LocaleDetector(options));
  await i18n.init();

  return i18n;
}
