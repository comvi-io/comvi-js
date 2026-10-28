/**
 * useI18n(ns?) (design §3.5, §2.5). Ported by meaning from 0.7 vue-composable.test.ts,
 * reactive-state.test.ts and use-chain.test.ts: reactive state from the app's instance, a
 * namespace-bound t(), t() re-translating on a locale change, rtl direction, setLocale
 * proxied. Gone with the 0.7 surface: tRaw, hasTranslation, loadedLocales,
 * activeNamespaces, isInitializing, the formatters (→ @comvi/vue/format), useI18nLoader
 * (`i18n.load(ns)`), the capability composables.
 */
import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createI18n, useI18n, type UseI18n } from "../src";
import { make, manualLoader, mountWith, probe, settle } from "./helpers";

const capture = (i18n: ReturnType<typeof createI18n>, ns?: string) => {
  let got!: UseI18n<string>;
  const C = defineComponent({
    setup() {
      got = useI18n(ns);
      return () => null;
    },
  });
  const wrapper = mountWith(i18n, C);
  return { wrapper, get: () => got };
};

describe("useI18n()", () => {
  it("returns t, T, locale, dir, isLoading, setLocale and the instance", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { hi: "Hi {name}" } } });
    const u = capture(i18n).get();
    expect(Object.keys(u).sort()).toEqual(
      ["T", "dir", "i18n", "isLoading", "locale", "setLocale", "t"].sort(),
    );
    expect(u.t("hi", { name: "Ann" })).toBe("Hi Ann");
    expect(u.locale.value).toBe("en");
    expect(u.dir.value).toBe("ltr");
    expect(u.isLoading.value).toBe(false);
    expect(u.i18n).toBe(i18n);
    expect(u.setLocale).toBe(i18n.setLocale);
  });

  it("re-translates a template on a locale change", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: { hi: "Hi" }, de: { hi: "Hallo" } } });
    const C = defineComponent({
      setup() {
        const { t } = useI18n();
        return () => h("p", t("hi"));
      },
    });
    const w = mountWith(i18n, C);
    expect(w.text()).toBe("Hi");
    await i18n.setLocale("de");
    await nextTick();
    expect(w.text()).toBe("Hallo");
  });

  it("locale is writable: setting it switches, and it keeps the old value until the catalogs are in", async () => {
    const l = manualLoader({ "de:default": { hi: "Hallo" } });
    const { i18n } = make({ locale: "en", messages: { en: { hi: "Hi" } }, loader: l.load });
    const u = capture(i18n).get();
    u.locale.value = "de";
    expect(l.requested).toEqual(["de:default"]);
    expect(u.locale.value).toBe("en");
    expect(u.isLoading.value).toBe(true);
    await l.answer("de:default");
    expect(u.locale.value).toBe("de");
    expect(u.t("hi")).toBe("Hallo");
  });

  it("a switch through the locale ref that fails keeps the old locale and rejects nothing", async () => {
    const l = manualLoader();
    const { i18n, errors } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const u = capture(i18n).get();
    u.locale.value = "de";
    await l.fail("de:default");
    expect(u.locale.value).toBe("en");
    expect(errors.map((e) => e.code)).toEqual(["load_failed"]);
    // An invalid locale is reported, never thrown at the v-model.
    u.locale.value = "not a locale!";
    await settle();
    expect(u.locale.value).toBe("en");
    expect(errors.map((e) => e.code)).toContain("invalid_locale");
  });

  it("reports rtl for a right-to-left locale", () => {
    const i18n = createI18n({ locale: "ar-EG", messages: { "ar-EG": { hi: "مرحبا" } } });
    expect(capture(i18n).get().dir.value).toBe("rtl");
  });

  it("per-call { ns } and { locale } reach the core (R3-1)", () => {
    const i18n = createI18n({
      locale: "en",
      catalogs: {
        default: { en: { hi: "Hi" }, de: { hi: "Hallo" } },
        shop: { en: { hi: "Shop hi" } },
      },
    });
    const { t } = capture(i18n).get();
    expect(t("hi", { ns: "shop" })).toBe("Shop hi");
    expect(t("hi", { locale: "de" })).toBe("Hallo");
  });

  it("$t is the default namespace's t() in every template, re-rendering on a switch", async () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { hi: "Hi {n}" }, de: { hi: "Hallo {n}" } },
    });
    const C = defineComponent({ template: `<p>{{ $t("hi", { n: 1 }) }}</p>` });
    const w = mountWith(i18n, C);
    expect(w.text()).toBe("Hi 1");
    await i18n.setLocale("de");
    await nextTick();
    expect(w.text()).toBe("Hallo 1");
  });

  it("throws a readable error outside an app that installed an instance (development)", () => {
    const C = defineComponent({
      setup() {
        useI18n();
        return () => null;
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => mount(C)).toThrow("[@comvi/vue] no app.use(i18n) above this component");
    warn.mockRestore();
  });
});

