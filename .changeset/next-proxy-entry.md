---
"@comvi/next": patch
---

Add `@comvi/next/proxy` for Next.js 16's `proxy.ts` file convention. Next 16 renamed `middleware.ts` to `proxy.ts` with the same request handler, so `@comvi/next/proxy` exports the same `createMiddleware` as `@comvi/next/middleware`: write `export default createMiddleware(routing)` in `src/proxy.ts` on Next 16. `@comvi/next/middleware` stays for Next 15's `middleware.ts`, and both subpaths hand out one function. Next 16 runs `proxy.ts` on the Node.js runtime and rejects a `runtime` option there; `createMiddleware` runs on either runtime.
