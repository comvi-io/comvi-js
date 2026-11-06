"use client";

import { useEffect } from "react";
import { useI18n } from "@comvi/react";
import { Link, usePathname } from "@comvi/next/navigation";

export function Navigation() {
  const { t, locale } = useI18n();
  const path = usePathname();
  // The e2e waits for this: the layout's client tree has hydrated.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
  }, []);
  return (
    <nav>
      <span data-testid="nav-locale">{locale}</span>
      <Link href="/" data-testid="nav-home">
        {t("nav.home")}
      </Link>
      <Link href="/admin" data-testid="nav-admin">
        {t("nav.namespaces")}
      </Link>
      {["en", "uk", "de", "ar"].map((l) => (
        <Link key={l} href={path} locale={l} data-testid={`switch-${l}`}>
          {l}
        </Link>
      ))}
    </nav>
  );
}
