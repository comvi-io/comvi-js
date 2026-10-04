/**
 * `targetLocale`: the tree renders in the locale a caller is switching to
 * from the render in which it changes, until the host's own locale moves;
 * after that it follows the host again.
 */
import React, { Suspense, startTransition, useState } from "react";
import { flushSync } from "react-dom";
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

/**
 * The handover is state a render derives, never a write a render makes: a
 * render React abandons (a superseded transition, a suspended one) leaves
 * nothing behind, and the i18n instance's identity is part of the key.
 */
describe("I18nProvider targetLocale across abandoned renders", () => {
  it("an abandoned transition to another target leaves no handover", async () => {
    for (const withTarget of [false, true]) {
      const i18n = createI18n({
        locale: "en",
        messages: { ...messages, fr: { greeting: "Bonjour" } },
      });
      const log: string[] = [];
      const never = new Promise<never>(() => {});
      const SuspendsInFr = () => {
        if (useLocale() === "fr") throw never;
        return null;
      };
      let setTarget!: (locale: string) => void;
      const App = () => {
        const [target, set] = useState("en");
        setTarget = set;
        return (
          <I18nProvider i18n={i18n} autoInit={false} targetLocale={withTarget ? target : undefined}>
            <Probe log={log} />
            <Suspense fallback={null}>
              <SuspendsInFr />
            </Suspense>
          </I18nProvider>
        );
      };
      const view = render(<App />);
      expect(view.container.textContent).toBe("en:Hello");
      // 2. A transition to fr whose child suspends: the speculative render is abandoned.
      await act(async () => {
        startTransition(() => setTarget("fr"));
      });
      expect(view.container.textContent).toBe("en:Hello");
      // 3. Back to the committed target, urgently.
      act(() => {
        flushSync(() => setTarget("en"));
      });
      // 4. The i18n instance moves on its own.
      log.length = 0;
      await act(async () => {
        await i18n.setLocale("de");
      });
      expect([withTarget, view.container.textContent]).toEqual([withTarget, "de:Hallo"]);
      expect(log.at(-1)).toBe("de:Hallo");
      view.unmount();
    }
  });

  it("a switch back to the locale the handover started from is not a new handover", async () => {
    const i18n = createI18n({ locale: "en", messages });
    const log: string[] = [];
    render(tree(i18n, log, "uk"));
    await act(async () => {
      await i18n.setLocale("uk");
    });
    expect(log.at(-1)).toBe("uk:Привіт");
    // `localePrefix: "never"`: the target prop stays, the i18n instance returns to `en`.
    await act(async () => {
      await i18n.setLocale("en");
    });
    expect(log.at(-1)).toBe("en:Hello");
  });

  it("a replacement instance with the same target renders the target", () => {
    const first = createI18n({ locale: "uk", messages: { uk: { greeting: "Привіт" } } });
    const replacement = createI18n({
      locale: "en",
      messages: { en: { greeting: "Hello" }, uk: { greeting: "Привіт" } },
    });
    const view = render(tree(first, [], "uk"));
    view.rerender(tree(replacement, [], "uk"));
    expect(view.container.textContent).toBe("uk:Привіт");
  });
});

describe("I18nProvider messages", () => {
  it("messages render before they are in the instance and are published at commit", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const seen: boolean[] = [];
    const InstanceHasDe = () => {
      seen.push(i18n.hasLocale("de"));
      return null;
    };
    const props = {
      i18n,
      autoInit: false,
      targetLocale: "de",
      messages: { de: { greeting: "Hallo" } },
    };
    const view = render(
      <I18nProvider {...props}>
        <Probe log={[]} />
        <InstanceHasDe />
      </I18nProvider>,
    );
    expect(view.container.textContent).toBe("de:Hallo");
    // The first render translated from the prop; the instance was not written by it.
    expect(seen[0]).toBe(false);
    await act(async () => {});
    expect(i18n.hasLocale("de")).toBe(true);
    expect(view.container.textContent).toBe("de:Hallo");
  });

  it("renderToString with messages never writes the instance", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const html = renderToString(
      <I18nProvider
        i18n={i18n}
        autoInit={false}
        targetLocale="de"
        messages={{ de: { greeting: "Hallo" } }}
      >
        <Probe log={[]} />
      </I18nProvider>,
    );
    expect(html.replace(/<!-- -->/g, "")).toContain("de:Hallo");
    expect(i18n.hasLocale("de")).toBe(false);
    expect(i18n.getActiveNamespaces()).toEqual(["default"]);
  });
});
