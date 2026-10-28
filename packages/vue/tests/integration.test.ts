/**
 * An app on the product's main path: createI18n + cdn() (CDN v1 layout) + detect() +
 * app.use, templates with `v-model="locale"`, `$t` and `<T>`. Ported by meaning from 0.7
 * integration-flow.test.ts: a language switcher workflow, a dynamic namespace with its
 * loading state, a namespace load that fails (the loading state clears and the failure is
 * reported). The first paint waits for the catalogs by mounting after `i18n.ready` (the
 * Vue idiom of the README; React's `<I18nProvider loading>`).
 */
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { cdn } from "@comvi/core/cdn";
import { detect } from "@comvi/core/plugins";
import { createI18n, T, useI18n, type I18nError } from "../src";
import { settle } from "./helpers";

const BASE = "https://cdn.example/d1";
const FILES: Record<string, object> = {
  "/en.json": {
    title: "Shop",
    items: "{count, plural, one {# item} other {# items}}",
    terms: "Read the <link>terms</link>",
  },
  "/de.json": {
    title: "Laden",
    items: "{count, plural, one {# Artikel} other {# Artikel}}",
    terms: "Lies die <link>AGB</link>",
  },
  "/account/en.json": { signed_in: "Signed in as {name}" },
};

/** A CDN double: each request waits until `release()` (or answers at once with `auto`). */
const cdnDouble = (auto = true) => {
  const log: string[] = [];
  const held: (() => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = url.slice(BASE.length);
      log.push(path);
      if (!auto) await new Promise<void>((y) => held.push(y));
      const body = FILES[path];
      return new Response(body ? JSON.stringify(body) : "nope", { status: body ? 200 : 404 });
    }),
  );
  return { log, release: async () => (held.splice(0).forEach((y) => y()), await settle()) };
};

const Shop = defineComponent({
  components: { T: T as never },
  setup() {
    const { locale, isLoading } = useI18n();
    return { locale, isLoading };
  },
  template: `
    <select aria-label="locale" v-model="locale" :disabled="isLoading">
      <option value="en">en</option><option value="de">de</option>
    </select>
    <h1>{{ $t("title") }}</h1>
    <p data-testid="items">{{ $t("items", { count: 2 }) }}</p>
    <p data-testid="terms"><T i18n-key="terms"><template #link="{ children }"><a href="/terms">{{ children }}</a></template></T></p>`,
});

describe("an app on createI18n + cdn() + detect()", () => {
  it("handles a language switcher workflow (v-model locale, $t, <T> with a slot)", async () => {
    const net = cdnDouble();
    const i18n = createI18n({
      locale: "en",
      loader: cdn(BASE),
      plugins: [detect({ supported: ["en", "de"], order: [] })],
    });
    await i18n.ready;
    const w = mount(Shop, { global: { plugins: [i18n] } });
    expect(w.find("h1").text()).toBe("Shop");
    expect(w.find("[data-testid=items]").text()).toBe("2 items");
    expect(w.find("[data-testid=terms]").html()).toBe(
      '<p data-testid="terms">Read the <a href="/terms">terms</a></p>',
    );
    await w.find("select").setValue("de");
    // The old locale stays on screen until the new catalogs are in.
    expect((w.find("select").element as HTMLSelectElement).disabled).toBe(true);
    await settle();
    expect(w.find("h1").text()).toBe("Laden");
    expect(w.find("[data-testid=terms]").text()).toBe("Lies die AGB");
    expect((w.find("select").element as HTMLSelectElement).value).toBe("de");
    expect(net.log).toEqual(["/en.json", "/de.json"]);
  });

  it("loads a dynamic namespace and updates its loading state", async () => {
    const net = cdnDouble(false);
    const i18n = createI18n({ locale: "en", loader: cdn(BASE) });
    const Account = defineComponent({
      setup: () => useI18n("account"),
      template: `<p>{{ isLoading ? "…" : t("signed_in", { name: "Ann" }) }}</p>`,
    });
    const w = mount(Account, { global: { plugins: [i18n] } });
    expect(w.text()).toBe("…");
    await net.release();
    await net.release();
    expect(w.text()).toBe("Signed in as Ann");
    expect(net.log).toEqual(["/en.json", "/account/en.json"]);
  });

  it("clears the loading state and reports the failure when a namespace load fails", async () => {
    cdnDouble();
    const errors: I18nError[] = [];
    const i18n = createI18n({ locale: "en", loader: cdn(BASE), onError: (e) => errors.push(e) });
    const Missing = defineComponent({
      setup: () => useI18n("nope"),
      template: `<p>{{ isLoading ? "…" : t("k") }}</p>`,
    });
    const w = mount(Missing, { global: { plugins: [i18n] } });
    await settle();
    await settle();
    expect(w.text()).toBe("k");
    expect(errors.some((e) => e.code === "load_failed" && e.ns === "nope")).toBe(true);
  });
});
