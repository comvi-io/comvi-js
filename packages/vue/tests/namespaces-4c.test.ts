/**
 * Lot 4c (owner brief 29.10, R3-26) through Vue components: `useI18n(ns)` reads, loads and
 * holds `ns` from mount to unmount (`KeepAlive`: while active; `v-show` keeps it); `<T>` and
 * `$t` read only; `isReady` / `isLoading` with no "unavailable" frame before the mount; the
 * key scenario; SSR hydration with `v-if` on `isReady`. Contract: `.lot1-pending-tests.md`
 * "Lot 4c contract".
 */
import {
  createSSRApp,
  defineComponent,
  h,
  KeepAlive,
  ref,
  Suspense,
  vShow,
  withDirectives,
  type Component,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it, vi } from "vitest";
import { createI18n, handover, useI18n, type Catalog, type VueI18n } from "../src";
import { make, manualLoader, mountWith, settle, tick, vueWarnings } from "./helpers";

/** A component showing `isReady ? t(key) : isLoading ? "…" : "unavailable"`; its frames. */
const probe = (ns: string, key = "title") => {
  const frames: string[] = [];
  const C = defineComponent({
    setup() {
      const { t, isReady, isLoading } = useI18n(ns);
      return () => {
        frames.push(`${isReady.value}/${isLoading.value}`);
        return h("p", isReady.value ? (t(key) as string) : isLoading.value ? "…" : "unavailable");
      };
    },
  });
  return { C, frames };
};

describe("isReady / isLoading (brief §2)", () => {
  it("first load: not ready and loading from the first render (before the mount) to the catalog", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { C, frames } = probe("shop");
    const w = mountWith(i18n, C);
    // A t() reading its namespace before the hold is a declared read: no idle warning.
    mountWith(
      i18n,
      defineComponent({
        setup() {
          const { t } = useI18n("eager");
          return () => h("i", t("title"));
        },
      }),
    );
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(frames[0]).toBe("false/true");
    expect(w.text()).toBe("…");
    await l.answer("en:shop", { title: "Shop" });
    expect(frames.at(-1)).toBe("true/false");
    expect(w.text()).toBe("Shop");
    expect(frames).not.toContain("false/false");
  });

  it("a usable catalog while loading: ready and loading; a failed load: neither", async () => {
    const l = manualLoader();
    const { i18n } = make({
      locale: "uk",
      fallbackLocale: "en",
      messages: { en: {} },
      catalogs: { shop: { en: { title: "Shop" } } },
      loader: l.load,
    });
    const { C, frames } = probe("shop");
    const w = mountWith(i18n, C);
    expect(frames[0]).toBe("true/true");
    expect(w.text()).toBe("Shop");
    await l.fail("uk:shop");
    expect(frames.at(-1)).toBe("true/false");
    const { i18n: other } = make({ locale: "uk", messages: { uk: {} }, loader: l.load });
    const q = probe("help");
    const v = mountWith(other, q.C);
    await l.fail("uk:help");
    expect(q.frames.at(-1)).toBe("false/false");
    expect(v.text()).toBe("unavailable");
  });

  it("a catalog of a locale outside the chain is not ready; with fallbackLocale it is", () => {
    const l = manualLoader();
    const a = make({ locale: "uk", messages: { en: { title: "Account" } }, loader: l.load });
    expect(mountWith(a.i18n, probe("default").C).text()).toBe("…");
    const b = make({
      locale: "uk",
      fallbackLocale: "en",
      messages: { en: { title: "Account" } },
      loader: l.load,
    });
    expect(mountWith(b.i18n, probe("default").C).text()).toBe("Account");
  });
});

/** A page that shows `count` consumers of `shop`, toggled by the returned setter. */
const list = (C: Component, count = 1) => {
  const n = ref(count);
  const Root = defineComponent({
    setup: () => () =>
      h(
        "div",
        Array.from({ length: n.value }, () => h(C)),
      ),
  });
  return { Root, n };
};

