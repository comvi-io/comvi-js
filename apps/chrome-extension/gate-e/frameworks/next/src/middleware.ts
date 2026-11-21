import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
