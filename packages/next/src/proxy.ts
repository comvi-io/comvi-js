/**
 * `@comvi/next/proxy`: the entry for Next.js 16's `proxy.ts` file convention.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts` with the same request handler
 * signature, so this is the SAME implementation as `@comvi/next/middleware`,
 * re-exported, not a copy: `createMiddleware` from either subpath is one
 * function. `@comvi/next/middleware` stays for Next 15's `middleware.ts`.
 */
export * from "./middleware";