describe("consumers (brief §3)", () => {
  it("two consumers share one flight; unmounting one keeps the namespace active", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { C } = probe("shop");
    const { Root, n } = list(C, 2);
    const w = mountWith(i18n, Root);
    expect(l.requested).toEqual(["en:shop"]);
    await l.answer("en:shop", { title: "Shop" });
    n.value = 1;
    await settle();
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:shop", "de:default", "de:shop"]);
    await l.answer("de:default");
    await l.answer("de:shop", { title: "Laden" });
    await sw;
    await settle();
    expect(w.text()).toBe("Laden");
  });

  it("the last consumer unmounting keeps the cache; the next switch does not load it", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { C } = probe("shop");
    const { Root, n } = list(C);
    const w = mountWith(i18n, Root);
    await l.answer("en:shop", { title: "Shop" });
    n.value = 0;
    await settle();
    const sw = i18n.setLocale("de");
    await l.answer("de:default");
    await sw;
    expect(l.requested).toEqual(["en:shop", "de:default"]);
    await i18n.setLocale("en");
    n.value = 1;
    await settle();
    expect(w.text()).toBe("Shop");
    expect(l.requested).toEqual(["en:shop", "de:default"]);
  });

  it("KeepAlive: deactivation releases, activation holds again; mount + first activation hold once", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const shop = probe("shop");
    const Other = defineComponent({ setup: () => () => h("p", "other") });
    const page = ref<"shop" | "other">("shop");
    const Root = defineComponent({
      setup: () => () => h(KeepAlive, null, [page.value == "shop" ? h(shop.C) : h(Other)]),
    });
    const w = mountWith(i18n, Root);
    expect(l.requested).toEqual(["en:shop"]);
    await l.answer("en:shop", { title: "Shop" });
    page.value = "other"; // deactivated (cached, not unmounted)
    await settle();
    let sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:shop", "de:default"]); // released: a double hold would load shop
    await l.answer("de:default");
    await sw;
    page.value = "shop"; // activated: holds again, loads for the locale on screen
    await settle();
    expect(l.requested).toEqual(["en:shop", "de:default", "de:shop"]);
    expect(w.text()).toBe("…");
    await l.answer("de:shop", { title: "Laden" });
    expect(w.text()).toBe("Laden");
    sw = i18n.setLocale("fr"); // held while active
    expect(l.requested.slice(3)).toEqual(["fr:default", "fr:shop"]);
    await l.answer("fr:default");
    await l.answer("fr:shop");
    await sw;
  });

  it("v-show hiding keeps the need: the switch still loads it", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { C } = probe("shop");
    const shown = ref(true);
    const Root = defineComponent({
      setup: () => () => withDirectives(h("div", [h(C)]), [[vShow, shown.value]]),
    });
    mountWith(i18n, Root);
    await l.answer("en:shop");
    shown.value = false;
    await settle();
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["en:shop", "de:default", "de:shop"]);
    await l.answer("de:default");
    await l.answer("de:shop");
    await sw;
  });

  it("a remount after a failed load asks for nothing; i18n.load(ns) retries", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { C } = probe("shop");
    const { Root, n } = list(C);
    const w = mountWith(i18n, Root);
    await l.fail("en:shop");
    for (const k of [0, 1, 0, 1]) {
      n.value = k;
      await settle();
    }
    expect(l.requested).toEqual(["en:shop"]);
    expect(w.text()).toBe("unavailable");
    void i18n.load("shop");
    await l.answer("en:shop", { title: "Shop" });
    expect(w.text()).toBe("Shop");
  });
});

