import { useI18n } from "@comvi/react";

/** Rows from the `account` namespace, which the `/about` route loads (App.tsx). */
export function AccountDetails({ name }: { name: string }) {
  const { t } = useI18n("account");

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
