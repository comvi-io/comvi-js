import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "./i18n/routing";

// Redirects `/` to the visitor's locale and keeps every path prefixed with one.
//
// This example runs Next.js 15, so the file is `middleware.ts`. On Next.js 16
// name it `src/proxy.ts` and import `createMiddleware` from "@comvi/next/proxy"
// instead: the same function under the new file convention.
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
