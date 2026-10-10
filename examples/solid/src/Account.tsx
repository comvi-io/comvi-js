import { createSignal, Show } from "solid-js";
import { A } from "@solidjs/router";
import { useI18n, useI18nLoader } from "@comvi/solid";
import { name } from "./name";

/**
 * The `/about` route, with a second namespace loaded the first time it is shown.
 *
 * `useI18n("account")` scopes `t()` to the `account` namespace and loads
 * nothing. `addActiveNamespace("account")` is what fetches it for the current
 * locale, and it keeps the namespace active, so a later locale switch brings
 * `account` along with the default namespace before the new locale applies.
 */
export function Account() {
  const { t, cacheRevision, getActiveNamespaces } = useI18n();
  const { t: tAccount } = useI18n("account");
  const { addActiveNamespace } = useI18nLoader();

  // Until the namespace is in, its keys would render as themselves, so the
  // rows wait for the activation to settle. Settle, not succeed: a load that
  // failed has already reached `onError`, and the keys then show as they would
  // for any missing translation.
  const [ready, setReady] = createSignal(false);
  const done = () => setReady(true);
  addActiveNamespace("account").then(done, done);

  return (
    <div class="cards">
      <section class="card">
        <h2 class="eyebrow">{t("demo.navigation.title")}</h2>
        <p class="widget" data-testid="about-body">
          {t("about.body")}
        </p>
        <p class="widget">
          <A data-testid="nav-home" href="/" end>
            {t("nav.home")}
          </A>
        </p>
      </section>

      <section class="card">
        <h2 class="eyebrow">{t("demo.lazy.title")}</h2>
        <p class="card-body">{t("demo.lazy.body")}</p>
        <Show when={ready()} fallback={<p class="widget">{t("app.loading")}</p>}>
          <p class="widget" data-testid="account-signed-in">
            {tAccount("profile.signed_in", { name })}
          </p>
          <p class="widget" data-testid="account-devices">
            {tAccount("profile.devices", { count: 3 })}
          </p>
          {/* Only `account/en.json` has this key: the fallback chain is walked
              inside the same namespace, once that namespace's en catalog is in. */}
          <p class="widget" data-testid="account-only-en">
            {tAccount("profile.only_en")}
          </p>
          <p class="network">
            <span>
              {(() => {
                void cacheRevision();
                return t("demo.lazy.namespaces", {
                  namespaces: getActiveNamespaces().join(", "),
                });
              })()}
            </span>
          </p>
        </Show>
      </section>
    </div>
  );
}
