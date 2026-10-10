import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "./i18n/routing";

// Redirects `/` to the visitor's locale and keeps every path prefixed with one.
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
