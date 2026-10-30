/**
 * The production build (dist/comvi-vue.js, `__DEV__` false), not the source under a define:
 * `useI18n(ns)` outside a component (`app.runWithContext()`) registers no lifecycle hook —
 * Vue warns nothing — and reports a load in flight only (Codex re-check of lot 4c, C4).
 * Turbo builds before test; a missing dist fails here.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

const DIST = path.resolve(__dirname, "../../dist/comvi-vue.js");

describe("production dist", () => {
  it("useI18n() outside a component registers no lifecycle hook and holds nothing", async () => {
    if (!fs.existsSync(DIST)) throw new Error(`${DIST} is missing — run \`pnpm build\``);
    const { createI18n, useI18n } = (await import(
      /* @vite-ignore */ pathToFileURL(DIST).href
    )) as typeof import("../../src");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = vi.fn(async () => ({}));
    const i18n = createI18n({ locale: "en", messages: { en: {} }, loader: load });
    const w = mount(defineComponent({ setup: () => () => h("p") }), {
      global: { plugins: [i18n] },
    });
    const u = w.vm.$.appContext.app.runWithContext(() => useI18n("shop"));
    expect([u.isReady.value, u.isLoading.value]).toEqual([false, false]);
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    w.unmount();
  });

  it("KeepAlive: a prop changed with the reactivation ends its flush on 'loading' with the load started (owner 30.10; paint order checked in Chromium)", async () => {
    const { createI18n, useI18n } = (await import(
      /* @vite-ignore */ pathToFileURL(DIST).href
    )) as typeof import("../../src");
    const answers = new Map<string, (c: Record<string, string>) => void>();
    const requested: string[] = [];
    const i18n = createI18n({
      locale: "en",
      messages: { en: {} },
      loader: (l, n) =>
        new Promise((y) => {
          requested.push(`${l}:${n}`);
          answers.set(`${l}:${n}`, y);
        }),
    });
    const frames: string[] = [];
    const Shop = defineComponent({
      props: { v: Number },
      setup() {
        const u = useI18n("shop");
        return () => {
          frames.push(`${u.isReady.value}/${u.isLoading.value}`);
          return h("p", u.isReady.value ? "text" : u.isLoading.value ? "…" : "unavailable");
        };
      },
    });
    const page = ref("shop");
    const v = ref(1);
    const w = mount(
      defineComponent({
        setup: () => () =>
          h(KeepAlive, null, [page.value == "shop" ? h(Shop, { v: v.value }) : h("p", "other")]),
      }),
      { global: { plugins: [i18n] } },
    );
    const flush = () => new Promise((y) => setTimeout(y));
    answers.get("en:shop")!({ title: "Shop" });
    await flush();
    page.value = "other";
    await flush();
    const sw = i18n.setLocale("de");
    answers.get("de:default")!({});
    await sw;
    await flush();
    const from = frames.length;
    page.value = "shop";
    v.value = 2;
    await nextTick(); // one flush: the activation render, onActivated's hold, its re-render
    expect(frames.slice(from)).toEqual(["false/false", "false/true"]);
    expect(w.text()).toBe("…");
    expect(requested).toEqual(["en:shop", "de:default", "de:shop"]);
    w.unmount();
  });

  it("KeepAlive: a prop changed while the subtree is detached holds nothing; the next switch does not wait for it (Codex re-check of 89c74155)", async () => {
    const { createI18n, useI18n } = (await import(
      /* @vite-ignore */ pathToFileURL(DIST).href
    )) as typeof import("../../src");
    const answers = new Map<string, (c: Record<string, string>) => void>();
    const requested: string[] = [];
    const i18n = createI18n({
      locale: "en",
      messages: { en: {} },
      loader: (l, n) =>
        new Promise((y) => {
          requested.push(`${l}:${n}`);
          answers.set(`${l}:${n}`, y);
        }),
    });
    const x = ref(1);
    const page = ref("shop");
    const Child = defineComponent({
      props: { x: Number },
      setup(p) {
        const u = useI18n("shop");
        return () => h("p", `${p.x} ${u.isLoading.value}`);
      },
    });
    const Parent = defineComponent({ setup: () => () => h(Child, { x: x.value }) });
    const w = mount(
      defineComponent({
        setup: () => () => h(KeepAlive, null, [page.value == "shop" ? h(Parent) : h("p", "other")]),
      }),
      { global: { plugins: [i18n] }, attachTo: document.body },
    );
    const flush = () => new Promise((y) => setTimeout(y));
    answers.get("en:shop")!({});
    await flush();
    page.value = "other";
    await flush();
    let sw = i18n.setLocale("de");
    answers.get("de:default")!({});
    await sw;
    x.value = 2;
    await flush();
    expect(requested).toEqual(["en:shop", "de:default"]);
    sw = i18n.setLocale("fr");
    answers.get("fr:default")!({});
    await sw;
    expect([i18n.locale, requested]).toEqual(["fr", ["en:shop", "de:default", "fr:default"]]);
    w.unmount();
  });
});
