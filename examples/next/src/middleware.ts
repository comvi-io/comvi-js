import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "./i18n/config";

// `createMiddleware(routing)` is the whole API, and this is the whole file. It
// takes the same `routing` value `createNextI18n` produced, so the URL rules the
// middleware enforces and the ones the app renders with are one object.
export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
