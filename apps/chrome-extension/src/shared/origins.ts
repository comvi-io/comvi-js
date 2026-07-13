/**
 * Canonical origin handling.
 *
 * Origins arriving in messages are untrusted strings. Naive checks like
 * `startsWith("http://localhost")` are bypassable (http://localhost.evil.com,
 * http://localhost@evil.com), so every origin is parsed with the URL parser
 * and reduced to `url.origin`, with the scheme/host policy enforced here:
 * https everywhere, plain http only for exact loopback hosts.
 */

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Parse an untrusted origin-like string into a canonical origin, or null when
 * it is not acceptable. Rejects credentials, paths, queries and fragments —
 * the value must denote an origin, nothing more.
 */
export function canonicalizeOrigin(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.username || url.password) return null;
  // Allow a bare trailing slash (URL always reports pathname "/"), nothing else.
  if (url.pathname !== "/" || url.search || url.hash) return null;

  if (url.protocol === "https:") return url.origin;
  if (url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname)) return url.origin;

  return null;
}

/** Canonical origin of a full page URL (tab.url), or null when not permitted. */
export function canonicalizePageOrigin(pageUrl: unknown): string | null {
  if (typeof pageUrl !== "string" || pageUrl.length === 0) return null;
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return null;
  }
  return canonicalizeOrigin(url.origin);
}
