import { createSignal, Show } from "solid-js";
import { useI18n } from "@comvi/solid";

/** Mounted on demand: useI18n("admin") loads the admin namespace after it mounts. */
function AdminPanel() {
  const { t, isLoading } = useI18n("admin");
  const { t: common } = useI18n();
  return (
    <Show
      when={!isLoading()}
      fallback={<p class="italic text-gray-500">{common("common.loading")}</p>}
    >
      <div class="space-y-4 border-t pt-4 mt-4">
        <h3 class="font-bold text-lg text-purple-600">{t("welcome_admin")}</h3>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="p-4 bg-purple-50 rounded border border-purple-100 text-center">
            {t("dashboard")}
          </div>
          <div class="p-4 bg-purple-50 rounded border border-purple-100 text-center">
            {t("settings")}
          </div>
          <div class="p-4 bg-purple-50 rounded border border-purple-100 text-center">
            {t("users")}
          </div>
        </div>
      </div>
    </Show>
  );
}

export default function NamespacesView() {
  const { t } = useI18n();
  const [showAdmin, setShowAdmin] = createSignal(false);

  return (
    <div class="space-y-8">
      <div class="flex justify-between items-start">
        <h2 class="text-2xl font-bold">{t("namespaces.title")}</h2>
        <span
          class={`px-2 py-1 rounded text-xs font-mono ${
            showAdmin() ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
          }`}
        >
          Admin NS: {showAdmin() ? "LOADED" : "NOT LOADED"}
        </span>
      </div>

      <div class="p-6 border rounded-lg bg-white space-y-4">
        <p>{t("namespaces.description")}</p>

        <Show
          when={showAdmin()}
          fallback={
            <button
              onClick={() => setShowAdmin(true)}
              class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {t("namespaces.load_admin")}
            </button>
          }
        >
          <AdminPanel />
        </Show>
      </div>
    </div>
  );
}
