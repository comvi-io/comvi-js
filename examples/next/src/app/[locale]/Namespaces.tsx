"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@comvi/next/client";

/**
 * The namespaces this browser's instance has active. Read AFTER mount, like the
 * fetched-locales line: on the server the instance is shared by every request,
 * so what it holds is a property of the process, not of this page.
 */
export function Namespaces() {
  const { t, locale, isLoading, getActiveNamespaces } = useI18n();
  const [namespaces, setNamespaces] = useState<string[]>([]);
  useEffect(() => {
    setNamespaces(getActiveNamespaces());
  }, [locale, isLoading, getActiveNamespaces]);
  return <div>{t("demo.lazy.namespaces", { namespaces: namespaces.join(", ") })}</div>;
}
