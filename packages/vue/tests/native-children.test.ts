/**
 * A native element is given its content as children (text or an array), never as a function:
 * Vue 3.5.0–3.5.38 (3.5.0 is the peer floor) read a function given to an element as slots,
 * which an element does not render, so `components: { b: "strong" }` rendered an empty
 * `<strong>` (client, SSR and hydration). The repo installs a later Vue, where both render,
 * so the test records what `h` receives.
 */
import { defineComponent, h as vueH, type Component } from "vue";
import { describe, expect, it, vi } from "vitest";

const calls: [unknown, unknown][] = [];
vi.mock("vue", async (orig) => {
  const vue = await orig<typeof import("vue")>();
  const h = (...a: any[]) => (calls.push([a[0], a[2]]), (vue.h as any)(...a));
  return { ...vue, h };
});

const { T } = await import("../src");
const { make, mountWith } = await import("./helpers");

const Italic = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      vueH("i", slots.default?.()),
});

describe("<T components>: an element's content is children, a component's a slot", () => {
  it.each([
    ["a tag name", "strong"],
    ["{ component, props } with a tag name", { component: "strong", props: { class: "x" } }],
  ])("%s gets text or an array, not a function", (_, b) => {
    const { i18n } = make({
      locale: "en",
      messages: { en: { m: "Read <b>the <i>new</i> terms</b>." } },
    });
    const Root = defineComponent({
      setup: () => () => vueH(T as Component, { i18nKey: "m", components: { b, i: Italic } }),
    });
    calls.length = 0;
    const html = mountWith(i18n, Root).html({ raw: true });
    expect(html).toContain("the <i>new</i> terms</strong>");
    const strong = calls.filter(([t]) => t === "strong");
    expect(strong).toHaveLength(1);
    expect(typeof strong[0]![1]).not.toBe("function");
    // A component still gets its content as a slot (a function).
    const it = calls.filter(([t]) => t === Italic);
    expect(it).toHaveLength(1);
    expect(typeof it[0]![1]).toBe("function");
  });
});