describe("reactivity slices (§2.5): counted renders", () => {
  it("a component reading only the locale does not re-render while a namespace loads; one calling t() does", async () => {
    const l = manualLoader({ "en:shop": { k: "K" } });
    const { i18n } = make({ locale: "en", messages: { en: { hi: "Hi" } }, loader: l.load });
    let locale!: UseI18n["locale"];
    const L = probe(() => locale.value);
    const T = probe(() => tt("hi"));
    let tt!: UseI18n["t"];
    const Root = defineComponent({
      setup() {
        const u = useI18n();
        locale = u.locale;
        tt = u.t;
        return () => [h(L.C), h(T.C)];
      },
    });
    mountWith(i18n, Root);
    expect([L.counter.count, T.counter.count]).toEqual([1, 1]);
    // A namespace load publishes twice (in flight, landed): the t() reader re-renders, the
    // locale reader does not.
    const p = i18n.load("shop");
    await nextTick();
    await l.answer("en:shop");
    await p;
    await nextTick();
    expect(L.counter.count).toBe(1);
    expect(T.counter.count).toBeGreaterThan(1);
  });

  it("a component reading dir re-renders on a locale change only when the direction changes", async () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: {}, de: {}, ar: {} },
    });
    let dir!: UseI18n["dir"];
    const D = probe(() => dir.value);
    const Root = defineComponent({
      setup() {
        dir = useI18n().dir;
        return () => h(D.C);
      },
    });
    mountWith(i18n, Root);
    await i18n.setLocale("de");
    await nextTick();
    expect(D.counter.count).toBe(1);
    await i18n.setLocale("ar");
    await nextTick();
    expect(D.counter.count).toBe(2);
  });
});

