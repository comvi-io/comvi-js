import { useEffect } from "react";
import { Route, Routes } from "react-router";
import { useI18n } from "@comvi/react";
import { About } from "./About";
import { Home } from "./Home";
import { locales, rtlLocale } from "./i18n";

// The greeting's `{name}`: "Ada", or `?name=…` from the address bar. Whatever
// arrives there is a parameter, and a parameter is rendered as text, never as
// markup: try `?name=<b>Grace</b>`.
const name = new URLSearchParams(location.search).get("name") ?? "Ada";

/** The page frame both routes share: header with the switcher, the route, the footer. */
export function App() {
  // Everything below re-renders on a locale change because `useI18n()`
  // subscribes this component to the instance.
  const { t, locale, setLocale, dir, isLoading } = useI18n();

  // `dir` is the binding's bound value; on a bare core instance the free function
  // `getTextDirection(locale)` from `@comvi/core` answers the same question.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  return (
    <main>
      <header>
        <h1>{t("app.title")}</h1>
        <p className="intro">{t("demo.intro")}</p>
        <div className="switcher-row">
          <span className="label" id="language-label">
            {t("app.language")}
          </span>
          <div className="switcher" role="group" aria-labelledby="language-label">
            {locales.map((code) => (
              <button
                key={code}
                data-testid={`locale-${code}`}
                aria-pressed={locale === code}
                onClick={() => void setLocale(code)}
              >
                {code}
              </button>
            ))}
          </div>
          {/* Not in the switcher: the right-to-left locale the e2e suite uses. */}
          <button
            hidden
            data-testid={`locale-${rtlLocale}`}
            onClick={() => void setLocale(rtlLocale)}
          >
            {rtlLocale}
          </button>
          {isLoading && <span className="status">{t("app.loading")}</span>}
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Home name={name} />} />
        <Route path="/about" element={<About name={name} />} />
      </Routes>

      <footer>
        <a href="https://comvi.io/docs/i18n">{t("demo.footer.docs")}</a>
        <a href="https://github.com/comvi-io/comvi-js/tree/main/examples/react">
          {t("demo.footer.source")}
        </a>
        <span>
          {t("demo.footer.install")}
          <code>npm i @comvi/react</code>
        </span>
      </footer>
    </main>
  );
}
