import type { CdnLayoutOptions } from "./options";
import { stripSlash, validateId } from "./http-core";

/**
 * Build CDN URL for production mode
 * - Root namespace: {cdnUrl}/{locale}.json
 * - Other namespaces: {cdnUrl}/{ns}/{locale}.json
 */
export function buildCdnUrl(
  cdnUrl: string,
  locale: string,
  namespace: string,
  defaultNs: string,
  layout: CdnLayoutOptions = {},
): string {
  validateId(locale, "locale");
  validateId(namespace, "namespace");
  const rootNamespace = layout.rootNamespace === undefined ? defaultNs : layout.rootNamespace;
  if (rootNamespace !== false) validateId(rootNamespace, "CDN root namespace");
  const base = stripSlash(cdnUrl);
  return rootNamespace !== false && namespace === rootNamespace
    ? `${base}/${locale}.json`
    : `${base}/${namespace}/${locale}.json`;
}
