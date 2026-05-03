import { createSignal, onMount, createEffect, For, Switch, Match } from "solid-js";
import { I18nProvider, useI18n } from "@comvi/solid";
import { i18n } from "./i18n";
import LanguageSwitcher from "./components/LanguageSwitcher";
import HomeView from "./views/HomeView";
import PluralsView from "./views/PluralsView";
import RichTextView from "./views/RichTextView";
import NamespacesView from "./views/NamespacesView";
import RtlView from "./views/RtlView";

function AppContent() {
  const { t, isLoading, locale } = useI18n();

  // Simple hash-based routing
  const [currentPath, setCurrentPath] = createSignal(window.location.hash.slice(1) || "/");

  function navigate(path: string) {
    window.location.hash = path;
    setCurrentPath(path);
  }

  onMount(() => {
    // Load default namespace
    const defaultNs = i18n.getDefaultNamespace();
    const activeNamespaces = i18n.getActiveNamespaces();
    if (!activeNamespaces.includes(defaultNs)) {
      i18n.addActiveNamespace(defaultNs);
    }

    // Listen for hash changes
    const handleHashChange = () => {
      setCurrentPath(window.location.hash.slice(1) || "/");
    };
    window.addEventListener("hashchange", handleHashChange);

    return () => window.removeEventListener("hashchange", handleHashChange);
  });

  // Update document direction based on locale
  createEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dir = locale() === "ar" ? "rtl" : "ltr";
      document.documentElement.lang = locale();
    }
  });

  const navItems = [
    { path: "/", label: "nav.home" },
    { path: "/plurals", label: "nav.plurals" },
    { path: "/rich-text", label: "nav.rich_text" },
    { path: "/namespaces", label: "nav.namespaces" },
    { path: "/rtl", label: "nav.rtl" },
  ] as const;

  return (
    <div class="min-h-screen bg-gray-50 font-sans">
      <nav class="bg-white shadow mb-8 sticky top-0 z-50">
        <div class="container mx-auto px-4 py-4 flex justify-between items-center">
          <div class="flex items-center gap-2">
            <h1 class="text-xl font-bold text-blue-600">Comvi SolidJS Example</h1>
          </div>
          <div class="flex gap-4 items-center">
            {isLoading() && <div class="text-sm text-gray-500 italic">{t("common.loading")}</div>}
            <LanguageSwitcher />
          </div>
        </div>
        <div class="container mx-auto px-4 border-t flex gap-2 overflow-x-auto py-2">
          <For each={navItems}>
            {(item) => (
              <button
                onClick={() => navigate(item.path)}
                class={`px-3 py-2 rounded text-sm hover:bg-gray-100 whitespace-nowrap transition-colors ${
                  currentPath() === item.path ? "bg-blue-50 text-blue-700 font-medium" : ""
                }`}
              >
                {t(item.label)}
              </button>
            )}
          </For>
        </div>
      </nav>

      <main class="container mx-auto px-4 pb-12">
        <div class="bg-white rounded-lg shadow p-6 min-h-[300px]">
          <Switch>
            <Match when={currentPath() === "/"}>
              <HomeView />
            </Match>
            <Match when={currentPath() === "/plurals"}>
              <PluralsView />
            </Match>
            <Match when={currentPath() === "/rich-text"}>
              <RichTextView />
            </Match>
            <Match when={currentPath() === "/namespaces"}>
              <NamespacesView />
            </Match>
            <Match when={currentPath() === "/rtl"}>
              <RtlView />
            </Match>
          </Switch>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider i18n={i18n}>
      <AppContent />
    </I18nProvider>
  );
}
