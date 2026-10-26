import { describe, it, expect } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n, useI18n } from "../src/index";

// `zz` is a well-formed tag no runtime ships data for, so it formats in its fallback.
const fr = new Intl.NumberFormat("fr").format(1234.5);

describe("@comvi/vue — formatters follow the fallback-locale chain", () => {
  it("formats in the fallback, and an explicit locale stays single", () => {
    const i18n = createI18n({ locale: "zz", fallbackLocale: "de", exposeGlobal: false });

    expect(i18n.formatNumber(1234.5)).toBe("1.234,5");
    expect(i18n.formatNumber(1234.5, undefined, "fr")).toBe(fr);
    expect(i18n.formatNumber(1234.5, undefined, "zz")).toBe(
      new Intl.NumberFormat("zz").format(1234.5),
    );
  });

  it("a template re-renders on setFallbackLocale", async () => {
    const i18n = createI18n({ locale: "zz", fallbackLocale: "de", exposeGlobal: false });
    const Probe = defineComponent({
      setup() {
        const { formatNumber } = useI18n();
        return () => h("span", formatNumber(1234.5));
      },
    });
    const wrapper = mount(Probe, { global: { plugins: [i18n] } });
    expect(wrapper.text()).toBe("1.234,5");

    i18n.setFallbackLocale("fr");
    await nextTick();

    expect(wrapper.text()).toBe(fr);
  });
});
