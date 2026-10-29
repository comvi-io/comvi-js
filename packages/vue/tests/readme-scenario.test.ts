/**
 * Lot 4b completion criterion (owner brief 29.10): the README's Vue app behaves predictably
 * on success, a slow load, an error, a fast double switch and a hydration. The components
 * are the README's (`App` with its `v-model` `<select>`, a `<T>` with `components`), the
 * loader stands for `cdn()`, the app mounts after `i18n.ready` as the README says. No case
 * may leave an unhandled rejection or a raw key the contract does not name.
 */
import {
  createApp,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  vModelSelect,
  withDirectives,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createI18n, handover, T, useI18n, type VueI18n } from "../src";
import { manualLoader, settle, vueWarnings } from "./helpers";

const CATALOGS = {
  "en:default": {
    greeting: "Hello, {name}!",
    terms: "Read the <link>terms</link>, <b>in <i>full</i></b>.",
  },
  "uk:default": {
    greeting: "Привіт, {name}!",
    terms: "Прочитайте <link>умови</link>, <b>усі <i>повністю</i></b>.",
  },
  "de:default": {
    greeting: "Hallo, {name}!",
    terms: "Lies die <link>AGB</link>, <b>ganz <i>vollständig</i></b>.",
  },
};

const TermsLink = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("a", { href: "/terms" }, slots.default?.()),
});

/** The README's `src/App.vue` (as a render function), plus its markup example. */
const App = defineComponent({
  setup() {
    const { t, locale } = useI18n();
    return () => [
      h("h1", t("greeting", { name: "Alice" })),
      withDirectives(
        h(
          "select",
          { "onUpdate:modelValue": (v: string) => (locale.value = v) },
          ["en", "uk", "de"].map((v) => h("option", { value: v }, v)),
        ),
        [[vModelSelect, locale.value]],
      ),
      h("p", [
        h(T as never, { i18nKey: "terms", components: { link: TermsLink, b: "strong", i: "em" } }),
      ]),
    ];
  },
});

let rejections: unknown[] = [];
const onRejection = (e: unknown) => rejections.push(e);
beforeEach(() => {
  rejections = [];
  process.on("unhandledRejection", onRejection);
});
afterEach(async () => {
  await new Promise((y) => setTimeout(y, 0));
  process.off("unhandledRejection", onRejection);
  expect(rejections).toEqual([]);
});

const start = async (first: "answer" | "fail" = "answer") => {
  const l = manualLoader(CATALOGS);
  const errors: string[] = [];
  const i18n = createI18n({
    locale: "en",
    fallbackLocale: "en",
    loader: l.load,
    onError: (e) => errors.push(`${e.code} ${e.locale}`),
  });
  const el = document.createElement("div");
  const app = createApp(App).use(i18n);
  // README: mount once the first catalogs are in.
  const mounted = i18n.ready.then(() => app.mount(el));
  await l[first]("en:default");
  await mounted;
  await settle();
  const h1 = () => el.querySelector("h1")?.textContent;
  const select = () => el.querySelector("select")!;
  const pick = async (v: string) => {
    select().value = v;
    select().dispatchEvent(new Event("change"));
    await settle();
  };
  return { l, i18n, el, h1, select, pick, errors, app };
};

describe("README Vue app (lot 4b)", () => {
  it("success: the text once mounted; components render the nested markup; a switch in place", async () => {
    const s = await start();
    expect(s.h1()).toBe("Hello, Alice!");
    expect(s.el.querySelector("p")!.innerHTML).toBe(
      'Read the <a href="/terms">terms</a>, <strong>in <em>full</em></strong>.',
    );
    await s.pick("uk");
    await s.l.answer("uk:default");
    expect([s.h1(), s.select().value]).toEqual(["Привіт, Alice!", "uk"]);
    expect(s.errors).toEqual([]);
  });

  it("slow load: the old locale's text stays until the new one is in", async () => {
    const s = await start();
    await s.pick("uk");
    expect([s.h1(), s.i18n.locale]).toEqual(["Hello, Alice!", "en"]);
    await s.l.answer("uk:default");
    expect([s.h1(), s.select().value]).toEqual(["Привіт, Alice!", "uk"]);
  });

  it("error: a failed switch keeps the locale, the <select> shows it again, nothing unhandled", async () => {
    const s = await start();
    await s.pick("de");
    await s.l.fail("de:default");
    await settle();
    expect([s.h1(), s.select().value, s.i18n.locale]).toEqual(["Hello, Alice!", "en", "en"]);
    expect(s.errors).toEqual(["load_failed de"]);
  });

  it("error on the first load: ready settles, the app mounts with the keys", async () => {
    const s = await start("fail");
    expect(s.h1()).toBe("greeting");
    expect(s.errors[0]).toBe("load_failed en");
  });

  it("fast double switch: the last one wins, the earlier never shows", async () => {
    const s = await start();
    await s.pick("uk");
    await s.pick("de");
    expect(s.l.signals.get("uk:default")!.aborted).toBe(true);
    await s.l.answer("de:default");
    expect([s.h1(), s.select().value]).toEqual(["Hallo, Alice!", "de"]);
    expect(s.errors).toEqual([]);
  });

  it("hydration: the server's text, no mismatch, 0 requests for what the server sent", async () => {
    const serverLoader = manualLoader(CATALOGS);
    const server = createI18n({
      locale: "uk",
      fallbackLocale: "en",
      timeZone: "UTC",
      loader: serverLoader.load,
    });
    const ready = server.ready;
    await serverLoader.answer("uk:default");
    await serverLoader.answer("en:default");
    await ready;
    const html = await renderToString(createSSRApp(App).use(server));
    const payload = JSON.parse(JSON.stringify(handover(server)));
    const el = document.createElement("div");
    el.innerHTML = html;
    const l = manualLoader(CATALOGS);
    const client: VueI18n = createI18n({ fallbackLocale: "en", ...payload, loader: l.load });
    const warnings = await vueWarnings(async () => {
      createSSRApp(App).use(client).mount(el);
      await nextTick();
      await settle();
    });
    expect(warnings).toEqual([]);
    expect(el.innerHTML).toBe(html);
    expect(el.querySelector("h1")!.textContent).toBe("Привіт, Alice!");
    expect(l.requested).toEqual([]);
  });
});
