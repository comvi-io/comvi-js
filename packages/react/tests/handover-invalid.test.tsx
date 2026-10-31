/**
 * `<I18nHandover locale>` refuses a locale that is not a tag (lot 4d, owner 31.10): a
 * RangeError at the top of its render, before the render snapshot and before its children,
 * whatever they use. Nothing reaches the instance. A valid locale with no catalog is not
 * affected. SSR: `ssr.node.test.tsx`.
 */
import { Component, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n, I18nHandover, I18nProvider, useI18n, type I18n } from "../src";
import { useFormat } from "../src/format";

const OnlyT = () => <p>{useI18n().t("a")}</p>;
const OnlyFormat = () => <p>{useFormat().number(1)}</p>;
const Plain = () => <p>x</p>;
const children = { "only t()": OnlyT, "only useFormat()": OnlyFormat, "a plain child": Plain };

class Catch extends Component<{ on: (e: unknown) => void; children: ReactNode }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    this.props.on(e);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const setup = () => {
  const loader = vi.fn(() => new Promise<never>(() => {}));
  const onError = vi.fn();
  const i18n = createI18n({ locale: "en", messages: { en: { a: "A" } }, loader, onError });
  loader.mockClear();
  return { i18n, loader, onError, set: vi.spyOn(i18n, "setLocale"), add: vi.spyOn(i18n, "add") };
};

const page = (i18n: I18n, bad: string, C: () => ReactNode, on: (e: unknown) => void) => (
  <I18nProvider i18n={i18n}>
    <Catch on={on}>
      <I18nHandover locale={bad} catalogs={{ default: { de: { a: "A-de" } } }}>
        <C />
      </I18nHandover>
    </Catch>
  </I18nProvider>
);

afterEach(() => vi.restoreAllMocks());

describe.each(["!!", ""])("<I18nHandover locale=%j> throws a RangeError", (bad) => {
  describe.each(Object.entries(children))("with %s", (_, C) => {
    const expectRefused = (e: unknown, s: ReturnType<typeof setup>, rev: number) => {
      expect(e).toBeInstanceOf(RangeError);
      expect(s.set).not.toHaveBeenCalled();
      expect(s.add).not.toHaveBeenCalled();
      expect(s.loader).not.toHaveBeenCalled();
      expect(s.i18n.rev()).toBe(rev);
      expect(s.i18n.locale).toBe("en");
    };

    it("on a client render", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const s = setup();
      const rev = s.i18n.rev();
      let caught: unknown;
      render(page(s.i18n, bad, C, (e) => (caught = e)));
      expectRefused(caught, s, rev);
    });

    it("on a hydration", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const s = setup();
      const rev = s.i18n.rev();
      const container = document.createElement("div");
      container.innerHTML = "<p>x</p>";
      let caught: unknown;
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(
          container,
          page(s.i18n, bad, C, (e) => (caught = e)),
          { onRecoverableError: () => {} },
        );
      });
      expectRefused(caught, s, rev);
      act(() => root.unmount());
    });
  });
});

describe("<I18nHandover> with a valid locale and no catalog", () => {
  it("renders the subtree in the target and switches at commit, as before", () => {
    const s = setup();
    const seen: string[] = [];
    const Probe = () => {
      seen.push(useI18n().locale);
      return null;
    };
    render(
      <I18nProvider i18n={s.i18n}>
        <I18nHandover locale="de">
          <Probe />
        </I18nHandover>
      </I18nProvider>,
    );
    expect(seen[0]).toBe("de");
    expect(s.set).toHaveBeenCalledWith("de");
    expect(s.i18n.locale).toBe("en");
    expect(s.onError).not.toHaveBeenCalled();
  });

  it("an absent prop means no target", () => {
    const s = setup();
    render(
      <I18nProvider i18n={s.i18n}>
        <I18nHandover>
          <Plain />
        </I18nHandover>
      </I18nProvider>,
    );
    expect(s.set).not.toHaveBeenCalled();
  });

  it("the development message names the tag", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const s = setup();
    let caught: Error | undefined;
    render(page(s.i18n, "!!", Plain, (e) => (caught = e as Error)));
    expect(caught!.message).toBe('[@comvi/react] invalid locale "!!"');
  });
});
