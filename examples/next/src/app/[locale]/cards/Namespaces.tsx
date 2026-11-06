"use client";

import { useI18n } from "@comvi/react";

/** One key per namespace, to ask the instance which namespaces this page carries. */
const PROBES = { default: "app.title", account: "profile.signed_in" } as const;

/** The namespaces this page's instance holds: the server handed them over with the page. */
export function Namespaces() {
  const { t, i18n } = useI18n();
  const held = Object.entries(PROBES)
    .filter(([ns, key]) => i18n.has(key, { ns }))
    .map(([ns]) => ns);
  return <div>{t("demo.lazy.namespaces", { namespaces: held.join(", ") })}</div>;
}
