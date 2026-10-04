// Type-level contract for this package's installer/factory pair.
//
// `fetchLoader` (no suffix) belongs to `.use`, `fetchLoaderPlugin` (the suffix) to
// `.use`, and NEITHER is branded — the two are kept apart by their signatures
// alone, which is exactly what these assertions pin.
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { fetchLoaderPlugin, fetchLoader, type FetchLoaderInstaller } from "../../src/api";

const OPTIONS = { cdnUrl: "https://cdn.comvi.io/distribution" };

// VALID — `.use(fetchLoader(…))` widens the BASE host with exactly the two
// capabilities the installer attaches, and nothing more.
export const composed = createI18n({ locale: "en" }).use(fetchLoader(OPTIONS));
void composed.registerLoader;
void composed.reloadMessages;
void composed.onLoadError;
void composed.use;
void composed.setPluginData;
void composed.t;

// The exported installer type names that contract.
export const installer: FetchLoaderInstaller = fetchLoader(OPTIONS);

// Composing twice stays the same type — both attaches are idempotent.
export const twice = composed.use(fetchLoader(OPTIONS));
void twice.registerLoader;

// WRONG — the `*Plugin` FACTORY through `.use`. A plugin demands a plugin
// host; the pipe hands it whatever it was called on.
// @ts-expect-error
createI18n({ locale: "en" }).use(fetchLoaderPlugin(OPTIONS));

// WRONG — the bare-name INSTALLER through `.use`. An installer returns a
// host, and a plugin may only return nothing or a cleanup function.
// @ts-expect-error
createI18n({ locale: "en" }).use(plugins()).registerPlugin(fetchLoader(OPTIONS));

// VALID — the `*Plugin` factory on a host that already has both capabilities.
export const manual = createI18n({ locale: "en" }).use(attachLoader).use(plugins());
manual.registerPlugin(fetchLoaderPlugin(OPTIONS));
