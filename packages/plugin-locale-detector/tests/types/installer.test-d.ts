// Type-level contract for this package's installer/factory pair.
//
// `localeDetector` (lowercase) belongs to `.with`, `LocaleDetector`
// (uppercase) to `.use`, and NEITHER is branded — the two are kept apart by
// their signatures alone, which is exactly what these assertions pin.
import { createI18n } from "@comvi/core";
import { plugins } from "@comvi/core/plugins";
import { LocaleDetector, localeDetector, type LocaleDetectorInstaller } from "../../src/index";

const OPTIONS = { supportedLocales: ["en", "uk"], caches: ["cookie" as const] };

// VALID — `.with(localeDetector(…))` widens the BASE host with the plugin
// host API, and with nothing else: the detector loads no catalog, so no
// loader capability is composed.
export const composed = createI18n({ locale: "en" }).with(localeDetector(OPTIONS));
void composed.use;
void composed.registerLocaleDetector;
void composed.getLanguageDetector;
void composed.setPluginData;
void composed.t;

// @ts-expect-error — no loader capability was attached, so none is promised.
void composed.registerLoader;

// The exported installer type names that contract, and options are optional.
export const installer: LocaleDetectorInstaller = localeDetector();

// Composing twice stays the same type — the attach is idempotent.
export const twice = composed.with(localeDetector(OPTIONS));
void twice.use;

// WRONG — the uppercase PLUGIN through `.with`. A plugin demands a plugin
// host; the pipe hands it whatever it was called on.
// @ts-expect-error
createI18n({ locale: "en" }).with(LocaleDetector(OPTIONS));

// WRONG — the lowercase INSTALLER through `.use`. An installer returns a
// host, and a plugin may only return nothing or a cleanup function.
// @ts-expect-error
createI18n({ locale: "en" }).with(plugins()).use(localeDetector(OPTIONS));

// VALID — the uppercase factory on a host that already has the capability.
export const manual = createI18n({ locale: "en" }).with(plugins());
manual.use(LocaleDetector(OPTIONS));
