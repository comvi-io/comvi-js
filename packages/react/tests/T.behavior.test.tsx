import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { createI18n, I18nProvider, plugins, T } from "../src";
import type { I18n } from "../src";

declare module "@comvi/core" {
  interface TranslationKeys {
    farewell: { name: string; when: string };
    greeting: never;
    reserved: never;
    "missing.key": never;
    echo: never;
  }
}

/** A plugins host whose post-processor upper-cases anything not asked for raw. */
const hostWithUppercasePostProcessor = () => {
  const i18n = createI18n({ locale: "en" }).with(plugins());
  i18n.addTranslations({ "en:default": { reserved: "English default" } });
  i18n.registerPostProcessor((result, _key, _ns, params) => {
    if (params?.raw === true) {
      return result;
    }
    return typeof result === "string" ? result.toUpperCase() : result;
  });
  return i18n;
};

const renderWithI18n = async (i18n: I18n, ui: ReactElement) => {
  await i18n.init();

  return render(
    <I18nProvider i18n={i18n} autoInit={false}>
      {ui}
    </I18nProvider>,
  );
};

describe("<T /> behavior", () => {
  it("renders with direct props taking precedence over params", async () => {
    const i18n = createI18n({ locale: "en" });
    i18n.addTranslations({
      "en:default": {
        farewell: "Goodbye {name}, see you {when}",
      },
    });

    const { container } = await renderWithI18n(
      i18n,
      <T
        i18nKey="farewell"
        params={{ name: "Wrong", when: "never" }}
        name="Right"
        when="tomorrow"
      />,
    );

    expect(container.textContent).toBe("Goodbye Right, see you tomorrow");
  });

  it("uses children as fallback when translation is missing", async () => {
    const i18n = createI18n({ locale: "en" });

    const { container } = await renderWithI18n(
      i18n,
      <T i18nKey="missing.key">Children fallback</T>,
    );

    expect(container.textContent).toBe("Children fallback");
  });

  it("prefers fallback prop over children when translation is missing", async () => {
    const i18n = createI18n({ locale: "en" });

    const { container } = await renderWithI18n(
      i18n,
      <T i18nKey="missing.key" fallback="Fallback text">
        Children fallback
      </T>,
    );

    expect(container.textContent).toBe("Fallback text");
    expect(screen.queryByText("Children fallback")).toBeNull();
  });

  // A value equal to its own key is the only state in which the
  // translation-exists check, rather than the rendered text, decides
  // `isMissing` — so these three pin that check's locale/namespace defaults.
  it("renders a translation whose value equals its key instead of the children fallback", async () => {
    const i18n = createI18n({ locale: "en" });
    i18n.addTranslations({ "en:default": { echo: "echo" } });

    const { container } = await renderWithI18n(i18n, <T i18nKey="echo">Children fallback</T>);

    expect(container.textContent).toBe("echo");
  });

  it("checks for the translation in the locale requested by the locale prop", async () => {
    const i18n = createI18n({ locale: "en" });
    i18n.addTranslations({ "fr:default": { echo: "echo" } });

    const { container } = await renderWithI18n(
      i18n,
      <T i18nKey="echo" locale="fr">
        Children fallback
      </T>,
    );

    expect(container.textContent).toBe("echo");
  });

  it("checks for the translation in the namespace requested by the ns prop", async () => {
    const i18n = createI18n({ locale: "en" });
    i18n.addTranslations({ "en:dashboard": { echo: "echo" } });

    const { container } = await renderWithI18n(
      i18n,
      <T i18nKey="echo" ns="dashboard">
        Children fallback
      </T>,
    );

    expect(container.textContent).toBe("echo");
  });

  it("renders element children as the fallback for a missing key", async () => {
    const i18n = createI18n({ locale: "en" });

    const { container } = await renderWithI18n(
      i18n,
      <T i18nKey="missing.key">
        <em>Fallback</em>
      </T>,
    );

    expect(container.querySelector("em")!.textContent).toBe("Fallback");
  });

  it("renders the translation from the requested locale and namespace", async () => {
    const i18n = createI18n({ locale: "en" });
    i18n.addTranslations({
      "en:default": { greeting: "Hello" },
      "fr:dashboard": { greeting: "Bonjour dashboard" },
    });

    const { container } = await renderWithI18n(
      i18n,
      <T i18nKey="greeting" locale="fr" ns="dashboard" />,
    );

    expect(container.textContent).toBe("Bonjour dashboard");
    expect(screen.queryByText("Hello")).toBeNull();
  });

  it("preserves reserved params from params when explicit overrides are absent", async () => {
    const { container } = await renderWithI18n(
      hostWithUppercasePostProcessor(),
      <T
        i18nKey="reserved"
        params={{ locale: "fr", ns: "custom", fallback: "fallback text", raw: true }}
      />,
    );

    expect(container.textContent).toBe("fallback text");
    expect(screen.queryByText("English default")).toBeNull();
  });

  it("lets explicit reserved props override reserved values inside params", async () => {
    const { container } = await renderWithI18n(
      hostWithUppercasePostProcessor(),
      <T
        i18nKey="reserved"
        locale="fr"
        ns="dashboard"
        fallback="Fallback text"
        raw={false}
        params={{ locale: "en", ns: "default", fallback: "param fallback", raw: true }}
      />,
    );

    expect(container.textContent).toBe("FALLBACK TEXT");
    expect(screen.queryByText("English default")).toBeNull();
  });
});
