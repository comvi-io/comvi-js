/**
 * Lots 4b and 4d through <T>: handler attribute → `components` → snippet of the tag's name →
 * text; a snippet's `children` is the tag's text; a void element takes no children; the bound
 * <T> is the exported one with its namespace.
 */
import { flushSync } from "svelte";
import { describe, expect, it } from "vitest";
import { T } from "../src";
import Formal from "./fixtures/Formal.svelte";
import Probe from "./fixtures/Probe.svelte";
import Reactive from "./fixtures/Reactive.svelte";
import Rich from "./fixtures/Rich.svelte";
import { make, mountWith, warnings } from "./helpers";

const messages = { en: { m: "Read <b>the <i>new</i> terms</b> <x>now</x>." } };
const render = (props: Record<string, unknown>, bound = false, seen: unknown[] = []) => {
  const { i18n } = make({ locale: "en", messages, onError() {} });
  return mountWith(i18n, Rich, { i18nKey: "m", bound, seen, ...props }).html();
};

describe("<T components>", () => {
  it.each([false, true])("renders nested tags: a tag name or a component (bound: %s)", (bound) => {
    expect(render({ components: { b: "strong", i: Formal } }, bound)).toBe(
      'Read <strong>the <em class="plain">new</em> terms</strong> now.',
    );
  });

  it("precedence: handler attribute → components → snippet; `undefined` leaves the tag to the next", () => {
    const comps = { components: { b: "strong", i: "em" } };
    // The fixture passes a snippet `b`, so these cover components over the snippet. A handler
    // attribute of the same name cannot sit beside a snippet: Svelte refuses the duplicate.
    expect(render(comps)).toBe("Read <strong>the <em>new</em> terms</strong> now.");
    expect(render({ components: { b: undefined, i: "em" } })).toBe(
      "Read <mark>the new terms</mark> now.",
    );
    expect(render({})).toContain("<mark>the new terms</mark>");
    const { i18n } = make({ locale: "en", messages, onError() {} });
    const html = mountWith(i18n, T, {
      i18nKey: "m",
      components: { b: "strong" },
      b: (c: string) => `[${c}]`,
      x: undefined,
    }).html();
    expect(html).toBe("Read [the new terms] now.");
  });

  it("a handler attribute gets the tag's content, its text output renders as text, never as markup", () => {
    const { i18n } = make({ locale: "en", messages: { en: { m: "a <b>c</b>" } } });
    const seen: unknown[] = [];
    const w = mountWith(i18n, T, {
      i18nKey: "m",
      b: (c: string) => (seen.push(c), `<i>${c}</i>`),
    });
    expect(seen).toEqual(["c"]);
    expect(w.target.querySelector("i")).toBe(null);
    expect(w.text()).toBe("a <i>c</i>");
  });

  it("a handler that returns its content keeps the markup inside it", () => {
    const { i18n } = make({ locale: "en", messages, onError() {} });
    const html = mountWith(i18n, T, {
      i18nKey: "m",
      components: { i: "em" },
      b: (c: unknown) => c,
    }).html();
    expect(html).toBe("Read the <em>new</em> terms now.");
  });

  it("an entry `{ component, props }` renders the tag with props of its own", () => {
    expect(
      render({ components: { b: { component: "strong", props: { class: "s" } }, i: "em" } }),
    ).toBe('Read <strong class="s">the <em>new</em> terms</strong> now.');
    expect(
      render({ components: { b: { component: Formal, props: { tone: "loud" } }, i: Formal } }),
    ).toBe('Read <em class="loud">the <em class="plain">new</em> terms</em> now.');
  });

  it("no tag handler: the tag's content renders as text, development warns", async () => {
    const seen = await warnings(() => {
      const { i18n } = make({ locale: "en", messages });
      expect(mountWith(i18n, T, { i18nKey: "m" }).text()).toBe("Read the new terms now.");
    });
    expect(seen.join()).toContain("no handler");
  });

  it("an object param shaped like a node is data: it never renders as an element", () => {
    const { i18n } = make({ locale: "en", messages: { en: { m: "x {v}" } } });
    const forged = { t: "script", c: "alert(1)", s: 1, p: {} };
    const w = mountWith(i18n, T, { i18nKey: "m", v: JSON.parse(JSON.stringify(forged)) });
    expect(w.target.querySelector("script")).toBe(null);
  });

  // Owner decision 04.11.2026: a plain {x} is always text; markup comes from tags.
  it("an object, a snippet or an HTML string in a plain {x} prints as text through <T> and t()", () => {
    const { i18n } = make({ locale: "en", messages: { en: { m: "x {v}", t: "{v}" } } });
    const fn = () => "<b>y</b>";
    for (const [v, want] of [
      [{ t: "<img src=x>" }, "[object Object]"],
      [fn, String(fn)],
      // A list holding an object prints as String(list), as a list of text does.
      [["a", { t: "<img src=x>" }], "a,[object Object]"],
      ["<img src=x>", "<img src=x>"],
    ] as const) {
      const w = mountWith(i18n, T, { i18nKey: "m", v });
      expect(w.target.querySelector("img, b")).toBe(null);
      expect(w.text()).toBe("x " + want);
      const out: { u?: { t: (k: string, p: object) => unknown } } = {};
      mountWith(i18n, Probe, { k: "t", out });
      expect(out.u!.t("m", { v })).toBe("x " + want);
    }
  });

  it("markup comes from a tag around the text {x}: components, a handler, a void tag", () => {
    const { i18n } = make({
      locale: "en",
      messages: { en: { m: "Hello, <strong>{name}</strong>!<br/>Bye" } },
    });
    const comps = { strong: "strong", br: "br" };
    expect(mountWith(i18n, T, { i18nKey: "m", name: "Olena", components: comps }).html()).toBe(
      "Hello, <strong>Olena</strong>!<br>Bye",
    );
    expect(
      mountWith(i18n, T, { i18nKey: "m", name: "<i>Olena</i>", components: comps }).html(),
    ).toBe("Hello, <strong>&lt;i&gt;Olena&lt;/i&gt;</strong>!<br>Bye");
  });
});

