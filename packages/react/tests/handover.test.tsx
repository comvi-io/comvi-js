/**
 * <I18nHandover catalogs locale> — render-local view() + commit publication (design §2.5,
 * R4-15, R4-16; lot-0 spike S9). Ports, by meaning:
 *   packages/next/tests/next-provider-handover-no-refetch.test.tsx  → H1–H5
 *   packages/react/tests/target-locale.test.tsx (0.7)               → R1–R6 and the
 *   abandoned-render, StrictMode, instance-swap and catalog-merge cases
 *
 * R4-16: only H5, R2 and R5 DISCRIMINATE the commit model from the naive one ("add() in
 * render"); the last block runs those three against `NaiveHandover` and requires each to
 * fail — the gate is seen red on every run, not once.
 */
import { StrictMode, Suspense, startTransition, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { state } from "../../core/src/internal";
import {
  createI18n,
  I18nHandover,
  I18nProvider,
  useI18n,
  useLocale,
  type I18n,
  type I18nHandoverProps,
  type ProviderCatalogs,
} from "../src";
import { manualLoader, settle } from "./helpers";

type Handover = (p: I18nHandoverProps) => ReactNode;

/**
 * The NAIVE variant S9 rejects: catalogs are added to the instance DURING render (guarded
 * per catalogs object, so it does not livelock — S9's "naive-ws"); the locale handover is
 * the real one.
 */
const added = new WeakSet<object>();
const NaiveHandover: Handover = ({ catalogs, locale, children }) => {
  const { i18n } = useI18n();
  if (catalogs && !added.has(catalogs)) {
    added.add(catalogs);
    for (const n in catalogs) for (const l in catalogs[n]) i18n.add(l, catalogs[n][l], n);
  }
  return <I18nHandover locale={locale}>{children}</I18nHandover>;
};

const has = (i18n: I18n, l: string, n = "default") => !!state(i18n).c[n]?.[l];
const get = (i18n: I18n, l: string, k: string, n = "default") => state(i18n).c[n][l].m[k];
const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

const CATALOGS: Record<string, Record<string, string>> = {
  en: { greeting: "Hello" },
  uk: { greeting: "Привіт" },
};
const createHost = () => {
  const loader = vi.fn((_l: string, _n: string, _s: AbortSignal) => new Promise<never>(() => {}));
  return { i18n: createI18n({ locale: "en", loader }), loader };
};
const handover = (l: string): ProviderCatalogs => ({ default: { [l]: CATALOGS[l] } });
const requested = (loader: ReturnType<typeof createHost>["loader"]) =>
  loader.mock.calls.map(([l, n]) => `${l}:${n}`);

const Probe = ({ given, log }: { given?: string; log: { given?: string; text: string }[] }) => {
  const { t, locale } = useI18n();
  const text = `${locale}:${t("greeting") as string}`;
  log.push({ given, text });
  return <p>{text}</p>;
};

/** The three discriminating scenarios, reusable against either handover. */
const scenarios = {
  async H5(H: Handover) {
    const { i18n } = createHost();
    const A = { default: { en: { greeting: "A" } } };
    const B = { default: { en: { greeting: "B" } } };
    const never = new Promise<never>(() => {});
    const Suspends = () => {
      throw never;
    };
    let navigate!: (s: { catalogs: ProviderCatalogs; suspend: boolean }) => void;
    const App = () => {
      const [s, set] = useState<{ catalogs: ProviderCatalogs; suspend: boolean }>({
        catalogs: A,
        suspend: false,
      });
      navigate = set;
      return (
        <I18nProvider i18n={i18n}>
          <H locale="en" catalogs={s.catalogs}>
            <Probe log={[]} />
            <Suspense fallback={null}>{s.suspend ? <Suspends /> : null}</Suspense>
          </H>
        </I18nProvider>
      );
    };
    const view = render(<App />);
    await settle();
    expect(view.container.textContent).toBe("en:A");
    await act(async () => {
      startTransition(() => navigate({ catalogs: B, suspend: true }));
    });
    await settle();
    expect(view.container.textContent).toBe("en:A");
    expect(get(i18n, "en", "greeting")).toBe("A");
  },

  async R2(H: Handover) {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const seen: boolean[] = [];
    const InstanceHasDe = () => {
      seen.push(has(i18n, "de"));
      return null;
    };
    const view = render(
      <I18nProvider i18n={i18n}>
        <H locale="de" catalogs={{ default: { de: { greeting: "Hallo" } } }}>
          <Probe log={[]} />
          <InstanceHasDe />
        </H>
      </I18nProvider>,
    );
    expect(view.container.textContent).toBe("de:Hallo");
    expect(seen[0]).toBe(false);
    await settle();
    expect(has(i18n, "de")).toBe(true);
    expect(view.container.textContent).toBe("de:Hallo");
  },

  async R5(H: Handover) {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const html = renderToString(
      <I18nProvider i18n={i18n}>
        <H locale="de" catalogs={{ default: { de: { greeting: "Hallo" } } }}>
          <Probe log={[]} />
        </H>
      </I18nProvider>,
    );
    expect(html.replace(/<!-- -->/g, "")).toContain("de:Hallo");
    expect(has(i18n, "de")).toBe(false);
    expect(i18n.locale).toBe("en");
  },
};

describe("H1–H5: Next-style handover (next-provider-handover-no-refetch)", () => {
  const tree = (i18n: I18n, locale: string, log: { given?: string; text: string }[]) => (
    <I18nProvider i18n={i18n}>
      <I18nHandover locale={locale} catalogs={handover(locale)}>
        <Probe given={locale} log={log} />
      </I18nHandover>
    </I18nProvider>
  );

  it("H1 first mount in a locale other than the instance's: no fetch of it, no render in the old locale", async () => {
    const { i18n, loader } = createHost();
    const log: { given?: string; text: string }[] = [];
    render(tree(i18n, "uk", log));
    await settle();
    expect(requested(loader).filter((r) => r.startsWith("uk"))).toEqual([]);
    expect(i18n.locale).toBe("uk");
    expect(log.map((e) => e.text)).toEqual(log.map(() => "uk:Привіт"));
  });

  it("H2 a mount on a running instance: no fetch, the new text at once", async () => {
    const { i18n, loader } = createHost();
    i18n.add("en", CATALOGS.en);
    const log: { given?: string; text: string }[] = [];
    render(tree(i18n, "uk", log));
    await settle();
    expect(requested(loader).filter((r) => r.startsWith("uk"))).toEqual([]);
    expect(i18n.locale).toBe("uk");
    expect(log[0]).toEqual({ given: "uk", text: "uk:Привіт" });
  });

  it("H3 a client navigation to another locale: no fetch, the new text in the same render", async () => {
    const { i18n, loader } = createHost();
    const log: { given?: string; text: string }[] = [];
    const { rerender } = render(tree(i18n, "en", log));
    await settle();
    log.length = 0;
    rerender(tree(i18n, "uk", log));
    await settle();
    expect(requested(loader).filter((r) => r.startsWith("uk"))).toEqual([]);
    expect(i18n.locale).toBe("uk");
    expect(log.filter((e) => e.text !== "uk:Привіт")).toEqual([]);
    expect(log.length).toBeGreaterThan(0);
  });

  it("H4 after the handover, a setLocale with no new prop still re-renders", async () => {
    const { i18n } = createHost();
    i18n.add("en", CATALOGS.en);
    i18n.add("uk", CATALOGS.uk);
    const log: { given?: string; text: string }[] = [];
    render(tree(i18n, "uk", log));
    await settle();
    await act(() => i18n.setLocale("en"));
    expect(log.at(-1)!.text).toBe("en:Hello");
  });

  it("H5 a cancelled render with a refreshed catalog never reaches the committed tree", () =>
    scenarios.H5(I18nHandover));
});

describe("R1–R6: target locale and catalogs (0.7 target-locale)", () => {
  const messages = {
    en: { greeting: "Hello" },
    uk: { greeting: "Привіт" },
    de: { greeting: "Hallo" },
  };

  it("R1 an abandoned transition to another target leaves no handover", async () => {
    for (const withTarget of [false, true]) {
      const i18n = createI18n({
        locale: "en",
        messages: { ...messages, fr: { greeting: "Bonjour" } },
      });
      const never = new Promise<never>(() => {});
      const SuspendsInFr = () => {
        if (useI18n().locale === "fr") throw never;
        return null;
      };
      let setTarget!: (l: string) => void;
      const App = () => {
        const [target, set] = useState("en");
        setTarget = set;
        return (
          <I18nProvider i18n={i18n}>
            <I18nHandover locale={withTarget ? target : undefined}>
              <Probe log={[]} />
              <Suspense fallback={null}>
                <SuspendsInFr />
              </Suspense>
            </I18nHandover>
          </I18nProvider>
        );
      };
      const view = render(<App />);
      expect(view.container.textContent).toBe("en:Hello");
      await act(async () => {
        startTransition(() => setTarget("fr"));
      });
      expect(view.container.textContent).toBe("en:Hello");
      act(() => {
        flushSync(() => setTarget("en"));
      });
      await act(() => i18n.setLocale("de"));
      expect([withTarget, view.container.textContent]).toEqual([withTarget, "de:Hallo"]);
      view.unmount();
    }
  });

  it("R2 catalogs render before they are in the instance and are published at commit", () =>
    scenarios.R2(I18nHandover));

  it("R3 hands over to the instance at commit, so a later add() wins", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const view = render(
      <I18nProvider i18n={i18n}>
        <I18nHandover locale="de" catalogs={{ default: { de: { greeting: "Hallo" } } }}>
          <Probe log={[]} />
        </I18nHandover>
      </I18nProvider>,
    );
    await settle();
    act(() => i18n.add("de", { greeting: "Servus" }));
    expect(view.container.textContent).toBe("de:Servus");
  });

  it("R4 adds a catalogs object once, under StrictMode too", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const add = vi.spyOn(i18n, "add");
    const m = { default: { de: { greeting: "Hallo" } } };
    const ui = (
      <StrictMode>
        <I18nProvider i18n={i18n}>
          <I18nHandover catalogs={m}>
            <Probe log={[]} />
          </I18nHandover>
        </I18nProvider>
      </StrictMode>
    );
    const view = render(ui);
    view.rerender(ui);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("R5 renderToString with catalogs never writes the instance", () => scenarios.R5(I18nHandover));

  it("R6 a later render with a new catalogs object translates from it in that render", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const log: { given?: string; text: string }[] = [];
    const nav = (l: string, g: string) => (
      <I18nProvider i18n={i18n}>
        <I18nHandover locale={l} catalogs={{ default: { [l]: { greeting: g } } }}>
          <Probe log={log} />
        </I18nHandover>
      </I18nProvider>
    );
    const view = render(nav("de", "Hallo"));
    await settle();
    log.length = 0;
    view.rerender(nav("uk", "Привіт"));
    expect(log[0].text).toBe("uk:Привіт");
    expect(has(i18n, "uk")).toBe(true);
  });
});

