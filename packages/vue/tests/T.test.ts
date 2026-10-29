/**
 * <T i18nKey> and rich text through t() (design §3.5, R3-5, R3-11, R4-20). Ported by
 * meaning from the 0.7 `T-*` files, vue-component-T.test.ts and tag-interpolation.test.ts:
 *
 * - params as attributes, the key when missing, the `ns` and `locale` props, the same text
 *   as t() for the same call (≡, generated messages);
 * - rich parts render with no wrapper element; a handler — an attribute OR a slot named
 *   after the tag — gets the tag's children as ONE child (their text, or the list of their
 *   parts, which Vue renders as a fragment);
 * - a param that only LOOKS like a node renders as text (0.7 T-forged-node);
 * - 0.8 has no `components` map and no per-tag error boundary: a throwing handler throws
 *   to the app's `errorHandler`.
 *
 * Gone with the 0.7 surface: the `components` / `tag` / `slots-as-components` conversion
 * (T-conversion, T-direct-props, T-structural's component specs).
 */
import { defineComponent, h, isVNode, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { createSSRApp } from "vue";
import { describe, expect, it, vi } from "vitest";
import { createI18n, T, useI18n, type VueI18n } from "../src";
import { mountWith, vueWarnings } from "./helpers";

const en = (m: Record<string, string>) => createI18n({ locale: "en", messages: { en: m } });
const Tc = T as never;
/** Mounts `<T v-bind="props">` with `slots`, returns its HTML. */
const html = (i18n: VueI18n, props: Record<string, unknown>, slots?: Record<string, unknown>) =>
  mountWith(
    i18n,
    defineComponent({ render: () => h("div", null, [h(Tc, props, slots as never)]) }),
  ).find("div").element.innerHTML;

describe("<T i18nKey>", () => {
  it("renders the message with params passed as attributes", () => {
    expect(html(en({ hi: "Hi {name}" }), { i18nKey: "hi", name: "Ann" })).toBe("Hi Ann");
  });

  it("renders the key when the translation is missing", () => {
    const i18n = createI18n({ locale: "en", messages: { en: {} }, onError: () => {} });
    expect(html(i18n, { i18nKey: "nope" })).toBe("nope");
  });

  it("reads the namespace of its `ns` prop and the locale of its `locale` prop", () => {
    const i18n = createI18n({
      locale: "en",
      catalogs: {
        default: { en: { k: "D" }, de: { k: "DE" } },
        shop: { en: { k: "Shop" } },
      },
    });
    expect(html(i18n, { i18nKey: "k", ns: "shop" })).toBe("Shop");
    expect(html(i18n, { i18nKey: "k", locale: "de" })).toBe("DE");
  });

  it("takes the kebab-case attribute of a template (i18n-key)", () => {
    expect(html(en({ hi: "Hi" }), { "i18n-key": "hi" })).toBe("Hi");
  });

  it("camelizes a kebab-case param, as a template spells it (:first-name → {firstName})", () => {
    expect(html(en({ hi: "Hi {firstName}" }), { "i18n-key": "hi", "first-name": "Ann" })).toBe(
      "Hi Ann",
    );
  });

  it("a template's :first-name reaches {firstName} (compiled template)", () => {
    const C = defineComponent({
      components: { T: T as never },
      template: `<p><T i18n-key="hi" :first-name="'Ann'" /></p>`,
    });
    expect(mountWith(en({ hi: "Hi {firstName}" }), C).html()).toBe("<p>Hi Ann</p>");
  });

  it("a slot named like an Object.prototype member is that tag's handler (constructor)", () => {
    const out = html(
      en({ m: "<constructor>x</constructor> <toString>y</toString>" }),
      { i18nKey: "m" },
      {
        constructor: ({ children }: { children: string }) => h("b", children),
        toString: ({ children }: { children: string }) => h("i", children),
      },
    );
    expect(out).toBe("<b>x</b> <i>y</i>");
  });

  it("never takes the namespace of a useI18n(ns) above it (R3-5: no implicit ns)", () => {
    const i18n = createI18n({
      locale: "en",
      catalogs: { default: { en: { k: "D" } }, shop: { en: { k: "Shop" } } },
    });
    const Parent = defineComponent({
      setup() {
        useI18n("shop");
        return () => h(Tc, { i18nKey: "k" });
      },
    });
    expect(mountWith(i18n, Parent).text()).toBe("D");
  });

  it("reads only (lot 4c): <T ns> requests nothing, before or after mount, nor when the prop changes", async () => {
    const requested: string[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = createI18n({
      locale: "en",
      messages: { en: {} },
      onError: () => {},
      loader: async (l, n) => (requested.push(`${l}:${n}`), { k: n }),
    });
    const ns = ref("shop");
    const w = mountWith(
      i18n,
      defineComponent({ render: () => h(Tc, { i18nKey: "k", ns: ns.value }) }),
    );
    await i18n.ready;
    await nextTick();
    expect(w.text()).toBe("k");
    ns.value = "cart";
    await nextTick();
    await i18n.ready;
    expect(requested).toEqual([]);
    // Development names the namespace nothing loads, once each.
    expect(warn.mock.calls.map((c) => String(c[0]).match(/namespace "(\w+)"/)![1])).toEqual([
      "shop",
      "cart",
    ]);
    // What loads it: i18n.load() (or a useI18n(ns) holding it); <T> then renders the text.
    await i18n.load("cart");
    await nextTick();
    expect(w.text()).toBe("cart");
    expect(requested).toEqual(["en:cart"]);
    warn.mockRestore();
  });

  it("re-renders on a locale switch and on new params", async () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { hi: "Hi {n}" }, de: { hi: "Hallo {n}" } },
    });
    const n = ref(1);
    const w = mountWith(
      i18n,
      defineComponent({ render: () => h(Tc, { i18nKey: "hi", n: n.value }) }),
    );
    expect(w.text()).toBe("Hi 1");
    n.value = 2;
    await nextTick();
    expect(w.text()).toBe("Hi 2");
    await i18n.setLocale("de");
    await nextTick();
    expect(w.text()).toBe("Hallo 2");
  });

  it("renders rich parts with no wrapper element", () => {
    const i18n = en({ m: "a <b>bold</b> c" });
    expect(html(i18n, { i18nKey: "m", b: (c: string) => h("b", c) })).toBe("a <b>bold</b> c");
  });

  it("takes a tag's handler from a slot named after the tag: slot props { children }", () => {
    const i18n = en({ m: "Read the <link>terms</link>." });
    const seen: unknown[] = [];
    const out = html(
      i18n,
      { i18nKey: "m" },
      {
        link: ({ children }: { children: string }) => (
          seen.push(children),
          h("a", { href: "/terms" }, children)
        ),
      },
    );
    expect(out).toBe('Read the <a href="/terms">terms</a>.');
    expect(seen).toEqual(["terms"]);
  });

  it("a template slot renders {{ children }}; a tag with markup inside takes a handler attribute", () => {
    const i18n = en({ m: "Read <link>the <b>full</b> terms</link>." });
    const C = defineComponent({
      components: { T: T as never },
      setup: () => ({ link: (c: unknown) => h("a", { href: "/terms" }, c as never) }),
      template: `<p><T i18n-key="m" :link="link"><template #b="{ children }"><b>{{ children }}</b></template></T></p>`,
    });
    expect(mountWith(i18n, C).html()).toBe(
      '<p>Read <a href="/terms">the <b>full</b> terms</a>.</p>',
    );
  });

  it("joins text-only children into one string for the handler: a nested handler's text included", () => {
    const i18n = en({ m: "<x>one <y>two</y> {n}</x>" });
    const seen: unknown[] = [];
    const out = html(i18n, {
      i18nKey: "m",
      n: 3,
      x: (c: unknown) => (seen.push(c), h("u", c as string)),
      y: (c: string) => c.toUpperCase(),
    });
    expect(seen).toEqual(["one TWO 3"]);
    expect(out).toBe("<u>one TWO 3</u>");
  });

  it("an attribute wins over a slot of the same name", () => {
    const i18n = en({ m: "<x>a</x>" });
    expect(html(i18n, { i18nKey: "m", x: (c: string) => h("i", c) }, { x: () => h("b") })).toBe(
      "<i>a</i>",
    );
  });

  it("an attribute present as null wins over a slot: the tag has no handler", () => {
    const i18n = en({ m: "<x>a</x>" });
    expect(html(i18n, { i18nKey: "m", x: null }, { x: () => h("b", "slot") })).toBe("a");
  });

  it("an attribute that is undefined leaves the tag to the slot (lot 4b: an accidental undefined overrides nothing)", () => {
    const i18n = en({ m: "<x>a</x>" });
    expect(html(i18n, { i18nKey: "m", x: undefined }, { x: () => h("b", "slot") })).toBe(
      "<b>slot</b>",
    );
  });

  it("gives a handler its children as ONE child: nested tags and node params, no warning", async () => {
    const i18n = en({ m: "<x>one <y>two</y> {k}</x>" });
    const kinds: string[] = [];
    const x = (c: unknown) => (
      kinds.push(Array.isArray(c) ? "parts" : typeof c),
      h("u", null, [c as never])
    );
    const warnings = await vueWarnings(() => {
      expect(html(i18n, { i18nKey: "m", x, y: (c: string) => h("b", c), k: h("kbd", "K") })).toBe(
        "<u>one <b>two</b> <kbd>K</kbd></u>",
      );
    });
    expect(kinds).toEqual(["parts"]);
    expect(warnings).toEqual([]);
  });

  it("keeps element params at stable positions: the DOM node survives a re-render", async () => {
    const i18n = en({ m: "{a} then {b}" });
    const b = ref("one");
    const w = mountWith(
      i18n,
      defineComponent({
        render: () => h("div", [h(Tc, { i18nKey: "m", a: h("i", { id: "a" }, "A"), b: b.value })]),
      }),
    );
    const node = w.find("#a").element;
    b.value = "two";
    await nextTick();
    expect(w.find("#a").element).toBe(node);
    expect(w.text()).toBe("A then two");
  });

  it("renders the children of a tag with no handler (development warns once)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const i18n = en({ m: "a <b>bold</b> word" });
    expect(html(i18n, { i18nKey: "m" })).toBe("a bold word");
    expect(warn.mock.calls.flat().join(" ")).toMatch(/<b> in "m" has no handler/);
  });

  it("a handler returning undefined or null renders nothing, without a warning", async () => {
    const i18n = en({ m: "[<x>gone</x>][<y>gone</y>]" });
    const warnings = await vueWarnings(() => {
      expect(html(i18n, { i18nKey: "m", x: () => undefined, y: () => null })).toBe(
        "[<!---->][<!---->]",
      );
    });
    expect(warnings).toEqual([]);
  });

  it("a throwing handler throws to the app's errorHandler (no per-tag boundary in 0.8)", () => {
    const i18n = en({ m: "<x>boom</x>" });
    const seen: unknown[] = [];
    const C = defineComponent({
      render: () =>
        h(Tc, {
          i18nKey: "m",
          x: () => {
            throw new Error("handler failed");
          },
        }),
    });
    const app = createSSRApp(C).use(i18n);
    app.config.errorHandler = (e) => void seen.push((e as Error).message);
    app.mount(document.createElement("div"));
    expect(seen).toEqual(["handler failed"]);
  });

  it("never mutates the caller's params when it wraps a handler", () => {
    const i18n = en({ m: "<x>a</x>{y}" });
    const x = (c: string) => h("u", c);
    const params = Object.freeze({ x, y: "!" });
    let out: unknown;
    mountWith(
      i18n,
      defineComponent({
        setup() {
          out = useI18n().t("m", params);
          return () => null;
        },
      }),
    );
    expect(Array.isArray(out)).toBe(true);
    expect(params.x).toBe(x);
  });
});

