import { createSignal, Show } from "solid-js";
import { A } from "@solidjs/router";
import { useI18n, useI18nLoader } from "@comvi/solid";
import { Card } from "../components/Card";
import { name } from "../name";

export function Account() {
  const { t, cacheRevision, getActiveNamespaces } = useI18n();
  // `useI18n("account")` only scopes `t` to the namespace; activating it is
  // what downloads it, and keeps it loaded across later locale switches.
  const { t: tAccount } = useI18n("account");
  const { addActiveNamespace } = useI18nLoader();

  // Show the rows once the load settles, whether it succeeded or failed.
  const [ready, setReady] = createSignal(false);
  const done = () => setReady(true);
  addActiveNamespace("account").then(done, done);

  const namespaces = () => {
    void cacheRevision();
    return t("demo.lazy.namespaces", { namespaces: getActiveNamespaces().join(", ") });
  };

  return (
    <div class="cards">
      <Card title={t("demo.navigation.title")}>
        <p class="widget" data-testid="about-body">
          {t("about.body")}
        </p>
        <p class="widget">
          <A data-testid="nav-home" href="/" end>
            {t("nav.home")}
          </A>
        </p>
      </Card>

      <Card title={t("demo.lazy.title")} body={t("demo.lazy.body")}>
        <Show when={ready()} fallback={<p class="widget">{t("app.loading")}</p>}>
          <p class="widget" data-testid="account-signed-in">
            {tAccount("profile.signed_in", { name: name() })}
          </p>
          <p class="widget" data-testid="account-devices">
            {tAccount("profile.devices", { count: 3 })}
          </p>
          {/* Only the English account catalog has this key, so every locale shows it in English. */}
          <p class="widget" data-testid="account-only-en">
            {tAccount("profile.only_en")}
          </p>
          <p class="network">
            <span>{namespaces()}</span>
          </p>
        </Show>
      </Card>
    </div>
  );
}
