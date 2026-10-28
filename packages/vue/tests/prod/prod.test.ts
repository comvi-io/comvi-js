/**
 * The production arms (`__DEV__` false), at source level: a composable outside an app
 * that installed an instance still fails (no diagnostic text shipped), one instance in two
 * server apps is not checked, and the same app renders the same markup as in development —
 * diagnostics never change what renders.
 */
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createI18n, handover, T, useI18n } from "../../src";

describe("production", () => {
  it("a composable outside an app with the instance throws, without the development message", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const C = defineComponent({ setup: () => (useI18n(), () => null) });
    let message = "";
    try {
      mount(C);
    } catch (e) {
      message = String(e);
    }
    expect(message).toMatch(/TypeError/);
    expect(message).not.toContain("[@comvi/vue]");
  });

  it("handover() without a timeZone does not throw in production", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { a: "A" } } });
    expect(handover(i18n).catalogs).toEqual({ default: { en: { a: "A" } } });
  });

  it("renders the development markup: rich text, plural, a slot, a tag without handler", async () => {
    const warn = vi.spyOn(console, "warn");
    const i18n = createI18n({
      locale: "en",
      messages: { en: { m: "<b>{n, plural, one {# item} other {# items}}</b> <i>x</i>" } },
    });
    const out = await renderToString(
      createSSRApp({
        render: () =>
          h("p", [
            h(T as never, { i18nKey: "m", n: 2, b: (c: string) => h("b", c) }),
            h(
              T as never,
              { i18nKey: "m", n: 1 },
              { b: ({ children }: { children: string }) => h("u", children) },
            ),
          ]),
      }).use(i18n),
    );
    expect(out).toBe(
      "<p><!--[--><b>2 items</b> x<!--]--><!--[--><!--[--><u>1 item</u><!--]--> x<!--]--></p>",
    );
    expect(warn).not.toHaveBeenCalled();
  });
});
