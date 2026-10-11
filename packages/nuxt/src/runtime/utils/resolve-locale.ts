/**
 * `Accept-Language` resolution, re-exported from the shared source.
 *
 * This file used to hold nuxt's own copy of the matcher. The copy is why `q=0`
 * was honoured in `@comvi/next` from its first release and ignored here until
 * 0.5: the same twenty lines, maintained twice. The rules now live in ONE
 * place, documented at `resolveAcceptLanguage` in
 * `packages/locale-routing/src/index.ts`, and both frameworks answer
 * identically — pinned by the shared input table in
 * `tooling/test-utils/acceptLanguageTable.ts`, asserted here and in
 * `packages/next/tests/accept-language-parity.test.ts`.
 *
 * The import is `../_vendor/locale-routing`, a COMMITTED copy of that source
 * (`pnpm --filter @comvi/nuxt vendor`, pinned byte-for-byte by
 * `tests/vendor-parity.test.ts`). `nuxt-module-build` transpiles `runtime/`
 * file by file and leaves bare specifiers alone, so a workspace package
 * imported here would ship as an unresolvable import; there is no bundling step
 * to inline it with. Same reason `locale-path.ts` imports from `_vendor/`.
 *
 * The module path stays put: the route middleware and the Nitro server utils
 * both import `resolveAcceptLanguage` from here, so this is the seam that keeps
 * them on the shared matcher.
 *
 * See `docs/design/next-nuxt-parity.md`.
 */
export { resolveAcceptLanguage } from "../_vendor/locale-routing";
