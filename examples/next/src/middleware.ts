import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "./i18n/routing";

// `createMiddleware(routing)` is the whole API, and this is the whole file.
//
// The import is `./i18n/routing`, NOT `./i18n/config`: an Edge isolate ships
// and executes every module this entry reaches, so importing the composed host
// for one plain object would put the whole i18n graph — and `createNextI18n()`
// plus `registerLoader()` at module scope — inside middleware. `config.ts`
// spreads the same object into the host, so the URL rules the middleware
// enforces and the ones the app renders with are still one source.
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