describe("the target locale across renders and instances (0.7 target-locale)", () => {
  const messages = {
    en: { greeting: "Hello" },
    de: { greeting: "Hallo" },
    uk: { greeting: "Привіт" },
  };

  it("renders the target in the very render it changes, before the instance switches", () => {
    const i18n = createI18n({ locale: "en", messages });
    const log: { given?: string; text: string }[] = [];
    const ui = (l: string) => (
      <I18nProvider i18n={i18n}>
        <I18nHandover locale={l}>
          <Probe log={log} />
        </I18nHandover>
      </I18nProvider>
    );
    const view = render(ui("en"));
    log.length = 0;
    view.rerender(ui("de"));
    expect(log[0].text).toBe("de:Hallo");
  });

  it("follows the instance once it moves, even to another locale", async () => {
    const i18n = createI18n({ locale: "en", messages });
    const view = render(
      <I18nProvider i18n={i18n}>
        <I18nHandover locale="de">
          <Probe log={[]} />
        </I18nHandover>
      </I18nProvider>,
    );
    await settle();
    expect(view.container.textContent).toBe("de:Hallo");
    await act(() => i18n.setLocale("uk"));
    expect(view.container.textContent).toBe("uk:Привіт");
  });

  it("follows the instance after it moved away and back to where it was (lrev, not the locale)", async () => {
    const l = manualLoader();
    const i18n = createI18n({ locale: "en", messages, loader: l.load, onError: () => {} });
    const view = render(
      <I18nProvider i18n={i18n}>
        <I18nHandover locale="fr">
          <Probe log={[]} />
        </I18nHandover>
      </I18nProvider>,
    );
    await settle();
    // The commit asked for fr, which is loading; the app moves to uk and back to en.
    expect(l.requested).toContain("fr:default");
    await act(async () => {
      await i18n.setLocale("uk");
      await i18n.setLocale("en");
    });
    // Back on the locale the handover started from: still a move, so the instance wins.
    expect(i18n.locale).toBe("en");
    expect(view.container.textContent).toBe("en:Hello");
  });

  it("under StrictMode still renders the target, then follows the instance", async () => {
    const i18n = createI18n({ locale: "en", messages });
    const view = render(
      <StrictMode>
        <I18nProvider i18n={i18n}>
          <I18nHandover locale="de">
            <Probe log={[]} />
          </I18nHandover>
        </I18nProvider>
      </StrictMode>,
    );
    await settle();
    expect(view.container.textContent).toBe("de:Hallo");
    await act(() => i18n.setLocale("en"));
    expect(view.container.textContent).toBe("en:Hello");
  });

  it("a replacement instance with the same target renders the target", async () => {
    const a = createI18n({ locale: "en", messages });
    const b = createI18n({ locale: "en", messages });
    const ui = (i: I18n) => (
      <I18nProvider i18n={i}>
        <I18nHandover locale="de">
          <Probe log={[]} />
        </I18nHandover>
      </I18nProvider>
    );
    const view = render(ui(a));
    await settle();
    view.rerender(ui(b));
    expect(view.container.textContent).toBe("de:Hallo");
    await settle();
    expect(b.locale).toBe("de");
  });

  it("a replacement instance that switched before renders the target at once", async () => {
    const a = createI18n({ locale: "en", messages });
    const b = createI18n({ locale: "en", messages });
    await b.setLocale("uk"); // b's lrev has moved
    await b.setLocale("en");
    const log: { given?: string; text: string }[] = [];
    const ui = (i: I18n) => (
      <I18nProvider i18n={i}>
        <I18nHandover locale="de">
          <Probe log={log} />
        </I18nHandover>
      </I18nProvider>
    );
    const view = render(ui(a));
    await settle();
    log.length = 0;
    view.rerender(ui(b));
    // Every render of b's subtree shows the target, the one before b switches too.
    expect(log.map((x) => x.text)).toEqual(log.map(() => "de:Hallo"));
    expect(log.length).toBeGreaterThan(0);
    expect(view.container.textContent).toBe("de:Hallo");
  });

  it("a replacement instance gets the same catalogs object too", async () => {
    const a = createI18n({ locale: "en", messages });
    const b = createI18n({ locale: "en", messages });
    const catalogs = { default: { en: { extra: "Extra" } } };
    const Extra = () => <p>{useI18n().t("extra") as string}</p>;
    const ui = (i: I18n) => (
      <I18nProvider i18n={i}>
        <I18nHandover catalogs={catalogs}>
          <Extra />
        </I18nHandover>
      </I18nProvider>
    );
    const view = render(ui(a));
    await settle();
    view.rerender(ui(b));
    expect(view.container.textContent).toBe("Extra");
    await settle();
    expect(b.t("extra")).toBe("Extra");
  });

  it.each([undefined, "en"])(
    "with target %j (none, or the instance's locale) switches nothing: no report, no refetch",
    async (target) => {
      const l = manualLoader();
      const errors: string[] = [];
      const i18n = createI18n({
        locale: "en",
        loader: l.load,
        onError: (e) => errors.push(e.code),
      });
      await l.fail("en:default");
      render(
        <I18nProvider i18n={i18n}>
          <I18nHandover locale={target}>
            <Probe log={[]} />
          </I18nHandover>
        </I18nProvider>,
      );
      await settle();
      expect(l.requested).toEqual(["en:default"]);
      // The probe's key is missing (nothing loaded); nothing else is reported.
      expect(errors.filter((c) => c != "missing_key")).toEqual(["load_failed"]);
    },
  );

  it("a failed switch of a replaced instance leaves the new instance's handover alone", async () => {
    const l = manualLoader();
    const a = createI18n({ locale: "en", messages, loader: l.load, onError: () => {} });
    const b = createI18n({ locale: "en", messages: { ...messages, fr: { greeting: "Salut" } } });
    const ui = (i: I18n) => (
      <I18nProvider i18n={i}>
        <I18nHandover locale="fr">
          <Probe log={[]} />
        </I18nHandover>
      </I18nProvider>
    );
    const view = render(ui(a)); // a's switch to fr waits for its load
    await settle();
    view.rerender(ui(b)); // b switches to fr at once
    await settle();
    expect(view.container.textContent).toBe("fr:Salut");
    await act(() => b.setLocale("uk")); // the user moves b on
    expect(view.container.textContent).toBe("uk:Привіт");
    await l.fail("fr:default"); // a's old switch fails now
    await settle();
    expect(view.container.textContent).toBe("uk:Привіт");
  });

  it("an invalid target is reported, not thrown, and the instance stays", async () => {
    const errors: string[] = [];
    const i18n = createI18n({ locale: "en", messages, onError: (e) => errors.push(e.code) });
    render(
      <I18nProvider i18n={i18n}>
        <I18nHandover locale="!!">
          <Probe log={[]} />
        </I18nHandover>
      </I18nProvider>,
    );
    await settle();
    expect(i18n.locale).toBe("en");
    expect(errors).toContain("invalid_locale");
  });
});

