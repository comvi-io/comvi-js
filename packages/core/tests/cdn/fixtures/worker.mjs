// FROZEN COPY of the platform CDN worker (platform/apps/cdn-worker/src/index.ts), bundled by
// esbuild for the lot-0 S5 spike (js-sdk/.omc/artifacts/reference-i18n-2026-10/lot0/s5). The
// e2e test runs the worker that serves CDN v1 today under Node with an fs-backed R2 shim.
// Refresh: esbuild platform/apps/cdn-worker/src/index.ts --bundle --format=esm --platform=neutral
// eslint-disable
// platform/apps/cdn-worker/src/index.ts
var CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-max-age": "86400",
};
var CLIENT_CACHE_CONTROL = "public, max-age=30, must-revalidate, stale-if-error=604800";
var EDGE_CACHE_CONTROL = "public, max-age=30, s-maxage=86400";
function notFound() {
  return new Response("Not found", { status: 404, headers: CORS_HEADERS });
}
function metadataHeaders(metadata) {
  const headers = new Headers(CORS_HEADERS);
  metadata.writeHttpMetadata(headers);
  headers.set("etag", metadata.httpEtag);
  headers.set("last-modified", metadata.uploaded.toUTCString());
  return headers;
}
var index_default = {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.slice(1));
    if (!key) return notFound();
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const ifNoneMatch = request.headers.get("if-none-match");
    const cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("cache-control", CLIENT_CACHE_CONTROL);
      headers.set("x-cache-status", "HIT");
      if (request.method === "HEAD") {
        return new Response(null, { status: 200, headers });
      }
      if (ifNoneMatch && headers.get("etag") === ifNoneMatch) {
        return new Response(null, { status: 304, headers });
      }
      return new Response(cached.body, { status: cached.status, headers });
    }
    if (request.method === "HEAD") {
      const headObj = await env.BUCKET.head(key);
      if (!headObj) return notFound();
      const headers = metadataHeaders(headObj);
      headers.set("cache-control", CLIENT_CACHE_CONTROL);
      headers.set("x-cache-status", "MISS");
      return new Response(null, { status: 200, headers });
    }
    const obj = await env.BUCKET.get(key);
    if (!obj) return notFound();
    const body = await obj.arrayBuffer();
    const cacheHeaders = metadataHeaders(obj);
    cacheHeaders.set("cache-control", EDGE_CACHE_CONTROL);
    ctx.waitUntil(cache.put(cacheKey, new Response(body, { status: 200, headers: cacheHeaders })));
    const clientHeaders = metadataHeaders(obj);
    clientHeaders.set("cache-control", CLIENT_CACHE_CONTROL);
    clientHeaders.set("x-cache-status", "MISS");
    if (ifNoneMatch && clientHeaders.get("etag") === ifNoneMatch) {
      return new Response(null, { status: 304, headers: clientHeaders });
    }
    return new Response(body, { status: 200, headers: clientHeaders });
  },
};
export { index_default as default };
