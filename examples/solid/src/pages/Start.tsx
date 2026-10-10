import { A } from "@solidjs/router";
import { useI18n } from "@comvi/solid";
import { name } from "../name";

export function Start() {
  const { t } = useI18n();
  return (
    <div class="start">
      <p class="widget">{t("greeting.hello", { name: name() })}</p>
      <A class="cta" href="/features">
        {t("demo.start.cta")}
      </A>
    </div>
  );
}
