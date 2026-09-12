// Type-level contract for the CDN-only subpath.
//
// `CdnLoaderOptions` is the CDN SUBSET of `FetchLoaderOptions`: the options
// that only mean something on the API request path are absent, so reaching for
// one is a compile error rather than a silently ignored setting. The
// installer/factory split mirrors the root entry's.
import { createI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import { plugins } from "@comvi/core/plugins";
import { CdnLoader, cdnLoader, type CdnLoaderInstaller } from "../../src/cdn/index";

const OPTIONS = { cdnUrl: "https://cdn.comvi.io/distribution" };

// VALID — `.use(cdnLoader(…))` widens the BASE host with exactly the two
// capabilities the installer attaches.
export const composed = createI18n({ locale: "en" }).use(cdnLoader(OPTIONS));
void composed.registerLoader;
void composed.use;
void composed.t;

// The exported installer type names that contract.
export const installer: CdnLoaderInstaller = cdnLoader(OPTIONS);

// VALID — every CDN-side option.
export const full = cdnLoader({
  cdnUrl: "https://cdn.comvi.io/distribution",
  cdnLayout: { rootNamespace: false },
  fallback: { en: () => Promise.resolve({ default: { greeting: "Hello" } }) },
  timeout: 5000,
  loadOnInit: false,
  cache: { revalidate: 3600, tags: ["i18n"] },
  onLoadError: (_locale: string, _ns: string, _error: Error) => undefined,
  onLoadSuccess: (_locale: string, _ns: string) => undefined,
});

// WRONG — `baseUrl` is the API host. There is no API request here to point.
// @ts-expect-error
cdnLoader({ cdnUrl: "https://cdn.comvi.io/distribution", baseUrl: "https://api.comvi.io" });

// WRONG — `apiBaseUrl`, the legacy spelling of the same API host.
// @ts-expect-error
cdnLoader({ cdnUrl: "https://cdn.comvi.io/distribution", apiBaseUrl: "https://api.comvi.io" });

// WRONG — `retry` governs the project-info request, which is API-only.
// @ts-expect-error
cdnLoader({ cdnUrl: "https://cdn.comvi.io/distribution", retry: false });

// WRONG — the uppercase PLUGIN through `.use`.
// @ts-expect-error
createI18n({ locale: "en" }).use(CdnLoader(OPTIONS));

// WRONG — the lowercase INSTALLER through `.use`.
// @ts-expect-error
createI18n({ locale: "en" }).use(plugins()).registerPlugin(cdnLoader(OPTIONS));

// VALID — the uppercase factory on a host that already has both capabilities.
export const manual = createI18n({ locale: "en" }).use(attachLoader).use(plugins());
manual.registerPlugin(CdnLoader(OPTIONS));