describe("a target the instance cannot switch to, a catalogs refresh", () => {
  it("a target whose load fails is given up: the subtree renders the instance's locale", async () => {
    const l = manualLoader();
    const errors: string[] = [];
    const i18n = createI18n({
      locale: "en",
      messages: { en: { greeting: "Hello" } },
      loader: l.load,
      onError: (e) => errors.push(e.code),
    });
    const locales: string[] = [];
    const Loc = () => {
      locales.push(useLocale());
      return null;
    };
    const view = render(
      <I18nProvider i18n={i18n}>
        <I18nHandover locale="fr">
          <Probe log={[]} />
          <Loc />
        </I18nHandover>
      </I18nProvider>,
    );
    await settle();
    await l.fail("fr:default");
    await settle();
    expect(i18n.locale).toBe("en");
    expect(errors).toContain("load_failed");
    expect(view.container.textContent).toBe("en:Hello");
    expect(locales.at(-1)).toBe("en");
  });

  it("an invalid target renders the instance's locale too", async () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { greeting: "Hello" } },
      onError: () => {},
    });
    const view = render(
      <I18nProvider i18n={i18n}>
        <I18nHandover locale="!!">
          <Probe log={[]} />
        </I18nHandover>
      </I18nProvider>,
    );
    await settle();
    expect(view.container.textContent).toBe("en:Hello");
  });

  it("a refreshed catalogs object with the same target does not undo the user's setLocale()", async () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { greeting: "Hello" }, uk: { greeting: "Привіт" } },
    });
    const ui = (c: ProviderCatalogs) => (
      <I18nProvider i18n={i18n}>
        <I18nHandover locale="de" catalogs={c}>
          <Probe log={[]} />
        </I18nHandover>
      </I18nProvider>
    );
    const view = render(ui({ default: { de: { greeting: "Hallo" } } }));
    await settle();
    expect(i18n.locale).toBe("de");
    await act(() => i18n.setLocale("uk"));
    view.rerender(ui({ default: { de: { greeting: "Hallo!" } } }));
    await settle();
    expect(i18n.locale).toBe("uk");
    expect(view.container.textContent).toBe("uk:Привіт");
  });

  it("a handover to a locale nobody handed catalogs for reports no missing key while it loads", async () => {
    const l = manualLoader({ "de:default": { greeting: "Hallo" } });
    const errors: string[] = [];
    const i18n = createI18n({
      locale: "en",
      messages: { en: { greeting: "Hello" } },
      loader: l.load,
      onError: (e) => errors.push(e.code),
    });
    const flags: boolean[] = [];
    const Flag = () => {
      flags.push(useI18n().isLoading);
      return null;
    };
    const view = render(
      <I18nProvider i18n={i18n}>
        <I18nHandover locale="de">
          <Probe log={[]} />
          <Flag />
        </I18nHandover>
      </I18nProvider>,
    );
    expect(flags[0]).toBe(true);
    await l.answer("de:default");
    await settle();
    expect(view.container.textContent).toBe("de:Hallo");
    expect(errors).toEqual([]);
  });
});

