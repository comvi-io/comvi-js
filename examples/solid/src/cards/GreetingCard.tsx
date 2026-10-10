import { createSignal } from "solid-js";
import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";
import { name as initialName } from "../name";

export function GreetingCard() {
  const { t } = useI18n();
  const [name, setName] = createSignal(initialName);

  return (
    <Card title={t("demo.interpolation.title")} body={t("demo.interpolation.body")}>
      <label class="field">
        <span>{t("demo.interpolation.label")}</span>
        <input
          data-testid="name-input"
          value={name()}
          onInput={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <p class="widget" data-testid="greeting">
        {t("greeting.hello", { name: name() })}
      </p>
    </Card>
  );
}
