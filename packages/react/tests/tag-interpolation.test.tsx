import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
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

  it("renders a string-target config entry with its configured props", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "Click <link>here</link>" } },
    });
    await i18n.init();

    render(
      <I18nProvider i18n={i18n}>
        <T i18nKey="msg" components={{ link: { tag: "a", props: { href: "/help" } } }} />
      </I18nProvider>,
    );

    expect(screen.getByRole("link").getAttribute("href")).toBe("/help");
  });

  it("merges configured props into a React element handler", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "Click <link>here</link>" } },
    });
    await i18n.init();

    render(
      <I18nProvider i18n={i18n}>
        <T
          i18nKey="msg"
          components={{
            link: { component: <a href="/placeholder" />, props: { href: "/help" } },
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("link").getAttribute("href")).toBe("/help");
  });

  it("passes configured props to a function handler", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "Click <btn>here</btn>" } },
    });
    await i18n.init();

    render(
      <I18nProvider i18n={i18n}>
        <T
          i18nKey="msg"
          components={{
            btn: {
              component: ({ children, tone }: { children: React.ReactNode; tone?: string }) => (
                <button data-tone={tone}>{children}</button>
              ),
              props: { tone: "warn" },
            },
          }}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button").getAttribute("data-tone")).toBe("warn");
  });

  it("throws in strict mode when handler is missing", async () => {
    const i18n = createI18n({
      locale: "en",
      translation: { en: { msg: "Click <link>here</link>" } },
      tagInterpolation: { strict: true },
    });
    await i18n.init();

    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() =>
      render(
        <I18nProvider i18n={i18n}>
          <T i18nKey="msg" />
        </I18nProvider>,
      ),
    ).toThrow("[i18n] Missing handler for tag: <link>");
  });
});
