/**
 * `<T>` (R3-24, lots 4b/4d): a tag renders through a handler prop of its name, then its
 * `components` entry, then as text; params are props and reactive; the bound `<T>` keeps its
 * namespace; an empty tag gets no children, so a void element renders.
 */
import { createSignal, type JSX, type ParentProps } from "solid-js";
import { render } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider, T, useI18n, type I18n } from "../src";
import { make, manualLoader } from "./helpers";

const messages = { en: { m: "Read <b>the <i>new</i> terms</b> <x>now</x>." } };
const html = (i18n: I18n, el: () => JSX.Element) =>
  render(() => <I18nProvider i18n={i18n}>{el()}</I18nProvider>).container.innerHTML;

const Italic = (p: ParentProps) => <i class="it">{p.children}</i>;

describe("a plain {x} is always text (04.11.2026)", () => {
  const i18n = () => make({ locale: "en", messages: { en: { m: "[{x}]" } } }).i18n;

  it("a JSX element or a server template shape `{ t }` prints as text, not as markup", () => {
    const el = <b>x</b>;
    const c = render(() => (
      <I18nProvider i18n={i18n()}>
        <T i18nKey="m" {...({ x: el } as object)} />
        <T i18nKey="m" {...({ x: { t: "<img src=x>" } } as object)} />
        {useI18n().t("m", { x: { t: "<img src=x>" } } as never) as string}
      </I18nProvider>
    )).container;
    expect(c.querySelector("b, img")).toBeNull();
    expect(c.textContent).toBe(`[${String(el)}][[object Object]][[object Object]]`);
  });

  it("markup comes from a tag around the text {x}", () => {
    const k = make({ locale: "en", messages: { en: { m: "Hi <strong>{x}</strong>!<br/>Bye" } } });
    expect(
      html(k.i18n, () => (
        <T i18nKey="m" x="<i>Ann</i>" components={{ strong: "strong", br: "br" }} />
      )),
    ).toBe("Hi <strong>&lt;i&gt;Ann&lt;/i&gt;</strong>!<br>Bye");
  });
});

describe("<T components>", () => {
  const i18n = () => make({ locale: "en", messages, onError: () => {} }).i18n;

  it("renders nested tags by name: a tag name or a component, the content as its children", () => {
    expect(html(i18n(), () => <T i18nKey="m" components={{ b: "strong", i: Italic }} />)).toBe(
      'Read <strong>the <i class="it">new</i> terms</strong> now.',
    );
  });

  it("`{ component, props }` gives the tag props of its own", () => {
    const Link = (p: ParentProps<{ to: string }>) => <a href={p.to}>{p.children}</a>;
    expect(
      html(i18n(), () => (
        <T
          i18nKey="m"
          components={{
            b: { component: "strong", props: { class: "s" } },
            i: { component: Link, props: { to: "/t" } },
          }}
        />
      )),
    ).toBe('Read <strong class="s">the <a href="/t">new</a> terms</strong> now.');
  });

  it("precedence: handler prop → components; `undefined` leaves the tag to the next, `null` does not", () => {
    const comps = { b: "strong", i: "em" };
    const u = (c: JSX.Element) => <u>{c}</u>;
    expect(html(i18n(), () => <T i18nKey="m" components={comps} b={u} />)).toBe(
      "Read <u>the <em>new</em> terms</u> now.",
    );
    expect(html(i18n(), () => <T i18nKey="m" components={comps} b={undefined} />)).toBe(
      "Read <strong>the <em>new</em> terms</strong> now.",
    );
    expect(html(i18n(), () => <T i18nKey="m" components={comps} b={null} />)).toBe(
      "Read the <em>new</em> terms now.",
    );
    // An entry that is `undefined` leaves the tag as text.
    expect(html(i18n(), () => <T i18nKey="m" components={{ b: undefined as never }} />)).toBe(
      "Read the new terms now.",
    );
  });

  it.each(["constructor", "toString"])("a tag called %s is a tag, not an inherited member", (n) => {
    const { i18n } = make({ locale: "en", messages: { en: { m: `<${n}>x</${n}>` } } });
    expect(html(i18n, () => <T i18nKey="m" components={{ [n]: "b" }} />)).toBe("<b>x</b>");
  });
});

describe("an empty tag through components (lot 4d, parity with React)", () => {
  const msgs = {
    en: {
      br: "Line one<br/>Line two",
      closed: "Line one<br></br>Line two",
      hr: "A <hr/> here",
    },
  };
  const components = { br: "br", hr: { component: "hr", props: { class: "x" } } };

  it.each([
    ["br", "Line one<br>Line two"],
    ["closed", "Line one<br>Line two"],
    ["hr", 'A <hr class="x"> here'],
  ])("%s renders a real void element", (key, out) => {
    const { i18n } = make({ locale: "en", messages: msgs });
    const got = html(i18n, () => <T i18nKey={key} components={components} />);
    expect(got).toBe(out);
  });

  it("an empty tag gives a component no children; a tag with content still gives them", () => {
    const seen: unknown[] = [];
    const Probe = (p: ParentProps) => {
      seen.push("children" in p);
      return <i>{p.children}</i>;
    };
    const { i18n } = make({ locale: "en", messages: { en: { m: "<p/><p>x</p>" } } });
    expect(html(i18n, () => <T i18nKey="m" components={{ p: Probe }} />)).toBe("<i></i><i>x</i>");
    expect(seen).toEqual([false, true]);
  });
});

