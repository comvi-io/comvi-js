"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@comvi/next/client";

/**
 * The client half of the `account` namespace. `useI18n("account")` scopes
 * `t()` to it and loads nothing: the catalog is here because the layout's
 * `<ComviProvider namespaces>` shipped it with the page.
 */
export function Account() {
  const { t } = useI18n("account");

  // "Ada", or `?name=…`, read after mount as on the demo page.
  const [name, setName] = useState("Ada");
  useEffect(() => {
    const fromQuery = new URLSearchParams(location.search).get("name");
    if (fromQuery !== null) setName(fromQuery);
  }, []);

  // A marker for the e2e suite: set once React has hydrated this tree.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <>
      <p data-testid="account-signed-in">{t("profile.signed_in", { name })}</p>
      {/* Only `account/en.json` has this key: the fallback chain is walked
          inside the same namespace, and the provider shipped en's catalog too. */}
      <p data-testid="account-only-en">{t("profile.only_en")}</p>
    </>
  );
}