describe("useI18n(ns).T, the bound <T>", () => {
  const shop = () =>
    createI18n({
      locale: "en",
      catalogs: {
        default: { en: { k: "D" } },
        shop: { en: { k: "Shop", hi: "Hi {firstName}" } },
        legal: { en: { k: "LEGAL" } },
      },
    });
  /** Renders the bound <T> of `useI18n(ns)` with `props`. */
  const bound = (i18n: VueI18n, ns: string, props: Record<string, unknown>) =>
    mountWith(
      i18n,
      defineComponent({
        setup() {
          const { T: B } = useI18n(ns as "default");
          return () => h("div", null, [h(B as never, props)]);
        },
      }),
    ).find("div").element.innerHTML;

  it("renders its namespace's message, kebab-case params camelized", () => {
    expect(bound(shop(), "shop", { "i18n-key": "hi", "first-name": "Ann" })).toBe("Hi Ann");
  });

  it("an `ns` attribute never re-targets it (untyped callers): its namespace wins", () => {
    expect(bound(shop(), "shop", { i18nKey: "k", ns: "legal" })).toBe("Shop");
  });

  it("is one component per instance and namespace: the same for every caller, another for another instance", () => {
    const got: unknown[] = [];
    const C = defineComponent({
      setup() {
        got.push(useI18n("shop").T, useI18n("shop").T, useI18n("legal").T);
        return () => null;
      },
    });
    const a = shop();
    mountWith(a, C);
    mountWith(a, C);
    mountWith(shop(), C);
    const [s1, s2, l1, s3, , , s4] = got;
    expect(s1).toBe(s2);
    expect(s1).toBe(s3);
    expect(s1).not.toBe(l1);
    expect(s4).not.toBe(s1);
  });
});

