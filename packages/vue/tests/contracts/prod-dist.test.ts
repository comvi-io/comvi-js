/**
 * The production build (dist/comvi-vue.js, `__DEV__` false), not the source under a define:
 * `useI18n(ns)` outside a component (`app.runWithContext()`) registers no lifecycle hook —
 * Vue warns nothing — and reports a load in flight only (Codex re-check of lot 4c, C4).
 * Turbo builds before test; a missing dist fails here.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { defineComponent, h } from "vue";
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
});