describe("useI18n(ns)", () => {
  it("binds t to the namespace", () => {
    const i18n = createI18n({ locale: "en", catalogs: { admin: { en: { title: "Dashboard" } } } });
    expect(capture(i18n, "admin").get().t("title")).toBe("Dashboard");
  });

  it("activates the namespace after mount, never during setup or render", async () => {
    const l = manualLoader({ "en:shop": { title: "Shop" } });
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const requestedInSetup: string[][] = [];
    const requestedInRender: string[][] = [];
    const C = defineComponent({
      setup() {
        const { t, isLoading } = useI18n("shop");
        requestedInSetup.push([...l.requested]);
        return () => {
          requestedInRender.push([...l.requested]);
          return h("p", `${isLoading.value}:${t("title")}`);
        };
      },
    });
    const w = mountWith(i18n, C);
    expect(requestedInSetup).toEqual([[]]);
    expect(requestedInRender[0]).toEqual([]);
    expect(l.requested).toEqual(["en:shop"]);
    expect(w.text()).toBe("true:title");
    await l.answer("en:shop");
    expect(w.text()).toBe("false:Shop");
  });

  it("a namespace not active yet renders as loading before its activation: no missing_key (lot 1d)", async () => {
    const l = manualLoader({ "en:shop": { title: "Shop" }, "en:cart": { n: "Cart" } });
    const { i18n, errors } = make({
      locale: "en",
      // `cart` holds a catalog of ANOTHER locale only: activation still loads `en`.
      catalogs: { default: { en: {} }, cart: { de: { n: "Korb" } } },
      loader: l.load,
    });
    const C = defineComponent({
      setup() {
        const shop = useI18n("shop");
        const cart = useI18n("cart");
        return () =>
          h(
            "p",
            `${shop.isLoading.value}:${shop.t("title")}|${cart.isLoading.value}:${cart.t("n")}`,
          );
      },
    });
    const w = mountWith(i18n, C);
    expect(w.text()).toBe("true:title|true:n");
    expect(errors.filter((e) => e.code == "missing_key")).toEqual([]);
    await l.answer("en:shop");
    await l.answer("en:cart");
    expect(w.text()).toBe("false:Shop|false:Cart");
    expect(errors).toEqual([]);
  });

  it("without a loader a namespace with no catalog is missing at once, never stuck loading", () => {
    const { i18n, errors } = make({ locale: "en", messages: { en: {} } });
    const u = capture(i18n, "shop").get();
    expect(u.isLoading.value).toBe(false);
    expect(u.t("title")).toBe("title");
    expect(errors.map((e) => [e.code, e.ns])).toEqual([["missing_key", "shop"]]);
  });

  it("isLoading is per namespace and covers a switch in flight", async () => {
    const l = manualLoader({ "de:default": { hi: "Hallo" }, "de:shop": {} });
    const { i18n } = make({
      locale: "en",
      catalogs: { default: { en: { hi: "Hi" } }, shop: { en: {} } },
      namespaces: ["default", "shop"],
      loader: l.load,
    });
    let a!: UseI18n["isLoading"];
    let b!: UseI18n["isLoading"];
    const C = defineComponent({
      setup() {
        a = useI18n().isLoading;
        b = useI18n("shop").isLoading;
        return () => h("p", `${a.value}/${b.value}`);
      },
    });
    const w = mountWith(i18n, C);
    expect(w.text()).toBe("false/false");
    const p = i18n.setLocale("de");
    await nextTick();
    expect(w.text()).toBe("true/true");
    await l.answer("de:default");
    expect(w.text()).toBe("false/true");
    await l.answer("de:shop");
    await p;
    await nextTick();
    expect(w.text()).toBe("false/false");
  });

  it("a remount after a failed load does not fetch it again; i18n.load(ns) retries", async () => {
    const l = manualLoader({ "en:shop": { title: "Shop" } });
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const Shop = defineComponent({
      setup() {
        const { t } = useI18n("shop");
        return () => h("p", t("title"));
      },
    });
    const k = ref(0);
    const List = defineComponent({ setup: () => () => h(Shop, { key: k.value }) });
    const w = mountWith(i18n, List);
    await l.fail("en:shop");
    k.value++;
    await settle();
    k.value++;
    await settle();
    expect(l.requested).toEqual(["en:shop"]);
    void i18n.load("shop");
    await l.answer("en:shop");
    expect(l.requested).toEqual(["en:shop", "en:shop"]);
    expect(w.text()).toBe("Shop");
  });

  it("default tag handlers get their children as ONE child too (constructor and setDefaultParams)", async () => {
    const seen: unknown[] = [];
    const b = (c: unknown) => (seen.push(c), h("b", c as string));
    const { i18n, errors } = make({
      locale: "en",
      messages: { en: { a: "<x>one <y>two</y></x>" } },
      defaultParams: { x: b, y: b },
    });
    const C = defineComponent({
      setup() {
        const { t } = useI18n();
        return () => h("div", null, [t("a")]);
      },
    });
    const w = mountWith(i18n, C);
    expect(w.html()).toBe("<div><b>one <b>two</b></b></div>");
    // `y` gets the text "two"; `x` gets one Fragment of "one " and `y`'s node.
    expect(seen[0]).toBe("two");
    expect(Array.isArray(seen[1])).toBe(false);
    i18n.setDefaultParams({ x: (c: unknown) => h("i", c as string), y: b });
    await nextTick();
    expect(w.html()).toBe("<div><i>one <b>two</b></i></div>");
    expect(errors).toEqual([]);
  });

  it("returns a bound <T> per namespace: one component for every caller, the namespace fixed", async () => {
    const i18n = createI18n({
      locale: "en",
      catalogs: { default: { en: { k: "D" } }, shop: { en: { k: "Shop {n}" } } },
    });
    const Ts = new Set<unknown>();
    const n = ref(0);
    const C = defineComponent({
      setup() {
        const { T } = useI18n("shop");
        Ts.add(T);
        Ts.add(useI18n("shop").T);
        return () => h(T as never, { i18nKey: "k", n: n.value });
      },
    });
    const w = mountWith(i18n, C);
    mountWith(i18n, C);
    expect(w.text()).toBe("Shop 0");
    n.value++;
    await nextTick();
    expect(w.text()).toBe("Shop 1");
    i18n.add("en", { k: "Shop {n}!" }, "shop");
    await nextTick();
    expect(w.text()).toBe("Shop 1!");
    expect(Ts.size).toBe(1);
  });

  it("binds <T> to a namespace named like an Object.prototype member", () => {
    const i18n = createI18n({
      locale: "en",
      catalogs: { constructor: { en: { k: "C" } }, toString: { en: { k: "S" } } },
    });
    const C = defineComponent({
      setup() {
        const A = useI18n("constructor").T;
        const B = useI18n("toString").T;
        return () => [h(A as never, { i18nKey: "k" }), h(B as never, { i18nKey: "k" })];
      },
    });
    expect(mountWith(i18n, C).text()).toBe("CS");
  });
});
