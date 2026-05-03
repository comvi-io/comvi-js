import { createSignal, Show } from "solid-js";
import { useI18n } from "@comvi/solid";

export default function NamespacesView() {
  const { t, addActiveNamespace, isLoading } = useI18n();

  const [isAdminLoaded, setIsAdminLoaded] = createSignal(false);

  async function loadAdmin() {
    await addActiveNamespace("admin");
    setIsAdminLoaded(true);
  }

  return (
    <div class="space-y-8">
      <div class="flex justify-between items-start">
        <h2 class="text-2xl font-bold">{t("namespaces.title")}</h2>
        <span
          class={`px-2 py-1 rounded text-xs font-mono ${
            isAdminLoaded() ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
          }`}
        >
          Admin NS: {isAdminLoaded() ? "LOADED" : "NOT LOADED"}
        </span>
      </div>

      <div class="p-6 border rounded-lg bg-white space-y-4">
        <p>{t("namespaces.description")}</p>

        <Show
          when={isAdminLoaded()}
          fallback={
            <button
              onClick={loadAdmin}
              disabled={isLoading()}
              class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading() ? t("common.loading") : t("namespaces.load_admin")}
            </button>
          }
        >
          <div class="space-y-4 border-t pt-4 mt-4">
            <h3 class="font-bold text-lg text-purple-600">{t("welcome_admin", { ns: "admin" })}</h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="p-4 bg-purple-50 rounded border border-purple-100 text-center">
                {t("dashboard", { ns: "admin" })}
              </div>
              <div class="p-4 bg-purple-50 rounded border border-purple-100 text-center">
                {t("settings", { ns: "admin" })}
              </div>
              <div class="p-4 bg-purple-50 rounded border border-purple-100 text-center">
                {t("users", { ns: "admin" })}
              </div>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
