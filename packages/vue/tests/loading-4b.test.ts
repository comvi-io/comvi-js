/**
 * Lot 4b part A (owner brief 29.10): a `v-model` locale control shows the locale on screen
 * again after a failed switch, and `useI18n()` activates `default` too; a failed load ends
 * the placeholder.
 */
import { defineComponent, h } from "vue";
import { describe, expect, it } from "vitest";
import { useI18n } from "../src";
import { make, manualLoader, mountWith, settle, vueWarnings } from "./helpers";

describe("the writable locale after a failed switch (lot 4b)", () => {
  it("a v-model <select> shows the locale on screen again; the instance keeps it", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", messages: { en: { hi: "Hi" } }, loader: l.load });
    const Switcher = defineComponent({
      setup() {
        const { locale } = useI18n();
        return () =>
          h(
            "select",
            {
              value: locale.value,
              onChange: (e: Event) => (locale.value = (e.target as HTMLSelectElement).value),
            },
            ["en", "de"].map((v) => h("option", { value: v }, v)),
          );
      },
    });
    const w = mountWith(i18n, Switcher);
    const select = w.element as HTMLSelectElement;
    select.value = "de";
    select.dispatchEvent(new Event("change"));
    await settle();
    expect(l.requested).toEqual(["de:default"]);
    await l.fail("de:default");
    await settle();
    expect(i18n.locale).toBe("en");
    expect(select.value).toBe("en");
    expect(errors.map((e) => [e.code, e.locale])).toEqual([["load_failed", "de"]]);
  });

  it("a locale reader re-renders on a switch and on a failed one, never on a namespace load", async () => {
    const l = manualLoader({ "de:default": { hi: "Hallo" } });
    const { i18n } = make({
      locale: "en",
      messages: { en: { hi: "Hi" } },
      loader: l.load,
      onError: () => {},
    });
    let renders = 0;
    let set!: (v: string) => void;
    const Reader = defineComponent({
      setup() {
        const { locale } = useI18n();
        set = (v) => (locale.value = v);
        return () => (renders++, h("p", locale.value));
      },
    });
    const w = mountWith(i18n, Reader);
    expect(renders).toBe(1);
    void i18n.load("shop");
    await l.answer("en:shop");
    await settle();
    expect(renders).toBe(1);
    set("fr");
    await l.fail("fr:default");
    await l.fail("fr:shop");
    await settle();
    expect([renders, w.text()]).toEqual([2, "en"]); // re-rendered, still en
    set("de");
    await l.answer("de:default");
    await l.answer("de:shop");
    await settle();
    expect([renders, w.text()]).toEqual([3, "de"]);
  });
});

describe("useI18n() activates `default` (lot 4b)", () => {
  it("an app whose `namespaces` leave `default` out loads it after mount; isLoading settles", async () => {
    const l = manualLoader({ "en:default": { hi: "Hello" }, "en:account": {} });
    const { i18n } = make({ locale: "en", namespaces: ["account"], loader: l.load });
    const Probe = defineComponent({
      setup() {
        const { t, isLoading } = useI18n();
        return () => h("p", isLoading.value ? "…" : t("hi"));
      },
    });
    const w = mountWith(i18n, Probe);
    expect(w.text()).toBe("…");
    await settle();
    expect(l.requested).toEqual(["en:account", "en:default"]);
    await l.answer("en:account");
    await l.answer("en:default");
    expect(w.text()).toBe("Hello");
  });

  it("a failed load ends the placeholder: isLoading false, the missing-key text", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const Probe = defineComponent({
      setup() {
        const { t, isLoading } = useI18n("shop");
        return () => h("p", isLoading.value ? "…" : t("title"));
      },
    });
    const w = mountWith(i18n, Probe);
    await settle();
    expect(w.text()).toBe("…");
    await l.fail("en:shop");
    expect(w.text()).toBe("title");
  });
});

describe("useI18n() outside a component (lot 4b)", () => {
  it("in app.runWithContext() (a store, a router guard) it registers no lifecycle hook: Vue warns nothing", async () => {
    const l = manualLoader({ "en:default": { hi: "Hello" } });
    const { i18n } = make({ locale: "en", loader: l.load });
    const { createApp } = await import("vue");
    const app = createApp({ render: () => null }).use(i18n);
    const warnings = await vueWarnings(() => {
      const { t, setLocale } = app.runWithContext(() => useI18n("shop"));
      expect(typeof t).toBe("function");
      expect(setLocale).toBe(i18n.setLocale);
    });
    expect(warnings).toEqual([]);
    // Nothing was activated there: `i18n.load("shop")` is the call that loads.
    expect(l.requested).toEqual(["en:default"]);
  });
});

describe("$t of a namespace nothing loads (lot 4b)", () => {
  it("development warns once, naming the namespace and the ways to load it; $t activates nothing", async () => {
    const l = manualLoader({ "en:account": {}, "en:default": { hi: "Hello" } });
    const { i18n } = make({ locale: "en", namespaces: ["account"], loader: l.load });
    const Root = defineComponent({
      template: "<p>{{ $t('hi') }}{{ $t('hi') }}</p>",
    });
    const warnings = await vueWarnings(async () => {
      mountWith(i18n, Root);
      await settle();
    });
    const idle = warnings.filter((w) => w.includes("which nothing loads"));
    expect(idle).toHaveLength(1);
    expect(idle[0]).toContain('"default"');
    expect(idle[0]).toContain("`namespaces`");
    expect(l.requested).toEqual(["en:account"]);
  });

  it("an app that loads the namespace hears nothing", async () => {
    const l = manualLoader({ "en:default": { hi: "Hello" } });
    const { i18n } = make({ locale: "en", loader: l.load });
    const Root = defineComponent({ template: "<p>{{ $t('hi') }}</p>" });
    const warnings = await vueWarnings(async () => {
      mountWith(i18n, Root);
      await l.answer("en:default");
    });
    expect(warnings.filter((w) => w.includes("which nothing loads"))).toEqual([]);
  });
});
