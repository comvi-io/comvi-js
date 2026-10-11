import { For } from "solid-js";
import { useI18n } from "@comvi/solid";
import { Card } from "../components/Card";
import { locales } from "../i18n";

export function CallOptionsCard() {
  const { t, cacheRevision, getLoadedLocales } = useI18n();

  // The `locale` call option reads another catalog without switching to it.
  // Only downloaded catalogs are listed: pick a language and it joins the list.
  const loaded = () => {
    void cacheRevision();
    const codes = getLoadedLocales();
    return locales.filter((code) => codes.includes(code));
  };

  return (
    <Card title={t("demo.options.title")} body={t("demo.options.body")}>
      <ul class="widget options">
        <For each={loaded()}>
          {(code) => (
            <li lang={code} dir="auto">
              {t("demo.options.inOwn", {
                name: t("demo.options.name", { locale: code }),
                locale: code,
              })}
            </li>
          )}
        </For>
      </ul>
    </Card>
  );
}