describe("reading never loads (brief §1)", () => {
  it("$t and useI18n(ns).T: $t requests nothing; the bound T reads what its useI18n holds, no warning", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const Child = defineComponent({
      props: { bound: { type: Object, required: true } },
      setup: (p) => () => h(p.bound as Component, { i18nKey: "title" }),
    });
    const Page = defineComponent({
      setup() {
        const { T: bound } = useI18n("account");
        return () => h(Child, { bound });
      },
    });
    const Global = defineComponent({ template: "<i>{{ $t('x', { ns: 'help' }) }}</i>" });
    let w!: ReturnType<typeof mountWith>;
    const warnings = await vueWarnings(async () => {
      w = mountWith(i18n, defineComponent({ setup: () => () => [h(Page), h(Global)] }));
      await settle();
      await l.answer("en:account", { title: "Account" });
    });
    expect(l.requested).toEqual(["en:account"]);
    expect(w.text()).toBe("Accountx");
    // `$t` read `help`, which nothing loads: development says so, once.
    expect(warnings.filter((x) => x.includes('"help"'))).toHaveLength(1);
    expect(warnings.filter((x) => x.includes('"account"'))).toEqual([]);
  });
});

describe("setLocale() and the active need (brief §4, §7)", () => {
  it("the key scenario: account → default page → switch: only default loads; back on account: loading, then the text", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", loader: l.load });
    await l.answer("en:default", { home: "Home" });
    const account = probe("account");
    const Home = defineComponent({
      setup() {
        const { t } = useI18n();
        return () => h("p", t("home"));
      },
    });
    const page = ref("account");
    const Root = defineComponent({
      setup: () => () => (page.value == "account" ? h(account.C) : h(Home)),
    });
    const w = mountWith(i18n, Root);
    await l.answer("en:account", { title: "Account" });
    expect(w.text()).toBe("Account");
    page.value = "home";
    await settle();
    const sw = i18n.setLocale("de");
    await l.answer("de:default", { home: "Start" });
    await sw;
    await settle();
    expect(w.text()).toBe("Start");
    expect(l.requested).toEqual(["en:default", "en:account", "de:default"]);
    account.frames.length = 0;
    page.value = "account";
    await settle();
    expect(account.frames[0]).toBe("false/true");
    expect(w.text()).toBe("…");
    expect(l.requested).toEqual(["en:default", "en:account", "de:default", "de:account"]);
    await l.answer("de:account", { title: "Konto" });
    expect(w.text()).toBe("Konto");
    expect(account.frames).not.toContain("false/false");
  });

  it("a consumer mounted while a switch is pending ends with the applied locale's catalog", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { C } = probe("shop");
    const { Root, n } = list(C, 0);
    const w = mountWith(i18n, Root);
    const sw = i18n.setLocale("de");
    n.value = 1;
    await settle();
    expect(l.requested).toEqual(["de:default", "en:shop"]);
    await l.answer("de:default");
    await sw;
    expect(l.requested).toEqual(["de:default", "en:shop", "de:shop"]);
    await l.answer("de:shop", { title: "Laden" });
    expect(w.text()).toBe("Laden");
  });
});

