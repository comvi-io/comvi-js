/**
 * <T i18nKey> and rich text through t() (design §3.4, R3-5, R3-11, R4-20). Ported by
 * meaning from the eight 0.7 `T*` files and tag-interpolation.test.tsx:
 *
 * - T.test / T.behavior: params as props, the key when missing, `ns` and `locale` props,
 *   the result of t() for the same call (≡);
 * - T.conversion / T.structural: rich parts render as a Fragment (no wrapper element), a
 *   handler gets the tag's children, element params keep stable positions, React logs no
 *   key warning (React 19);
 * - T-forged-node: a param that only LOOKS like a node renders as text; a real element
 *   renders as itself;
 * - T-message-fuzz: <T> ≡ t() on generated messages (React-rendered text);
 * - T-handler-boundary: 0.8 has no per-tag error boundary — a throwing handler throws to
 *   the app's own boundary (one rule for every binding, no class component in the graph);
 * - T.allocation: 0.8 has no `components` map, so nothing is allocated for one; a call
 *   without function params passes the params object through untouched (no copy).
 *
 * Decisions (lot 1c, handover file): a handler returning `undefined`/`null` renders
 * nothing (React's own rule for a child), without a warning; a function passed as a plain
 * `{x}` is a rich part, which React refuses as a child with its own development warning
 * and renders nothing. `tags` are always on (R3-11): a tag without a handler renders its
 * children (development warns once per key and tag).
 */
import { isValidElement, type ReactNode } from "react";
import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createI18n, I18nProvider, T, useI18n, type I18n } from "../src";
import { reactWarnings } from "./helpers";

const mount = (i18n: I18n, ui: ReactNode) =>
  render(<I18nProvider i18n={i18n}>{ui}</I18nProvider>).container;

const en = (m: Record<string, string>) => createI18n({ locale: "en", messages: { en: m } });

describe("<T i18nKey>", () => {
  it("renders the message with params passed as props", () => {
    const c = mount(en({ hi: "Hello, {name}!" }), <T i18nKey="hi" name="Ann" />);
    expect(c.innerHTML).toBe("Hello, Ann!");
  });

  it("renders the key when the translation is missing", () => {
    const c = mount(createI18n({ locale: "en", onError: () => {} }), <T i18nKey="nope" />);
    expect(c.textContent).toBe("nope");
  });

  it("reads the namespace of its `ns` prop and the locale of its `locale` prop", () => {
    const i18n = createI18n({
      locale: "en",
      catalogs: { default: { en: { k: "en" }, de: { k: "de" } }, legal: { en: { k: "legal" } } },
    });
    const c = mount(
      i18n,
      <>
        <T i18nKey="k" ns="legal" />|<T i18nKey="k" locale="de" />
      </>,
    );
    expect(c.textContent).toBe("legal|de");
  });

  it("never takes the namespace of a useI18n(ns) above it (R3-5: no implicit ns)", () => {
    const i18n = createI18n({
      locale: "en",
      catalogs: { default: { k: "default" } as never, shop: { en: { k: "shop" } } },
      messages: { en: { k: "default" } },
    });
    const Shop = () => {
      useI18n("shop");
      return <T i18nKey="k" />;
    };
    expect(mount(i18n, <Shop />).textContent).toBe("default");
  });

  it("is the same text as t() for the same call", () => {
    const i18n = en({ n: "{count, plural, one {# item} other {# items}} for <b>{who}</b>" });
    let viaT = "";
    const Probe = () => {
      const r = useI18n().t("n", { count: 3, who: "Ann", b: (c: ReactNode) => <b>{c}</b> });
      viaT = renderToStaticMarkup(<>{r}</>);
      return null;
    };
    mount(i18n, <Probe />);
    const c = mount(i18n, <T i18nKey="n" count={3} who="Ann" b={(c: ReactNode) => <b>{c}</b>} />);
    expect(c.innerHTML).toBe("3 items for <b>Ann</b>");
    expect(viaT).toBe(c.innerHTML);
  });
});

