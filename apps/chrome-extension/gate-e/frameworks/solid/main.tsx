import { createSignal, Show } from "solid-js";
import { render } from "solid-js/web";
import { createI18n, I18nProvider, T, useI18n } from "@comvi/solid";
import { booted, options } from "../options.js";

const i18n = createI18n(options());

function App() {
  const { t } = useI18n();
  const [late, setLate] = createSignal(false);
  return (
    <section id="region-A">
      <h1 id="A-title">{t("home.title")}</h1>
      <p id="A-common">{t("save", { ns: "common" })}</p>
      <p id="A-missing">{t("missing.key")}</p>
      <p id="A-rich">
        <T i18nKey="rich.terms" components={{ b: "b" }} />
      </p>
      <button id="more" type="button" onClick={() => setLate(true)}>
        More
      </button>
      <Show when={late()}>
        <p id="A-late">{t("nav.about")}</p>
      </Show>
    </section>
  );
}

i18n.ready.then(() => {
  render(
    () => (
      <I18nProvider i18n={i18n}>
        <App />
      </I18nProvider>
    ),
    document.getElementById("app")!,
  );
  booted();
});
