// `VueI18n.use(installer)`: the pipe on the WRAPPER. It runs the installer on
// `core`, keeps the one instance the app holds, and widens `core`'s type — so
// `createI18n(options).use(…)` reads like the other bindings' `createI18n`
// instead of the core `createI18n` + `createI18nFromCore` detour.
import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n as createCore } from "@comvi/core";
import {
  attachLoader,
  createI18n,
  createI18nFromCore,
  devtools,
  icuCompiler,
  plugins,
  useI18n,
  useI18nLoader,
  useI18nPlugins,
} from "../src/index";

describe("VueI18n.use()", () => {
  it("returns the same wrapper and widens its core in place", () => {
    const base = createI18n({ locale: "en", exposeGlobal: false });
    const core = base.core;
    expect("reloadTranslations" in core).toBe(false);

    const composed = base.use(attachLoader).use(plugins());

    expect(composed).toBe(base);
    expect(composed.core).toBe(core);
    expect(typeof composed.core.reloadTranslations).toBe("function");
    expect(typeof composed.core.onMissingKey).toBe("function");
    // The wrapper's bound proxies still drive that one host.
    composed.addTranslations({ en: { greeting: "Hello" } });
    expect(composed.t("greeting")).toBe("Hello");
  });

  it("carries the compiler option through the preset, ahead of a later catalog", () => {
    // ICU is not composed: the option reaches the host the preset builds, so a
    // catalog ingested after construction still compiles under it.
    const i18n = createI18n({ locale: "en", exposeGlobal: false, compiler: icuCompiler });
    i18n.addTranslations({ en: { items: "{count, plural, one {# item} other {# items}}" } });
    expect(i18n.t("items", { count: 1 })).toBe("1 item");
    expect(i18n.t("items", { count: 3 })).toBe("3 items");
  });

  it("refuses an installer that hands back a different host", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const foreign = createCore({ locale: "en", exposeGlobal: false });
    expect(() => i18n.use(() => foreign)).toThrow(
      expect.objectContaining({ code: "E_USE_HOST_IDENTITY" }),
    );
    // The refused installer left the wrapper on its own host.
    expect(i18n.core).not.toBe(foreign);
  });

  it("swallows the rejection an already-invoked async plugin left behind", async () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      expect(() =>
        i18n.use((async () => {
          throw new Error("the plugin's own failure");
        }) as unknown as (core: typeof i18n.core) => typeof i18n.core),
      ).toThrow(expect.objectContaining({ code: "E_USE_HOST_IDENTITY" }));

      // Two macrotask turns: enough for node to have reported one.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("names the rule and the ways out in development", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });

    let message = "";
    try {
      i18n.use((() => undefined) as unknown as (core: typeof i18n.core) => typeof i18n.core);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("must return the host it was given");
    expect(message).toContain(".use(definePlugin(f))");
    expect(message).toContain("registerPlugin(f)");
    expect(message).toContain("localeDetector(), not LocaleDetector()");
  });

  it("composes devtools through the pipe without widening", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const composed = i18n.use(devtools({ instanceId: "use-chain" }));
    expect(composed).toBe(i18n);
    expect(composed.core.instanceId).toBe("use-chain");
    composed.destroy();
  });

  it("warns once in development when composed after app.use(i18n) started init()", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const i18n = createI18n({
        locale: "en",
        exposeGlobal: false,
        translation: { en: { greeting: "Hello" } },
      });
      const wrapper = mount(defineComponent({ render: () => h("span") }), {
        global: { plugins: [i18n] },
      });
      expect(i18n.core.isInitialized || i18n.core.isInitializing).toBe(true);
      i18n.use(plugins()).use(attachLoader);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]![0]).toContain("after app.use(i18n) started init()");
      wrapper.unmount();
      i18n.destroy();
    } finally {
      warn.mockRestore();
    }
  });

  it("hands the installer the core, not the wrapper", () => {
    const i18n = createI18n({ locale: "en", exposeGlobal: false });
    const installer = vi.fn((core: typeof i18n.core) => core);
    i18n.use(installer);
    expect(installer).toHaveBeenCalledTimes(1);
    expect(installer.mock.calls[0]![0]).toBe(i18n.core);
  });

  it("works on a createI18nFromCore wrapper too", () => {
    const i18n = createI18nFromCore(createCore({ locale: "en", exposeGlobal: false })).use(
      attachLoader,
    );
    expect(typeof i18n.core.addActiveNamespace).toBe("function");
  });

  it("makes the capability composables acquirable inside the app", async () => {
    const i18n = createI18n({
      locale: "en",
      exposeGlobal: false,
      translation: { en: { greeting: "Hello" } },
    })
      .use(attachLoader)
      .use(plugins());

    const seen: { loader?: string; plugins?: string; text?: string } = {};
    const Probe = defineComponent({
      setup() {
        const { t } = useI18n();
        seen.loader = typeof useI18nLoader().reloadTranslations;
        seen.plugins = typeof useI18nPlugins().onMissingKey;
        seen.text = t("greeting");
        return () => h("span", seen.text);
      },
    });

    const wrapper = mount(Probe, { global: { plugins: [i18n] } });
    expect(seen).toEqual({ loader: "function", plugins: "function", text: "Hello" });
    wrapper.unmount();
    i18n.destroy();
  });
});
