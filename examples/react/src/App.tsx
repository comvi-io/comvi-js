import { useEffect } from "react";
import { Route, Routes } from "react-router";
import { useI18n } from "@comvi/react";
import { Footer } from "./components/Footer";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { About } from "./pages/About";
import { Home } from "./pages/Home";

// Try `?name=<b>Grace</b>`: a parameter is always rendered as text.
const name = new URLSearchParams(location.search).get("name") ?? "Ada";

export function App() {
  const { t, locale, dir } = useI18n();

  // Arabic flips the whole document to right-to-left.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  return (
    <main>
      <header>
        <h1>{t("app.title")}</h1>
        <p className="intro">{t("demo.intro")}</p>
        <LocaleSwitcher />
      </header>

      <Routes>
        <Route path="/" element={<Home name={name} />} />
        <Route path="/about" element={<About name={name} />} />
      </Routes>

      <Footer />
    </main>
  );
}
