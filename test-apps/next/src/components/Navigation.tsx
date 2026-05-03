"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@comvi/next/client";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useEffect } from "react";

const navItems = [
  { path: "", label: "nav.home" },
  { path: "/plurals", label: "nav.plurals" },
  { path: "/rich-text", label: "nav.rich_text" },
  { path: "/namespaces", label: "nav.namespaces" },
  { path: "/rtl", label: "nav.rtl" },
] as const;

export function Navigation() {
  const { t, isLoading, locale } = useI18n();
  const pathname = usePathname();

  // Handle RTL for Arabic
  useEffect(() => {
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  // Extract the path without locale prefix
  const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";

  return (
    <nav className="bg-white shadow mb-8 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-blue-600">Comvi Next.js Example</h1>
        </div>
        <div className="flex gap-4 items-center">
          {isLoading && <div className="text-sm text-gray-500 italic">{t("common.loading")}</div>}
          <LanguageSwitcher />
        </div>
      </div>
      <div className="container mx-auto px-4 border-t flex gap-2 overflow-x-auto py-2">
        {navItems.map((item) => {
          const isActive =
            item.path === ""
              ? pathWithoutLocale === "/" || pathWithoutLocale === ""
              : pathWithoutLocale === item.path;

          return (
            <Link
              key={item.path}
              href={item.path || "/"}
              className={`px-3 py-2 rounded text-sm hover:bg-gray-100 whitespace-nowrap transition-colors ${
                isActive ? "bg-blue-50 text-blue-700 font-medium" : ""
              }`}
            >
              {t(item.label)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
