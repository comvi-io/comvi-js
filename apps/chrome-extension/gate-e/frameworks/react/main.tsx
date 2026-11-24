import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider, T, useI18n } from "@comvi/react";
import { booted, options } from "../options.js";

const i18n = createI18n(options());

function App() {
  const { t } = useI18n();
  const [late, setLate] = useState(false);
  return (
    <section id="region-A">
      <h1 id="A-title">{t("home.title")}</h1>
      <p id="A-common">{t("save", { ns: "common" })}</p>
      <p id="A-missing">{t("missing.key")}</p>
      <p id="A-rich">
        <T i18nKey="rich.terms" b={(chunks) => <b>{chunks}</b>} />
      </p>
      <button id="more" type="button" onClick={() => setLate(true)}>
        More
      </button>
      {late && <p id="A-late">{t("nav.about")}</p>}
    </section>
  );
}

i18n.ready.then(() => {
  createRoot(document.getElementById("app")!).render(
    <StrictMode>
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>
    </StrictMode>,
  );
  requestAnimationFrame(booted);
});
