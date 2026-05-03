// Routing configuration (server-safe)
// For client-side navigation components, use @comvi/next/navigation
export { defineRouting, hasLocale, createGetPathname } from "./routing/defineRouting";

export type { GetPathnameOptions } from "./routing/defineRouting";

export type { RoutingConfig, LocalePrefixMode } from "./routing/types";
