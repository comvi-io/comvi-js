import { useI18n } from "@comvi/react";
import { FeatureCard } from "../components/FeatureCard";
import { locales } from "../i18n";

export function CallOptionsCard() {
  const { t, getLoadedLocales } = useI18n();

  // The `locale` call option reads another catalog without switching to it.
  // Only downloaded catalogs are listed: pick a language and it joins the list.
  const loaded = locales.filter((code) => getLoadedLocales().includes(code));

  return (
    <FeatureCard feature="options">
      <ul className="widget languages">
        {loaded.map((code) => (
          <li key={code} lang={code} dir="auto">
            {t("demo.options.inOwn", {
              name: t("demo.options.name", { locale: code }),
              locale: code,
            })}
          </li>
        ))}
      </ul>
    </FeatureCard>
  );
}
