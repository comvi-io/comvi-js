/**
 * Check 9 of the ready/loading scope (owner brief 2026-11-10) on a server render: a server render
 * of `useI18n()` waits (`onServerPrefetch`) while a namespace its flags cover loads — `default`
 * or one of the `namespaces` option — so the server renders the branch the browser, started from
 * `handover()`, hydrates. Without that wait the server renders the loading branch and the
 * browser, handed the catalog, the content: a hydration mismatch. Contract:
 * `.lot1-pending-tests.md` "Ready/loading scope of `useI18n()`", "Server-render wait".
 */
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import { createI18n, handover, useI18n, type I18nOptions } from "../src";
import { make, manualLoader, settle, vueWarnings } from "./helpers";

/** Every render's `isReady/isLoading` of `useI18n()`, and the branch it shows. */
const probe = () => {
  const frames: string[] = [];
  const C = defineComponent({
    setup() {
      const { t, isReady, isLoading } = useI18n();
      return () => {
        frames.push(`${isReady.value}/${isLoading.value}`);
        return h("p", isReady.value ? t("hi") : isLoading.value ? "…" : "unavailable");
      };
    },
  });
  return { C, frames };
};

describe("9: a server render of useI18n() waits for the namespaces its flags cover", () => {
  const OPTS: I18nOptions = { locale: "en", timeZone: "UTC", namespaces: ["default", "nav"] };

  it("a server render waits for the set: the server's branch at the first frame, no mismatch, no request", async () => {
    // Nothing awaited before the render: default is inline, nav's startup load is in flight.
    const server = createI18n({
      ...OPTS,
      catalogs: { default: { en: { hi: "Hi" } } },
      loader: async () => ({}),
    });
    const s = probe();
    const html = await renderToString(createSSRApp(s.C).use(server));
    const payload = JSON.parse(JSON.stringify(handover(server)));
    server.destroy();
    const el = document.createElement("div");
    el.innerHTML = html;
    const l = manualLoader();
    const { i18n } = make({ ...OPTS, loader: l.load, ...payload });
    const b = probe();
    const app = createSSRApp(b.C).use(i18n);
    const warnings = await vueWarnings(async () => {
      app.mount(el);
      await settle();
    });
    const text = el.textContent;
    app.unmount();
    expect([s.frames, b.frames, warnings, text, l.requested]).toEqual([
      ["true/false"],
      ["true/false"],
      [],
      "Hi",
      [],
    ]);
  });
});
