// Framework size fixture: the Next middleware graph an app's `middleware.ts`
// ships to the Edge runtime — `createMiddleware` from `@comvi/next/middleware`,
// with the routing helpers it reaches and nothing under `src/server/`.
import { createMiddleware } from "@comvi/next/middleware";

console.log(createMiddleware({ locales: ["en", "de"], defaultLocale: "en" }));