describe("hydration (0.7 target-locale hydrateRoot)", () => {
  /**
   * The server renders from a request instance holding the catalog; the client creates a
   * FRESH instance and passes the same <I18nHandover catalogs locale> props (the payload
   * the server serialized). The first client render must equal the server HTML.
   */
  it.each([
    ["a fresh client instance, no `loading`", false],
    ["`loading` on a client instance created from the payload", true],
  ])(
    "hydrates a handed-over locale with 0 recoverable errors and no fetch of it: %s",
    async (_, gated) => {
      const catalogs: ProviderCatalogs = { default: { uk: { greeting: "Привіт" } } };
      const ui = (i: I18n, log: { text: string }[]) => (
        <I18nProvider i18n={i} loading={gated ? "wait" : undefined}>
          <I18nHandover locale="uk" catalogs={catalogs}>
            <Probe log={log} />
          </I18nHandover>
        </I18nProvider>
      );
      const server = createI18n({ locale: "uk", messages: { uk: { greeting: "Привіт" } } });
      const container = document.createElement("div");
      container.innerHTML = renderToString(ui(server, []));
      expect(container.textContent).toBe("uk:Привіт");
      // The client instance: knows nothing yet (its loader would fetch the default locale),
      // or — with `loading` — is created from the serialized payload, so nothing is in flight.
      const loader = vi.fn(
        (_l: string, _n: string, _s: AbortSignal) => new Promise<never>(() => {}),
      );
      const client = gated
        ? createI18n({ locale: "uk", catalogs, loader })
        : createI18n({ locale: "en", loader });
      const errors: unknown[] = [];
      const log: { text: string }[] = [];
      const err = quiet();
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, ui(client, log), {
          onRecoverableError: (e) => errors.push(e),
        });
      });
      await settle();
      expect(errors).toEqual([]);
      expect(err).not.toHaveBeenCalled();
      err.mockRestore();
      expect(log[0].text).toBe("uk:Привіт");
      expect(container.textContent).toBe("uk:Привіт");
      expect(client.locale).toBe("uk");
      expect(requested(loader).filter((r) => r.startsWith("uk"))).toEqual([]);
      act(() => root.unmount());
    },
  );

  it("documents the client setup: `loading` on a client instance still loading does NOT match the server", async () => {
    const server = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const ui = (i: I18n) => (
      <I18nProvider i18n={i} loading="wait">
        <Probe log={[]} />
      </I18nProvider>
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(ui(server));
    const { i18n: client } = createHost(); // its catalog is still loading
    const errors: unknown[] = [];
    const err = quiet();
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, ui(client), { onRecoverableError: (e) => errors.push(e) });
    });
    err.mockRestore();
    expect(errors.length).toBeGreaterThan(0);
    act(() => root.unmount());
  });
});