describe("params and reactivity", () => {
  it("params are props: a signal in a prop updates the text; the tree of a handler is replaced", () => {
    const { i18n } = make({ locale: "en", messages: { en: { m: "<b>{n}</b> items" } } });
    const [n, setN] = createSignal(1);
    const { container } = render(() => (
      <I18nProvider i18n={i18n}>
        <T i18nKey="m" n={n()} b={(c) => <b>{c}</b>} />
      </I18nProvider>
    ));
    expect(container.innerHTML).toBe("<b>1</b> items");
    setN(2);
    expect(container.innerHTML).toBe("<b>2</b> items");
  });

  it("follows a locale switch; the parameter stays text, never markup", async () => {
    const { i18n } = make({
      locale: "en",
      messages: { en: { m: "Hi <b>{name}</b>" }, de: { m: "Hallo <b>{name}</b>" } },
    });
    const { container } = render(() => (
      <I18nProvider i18n={i18n}>
        <T i18nKey="m" name="<img>" components={{ b: "strong" }} />
      </I18nProvider>
    ));
    expect(container.innerHTML).toBe("Hi <strong>&lt;img&gt;</strong>");
    await i18n.setLocale("de");
    expect(container.innerHTML).toBe("Hallo <strong>&lt;img&gt;</strong>");
  });

  it("a component of `components` is disposed when the message re-renders", async () => {
    const { i18n } = make({
      locale: "en",
      messages: { en: { m: "<b>x</b>" }, de: { m: "<b>y</b>" } },
    });
    let live = 0;
    const B = (p: ParentProps) => {
      live++;
      return <b>{p.children}</b>;
    };
    const { container } = render(() => (
      <I18nProvider i18n={i18n}>
        <T i18nKey="m" components={{ b: B }} />
      </I18nProvider>
    ));
    await i18n.setLocale("de");
    expect(container.innerHTML).toBe("<b>y</b>");
    expect(live).toBe(2);
  });

  it("a hold or another namespace's load replaces no node; its own namespace's catalog does", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "en",
      messages: { en: { m: "<b>x</b>" } },
      catalogs: { shop: { en: { m: "<b>s</b>" } } },
      loader: l.load,
    });
    let renders = 0;
    const B = (p: ParentProps) => (renders++, (<b>{p.children}</b>));
    const Holds = () => (useI18n("other"), null);
    const { container } = render(() => (
      <I18nProvider i18n={i18n}>
        <T i18nKey="m" components={{ b: B }} />
        <T i18nKey="m" ns="shop" components={{ b: B }} />
        <Holds />
      </I18nProvider>
    ));
    const [one, two] = [...container.querySelectorAll("b")];
    expect(renders).toBe(2);
    expect(l.requested).toEqual(["en:other"]);
    await l.answer("en:other");
    expect(renders).toBe(2);
    expect(container.querySelectorAll("b")[0]).toBe(one);
    i18n.add("en", { m: "<b>s2</b>" }, "shop");
    expect(renders).toBe(3);
    expect(container.querySelectorAll("b")[0]).toBe(one);
    expect(container.querySelectorAll("b")[1]).not.toBe(two);
    expect(container.textContent).toBe("xs2");
  });

  it("a param's change re-renders under the same state", () => {
    const { i18n } = make({ locale: "en", messages: { en: { a: "A", b: "B" } } });
    const [k, setK] = createSignal("a");
    const { container } = render(() => (
      <I18nProvider i18n={i18n}>
        <T i18nKey={k()} />
      </I18nProvider>
    ));
    setK("b");
    expect(container.textContent).toBe("B");
  });

  it("every prop but the options is a param; `class` too", () => {
    const { i18n } = make({ locale: "en", messages: { en: { m: "{class}" } } });
    expect(html(i18n, () => <T i18nKey="m" class="c" />)).toBe("c");
  });

  it("`locale` and `ns` read per call", () => {
    const { i18n } = make({
      locale: "en",
      messages: { en: { m: "en" }, de: { m: "de" } },
      catalogs: { shop: { en: { m: "shop" } } },
    });
    expect(html(i18n, () => <T i18nKey="m" locale="de" />)).toBe("de");
    expect(html(i18n, () => <T i18nKey="m" ns="shop" />)).toBe("shop");
  });
});

describe("the bound <T>", () => {
  it("reads its namespace; an `ns` prop does not re-target it; renders components as the exported one", () => {
    const { i18n } = make({
      locale: "en",
      messages: { en: { m: "default" } },
      catalogs: { shop: { en: { m: "<b>shop</b>" } } },
    });
    const C = () => {
      const { T: B } = useI18n("shop");
      return <B i18nKey="m" ns={"default" as never} components={{ b: "strong" }} />;
    };
    expect(html(i18n, () => <C />)).toBe("<strong>shop</strong>");
  });

  it("<T> never takes the namespace of a useI18n(ns) above it (R3-5)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { i18n } = make({
      locale: "en",
      messages: { en: { m: "default" } },
      catalogs: { shop: { en: { m: "shop" } } },
    });
    const C = () => {
      useI18n("shop");
      return <T i18nKey="m" />;
    };
    expect(html(i18n, () => <C />)).toBe("default");
    warn.mockRestore();
  });
});
