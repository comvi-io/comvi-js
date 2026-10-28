/**
 * The editor marking hook through Vue (design R3-14 H4, H7, H9): output rendered after
 * `x.mark(fn)` is marked because the hook travels on the PUBLISHED state the binding's
 * cell holds (H7) — no Vue code is involved; `<T :markers="false">` and
 * `t(key, { markers: false })` are never marked (the core reads `markers` as a per-call
 * option); an instance without `devtools()` is never marked. Vue has no render-local view
 * (the server payload is in the instance before the app is created), so H9's "view() is
 * marked" has nothing to cover here; the core's own test covers view().
 */
import { defineComponent, h, nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { devtools, type ComviHandle, type ComviQueueEntry, type Mark } from "@comvi/core/devtools";
import { createI18n, T, useI18n, type I18n } from "../src";
import { mountWith } from "./helpers";

const win = window as { __COMVI__?: ComviQueueEntry[] };
afterEach(() => {
  delete win.__COMVI__;
});

const MSGS = { hi: "Hi", name: "Hi {n}" };
const make = (plugins = [devtools()]) =>
  createI18n({ locale: "en", messages: { en: MSGS }, onError: () => {}, plugins });
const handle = (i18n: I18n): ComviHandle => win.__COMVI__!.find((e) => e.i === i18n)!.x;
const mark = vi.fn<Mark>((out, key) => (typeof out == "string" ? `[${key}:${out}]` : out));
const Tc = T as never;

const Probe = defineComponent({
  setup() {
    const { t } = useI18n();
    return () => [
      h("p", { id: "t" }, t("name", { n: "A" })),
      h("p", { id: "off" }, t("hi", { markers: false })),
      h("p", { id: "T" }, [h(Tc, { i18nKey: "hi" })]),
      h("p", { id: "Toff" }, [h(Tc, { i18nKey: "hi", markers: false })]),
      h("p", { id: "missing" }, [h(Tc, { i18nKey: "gone" })]),
    ];
  },
});
const texts = (w: ReturnType<typeof mountWith>) =>
  ["t", "off", "T", "Toff", "missing"].map((id) => w.find(`#${id}`).text());

describe("marking in Vue", () => {
  it("x.mark re-renders the mounted tree marked; markers=false opts out; mark(null) unmarks", async () => {
    const i18n = make();
    const w = mountWith(i18n, Probe);
    expect(texts(w)).toEqual(["Hi A", "Hi", "Hi", "Hi", "gone"]);
    handle(i18n).mark(mark);
    await nextTick();
    expect(texts(w)).toEqual(["[name:Hi A]", "Hi", "[hi:Hi]", "Hi", "[gone:gone]"]);
    handle(i18n).mark(null);
    await nextTick();
    expect(texts(w)).toEqual(["Hi A", "Hi", "Hi", "Hi", "gone"]);
  });

  it('a template\'s <T :markers="false"> and $t(key, { markers: false }) are not marked', async () => {
    const i18n = make();
    handle(i18n).mark(mark);
    const C = defineComponent({
      components: { T: T as never },
      template: `<p>{{ $t("hi") }}|{{ $t("hi", { markers: false }) }}|<T i18n-key="hi" />|<T i18n-key="hi" :markers="false" /></p>`,
    });
    expect(mountWith(i18n, C).text()).toBe("[hi:Hi]|Hi|[hi:Hi]|Hi");
  });

  it("the bound <T> of useI18n(ns) takes markers=false too", () => {
    const i18n = createI18n({
      locale: "en",
      catalogs: { shop: { en: { buy: "Buy" } } },
      plugins: [devtools()],
    });
    handle(i18n).mark(mark);
    const Shop = defineComponent({
      setup() {
        const { T: ShopT } = useI18n("shop");
        return () => [
          h(ShopT as never, { i18nKey: "buy" }),
          "|",
          h(ShopT as never, { i18nKey: "buy", markers: false }),
        ];
      },
    });
    expect(mountWith(i18n, Shop).text()).toBe("[buy:Buy]|Buy");
  });

  it("an instance without devtools() renders unmarked", () => {
    const i18n = make([]);
    expect(texts(mountWith(i18n, Probe))).toEqual(["Hi A", "Hi", "Hi", "Hi", "gone"]);
    expect(win.__COMVI__).toBeUndefined();
  });
});