describe("a void element", () => {
  it.each(["a<br/>b", "a<br></br>b"])(
    "%s renders a real <br> on the client, nothing warns",
    async (m) => {
      const logged = await warnings(() => {
        const { i18n } = make({ locale: "en", messages: { en: { m } } });
        const w = mountWith(i18n, T, { i18nKey: "m", components: { br: "br" } });
        expect(w.html()).toBe("a<br>b");
      });
      expect(logged).toEqual([]);
    },
  );

  it.each(["<x/>", "<x></x>"])("a component on the empty tag %s gets no children", (m) => {
    const { i18n } = make({ locale: "en", messages: { en: { m } } });
    const w = mountWith(i18n, T, { i18nKey: "m", components: { x: Formal } });
    expect(w.html()).toBe('<em class="plain" data-empty="true"></em>');
  });
});

describe("a snippet of a tag's name", () => {
  it("gets the tag's text, whatever renders inside; markup warns once in development", async () => {
    const msgs = { en: { w: "Read <b>the <i>new</i> terms</b>." } };
    const seen: string[] = [];
    const logged = await warnings(() => {
      const { i18n } = make({ locale: "en", messages: msgs, onError() {} });
      const go = (p: object) => mountWith(i18n, Rich, { i18nKey: "w", seen, ...p }).html();
      expect(go({ components: { i: "em" } })).toBe("Read <mark>the new terms</mark>.");
      go({ components: { i: "em" } });
    });
    expect(new Set(seen)).toEqual(new Set(["the new terms"]));
    expect(logged.filter((w) => w.includes("holds markup"))).toHaveLength(1);
  });

  it("is told from a handler on the bound <T> too", () => {
    const { i18n } = make({ locale: "en", messages: { en: { t: "<b>plain</b>" } } });
    expect(mountWith(i18n, Rich, { i18nKey: "t", bound: true }).html()).toBe("<mark>plain</mark>");
  });

  it("a text-only tag does not warn", async () => {
    const logged = await warnings(() => {
      const { i18n } = make({ locale: "en", messages: { en: { t: "<b>plain</b>" } } });
      expect(mountWith(i18n, Rich, { i18nKey: "t" }).html()).toBe("<mark>plain</mark>");
    });
    expect(logged.filter((w) => w.includes("holds markup"))).toEqual([]);
  });
});

describe("the bound <T>", () => {
  it("reads its namespace, over an ns attribute, and keeps a rest-spread param reactive", () => {
    const { i18n } = make({
      locale: "en",
      catalogs: {
        default: { en: { items: "{count} default" } },
        shop: { en: { items: "{count} in the shop" } },
      },
    });
    const api: { set?: (v: number) => void } = {};
    const w = mountWith(i18n, Reactive, { ns: "shop", api });
    expect(w.text()).toBe("1 in the shop");
    api.set!(2);
    flushSync();
    expect(w.text()).toBe("2 in the shop");
  });

  it("follows a locale switch", async () => {
    const { i18n } = make({
      locale: "en",
      catalogs: { default: { en: { items: "{count} en" }, de: { items: "{count} de" } } },
    });
    const w = mountWith(i18n, Reactive);
    expect(w.text()).toBe("1 en");
    await i18n.setLocale("de");
    flushSync();
    expect(w.text()).toBe("1 de");
  });
});
