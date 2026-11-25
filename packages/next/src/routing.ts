// Routing configuration (server-safe)
// For client-side navigation components, use @comvi/next/navigation
export { defineRouting, hasLocale, createGetPathname } from "./routing/defineRouting";
export { getAlternates } from "./routing/alternates";

export type { GetPathnameOptions } from "./routing/defineRouting";
export type { Alternates } from "./routing/alternates";

export type { RoutingConfig, LocalePrefixMode } from "./routing/types";
export type { LocaleCookieConfig, LocaleCookieOptions } from "./middleware/types";
