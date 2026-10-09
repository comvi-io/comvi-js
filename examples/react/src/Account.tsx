import { useEffect, useState } from "react";
import { useI18n, useI18nLoader } from "@comvi/react";

/**
 * A second namespace, loaded the first time this component is shown.
 *
 * `useI18n("account")` scopes `t()` to the `account` namespace and loads
 * nothing. `addActiveNamespace("account")` is what fetches it for the current
 * locale, and it keeps the namespace active, so a later locale switch brings
 * `account` along with the default namespace before the new locale applies.
 */
export function Account({ name }: { name: string }) {
  const { t } = useI18n("account");
  const { addActiveNamespace } = useI18nLoader();

  // Until the namespace is in, its keys would render as themselves, so the
  // rows wait for the activation to settle. Settle, not succeed: a load that
  // failed has already reached `onError`, and the keys then show as they would
  // for any missing translation.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const done = () => setReady(true);
    addActiveNamespace("account").then(done, done);
  }, [addActiveNamespace]);

  if (!ready) return <p>Loading…</p>;

  return (
    <section>
      <h2>namespace</h2>
      <p data-testid="account-signed-in">{t("profile.signed_in", { name })}</p>
      <p data-testid="account-devices">{t("profile.devices", { count: 3 })}</p>
      {/* Only `account/en.json` has this key: the fallback chain is walked
          inside the same namespace, once that namespace's en catalog is in. */}
      <p data-testid="account-only-en">{t("profile.only_en")}</p>
    </section>
  );
}
