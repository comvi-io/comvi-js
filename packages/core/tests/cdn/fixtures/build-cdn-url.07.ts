/**
 * FROZEN COPY of `buildCdnUrl` from @comvi/plugin-fetch-loader 0.7
 * (packages/plugin-fetch-loader/src/cdn-url.ts + the id check of http-core.ts), the URL
 * builder `cdn()` must match (S5 parity, 96/96). Kept here because the package itself is
 * removed in lot 2c.
 */
const VALID_ID = /^[\w\-@.]+$/;
const isSafeId = (value: string): boolean =>
  !!value && value !== "." && value !== ".." && VALID_ID.test(value);
const validateId = (value: string, label: string): void => {
  if (!isSafeId(value)) throw new Error(`Invalid ${label}: "${value}"`);
};

export function buildCdnUrl(
  cdnUrl: string,
  locale: string,
  namespace: string,
  defaultNs: string,
  layout: { rootNamespace?: string | false } = {},
): string {
  validateId(locale, "locale");
  validateId(namespace, "namespace");
  const rootNamespace = layout.rootNamespace === undefined ? defaultNs : layout.rootNamespace;
  if (rootNamespace !== false) validateId(rootNamespace, "CDN root namespace");
  const base = cdnUrl.replace(/\/$/, "");
  return rootNamespace !== false && namespace === rootNamespace
    ? `${base}/${locale}.json`
    : `${base}/${namespace}/${locale}.json`;
}
