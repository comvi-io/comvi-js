import { createSignal, For } from "solid-js";
import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";

const genders = ["female", "male", "other"] as const;

export function SelectCard() {
  const { t } = useI18n();
  const [gender, setGender] = createSignal<(typeof genders)[number]>("female");

  return (
    <Card title={t("demo.select.title")} body={t("demo.select.body")}>
      <div class="segmented">
        <For each={genders}>
          {(option) => (
            <button aria-pressed={gender() === option} onClick={() => setGender(option)}>
              {t(`demo.select.${option}`)}
            </button>
          )}
        </For>
      </div>
      <p class="widget" data-testid="select-message">
        {t("demo.select.message", { gender: gender() })}
      </p>
    </Card>
  );
}