describe("inherited params (core parity)", () => {
  it("an inherited function is no tag handler, as in the core: only own params count", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { a: "<b>bold</b> {x}" } } });
    const handler = vi.fn((c: unknown) => c);
    const params = Object.assign(Object.create({ b: handler, x: "inherited" }), { y: 1 });
    let out: unknown;
    mountWith(
      i18n,
      defineComponent({
        setup() {
          out = useI18n().t("a", params);
          return () => null;
        },
      }),
    );
    expect(handler).not.toHaveBeenCalled();
    expect(out).toBe("bold {x}");
  });
});

describe("params that only look like nodes (0.7 T-forged-node)", () => {
  it("a JSON-forged node shape never renders as an element", async () => {
    // JSON cannot carry Vue's __v_isVNode marker as a real VNode: Vue prints the object.
    const forged = JSON.parse('{"__v_isVNode":true,"type":"script","props":{},"children":"x"}');
    const i18n = en({ m: "[{x}]" });
    await vueWarnings(() => {
      try {
        html(i18n, { i18nKey: "m", x: forged });
      } catch {
        // Vue refuses the object: nothing rendered is fine too.
      }
    });
    expect(document.querySelector("script")).toBeNull();
  });

  it("markup in a string param is text, not HTML", () => {
    const out = html(en({ m: "[{x}]" }), { i18nKey: "m", x: '<img src=x onerror="alert(1)">' });
    expect(out).not.toContain("<img");
    expect(out).toBe('[&lt;img src=x onerror="alert(1)"&gt;]');
  });

  it("a real node param renders as that element", () => {
    expect(html(en({ m: "[{x}]" }), { i18nKey: "m", x: h("kbd", "K") })).toBe("[<kbd>K</kbd>]");
  });

  it("t() returns the parts of a rich message (a render function's child) and a string otherwise", () => {
    let rich: unknown;
    let plain: unknown;
    let text: unknown;
    mountWith(
      en({ r: "a{x}", p: "a{x}", s: "<b>x</b>" }),
      defineComponent({
        setup() {
          const { t } = useI18n();
          rich = t("r", { x: h("i") });
          plain = t("p", { x: "s" });
          // A handler that returns text keeps the whole output a string.
          text = t("s", { b: (c: string) => `*${c}*` });
          return () => null;
        },
      }),
    );
    expect(Array.isArray(rich)).toBe(true);
    expect((rich as unknown[])[0]).toBe("a");
    expect(isVNode((rich as unknown[])[1])).toBe(true);
    expect(plain).toBe("as");
    expect(text).toBe("*x*");
  });
});

