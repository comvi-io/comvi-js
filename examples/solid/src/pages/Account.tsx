import { Show } from "solid-js";
import { A } from "@solidjs/router";
import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";
import { fetched } from "../i18n";
import { name } from "../name";

export function Account() {
  const { t } = useI18n();
  // Loads the `account` namespace and holds it while this page shows, so a language
  // switch loads it too; once the page closes it stays cached and a switch skips it.
  const { t: tAccount, isReady, isLoading } = useI18n("account");

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
        {/* A failed load settles too: the rows then show the fallback text. */}
        <Show when={isReady() || !isLoading()} fallback={<p class="widget">{t("app.loading")}</p>}>
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
      </Card>
    </div>
  );
}