describe("handed-over catalogs (0.7 target-locale messages)", () => {
  it("a partial catalog merges over the one in place, key by key", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { a: "A", b: "B" } } });
    const Two = () => {
      const { t } = useI18n();
      return <p>{`${t("a") as string}${t("b") as string}`}</p>;
    };
    const view = render(
      <I18nProvider i18n={i18n}>
        <I18nHandover catalogs={{ default: { en: { b: "b2" } } }}>
          <Two />
        </I18nHandover>
      </I18nProvider>,
    );
    expect(view.container.textContent).toBe("Ab2");
    await settle();
    expect(i18n.t("a")).toBe("A");
    expect(i18n.t("b")).toBe("b2");
  });

  it("an Object.prototype name is a missing key; a __proto__ key is translatable", () => {
    const i18n = createI18n({ locale: "en", onError: () => {} });
    const cat = JSON.parse('{"__proto__":"P","x":"X"}');
    const Keys = () => {
      const { t } = useI18n();
      return <p>{[t("toString"), t("__proto__"), t("x")].join("|")}</p>;
    };
    const view = render(
      <I18nProvider i18n={i18n}>
        <I18nHandover catalogs={{ default: { en: cat } }}>
          <Keys />
        </I18nHandover>
      </I18nProvider>,
    );
    expect(view.container.textContent).toBe("toString|P|X");
  });

  it("never mutates the caller's catalogs (frozen ones included)", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { a: "A" } } });
    const cat = Object.freeze({ default: Object.freeze({ en: Object.freeze({ b: "B" }) }) });
    render(
      <I18nProvider i18n={i18n}>
        <I18nHandover catalogs={cat}>
          <Probe log={[]} />
        </I18nHandover>
      </I18nProvider>,
    );
    await settle();
    expect(cat).toEqual({ default: { en: { b: "B" } } });
    expect(i18n.t("b")).toBe("B");
  });

  it("a stable catalogs object re-renders without layering it again", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { greeting: "Hello" } } });
    const cat = { default: { de: { greeting: "Hallo" } } };
    const states: unknown[] = [];
    const Spy = () => {
      states.push(useRef(useI18n()).current);
      return null;
    };
    let bump!: () => void;
    const App = () => {
      const [n, set] = useState(0);
      bump = () => set(n + 1);
      return (
        <I18nProvider i18n={i18n}>
          <I18nHandover catalogs={cat}>
            <Spy />
            <i>{n}</i>
          </I18nHandover>
        </I18nProvider>
      );
    };
    render(<App />);
    await settle();
    const add = vi.spyOn(i18n, "add");
    act(() => bump());
    act(() => bump());
    expect(add).not.toHaveBeenCalled();
  });
});

describe("R4-16: H5, R2 and R5 are RED on the naive binding (add() in render)", () => {
  it.each(["H5", "R2", "R5"] as const)("%s fails on NaiveHandover", async (name) => {
    quiet();
    await expect(scenarios[name](NaiveHandover)).rejects.toThrow();
  });

  it("and each passes on I18nHandover in the same run", async () => {
    for (const name of ["H5", "R2", "R5"] as const) await scenarios[name](I18nHandover);
  });
});
