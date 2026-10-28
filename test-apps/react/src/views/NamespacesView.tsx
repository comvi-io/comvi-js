import { useI18n } from "@comvi/react";
import { useState } from "react";

/** Mounted on demand: useI18n("admin") loads the admin namespace after it commits. */
function AdminPanel() {
  const { t, isLoading } = useI18n("admin");
  const { t: common } = useI18n();
  if (isLoading) return <p className="italic text-gray-500">{common("common.loading")}</p>;
  return (
    <div className="space-y-4 border-t pt-4 mt-4">
      <h3 className="font-bold text-lg text-purple-600">{t("welcome_admin")}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-purple-50 rounded border border-purple-100 text-center">
          {t("dashboard")}
        </div>
        <div className="p-4 bg-purple-50 rounded border border-purple-100 text-center">
          {t("settings")}
        </div>
        <div className="p-4 bg-purple-50 rounded border border-purple-100 text-center">
          {t("users")}
        </div>
      </div>
    </div>
  );
}

export function NamespacesView() {
  const { t } = useI18n();
  const [showAdmin, setShowAdmin] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-start">
        <h2 className="text-2xl font-bold">{t("namespaces.title")}</h2>
        <span
          className={`px-2 py-1 rounded text-xs font-mono ${
            showAdmin ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
          }`}
        >
          Admin NS: {showAdmin ? "LOADED" : "NOT LOADED"}
        </span>
      </div>

      <div className="p-6 border rounded-lg bg-white space-y-4">
        <p>{t("namespaces.description")}</p>

        {showAdmin ? (
          <AdminPanel />
        ) : (
          <button
            onClick={() => setShowAdmin(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {t("namespaces.load_admin")}
          </button>
        )}
      </div>
    </div>
  );
}