describe("SSR hydration with v-if on isReady (brief §5)", () => {
  const Account = defineComponent({
    setup() {
      const { t, isReady, isLoading } = useI18n("account");
      return () =>
        isReady.value
          ? h("p", t("title"))
          : isLoading.value
            ? h("i", "loading")
            : h("b", "unavailable");
    },
  });
  const run = async (load: (l: string) => Promise<Catalog>, locale = "en") => {
    const options = { locale, fallbackLocale: "en", timeZone: "UTC", messages: { [locale]: {} } };
    const server = createI18n({ ...options, onError: () => {}, loader: (l) => load(l) });
    const html = await renderToString(createSSRApp(Account).use(server));
    const payload = JSON.parse(JSON.stringify(handover(server)));
    const el = document.createElement("div");
    el.innerHTML = html;
    const l = manualLoader();
    // Reports (fallback_used) are not warnings of the hydration.
    const client: VueI18n = createI18n({
      ...options,
      ...payload,
      onError: () => {},
      loader: l.load,
    });
    const app = createSSRApp(Account).use(client);
    const warnings = await vueWarnings(async () => {
      app.mount(el);
      await settle();
    });
    return { html, el, warnings, l, app, client };
  };

  it("loaded on the server (its onServerPrefetch): the same text branch, 0 requests, the handover kept after unmount", async () => {
    const r = await run(async () => ({ title: "Account" }));
    expect(r.html).toBe("<p>Account</p>");
    expect([r.el.innerHTML, r.warnings, r.l.requested]).toEqual([r.html, [], []]);
    r.app.unmount(); // the consumer is released
    expect(r.client.t("title", { ns: "account" })).toBe("Account");
    expect(r.l.requested).toEqual([]);
  });

  it("failed on the server with no usable catalog: the same 'unavailable' branch, 0 requests", async () => {
    const r = await run(async () => {
      throw new Error("404");
    });
    expect(r.html).toBe("<b>unavailable</b>");
    expect([r.el.innerHTML, r.warnings, r.l.requested]).toEqual([r.html, [], []]);
    r.app.unmount();
  });

  it("served through the fallback locale: the same text branch, 0 requests", async () => {
    const r = await run(async (l) => {
      if (l == "uk") throw new Error("404");
      return { title: "Account" };
    }, "uk");
    expect(r.html).toBe("<p>Account</p>");
    expect([r.el.innerHTML, r.warnings, r.l.requested]).toEqual([r.html, [], []]);
    r.app.unmount();
  });
});

describe("development diagnostic: declared needs (review of lot 4c)", () => {
  it("the exported <T ns> beside useI18n(ns) of the same component: no idle warning", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { T } = await import("../src");
    const Page = defineComponent({
      setup() {
        useI18n("account");
        return () => h(T as never, { i18nKey: "title", ns: "account" });
      },
    });
    let w!: ReturnType<typeof mountWith>;
    const warnings = await vueWarnings(async () => {
      w = mountWith(i18n, Page);
      await tick();
      await l.answer("en:account", { title: "Account" });
    });
    expect(l.requested).toEqual(["en:account"]);
    expect(w.text()).toBe("Account");
    expect(warnings.filter((x) => x.includes("which nothing loads"))).toEqual([]);
  });

  it("useI18n(ns) and <T ns> in a Suspense branch whose async sibling waits: no idle warning before the mount (Codex re-check F1/C5)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const { T } = await import("../src");
    let open!: () => void;
    const gate = new Promise<void>((y) => (open = y));
    const Sibling = defineComponent({
      async setup() {
        await gate;
        return () => null;
      },
    });
    const Page = defineComponent({
      setup() {
        useI18n("account");
        return () => h(T as never, { i18nKey: "title", ns: "account" });
      },
    });
    const Root = defineComponent({
      setup: () => () =>
        h(Suspense, null, {
          default: () => h("div", [h(Page), h(Sibling)]),
          fallback: () => "waiting",
        }),
    });
    let w!: ReturnType<typeof mountWith>;
    const before = await vueWarnings(async () => {
      w = mountWith(i18n, Root);
      await tick();
      await tick();
    });
    expect(w.text()).toBe("waiting");
    expect(l.requested).toEqual([]);
    expect(before.filter((x) => x.includes("which nothing loads"))).toEqual([]);
    const after = await vueWarnings(async () => {
      open();
      await settle();
      await tick();
      await l.answer("en:account", { title: "Account" });
    });
    expect(l.requested).toEqual(["en:account"]);
    expect(w.text()).toBe("Account");
    expect(after.filter((x) => x.includes("which nothing loads"))).toEqual([]);
  });

  it("useI18n(ns).t of another namespace (a per-call { ns }) is checked: development warns", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const Page = defineComponent({
      setup() {
        const { t } = useI18n();
        return () => h("p", t("title", { ns: "undeclared" }));
      },
    });
    const warnings = await vueWarnings(async () => {
      mountWith(i18n, Page);
      await settle();
      await tick();
    });
    const idle = warnings.filter((x) => x.includes("which nothing loads"));
    expect(idle).toHaveLength(1);
    expect(idle[0]).toContain('"undeclared"');
  });
});

