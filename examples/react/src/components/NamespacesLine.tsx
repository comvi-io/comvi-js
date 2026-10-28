import { useSyncExternalStore } from "react";
import { useI18n } from "@comvi/react";
import { fetched } from "../i18n";

export function NamespacesLine() {
  const { t } = useI18n();
  const { namespaces } = useSyncExternalStore(fetched.subscribe, fetched.get);
  return <code>{t("demo.lazy.namespaces", { namespaces: namespaces.join(", ") })}</code>;
}
