import { createSignal, Show } from "solid-js";
import { A } from "@solidjs/router";
import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";
import { LoadError } from "../components/LoadError";
import { fetched } from "../i18n";
import { name } from "../name";

export function Account() {
  const { t } = useI18n();
  // Loads the `account` namespace and holds it while this page shows, so a language
  // switch loads it too; once the page closes it stays cached and a switch skips it.
  const { t: tAccount, isLoading, i18n } = useI18n("account");

  // `load()` settles with that load: it resolves with the Error when the catalog could not
  // be loaded (onError has the details), and calling it again asks the loader again.
  const [failed, setFailed] = createSignal(false);
  const loadAccount = async () => {
    setFailed(false);
    const failure = await i18n.load("account");
    setFailed(failure !== undefined);
  };
  loadAccount();

  return (
    <div class="cards">
      <Card title={t("demo.navigation.title")}>
        <p class="widget" data-testid="about-body">
          {t("about.body")}
        </p>
        <p class="widget">
          <A data-testid="nav-home" href="/features">
            {t("nav.home")}
          </A>
        </p>
      </Card>

      <Card title={t("demo.lazy.title")} body={t("demo.lazy.body")}>
        <Show when={!failed()} fallback={<LoadError onRetry={loadAccount} />}>
          <Show when={!isLoading()} fallback={<p class="widget">{t("app.loading")}</p>}>
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
              <span>
                {t("demo.lazy.namespaces", { namespaces: fetched().namespaces.join(", ") })}
              </span>
            </p>
          </Show>
        </Show>
      </Card>
    </div>
  );
}