describe("SSR handover: an inline catalog a passive read rendered (review of lot 4c)", () => {
  it("<T ns> of an inline namespace nothing holds: handed over, hydrated with 0 requests", async () => {
    const { T } = await import("../src");
    const Page = defineComponent({
      render: () => h("p", [h(T as never, { i18nKey: "title", ns: "help" })]),
    });
    const server = createI18n({
      locale: "en",
      timeZone: "UTC",
      messages: { en: {} },
      catalogs: { help: { en: { title: "Help" } } },
      loader: async () => ({}),
    });
    const html = await renderToString(createSSRApp(Page).use(server));
    expect(html).toBe("<p>Help</p>");
    const payload = JSON.parse(JSON.stringify(handover(server)));
    expect(payload.catalogs.help).toEqual({ en: { title: "Help" } });
    const l = manualLoader();
    const client = createI18n({ locale: "en", loader: l.load, ...payload });
    const el = document.createElement("div");
    el.innerHTML = html;
    const warnings = await vueWarnings(async () => {
      createSSRApp(Page).use(client).mount(el);
      await settle();
      await tick();
    });
    expect([el.innerHTML, warnings, l.requested]).toEqual([html, [], []]);
  });
});

describe("outside a component (brief §3)", () => {
  it("useI18n() in app.runWithContext() holds nothing: a switch does not load its namespace", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const w = mountWith(i18n, defineComponent({ setup: () => () => h("p") }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    w.vm.$.appContext.app.runWithContext(() => useI18n("shop"));
    warn.mockRestore();
    expect(l.requested).toEqual([]);
    const sw = i18n.setLocale("de");
    expect(l.requested).toEqual(["de:default"]);
    await l.answer("de:default");
    await sw;
  });

  it("there isLoading is a load in flight only: nothing holds, so no endless loading (review of lot 4c)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const w = mountWith(i18n, defineComponent({ setup: () => () => h("p") }));
    const app = w.vm.$.appContext.app;
    const u = app.runWithContext(() => useI18n("shop"));
    expect([u.isReady.value, u.isLoading.value]).toEqual([false, false]);
    await settle();
    expect([u.isReady.value, u.isLoading.value, l.requested]).toEqual([false, false, []]);
    // A load in flight is loading there too.
    const p = i18n.load("shop");
    expect([u.isReady.value, u.isLoading.value]).toEqual([false, true]);
    await l.answer("en:shop");
    await p;
    expect([u.isReady.value, u.isLoading.value]).toEqual([true, false]);
  });

  it("its reads are not a declared need: development warns about a namespace nothing loads (review of lot 4c)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const w = mountWith(i18n, defineComponent({ setup: () => () => h("p") }));
    const app = w.vm.$.appContext.app;
    const warnings = await vueWarnings(async () => {
      const { t } = app.runWithContext(() => useI18n("shop"));
      expect(t("x")).toBe("x");
      await tick();
    });
    expect(l.requested).toEqual([]);
    const idle = warnings.filter((x) => x.includes("which nothing loads"));
    expect(idle).toHaveLength(1);
    expect(idle[0]).toContain('"shop"');
  });

  it("its T reads the namespace undeclared too: development warns, nothing loads (Codex re-check F2)", async () => {
    const l = manualLoader();
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    const w = mountWith(i18n, defineComponent({ setup: () => () => h("p") }));
    const { T } = w.vm.$.appContext.app.runWithContext(() => useI18n("shop"));
    let v!: ReturnType<typeof mountWith>;
    const warnings = await vueWarnings(async () => {
      v = mountWith(i18n, defineComponent({ setup: () => () => h(T as never, { i18nKey: "x" }) }));
      await settle();
      await tick();
    });
    expect([v.text(), l.requested]).toEqual(["x", []]);
    const idle = warnings.filter((x) => x.includes("which nothing loads"));
    expect(idle).toHaveLength(1);
    expect(idle[0]).toContain('"shop"');
  });
});
