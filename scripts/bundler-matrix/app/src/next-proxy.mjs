// The Next.js 16 `proxy.ts` recipe (COM-96), resolved through the PACKED
// exports map. `@comvi/next/proxy` re-exports the middleware entry, so the two
// subpaths must hand the app ONE function, from one shared module, and the
// graph must stay what an Edge or Node `proxy.ts` can carry: no `@comvi/core`
// and nothing under next's `dist/server/`. `createMiddleware` is not called —
// the `next/server` stub throws on use, and the routing behaviour is covered
// by the package's own tests; this case proves resolution and identity.
import { createMiddleware as fromProxy } from "@comvi/next/proxy";
import { createMiddleware as fromMiddleware } from "@comvi/next/middleware";

function assert(condition, label) {
  if (!condition) {
    console.error(`FAIL ${label}`);
    process.exit(1);
  }
}

assert(typeof fromProxy === "function", "@comvi/next/proxy exports createMiddleware");
assert(fromProxy === fromMiddleware, "/proxy and /middleware export the same createMiddleware");

console.log("BUNDLER_MATRIX_OK next-proxy");
