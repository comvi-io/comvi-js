import { I18nProvider, useI18n } from "@comvi/react";
import { i18n } from "./i18n";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { HomeView } from "./views/HomeView";
import { PluralsView } from "./views/PluralsView";
import { RichTextView } from "./views/RichTextView";
import { NamespacesView } from "./views/NamespacesView";
import { RtlView } from "./views/RtlView";
import { useEffect } from "react";

function Layout() {
  const { t, isLoading, locale } = useI18n();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  const navItems = [
    { path: "/", label: "nav.home" },
    { path: "/plurals", label: "nav.plurals" },
    { path: "/rich-text", label: "nav.rich_text" },
    { path: "/namespaces", label: "nav.namespaces" },
    { path: "/rtl", label: "nav.rtl" },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <nav className="bg-white shadow mb-8 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-blue-600">Comvi React Example</h1>
          </div>
          <div className="flex gap-4 items-center">
            {isLoading && <div className="text-sm text-gray-500 italic">{t("common.loading")}</div>}
            <LanguageSwitcher />
          </div>
        </div>
        <div className="container mx-auto px-4 border-t flex gap-2 overflow-x-auto py-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-3 py-2 rounded text-sm hover:bg-gray-100 whitespace-nowrap transition-colors ${
                location.pathname === item.path ? "bg-blue-50 text-blue-700 font-medium" : ""
              }`}
            >
              {t(item.label)}
            </Link>
          ))}
        </div>
      </nav>

      <main className="container mx-auto px-4 pb-12">
        <div className="bg-white rounded-lg shadow p-6 min-h-[300px]">
          <Routes>
            <Route path="/" element={<HomeView />} />
            <Route path="/plurals" element={<PluralsView />} />
            <Route path="/rich-text" element={<RichTextView />} />
            <Route path="/namespaces" element={<NamespacesView />} />
            <Route path="/rtl" element={<RtlView />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider i18n={i18n}>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </I18nProvider>
  );
}