/** A small deterministic generator (0.7 T-message-fuzz, Vue-rendered). */
const rng = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

describe("<T> ≡ t() on generated messages (0.7 T-message-fuzz)", () => {
  it("renders the same markup through <T> and through t() for 200 generated messages", async () => {
    const r = rng(7);
    const pick = <X>(xs: X[]) => xs[Math.floor(r() * xs.length)];
    const pieces = ["a", " ", "{n}", "{w}", "<b>x</b>", "''", "'{'", "#", "}", "<i>{w}</i>"];
    for (let i = 0; i < 200; i++) {
      const msg = Array.from({ length: 1 + Math.floor(r() * 6) }, () => pick(pieces)).join("");
      const params = {
        n: 5,
        w: "W",
        b: (c: unknown) => h("b", null, [c as never]),
        i: (c: unknown) => h("i", null, [c as never]),
      };
      const render = (body: () => unknown) => {
        const i18n = createI18n({
          locale: "en",
          messages: { en: { m: msg } },
          onError: () => {},
          // A server render (renderToString) needs a zone (development check).
          timeZone: "UTC",
        });
        return renderToString(
          createSSRApp({ render: () => h("p", null, [body() as never]) }).use(i18n),
        );
      };
      const viaComponent = await render(() => h(Tc, { i18nKey: "m", ...params }));
      const viaT = await render(() =>
        h(
          defineComponent({
            setup() {
              const { t } = useI18n();
              return () => t("m", params);
            },
          }),
        ),
      );
      expect([msg, viaComponent]).toEqual([msg, viaT]);
    }
  });
});
