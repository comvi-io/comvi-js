// Informational BASELINE: the uppercase `FetchLoader` plugin on a host the
// app composed itself — the recipe that predates the lowercase installer.
//
// The low-level `attachLoader` / `attachPlugins` are used deliberately, not
// `loader()` / `plugins()`: those are what `fetchLoader()` calls internally,
// so this row and `plugin-fetch-loader-with` differ by the installer and its
// nested-use guard and by nothing else. `loader()` would additionally drag in
// the import-map adapter it names statically (+124 B measured on
// `core-base-loader`) and make the pair incomparable.
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { attachPlugins } from "@comvi/core/plugins";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).with(attachLoader).with(attachPlugins);
i18n.use(FetchLoader({ cdnUrl: "https://cdn.comvi.io/distribution" }));

console.log(i18n.t("hello" as never));
