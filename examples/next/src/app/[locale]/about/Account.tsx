"use client";

import { useEffect } from "react";
import { useI18n } from "@comvi/next/client";
import { useName } from "../cards/useName";

/**
 * The client half of the `account` namespace. `useI18n("account")` scopes
 * `t()` to it and loads nothing: the catalog is here because the layout's
 * `<ComviProvider namespaces>` shipped it with the page.
 */
export function Account() {
  const { t } = useI18n("account");

  const name = useName();

  // Marks the document once React has hydrated it.
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);

  return (
    <>
      <p className="widget" data-testid="account-signed-in">
        {t("profile.signed_in", { name })}
      </p>
      {/* Only `account/en.json` has this key: the fallback chain is walked
          inside the same namespace, and the provider shipped en's catalog too. */}
      <p className="widget" data-testid="account-only-en">
        {t("profile.only_en")}
      </p>
    </>
  );
}