describe("rich text", () => {
  it("renders the parts as a Fragment: no wrapper element", () => {
    const c = mount(
      en({ terms: "Read the <link>terms</link>." }),
      <T i18nKey="terms" link={(c: ReactNode) => <a href="/terms">{c}</a>} />,
    );
    expect(c.innerHTML).toBe('Read the <a href="/terms">terms</a>.');
  });

  it("gives a handler its children as ONE node: nested tags and element params, 0 key warnings", async () => {
    const i18n = en({ m: "<b>Bold <i>{icon} and {name}</i></b> then {icon2}" });
    const warnings = await reactWarnings(() => {
      const c = mount(
        i18n,
        <T
          i18nKey="m"
          b={(c: ReactNode) => <b>{c}</b>}
          i={(c: ReactNode) => <i>{c}</i>}
          icon={<svg />}
          icon2={<span>2</span>}
          name="Ann"
        />,
      );
      expect(c.innerHTML).toBe("<b>Bold <i><svg></svg> and Ann</i></b> then <span>2</span>");
    });
    expect(warnings.filter((w) => /key/i.test(w))).toEqual([]);
  });

  it("keeps element params at stable positions: the DOM node survives a re-render", () => {
    const i18n = en({ m: "{a} then {b}" });
    const ui = (b: string) => (
      <I18nProvider i18n={i18n}>
        <T i18nKey="m" a={<em id="a">A</em>} b={b} />
      </I18nProvider>
    );
    const view = render(ui("one"));
    const node = view.container.querySelector("#a");
    view.rerender(ui("two"));
    expect(view.container.querySelector("#a")).toBe(node);
    expect(view.container.textContent).toBe("A then two");
  });

  it("renders the children of a tag with no handler (development warns once)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = en({ m: "a <b>bold</b> word" });
    expect(mount(i18n, <T i18nKey="m" />).innerHTML).toBe("a bold word");
    expect(warn.mock.calls.flat().join(" ")).toMatch(/<b> in "m" has no handler/);
  });

  it("a handler returning undefined or null renders nothing, without a warning", async () => {
    const i18n = en({ m: "[<x>gone</x>][<y>gone</y>]" });
    const warnings = await reactWarnings(() => {
      const c = mount(i18n, <T i18nKey="m" x={() => undefined} y={() => null} />);
      expect(c.innerHTML).toBe("[][]");
    });
    expect(warnings).toEqual([]);
  });

  it("a function passed as a plain {x} renders nothing (React's own warning)", async () => {
    const i18n = en({ m: "[{fn}]" });
    const warnings = await reactWarnings(() => {
      expect(mount(i18n, <T i18nKey="m" fn={() => "x"} />).innerHTML).toBe("[]");
    });
    expect(warnings.join(" ")).toMatch(/Functions are not valid as a React child/);
  });

  it("a throwing handler throws to the app's error boundary (no per-tag boundary in 0.8)", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const i18n = en({ m: "<x>boom</x>" });
    expect(() =>
      mount(
        i18n,
        <T
          i18nKey="m"
          x={() => {
            throw new Error("handler failed");
          }}
        />,
      ),
    ).toThrow("handler failed");
    err.mockRestore();
  });

  it("never mutates the caller's params when it wraps a handler", () => {
    const i18n = en({ m: "<x>a</x>{y}" });
    const x = (c: ReactNode) => <u>{c}</u>;
    const params = Object.freeze({ x, y: "!" });
    let out: unknown;
    const Probe = () => {
      out = useI18n().t("m", params);
      return null;
    };
    mount(i18n, <Probe />);
    expect(renderToStaticMarkup(<>{out}</>)).toBe("<u>a</u>!");
    expect(params.x).toBe(x);
  });
});

