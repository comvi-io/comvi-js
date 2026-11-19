import "server-only";
import { cdn } from "@comvi/core/cdn";
import { createGetI18n } from "@comvi/next/server";
import { CDN, NAMESPACES, routing } from "./routing";

export const getI18n = createGetI18n({
  ...routing,
  fallbackLocale: "en",
  namespaces: NAMESPACES,
  timeZone: "UTC",
  loader: cdn(CDN),
});
