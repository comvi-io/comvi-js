/**
 * Concurrency. Ported by meaning from 0.7 tearing.test.tsx and store-revision-race.test.tsx
 * (one snapshot store now, no revision counter of the binding's own):
 *
 * - no tearing: a change published in the middle of a render pass never commits a tree in
 *   which two consumers show different states (useSyncExternalStore re-renders);
 * - interleaved transitions: the last setLocale wins, the committed locale is the latest;
 * - the commit→subscribe window: a change published after the first render but before the
 *   provider subscribed is not lost;
 * - the 0.7 "render-time mutation idempotency" repro is the handover's R4 (handover.test).
 *
 * New in 1c (synthesis §4.4): the component-render counter — 1,000 useLocale() components
 * render 0 times while a namespace loads and settles; useI18n() consumers do re-render.
 */
import { memo, startTransition, useLayoutEffect, useRef } from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nProvider, useI18n, useLocale } from "../src";
import { make, manualLoader } from "./helpers";

describe("no tearing", () => {
  it("a publish in the middle of a render pass never commits two consumers out of step", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const i18n = createI18n({ locale: "en", messages: { en: { g: "Hello" } } });
    const commits: string[][] = [];
    let mutate = false;
    const Probe = ({ id }: { id: string }) => <span id={id}>{useI18n().t("g") as string}</span>;
    const Mutator = () => {
      if (mutate) {
        mutate = false;
        i18n.add("en", { g: "Changed" });
      }
      return null;
    };
    const Check = () => {
      useLayoutEffect(() => {
        commits.push(["#a", "#b"].map((s) => document.querySelector(s)!.textContent!));
      });
      return null;
    };
    const ui = (n: number) => (
      <I18nProvider i18n={i18n}>
        <Probe id="a" />
        <Mutator key={n} />
        <Probe id="b" />
        <Check />
      </I18nProvider>
    );
    const view = render(ui(0));
    mutate = true;
    act(() => startTransition(() => view.rerender(ui(1))));
    expect(commits.every(([a, b]) => a === b)).toBe(true);
    expect(commits.at(-1)).toEqual(["Changed", "Changed"]);
  });

  it("interleaved transitions: the last setLocale is the committed locale", async () => {
    const l = manualLoader({ "fr:default": { g: "Bonjour" }, "de:default": { g: "Hallo" } });
    const { i18n } = make({ locale: "en", messages: { en: { g: "Hello" } }, loader: l.load });
    const Probe = () => <p>{useI18n().t("g") as string}</p>;
    const view = render(
      <I18nProvider i18n={i18n}>
        <Probe />
      </I18nProvider>,
    );
    act(() =>
      startTransition(() => {
        void i18n.setLocale("fr").catch(() => {});
        void i18n.setLocale("de");
      }),
    );
    await l.answer("de:default");
    expect(l.signals.get("fr:default")!.aborted).toBe(true); // the superseded switch
    expect(i18n.locale).toBe("de");
    expect(view.container.textContent).toBe("Hallo");
  });
});

describe("the commit→subscribe window (0.7 store-revision-race)", () => {
  it("a change published after the first render but before the subscription is not lost", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { g: "Hello {who}" } } });
    const Probe = () => <p>{useI18n().t("g", { who: "you" }) as string}</p>;
    const Early = () => {
      // Layout effects run before the provider's passive subscription.
      useLayoutEffect(() => {
        i18n.add("en", { g: "Hi {who}" });
        i18n.setDefaultParams({ who: "Ann" });
      }, []);
      return null;
    };
    const view = render(
      <I18nProvider i18n={i18n}>
        <Probe />
        <Early />
      </I18nProvider>,
    );
    expect(view.container.textContent).toBe("Hi you");
  });
});

describe("component-render counter (synthesis §4.4)", () => {
  const N = 1000;

  it(`${N} useLocale() components render 0 times while a namespace loads; useI18n() ones do`, async () => {
    const l = manualLoader({ "en:shop": { x: "X" } });
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    let localeRenders = 0;
    let i18nRenders = 0;
    const ByLocale = () => {
      localeRenders++;
      return <i>{useLocale()}</i>;
    };
    const ByI18n = () => {
      i18nRenders++;
      return <b>{useI18n().locale}</b>;
    };
    const List = memo(() => (
      <>
        {Array.from({ length: N }, (_, k) => (
          <ByLocale key={k} />
        ))}
        <ByI18n />
      </>
    ));
    const Root = () => {
      const list = useRef(<List />).current;
      return <I18nProvider i18n={i18n}>{list}</I18nProvider>;
    };
    render(<Root />);
    expect(localeRenders).toBe(N);
    localeRenders = 0;
    i18nRenders = 0;
    let load!: Promise<void>;
    act(() => void (load = i18n.load("shop")));
    await l.answer("en:shop");
    await act(() => load);
    expect(localeRenders).toBe(0);
    // The load published twice (start, end): the useI18n() consumer saw both.
    expect(i18nRenders).toBe(2);
  });
});
