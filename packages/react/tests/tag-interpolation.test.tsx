import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createI18n } from "../src";
import { I18nProvider } from "../src/I18nProvider";
import { T } from "../src/T";

declare module "@comvi/core" {
  interface TranslationKeys {
    msg: never;
  }
}

describe("<T /> tag interpolation smoke", () => {
  it("renders nested handlers with real core parser", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "Click <link><bold>here</bold></link>" } },
    });
    await i18n.init();

    render(
      <I18nProvider i18n={i18n}>
        <T
          i18nKey="msg"
          components={{
            link: <a href="/help" />,
            bold: <strong />,
          }}
        />
      </I18nProvider>,
    );

    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/help");
    expect(link.querySelector("strong")?.textContent).toBe("here");
  });

  it("renders React element params nested inside mapped tags", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "Hello <bold>{name}</bold>" } },
    });
    await i18n.init();

    const { container } = render(
      <I18nProvider i18n={i18n}>
        <T
          i18nKey="msg"
          name={<em>Alice</em>}
          components={{
            bold: "strong",
          }}
        />
      </I18nProvider>,
    );

    const strong = container.querySelector("strong");
    expect(strong?.querySelector("em")?.textContent).toBe("Alice");
    expect(container.textContent).toBe("Hello Alice");
  });

  it("throws in strict mode when handler is missing", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "Click <link>here</link>" } },
      tagInterpolation: { strict: true },
    });
    await i18n.init();

    const originalError = console.error;
    console.error = () => {};

    expect(() =>
      render(
        <I18nProvider i18n={i18n}>
          <T i18nKey="msg" />
        </I18nProvider>,
      ),
    ).toThrow(/Missing handler for tag: <link>|E_MISSING_TAG_HANDLER/);

    console.error = originalError;
  });
});
