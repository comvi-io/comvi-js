/**
 * Lot 4b part B (owner brief 29.10): `<T components>` renders nested markup with the
 * precedence handler attribute → `components` → slot (an attribute that is `undefined` does
 * not override); the bound `<T>` lets no attribute fall through, like the exported one; a
 * slot's `children` is the text of its tag in the message (nested markup flattened, with a
 * development warning).
 */
import { defineComponent, h, nextTick, type Component } from "vue";
import { describe, expect, it } from "vitest";
import { T, useI18n } from "../src";
import { make, mountWith, vueWarnings } from "./helpers";

/** SSR output without Vue's fragment markers. */
const strip = (html: string) => html.replace(/<!--.*?-->/g, "");

describe("<T components> (R3-24, lot 4b)", () => {
  const Italic = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h("i", { class: "it" }, slots.default?.()),
  });
  const messages = { en: { m: "Read <b>the <i>new</i> terms</b> <x>now</x>." } };
  const render = (
    attrs: Record<string, unknown>,
    slots?: Record<string, unknown>,
    bound = false,
  ) => {
    const { i18n } = make({ locale: "en", messages, onError: () => {} });
    const Root = defineComponent({
      setup() {
        const { T: B } = useI18n();
        return () => h((bound ? B : T) as Component, { i18nKey: "m", ...attrs }, slots);
      },
    });
    return mountWith(i18n, Root).html({ raw: true });
  };

  it.each([false, true])(
    "renders nested tags by name: a tag name or a component, the content as its default slot (bound: %s)",
    (bound) => {
      expect(render({ components: { b: "strong", i: Italic } }, undefined, bound)).toBe(
        'Read <strong>the <i class="it">new</i> terms</strong> now.',
      );
    },
  );

  it("precedence: handler attribute → components → slot; `undefined` leaves the tag to the next, `null` does not", () => {
    const comps = { components: { b: "strong", i: "em" } };
    const slot = { b: ({ children }: { children: unknown }) => h("mark", children as never) };
    const handler = (c: never) => h("u", c);
    expect(render({ ...comps, b: handler }, slot)).toBe("Read <u>the <em>new</em> terms</u> now.");
    expect(render({ ...comps, b: undefined }, slot)).toBe(
      "Read <strong>the <em>new</em> terms</strong> now.",
    );
    expect(render({ b: undefined, i: undefined }, slot)).toContain("<mark>");
    // `null` is a value like any other: not a function, so the tag is unhandled (text).
    expect(render({ ...comps, b: null }, slot)).toBe("Read the <em>new</em> terms now.");
  });

  it("a slot's `children` is always text, from the message before any nested handler runs; markup warns once in development", async () => {
    const seen: unknown[] = [];
    const slot = {
      b: ({ children }: { children: unknown }) => (seen.push(children), h("b", children as never)),
    };
    const ran: string[] = [];
    const em = (c: never) => (ran.push("i"), h("em", c));
    let html = "";
    const warnings = await vueWarnings(() => {
      // <i> inside <b> renders through `components`, a handler attribute, or nothing: the
      // slot of <b> gets the same text in every case.
      html = render({ components: { i: "em" } }, slot);
      render({ i: em }, slot);
      render({ components: { i: "em" } }, slot);
    });
    expect(seen).toEqual(["the new terms", "the new terms", "the new terms"]);
    expect(html).toBe("Read <b>the new terms</b> now.");
    // The slot's text came from the message, not from the nested handler's output.
    expect(ran).toEqual(["i"]);
    expect(warnings.filter((w) => w.includes("holds markup"))).toHaveLength(1);
    expect(warnings[0]).toContain("`components`");
    seen.length = 0;
    const quiet = await vueWarnings(() => render({}, slot)); // <i> unhandled: text only
    expect(seen).toEqual(["the new terms"]);
    expect(quiet.filter((w) => w.includes("holds markup"))).toEqual([]);
  });

  it("the slot's text is built before a nested handler runs: one that changes a param does not reach it", async () => {
    // Codex re-check: a nested handler moving a Date from 2026 to 2030 used to show 2030 in
    // the slot (the text pass ran after the children).
    // Its own key: development warns once per (key, tag), and this slot holds markup.
    const msgs = { en: { order: "<link><b>{d}</b></link>" } };
    const d = new Date(2026, 5, 1);
    const order: string[] = [];
    const seen: unknown[] = [];
    const Root = defineComponent({
      setup: () => () =>
        h(
          T as Component,
          {
            i18nKey: "order",
            d,
            b: (c: never) => (order.push("b"), d.setFullYear(2030), h("b", c)),
          },
          {
            link: ({ children }: { children: unknown }) => (
              order.push("link"),
              seen.push(children),
              h("a", children as never)
            ),
          },
        ),
    });
    const { i18n } = make({ locale: "en", messages: msgs, onError: () => {} });
    let html = "";
    const warnings = await vueWarnings(
      () => void (html = mountWith(i18n, Root).html({ raw: true })),
    );
    expect(warnings.filter((w) => w.includes("holds markup"))).toHaveLength(1);
    expect(html).toBe(`<a>${String(new Date(2026, 5, 1))}</a>`);
    expect(order).toEqual(["b", "link"]);
    expect(seen).toEqual([String(new Date(2026, 5, 1))]);
  });

  it("`{{ children }}` of a slot whose tag holds markup prints text, never throws (DOM and SSR)", async () => {
    const msgs = { en: { m: "Read the <link><b>new</b> terms</link>." } };
    const App = defineComponent({
      components: { T: T as Component },
      template: `<T i18n-key="m" :components="{ b: 'strong' }"><template #link="{ children }"><a href="/terms">{{ children }}</a></template></T>`,
    });
    const { i18n } = make({ locale: "en", messages: msgs, onError: () => {} });
    const warnings = await vueWarnings(async () => {
      expect(mountWith(i18n, App).html({ raw: true })).toBe(
        'Read the <a href="/terms">new terms</a>.',
      );
    });
    expect(warnings.filter((w) => w.includes("holds markup"))).toHaveLength(1);
    const { renderToString } = await import("vue/server-renderer");
    const { createSSRApp } = await import("vue");
    const server = make({ locale: "en", messages: msgs, onError: () => {}, timeZone: "UTC" });
    await vueWarnings(async () => {
      expect(strip(await renderToString(createSSRApp(App).use(server.i18n)))).toBe(
        'Read the <a href="/terms">new terms</a>.',
      );
    });
  });

  it("a node param inside a slot's tag has no text: the slot gets the message's text around it", () => {
    const { i18n } = make({
      locale: "en",
      messages: { en: { m: "<link>{icon} terms</link>" } },
      onError: () => {},
    });
    const seen: unknown[] = [];
    const Root = defineComponent({
      setup: () => () =>
        h(
          T as Component,
          { i18nKey: "m", icon: h("img") },
          {
            link: ({ children }: { children: unknown }) => (
              seen.push(children),
              h("a", children as never)
            ),
          },
        ),
    });
    expect(mountWith(i18n, Root).html({ raw: true })).toBe("<a> terms</a>");
    expect(seen).toEqual([" terms"]);
  });

  it("an entry `{ component, props }` renders the tag with props of its own; a component's own `props` option is not misread (R3-24)", () => {
    const Link = defineComponent({
      props: { to: String },
      setup:
        (p, { slots }) =>
        () =>
          h("a", { href: p.to }, slots.default?.()),
    });
    expect(
      render({ components: { b: { component: "strong", props: { class: "s" } }, i: "em" } }),
    ).toBe('Read <strong class="s">the <em>new</em> terms</strong> now.');
    expect(render({ components: { b: { component: Link, props: { to: "/t" } }, i: Link } })).toBe(
      'Read <a href="/t">the <a>new</a> terms</a> now.',
    );
  });

  it("a `components` entry that is `undefined` leaves the tag to its slot (DOM and SSR)", async () => {
    const slot = { b: ({ children }: { children: unknown }) => h("mark", children as never) };
    expect(render({ components: { b: undefined, i: "em" } }, slot)).toBe(
      "Read <mark>the new terms</mark> now.",
    );
    const { renderToString } = await import("vue/server-renderer");
    const { createSSRApp } = await import("vue");
    const { i18n } = make({ locale: "en", messages, onError: () => {}, timeZone: "UTC" });
    const Root = defineComponent({
      setup: () => () =>
        h(T as Component, { i18nKey: "m", components: { b: undefined, i: "em" } }, slot),
    });
    await vueWarnings(async () => {
      expect(strip(await renderToString(createSSRApp(Root).use(i18n)))).toBe(
        "Read <mark>the new terms</mark> now.",
      );
    });
  });
});

describe("attribute policy: the bound <T> as the exported one (lot 4b)", () => {
  it("no attribute falls through and nothing warns: `class` is a message param in both", async () => {
    const { i18n } = make({ locale: "en", messages: { en: { m: "<b>x</b> {class}" } } });
    const Root = defineComponent({
      setup() {
        const { T: B } = useI18n();
        return () => [
          h(T as Component, { i18nKey: "m", class: "c1", components: { b: "b" } }),
          h(B as Component, { i18nKey: "m", class: "c2", components: { b: "b" } }),
        ];
      },
    });
    const warnings = await vueWarnings(async () => {
      const w = mountWith(i18n, Root);
      await nextTick();
      expect(w.html({ raw: true })).toBe("<b>x</b> c1<b>x</b> c2");
    });
    expect(warnings).toEqual([]);
  });
});