describe("inherited params (core parity)", () => {
  it("an inherited function is no tag handler, as in the core: only own params count", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { a: "<b>bold</b> {x}" } } });
    const handler = vi.fn((c: unknown) => c);
    const params = Object.assign(Object.create({ b: handler, x: "inherited" }), { y: 1 });
    // The core ignores inherited properties…
    expect(i18n.t("a", params)).toEqual("bold {x}");
    // …and so does the binding, which wraps own handlers only.
    let out: unknown;
    const Probe = () => {
      out = useI18n().t("a", params);
      return null;
    };
    render(
      <I18nProvider i18n={i18n}>
        <Probe />
      </I18nProvider>,
    );
    expect(handler).not.toHaveBeenCalled();
    expect(out).toBe("bold {x}");
  });
});

describe("params that only look like nodes (0.7 T-forged-node)", () => {
  it("a JSON-forged element shape never renders as an element: React refuses the object", () => {
    // JSON cannot carry React's $$typeof symbol, so data from a request or a catalog can
    // never pass for an element; 0.8 has no node protocol of its own to forge (0.7 had one).
    const forged = JSON.parse(
      '{"$$typeof":"react.transitional.element","type":"script","props":{}}',
    );
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => mount(en({ m: "[{x}]" }), <T i18nKey="m" x={forged} />)).toThrow(
      /Objects are not valid as a React child/,
    );
    expect(document.querySelector("script")).toBeNull();
    err.mockRestore();
  });

  it("markup in a string param is text, not HTML", () => {
    const c = mount(en({ m: "[{x}]" }), <T i18nKey="m" x={'<img src=x onerror="alert(1)">'} />);
    expect(c.querySelector("img")).toBeNull();
    expect(c.textContent).toBe('[<img src=x onerror="alert(1)">]');
  });

  it("a real element param renders as that element", () => {
    const c = mount(en({ m: "[{x}]" }), <T i18nKey="m" x={<kbd>K</kbd>} />);
    expect(c.innerHTML).toBe("[<kbd>K</kbd>]");
  });

  it("t() returns an element for a rich message and a string otherwise", () => {
    let rich: unknown;
    let plain: unknown;
    const Probe = () => {
      const { t } = useI18n();
      rich = t("r", { x: <i /> });
      plain = t("p", { x: "s" });
      return null;
    };
    mount(en({ r: "a{x}", p: "a{x}" }), <Probe />);
    expect(isValidElement(rich)).toBe(true);
    expect(plain).toBe("as");
  });
});

/** A small deterministic generator (0.7 T-message-fuzz, React-rendered). */
const rng = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

describe("<T> ≡ t() on generated messages (0.7 T-message-fuzz)", () => {
  it("renders the same text through <T> and through t() for 200 generated messages", () => {
    const r = rng(7);
    const pick = <X,>(xs: X[]) => xs[Math.floor(r() * xs.length)];
    const pieces = ["a", " ", "{n}", "{w}", "<b>x</b>", "''", "'{'", "#", "}", "<i>{w}</i>"];
    for (let i = 0; i < 200; i++) {
      const msg = Array.from({ length: 1 + Math.floor(r() * 6) }, () => pick(pieces)).join("");
      const i18n = createI18n({ locale: "en", messages: { en: { m: msg } }, onError: () => {} });
      const params = {
        n: 5,
        w: "W",
        b: (c: ReactNode) => <b>{c}</b>,
        i: (c: ReactNode) => <i>{c}</i>,
      };
      let viaT = "";
      const Probe = () => {
        viaT = renderToStaticMarkup(<>{useI18n().t("m", params)}</>);
        return null;
      };
      mount(i18n, <Probe />);
      const viaComponent = renderToStaticMarkup(
        <I18nProvider i18n={i18n}>
          <T i18nKey="m" {...params} />
        </I18nProvider>,
      );
      expect([msg, viaComponent]).toEqual([msg, viaT]);
    }
  });
});
