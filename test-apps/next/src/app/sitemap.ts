import type { MetadataRoute } from "next";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/config";

const baseUrl = "https://example.com";

// All pages in the app (without locale prefix)
const pages = ["/", "/plurals", "/rich-text", "/namespaces", "/rtl"];

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.flatMap((page) =>
    routing.locales.map((locale) => ({
      url: `${baseUrl}${getPathname({ locale, href: page })}`,
      lastModified: new Date(),
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, `${baseUrl}${getPathname({ locale: l, href: page })}`]),
        ),
      },
    })),
  );
}
