import type { Handover } from "@comvi/core/ssr";

/** A server payload of `locale` with no catalogs: what the routing tests render under. */
export const payloadFor = (locale: string): Handover => ({
  locale,
  timeZone: "UTC",
  serverNow: 0,
  catalogs: {},
});
