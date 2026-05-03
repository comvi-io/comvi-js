import { useI18n } from "@comvi/react";

export function HomeView() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <header className="border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-900">{t("home.title")}</h2>
        <p className="text-gray-600 mt-1">{t("home.subtitle")}</p>
      </header>

      <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
        <p className="text-lg text-blue-900">{t("home.intro", { name: "Developer" })}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold mb-2">
            {t("common.current_language", { lang: t("common.language_selector") })}
          </h3>
          <p className="text-sm text-gray-500">
            Comvi i18n automatically handles language switching and reactivity.
          </p>
        </div>
      </div>
    </div>
  );
}
