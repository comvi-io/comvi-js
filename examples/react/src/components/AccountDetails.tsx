import { use } from "react";
import { useI18n } from "@comvi/react";
import { i18n } from "../i18n";

// Loads the `account` namespace the first time this page needs it. The promise is
// kept, so every render reads the same one; once loaded, the namespace stays
// active and follows every later language switch.
let account: Promise<void> | undefined;
const loadAccount = () => (account ??= i18n.load("account"));

/** Rows from the `account` namespace; suspends until it has loaded. */
export function AccountDetails({ name }: { name: string }) {
  use(loadAccount());
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
