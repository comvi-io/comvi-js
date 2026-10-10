/**
 * `targetLocale`: the tree renders in the locale a caller is switching to
 * from the render in which it changes, until the host's own locale moves;
 * after that it follows the host again.
 */
import React, { Activity, Suspense, startTransition, useState } from "react";
import { flushSync } from "react-dom";
import { describe, it, expect, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { createI18n } from "../src";
import { attachLoader } from "@comvi/core/loader";
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

  it("is no handover when the target is the instance's locale: the server snapshot renders", () => {
    const i18n = createI18n({ locale: "en", messages });
    const html = renderToString(
      <I18nProvider i18n={i18n} autoInit={false} ssrLocale="uk" targetLocale="en">
        <Probe log={[]} />
      </I18nProvider>,
    );
    expect(html.replace(/<!-- -->/g, "")).toContain("uk:Привіт");
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

  it("ends the handover when the i18n instance moves, even if that render is discarded", async () => {
    const i18n = createI18n({ locale: "en", messages });
    let resolve!: () => void;
    const pending = new Promise<void>((r) => (resolve = r));
    const SuspendsInDe = () => {
      if (useLocale() === "de") throw pending;
      return null;
    };
    const view = render(
      <Suspense fallback="loading">
        <I18nProvider i18n={i18n} autoInit={false} targetLocale="uk">
          <Probe log={[]} />
          <SuspendsInDe />
        </I18nProvider>
      </Suspense>,
    );
    expect(view.container.textContent).toBe("uk:Привіт");
    // The render that sees the instance at `de` suspends: React discards it.
    await act(async () => {
      await i18n.setLocale("de");
    });
    // The committed tree stays mounted, hidden, behind the fallback.
    expect(view.container.textContent).toContain("loading");
    await act(async () => {
      await i18n.setLocale("en");
    });
    await act(async () => {
      resolve();
      await pending;
    });
    expect(view.container.textContent).toBe("en:Hello");
  });

  it("ends the handover when the instance moves away and back within one act", async () => {
    const i18n = createI18n({ locale: "en", messages });
    const view = render(tree(i18n, [], "uk"));
    expect(view.container.textContent).toBe("uk:Привіт");
    await act(async () => {
      void i18n.setLocale("uk");
      await i18n.setLocale("en");
    });
    expect(view.container.textContent).toBe("en:Hello");
  });

  it("ends the handover on a move made before the provider subscribed", async () => {
    const i18n = createI18n({ locale: "en", messages });
    // A layout effect runs before the provider's subscription attaches.
    const MovesInLayoutEffect = () => {
      React.useLayoutEffect(() => {
        void i18n.setLocale("de");
      }, []);
      return null;
    };
    const view = render(
      <I18nProvider i18n={i18n} autoInit={false} targetLocale="uk">
        <Probe log={[]} />
        <MovesInLayoutEffect />
      </I18nProvider>,
    );
    await act(async () => {});
    expect(view.container.textContent).toBe("de:Hallo");
  });

  it("ends the handover on two moves made before the provider subscribed, back to the start", async () => {
    const i18n = createI18n({ locale: "en", messages });
    // Layout effects run before the provider's subscription attaches.
    const MovesAwayAndBack = () => {
      React.useLayoutEffect(() => {
        void i18n.setLocale("de");
        void i18n.setLocale("en");
      }, []);
      return null;
    };
    const view = render(
      <I18nProvider i18n={i18n} autoInit={false} targetLocale="uk">
        <Probe log={[]} />
        <MovesAwayAndBack />
      </I18nProvider>,
    );
    await act(async () => {});
    expect(i18n.locale).toBe("en");
    expect(view.container.textContent).toBe("en:Hello");
  });

  it("ends the handover on a move made while an Activity hides the provider", async () => {
    const i18n = createI18n({ locale: "en", messages });
    const app = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <I18nProvider i18n={i18n} autoInit={false} targetLocale="uk">
          <Probe log={[]} />
        </I18nProvider>
      </Activity>
    );
    const view = render(app("visible"));
    expect(view.container.textContent).toBe("uk:Привіт");
    // Hidden: React detaches the provider's effects, its subscriptions with them.
    await act(async () => {
      view.rerender(app("hidden"));
    });
    await act(async () => {
      await i18n.setLocale("uk");
      await i18n.setLocale("en");
    });
    await act(async () => {
      view.rerender(app("visible"));
    });
    expect(i18n.locale).toBe("en");
    expect(view.container.textContent).toBe("en:Hello");
  });

  it("hydrates in ssrLocale, then follows the instance; a target handover hydrates in the target", async () => {
    for (const [props, serverText, clientText] of [
      [{ ssrLocale: "uk" }, "uk:Привіт", "en:Hello"],
      [{ ssrLocale: "uk", targetLocale: "uk" }, "uk:Привіт", "uk:Привіт"],
      [{}, "en:Hello", "en:Hello"],
    ] as const) {
      const ui = (i18n: ReturnType<typeof createI18n>, log: string[]) => (
        <I18nProvider i18n={i18n} autoInit={false} {...props}>
          <Probe log={log} />
        </I18nProvider>
      );
      const container = document.createElement("div");
      container.innerHTML = renderToString(ui(createI18n({ locale: "en", messages }), []));
      expect(container.textContent).toBe(serverText);
      const errors: unknown[] = [];
      const log: string[] = [];
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, ui(createI18n({ locale: "en", messages }), log), {
          onRecoverableError: (error) => errors.push(error),
        });
      });
      // The hydration render reads the server snapshot: no mismatch.
      expect(errors).toEqual([]);
      expect(log[0]).toBe(serverText);
      expect(container.textContent).toBe(clientText);
      root.unmount();
    }
  });

  it("a handover under StrictMode still renders the target, then follows the instance", async () => {
    const i18n = createI18n({ locale: "en", messages });
    const view = render(<React.StrictMode>{tree(i18n, [], "uk")}</React.StrictMode>);
    expect(view.container.textContent).toBe("uk:Привіт");
    await act(async () => {
      await i18n.setLocale("uk");
    });
    expect(view.container.textContent).toBe("uk:Привіт");
    await act(async () => {
      await i18n.setLocale("en");
    });
    expect(view.container.textContent).toBe("en:Hello");
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

/**
 * A loader-composed instance whose target catalog is cached switches inside
 * the `setLocale` call, so a parent that moves it in a layout effect (the
 * `@comvi/next` shape) is done before the provider's subscription attaches.
 */
describe("I18nProvider targetLocale with a loader-composed instance", () => {
  const loaderBacked = () => {
    const i18n = attachLoader(createI18n({ locale: "en", messages }));
    const answers: Record<string, () => void> = {};
    const loader = vi.fn(
      (locale: string) =>
        new Promise<Record<string, string>>((resolve) => {
          answers[locale] = () => resolve({ greeting: locale });
        }),
    );
    i18n.registerLoader(loader);
    return { i18n, loader, answers };
  };

  it("a parent's layout-effect switch to a cached target commits the target once, then follows the instance", async () => {
    const { i18n, loader } = loaderBacked();
    expect(i18n.getActiveNamespaces()).toEqual(["default"]);
    const log: string[] = [];
    const loading: boolean[] = [];
    i18n.on("loadingStateChanged", ({ isLoading }) => loading.push(isLoading));
    const Parent = () => {
      React.useLayoutEffect(() => {
        void i18n.setLocale("uk");
      }, []);
      return tree(i18n, log, "uk");
    };

    const view = render(<Parent />);

    // The switch happened inside the layout effect: nothing was fetched or awaited.
    expect(i18n.locale).toBe("uk");
    expect(view.container.textContent).toBe("uk:Привіт");
    await act(async () => {});
    expect(view.container.textContent).toBe("uk:Привіт");
    // No render in the old locale, before or after the handover ended.
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((entry) => entry === "uk:Привіт")).toBe(true);
    expect(loader).not.toHaveBeenCalled();
    expect(loading).toEqual([]);

    // The handover is over: the unchanged target no longer holds the tree.
    await act(async () => {
      await i18n.setLocale("en");
    });
    expect(view.container.textContent).toBe("en:Hello");
  });

  it("a switch that never assigns does not end the handover", async () => {
    const { i18n, answers } = loaderBacked();
    const view = render(tree(i18n, [], "uk"));
    expect(view.container.textContent).toBe("uk:Привіт");

    // `fr` must be fetched; going back to `en` cancels it before it assigns.
    await act(async () => {
      const toFr = i18n.setLocale("fr");
      await Promise.resolve();
      const back = i18n.setLocale("en");
      answers.fr();
      await Promise.all([toFr, back]);
    });

    expect(i18n.locale).toBe("en");
    expect(i18n.localeRevision).toBe(0);
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

  it("hands over to the i18n instance at commit, so a later addMessages wins", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const view = render(
      <I18nProvider
        i18n={i18n}
        autoInit={false}
        targetLocale="de"
        messages={{ de: { greeting: "Hallo" } }}
      >
        <Probe log={[]} />
      </I18nProvider>,
    );
    await act(async () => {});
    // An editor save after the handover: the tree reads the instance again.
    await act(async () => {
      i18n.addMessages({ de: { greeting: "Servus" } });
    });
    expect(view.container.textContent).toBe("de:Servus");
  });

  it("a later render with a new messages object translates from it in that render", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const log: string[] = [];
    const navigate = (locale: string, greeting: string) => (
      <I18nProvider
        i18n={i18n}
        autoInit={false}
        targetLocale={locale}
        messages={{ [locale]: { greeting } }}
      >
        <Probe log={log} />
      </I18nProvider>
    );
    const view = render(navigate("de", "Hallo"));
    await act(async () => {
      await i18n.setLocale("de");
    });
    log.length = 0;
    view.rerender(navigate("uk", "Привіт"));
    expect(log[0]).toBe("uk:Привіт");
    expect(i18n.hasLocale("uk")).toBe(true);
  });

  it("adds a messages object once, under StrictMode too", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const addMessages = vi.spyOn(i18n, "addMessages");
    const messages = { de: { greeting: "Hallo" } };
    const view = render(
      <React.StrictMode>
        <I18nProvider i18n={i18n} autoInit={false} messages={messages}>
          <Probe log={[]} />
        </I18nProvider>
      </React.StrictMode>,
    );
    view.rerender(
      <React.StrictMode>
        <I18nProvider i18n={i18n} autoInit={false} messages={messages}>
          <Probe log={[]} />
        </I18nProvider>
      </React.StrictMode>,
    );
    expect(addMessages).toHaveBeenCalledExactlyOnceWith(messages);
  });

  it("a partial messages catalog merges over the cached one, key by key", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { greeting: "Hello", home: "Home" } },
    });
    const Both = () => {
      const { t } = useI18n();
      return <p>{`${t("greeting")}|${t("home")}`}</p>;
    };
    const html = renderToString(
      <I18nProvider i18n={i18n} autoInit={false} messages={{ en: { greeting: "Hi" } }}>
        <Both />
      </I18nProvider>,
    );
    expect(html).toContain("Hi|Home");
  });

  it("merges catalogs that share a locale and namespace, in input order, as addMessages does", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Old" } } });
    const Both = () => {
      const { t } = useI18n();
      return <p>{`${t("greeting")}|${t("home")}`}</p>;
    };
    const html = renderToString(
      <I18nProvider
        i18n={i18n}
        autoInit={false}
        messages={{ en: { greeting: "New" }, "en:default": { home: "Home" } }}
      >
        <Both />
      </I18nProvider>,
    );
    expect(html).toContain("New|Home");
  });

  it("messages catalogs have no inherited keys: an Object.prototype name is a missing key", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const Names = () => {
      const { t, hasTranslation } = useI18n();
      const names = ["constructor", "hasOwnProperty", "toString", "valueOf"];
      return <p>{names.map((name) => `${t(name as never)}:${hasTranslation(name)}`).join("|")}</p>;
    };
    const ui = (
      <I18nProvider i18n={i18n} autoInit={false} messages={{ en: { home: "Home" } }}>
        <Names />
      </I18nProvider>
    );
    const expected = "constructor:false|hasOwnProperty:false|toString:false|valueOf:false";
    expect(renderToString(ui)).toContain(expected);
    const view = render(ui);
    expect(view.container.textContent).toBe(expected);
  });

  it("a __proto__ key in a messages catalog is translatable", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const Proto = () => {
      const { t, hasTranslation } = useI18n();
      return <p>{`${t("__proto__" as never)}:${hasTranslation("__proto__")}`}</p>;
    };
    // JSON.parse makes `__proto__` an own key, as a fetched catalog has it.
    const fromJson = JSON.parse('{"en":{"__proto__":"Proto"},"en:default":{"home":"Home"}}');
    const html = renderToString(
      <I18nProvider i18n={i18n} autoInit={false} messages={fromJson}>
        <Proto />
      </I18nProvider>,
    );
    expect(html).toContain("Proto:true");
  });

  it("never mutates the caller's messages, null-prototype catalogs included", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const flat = Object.assign(Object.create(null), { greeting: "New" });
    const caller = { en: flat, "en:default": { home: "Home" } };
    const html = renderToString(
      <I18nProvider i18n={i18n} autoInit={false} messages={caller}>
        <Probe log={[]} />
      </I18nProvider>,
    );
    expect(html.replace(/<!-- -->/g, "")).toContain("en:New");
    expect(Object.keys(caller)).toEqual(["en", "en:default"]);
    expect(caller.en).toBe(flat);
    expect({ ...flat }).toEqual({ greeting: "New" });
    expect(caller["en:default"]).toEqual({ home: "Home" });
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
