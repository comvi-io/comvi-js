import { useEffect, useState } from "react";
import { Outlet, useLocation, type RouteObject } from "react-router";
import { useI18n } from "@comvi/react";
import { Footer } from "./components/Footer";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { About } from "./pages/About";
import { Features } from "./pages/Features";
import { Start } from "./pages/Start";
import { i18n } from "./i18n";

// Try `?name=<b>Grace</b>`: a parameter is always rendered as text.
const initialName = new URLSearchParams(location.search).get("name") ?? "Ada";

/** What every page reads from the layout: the one name of the whole app. */
export type Shared = { name: string; setName: (name: string) => void };

/** No catalog means no words yet, so the boot screen is a wordless spinner. */
export const Boot = () => <div className="boot" role="status" aria-busy="true" />;

export function App() {
  const { t, locale, dir } = useI18n();
  // One name for the whole app: the greeting edits it, the Account page reads it.
  const [name, setName] = useState(initialName);
  // The start page stays minimal: its own one-line intro and no footer.
  const isStart = useLocation().pathname === "/";

  // Arabic flips the whole document to right-to-left.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  return (
    <main>
      <header>
        <h1>{t("app.title")}</h1>
        <p className="intro">{t(isStart ? "demo.start.intro" : "demo.intro")}</p>
        <LocaleSwitcher />
      </header>

      <Outlet context={{ name, setName } satisfies Shared} />

      {!isStart && <Footer />}
    </main>
  );
}

export const routes: RouteObject[] = [
  {
    Component: App,
    HydrateFallback: Boot,
    children: [
      { index: true, Component: Start },
      { path: "features", Component: Features },
      {
        path: "about",
        // The page's own namespace loads with the route, before the page renders:
        // no frame shows its keys. Once loaded, it follows every language switch.
        loader: async () => {
          await i18n.load("account");
          return null;
        },
        Component: About,
      },
    ],
  },
];
