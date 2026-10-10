import { useI18n } from "@comvi/react";

export function NamespacesLine() {
  const { t, getActiveNamespaces } = useI18n();
  return <code>{t("demo.lazy.namespaces", { namespaces: getActiveNamespaces().join(", ") })}</code>;
}
