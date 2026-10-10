import { createSignal, For } from "solid-js";
import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";

const registers = ["formal", "informal"] as const;

export function FormalityCard() {
  const { t } = useI18n();
  const [formality, setFormality] = createSignal<(typeof registers)[number]>("formal");

  return (
    <Card title={t("demo.formality.title")} body={t("demo.formality.body")}>
      <div class="segmented">
        <For each={registers}>
          {(option) => (
            <button aria-pressed={formality() === option} onClick={() => setFormality(option)}>
              {t(`demo.formality.${option}`)}
            </button>
          )}
        </For>
      </div>
      <p class="widget" data-testid="formality-message">
        {t("demo.formality.message", { formality: formality() })}
      </p>
    </Card>
  );
}
