import { useEffect, useState } from "react";
import { useI18n, useI18nLoader } from "@comvi/react";

/** Rows from the `account` namespace, which loads the first time this renders. */
export function AccountDetails({ name }: { name: string }) {
  const { t } = useI18n("account");
  const { t: tApp } = useI18n();
  const { addActiveNamespace } = useI18nLoader();

  // Activating keeps `account` loaded across later locale switches. The rows
  // wait for it to settle; a failed load has already reached `onError`.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const done = () => setReady(true);
    addActiveNamespace("account").then(done, done);
  }, [addActiveNamespace]);

  if (!ready) return <p className="body">{tApp("app.loading")}</p>;

  return (
    <>
      <p className="widget" data-testid="account-signed-in">
        {t("profile.signed_in", { name })}
      </p>
      <p className="widget" data-testid="account-devices">
        {t("profile.devices", { count: 3 })}
      </p>
      {/* Only the English account catalog has this key. */}
      <p className="widget" data-testid="account-only-en">
        {t("profile.only_en")}
      </p>
    </>
  );
}
