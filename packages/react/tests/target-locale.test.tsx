/**
 * `targetLocale`: the tree renders in the locale a caller is switching to
 * from the render in which it changes, until the host's own locale moves;
 * after that it follows the host again.
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createI18n } from "../src";
import { I18nProvider, useLocale } from "../src/I18nProvider";
import { useI18n } from "../src/useI18n";

const messages = {
  en: { greeting: "Hello" },
  uk: { greeting: "Привіт" },
  de: { greeting: "Hallo" },
};

const Probe = ({ log }: { log: string[] }) => {
  const { t } = useI18n();
  const text = `${useLocale()}:${t("greeting")}`;
  log.push(text);
  return <p>{text}</p>;
};

const tree = (i18n: ReturnType<typeof createI18n>, log: string[], targetLocale?: string) => (
  <I18nProvider i18n={i18n} autoInit={false} targetLocale={targetLocale}>
    <Probe log={log} />
  </I18nProvider>
);

describe("I18nProvider targetLocale", () => {
  it("renders the target in the very render it changes, before the host switches", async () => {
    const i18n = createI18n({ locale: "en", messages });
    const log: string[] = [];
    const { rerender } = render(tree(i18n, log, "en"));
    log.length = 0;
    rerender(tree(i18n, log, "uk"));
    // The host has not moved: the caller switches it afterwards.
    expect(i18n.locale).toBe("en");
    expect(log).toEqual(["uk:Привіт"]);
    await act(async () => {
      await i18n.setLocale("uk");
    });
    expect(log.every((entry) => entry === "uk:Привіт")).toBe(true);
  });

  it("follows the host again once it moves, even to another locale", async () => {
    const i18n = createI18n({ locale: "en", messages });
    const log: string[] = [];
    render(tree(i18n, log, "uk"));
    expect(log.at(-1)).toBe("uk:Привіт");
    // A switch with no new target (a client `setLocale`, say) wins.
    await act(async () => {
      await i18n.setLocale("de");
    });
    expect(log.at(-1)).toBe("de:Hallo");
  });

  it("is the host's locale when it equals the target, and absent when not given", async () => {
    const i18n = createI18n({ locale: "uk", messages });
    const log: string[] = [];
    render(tree(i18n, log, "uk"));
    render(tree(i18n, log));
    expect(log).toEqual(["uk:Привіт", "uk:Привіт"]);
    await act(async () => {
      await i18n.setLocale("en");
    });
    expect(log.slice(-2)).toEqual(["en:Hello", "en:Hello"]);
  });

  it("renders the target on the server, as ssrLocale does", () => {
    const i18n = createI18n({ locale: "en", messages });
    expect(renderToString(tree(i18n, [], "de"))).toContain("de:Hallo");
  });
});
