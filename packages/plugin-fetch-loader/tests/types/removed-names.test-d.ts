// 0.5 is a new library: a name that left the public API is GONE. `cdnUrl` is
// a required option with no default, so no exported CDN constant exists; the
// hosted default is `comviPreset.cdnBaseUrl`.
import * as api from "../../src/api";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type _NoCdnBaseUrl = Expect<
  Equal<"CDN_BASE_URL" extends keyof typeof api ? true : false, false>
>;

// The API host option is `baseUrl`; there is no second spelling of it.
export type _NoApiBaseUrlOption = Expect<
  Equal<"apiBaseUrl" extends keyof api.FetchLoaderOptions ? true : false, false>
>;
