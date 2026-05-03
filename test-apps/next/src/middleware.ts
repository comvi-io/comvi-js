import { createMiddleware } from "@comvi/next/middleware";
import { routing } from "./i18n/config";

export default createMiddleware(routing);

export const config = {
  matcher: [
    "/((?!api|_next|_vercel|.*\\.(?:avif|bmp|css|csv|eot|gif|ico|jpeg|jpg|js|json|map|mjs|mp3|mp4|otf|pdf|png|svg|txt|ttf|wav|webm|webmanifest|webp|woff|woff2|xml|zip)$).*)",
  ],
};
