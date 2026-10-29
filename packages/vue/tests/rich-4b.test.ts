/**
 * Lot 4b part B (owner brief 29.10): `<T components>` renders nested markup with the
 * precedence handler attribute → `components` → slot (an attribute that is `undefined` does
 * not override); the bound `<T>` lets no attribute fall through, like the exported one; a
 * slot handed markup warns in development.
 */
import { defineComponent, h, nextTick, type Component } from "vue";
import { describe, expect, it } from "vitest";
import { T, useI18n } from "../src";
import { make, mountWith, vueWarnings } from "./helpers";

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

  it("a slot whose tag holds markup gets the parts and warns once in development; text-only stays text", async () => {
    const seen: unknown[] = [];
    const slot = {
      b: ({ children }: { children: unknown }) => (seen.push(children), h("b", children as never)),
    };
    const warnings = await vueWarnings(() => {
      render({ components: { i: "em" } }, slot);
      render({ components: { i: "em" } }, slot);
    });
    expect(warnings.filter((w) => w.includes("holds markup"))).toHaveLength(1);
    expect(warnings[0]).toContain("`components`");
    expect(Array.isArray(seen[0])).toBe(true);
    seen.length = 0;
    const quiet = await vueWarnings(() => render({}, slot)); // <i> unhandled: text only
    expect(seen).toEqual(["the new terms"]);
    expect(quiet.filter((w) => w.includes("holds markup"))).toEqual([]);
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
