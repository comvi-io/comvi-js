import { describe, it, expect, vi } from "vitest";
import { createApp, defineComponent } from "vue";
import { createI18n } from "../src";

describe("Vue plugin integration", () => {
  it("installs and exposes $t and $i18n", async () => {
    const app = createApp(defineComponent({ template: "<div />" }));
    const i18nPlugin = createI18n({ locale: "en" });
    i18nPlugin.addTranslations({ en: { hello: "Hello" } });
    app.use(i18nPlugin);

    app.mount(document.createElement("div"));

    // Verify $i18n is the actual VueI18n instance with expected properties
    const $i18n = app.config.globalProperties.$i18n;
    expect($i18n).toBe(i18nPlugin);
    expect($i18n.locale.value).toBe("en");

    // Behavioral assertion: $t translates correctly
    // @ts-ignore
    expect(app.config.globalProperties.$t("hello")).toBe("Hello");

    app.unmount();
  });

  it("initializes plugins even when translations are preloaded", async () => {
    const plugin = vi.fn();
    const i18nPlugin = createI18n({ locale: "en" });
    i18nPlugin.use(plugin);
    i18nPlugin.addTranslations({ en: { hello: "Hi" } });

    const app = createApp(defineComponent({ template: "<div />" }));
    app.use(i18nPlugin);

    await vi.waitFor(() => {
      expect(plugin).toHaveBeenCalledTimes(1);
    });

    // Verify the plugin received an actual I18n core instance
    const receivedArg = plugin.mock.calls[0][0];
    expect(receivedArg.locale).toBe("en");
    expect(receivedArg.t("hello")).toBe("Hi");
    expect(receivedArg.getDefaultNamespace()).toBe("default");
  });
});
