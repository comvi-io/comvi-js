/**
 * How `<T>` converts a prepared translation into VNodes: what it asks the host
 * about the key, which handler wins a name collision, what a tag callback's
 * VirtualNode turns into, and what a throwing handler renders.
 *
 * `<T>` is multi-root, and @vue/test-utils trims each root fragment in text(),
 * so every case mounts it inside a single-root host element.
 */
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { h, defineComponent, markRaw } from "vue";
import { createI18n } from "../src/createI18n";
import type { AnyVueI18n } from "../src/VueI18n";
import { T } from "../src/components/T";
import { I18N_INJECTION_KEY } from "../src/keys";

const mountT = (
  i18n: AnyVueI18n,
  props: Record<string, unknown>,
  slots?: Record<string, unknown>,
) =>
  mount(
    defineComponent({
      render: () => h("div", h(T, props as never, slots as never)),
    }),
    { global: { provide: { [I18N_INJECTION_KEY as symbol]: i18n } } },
  );

describe("<T /> missing-key detection", () => {
  it("renders a translation whose value equals its key instead of the default slot", () => {
    // The only case where the rendered content alone cannot tell "translated"
    // from "missing": `<T>` has to ask the host.
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      defaultNs: "common",
      translation: { "en:common": { hello: "hello" } },
    });

    const wrapper = mountT(i18n, { i18nKey: "hello" }, { default: () => "Slot fallback" });

    expect(wrapper.text()).toBe("hello");
  });

  it("asks the host about the ns the prop names, not the default one", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      defaultNs: "common",
      translation: { "en:admin": { hello: "hello" } },
    });

    const wrapper = mountT(
      i18n,
      { i18nKey: "hello", ns: "admin" },
      { default: () => "Slot fallback" },
    );

    expect(wrapper.text()).toBe("hello");
  });

  it("asks the host about the locale the prop names, not the current one", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      defaultNs: "common",
      translation: { "fr:common": { hello: "hello" } },
    });

    const wrapper = mountT(
      i18n,
      { i18nKey: "hello", locale: "fr" },
      { default: () => "Slot fallback" },
    );

    expect(wrapper.text()).toBe("hello");
  });

  it("counts a key that only the fallback locale carries as translated", () => {
    const i18n = createI18n({
      locale: "fr",
      exposeGlobal: false,
      fallbackLocale: "en",
      defaultNs: "common",
      translation: { "en:common": { hello: "hello" } },
    });

    const wrapper = mountT(i18n, { i18nKey: "hello" }, { default: () => "Slot fallback" });

    expect(wrapper.text()).toBe("hello");
  });
});

describe("<T /> tag handler resolution", () => {
  it("passes an array to a slot whose only child is an element", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { msg: "a <wrap><bold>x</bold></wrap> b" } },
    });
    let received: unknown;

    mountT(
      i18n,
      { i18nKey: "msg" },
      {
        wrap: ({ children }: { children: unknown }) => {
          received = children;
          return h("i", {}, children as never);
        },
        bold: ({ children }: { children: unknown }) => h("strong", {}, children as never),
      },
    );

    // Only a lone STRING child is unwrapped; an element child stays a list.
    expect(Array.isArray(received)).toBe(true);
    expect(received).toHaveLength(1);
  });

  it("prefers a components entry over a same-named slot for a component handler", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { msg: "go <tag>x</tag>" } },
    });
    const Chosen = markRaw(
      defineComponent({ name: "Chosen", template: '<b class="chosen"><slot /></b>' }),
    );

    const wrapper = mountT(
      i18n,
      { i18nKey: "msg", components: { tag: Chosen } },
      { tag: ({ children }: { children: unknown }) => h("u", {}, children as never) },
    );

    expect(wrapper.find("b.chosen").text()).toBe("x");
    expect(wrapper.find("u").exists()).toBe(false);
  });

  it("hands a component handler the props its components entry declares", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { msg: "go <link>here</link>" } },
    });
    const Anchor = markRaw(
      defineComponent({
        name: "Anchor",
        props: { href: { type: String, default: "/none" } },
        template: '<a :href="href"><slot /></a>',
      }),
    );

    const wrapper = mountT(i18n, {
      i18nKey: "msg",
      components: { link: { component: Anchor, props: { href: "/help" } } },
    });

    expect(wrapper.find("a").attributes("href")).toBe("/help");
  });

  it("renders no placeholder node for a tag handler that returns nothing", () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { msg: "[<wrap></wrap>]" } },
    });

    const wrapper = mountT(i18n, { i18nKey: "msg" }, { wrap: () => [] });

    expect(wrapper.html()).toBe("<div>[]</div>");
  });

  it("reports a throwing tag handler and renders its children in a span", () => {
    const onError = vi.fn();
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      onError,
      translation: { en: { msg: "a <wrap>inner</wrap> b" } },
    });

    const wrapper = mountT(
      i18n,
      { i18nKey: "msg" },
      {
        wrap: () => {
          throw new Error("handler exploded");
        },
      },
    );

    expect(wrapper.find("span").text()).toBe("inner");
    expect(wrapper.text()).toBe("a inner b");
    expect(onError).toHaveBeenCalledWith(expect.any(Error), {
      source: "translation",
      tagName: "wrap",
    });
  });
});

// A tag callback in `params` may return any VirtualNode, including the shapes
// core's own `createTextNode` / `createFragment` build.
describe("<T /> VirtualNode conversion", () => {
  const withCallback = (callback: unknown) =>
    mountT(
      createI18n({
        locale: "en",
        exposeGlobal: false,
        translation: { en: { msg: "[<wrap>inner</wrap>]" } },
      }),
      { i18nKey: "msg", params: { wrap: callback } },
    );

  it("renders the text of a text node a tag callback returns", () => {
    const wrapper = withCallback(() => ({ type: "text", text: "replaced" }));

    expect(wrapper.text()).toBe("[replaced]");
  });

  it("renders a fragment node whose children arrived as one string", () => {
    const wrapper = withCallback(() => ({ type: "fragment", children: "replaced" }));

    expect(wrapper.text()).toBe("[replaced]");
  });

  it("renders nothing for a fragment node whose children arrived as an empty string", () => {
    const wrapper = withCallback(() => ({ type: "fragment", children: "" }));

    expect(wrapper.text()).toBe("[]");
  });
});
