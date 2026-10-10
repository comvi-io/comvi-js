"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@comvi/next/client";

/** The namespaces this browser has active, read after mount for the same reason as the locales. */
export function Namespaces() {
  const { t, locale, isLoading, getActiveNamespaces } = useI18n();
  const [namespaces, setNamespaces] = useState<string[]>([]);
  useEffect(() => {
    setNamespaces(getActiveNamespaces());
  }, [locale, isLoading, getActiveNamespaces]);
  return <div>{t("demo.lazy.namespaces", { namespaces: namespaces.join(", ") })}</div>;
}
