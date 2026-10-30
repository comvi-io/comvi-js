/**
 * @comvi/vue/format — useFormat() (design §3.3, lot 4 gate: "reactivity of useFormat on a
 * locale change, a test"). Ported by meaning from 0.7 useI18n's formatter cases and
 * @comvi/react's format test: the locale on screen, the instance's timeZone, named
 * formats, relative time from the instance's `now`. Vue's formatters read the locale when
 * they are CALLED (a reactive read), so a template that formats re-renders on a switch —
 * and only on a switch; React's are bound to the render's locale instead.
 */
import {
  createSSRApp,
  defineAsyncComponent,
  defineComponent,
  h,
  nextTick,
  ref,
  type Component,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import { createI18n, handover, type VueI18n } from "../src";
import { useFormat, type Formatters } from "../src/format";
import { manualLoader, make, mountWith, probe, vueWarnings } from "./helpers";

const capture = (i18n: VueI18n) => {
  let f!: Formatters;
  mountWith(
    i18n,
    defineComponent({
      setup() {
        f = useFormat();
        return () => null;
      },
    }),
  );
  return f;
};
// Intl spaces are narrow / no-break spaces.
const sp = (s: string | undefined) => s!.replace(/[\u00a0\u202f]/g, " ");

describe("useFormat()", () => {
  it("formats numbers, currency, dates, ranges, lists, names and relative time in the locale", () => {
    const i18n = createI18n({
      locale: "de",
      timeZone: "UTC",
      now: Date.UTC(2026, 0, 10),
      formats: { number: { pct: { style: "percent" } } },
    });
    const f = capture(i18n);
    expect(sp(f.number(1234.5))).toBe("1.234,5");
    expect(sp(f.number(0.5, "pct"))).toBe("50 %");
    expect(sp(f.currency(9.5, "EUR"))).toBe("9,50 €");
    expect(sp(f.date(Date.UTC(2026, 0, 2), { dateStyle: "medium" }))).toBe("02.01.2026");
    expect(
      sp(
        f.dateRange(Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 5), {
          day: "numeric",
          month: "numeric",
        }),
      ),
    ).toBe("02.–05.01.");
    expect(f.list(["a", "b", "c"])).toBe("a, b und c");
    expect(f.displayName("en")).toBe("Englisch");
    expect(f.relative(Date.UTC(2026, 0, 9))).toBe("gestern");
    // `now` and Intl's options in one object, like every other formatter (lot 4b).
    expect(f.relative(Date.UTC(2026, 0, 3), { now: Date.UTC(2026, 0, 5), numeric: "always" })).toBe(
      "vor 2 Tagen",
    );
  });

  it("a handed-over serverNow holds for a component's hydration only: later renders and late mounts run live (lot 4b)", async () => {
    const real = Date.now;
    let clockNow = 940_000;
    Date.now = () => clockNow;
    try {
      // 880 000 is "1 minute ago" for the server's render at 940 000.
      const tick = ref(0);
      const late = ref(false);
      let resolve!: (c: Component) => void;
      const Ago = defineComponent({
        props: { id: String },
        setup(p) {
          const f = useFormat();
          return () => h("i", { id: p.id }, (tick.value, f.relative(880_000)));
        },
      });
      // Hydrated later than the rest (an async component): its own hydration still counts
      // from the server's clock.
      const Later = defineAsyncComponent(() => new Promise<Component>((y) => (resolve = y)));
      const App = defineComponent({
        setup: () => () => [
          h(Ago, { id: "a" }),
          h(Later, { id: "later" }),
          late.value ? h(Ago, { id: "late" }) : null,
        ],
      });
      const server = createI18n({ locale: "en", timeZone: "UTC" });
      const ServerApp = defineComponent({
        setup: () => () => [h(Ago, { id: "a" }), h(Ago, { id: "later" }), null],
      });
      const html = await renderToString(createSSRApp(ServerApp).use(server));
      const payload = JSON.parse(JSON.stringify(handover(server)));
      expect(payload.serverNow).toBe(940_000);
      // The browser hydrates a minute later.
      clockNow = 1_000_000;
      const el = document.createElement("div");
      el.innerHTML = html;
      const client = createI18n({ locale: "en", ...payload });
      const app = createSSRApp(App).use(client);
      const warnings = await vueWarnings(async () => {
        app.mount(el);
        await nextTick();
        expect(el.querySelector("#a")!.textContent).toBe("1 minute ago"); // what the server rendered
        resolve(Ago);
        await new Promise((y) => setTimeout(y, 0));
        await nextTick();
      });
      // No hydration mismatch: each component's hydration matched the server's text.
      expect(warnings).toEqual([]);
      expect(el.querySelector("#later")!.textContent).toBe("1 minute ago");
      // After mount, a re-render counts from the browser's clock.
      tick.value++;
      await nextTick();
      expect(el.querySelector("#a")!.textContent).toBe("2 minutes ago");
      // A component mounted after the hydration is live at its first render.
      late.value = true;
      await nextTick();
      expect(el.querySelector("#late")!.textContent).toBe("2 minutes ago");
      app.unmount();
    } finally {
      Date.now = real;
    }
  });

  it("an explicit `now` option stays fixed in every render (lot 4b)", () => {
    const real = Date.now;
    Date.now = () => 5_000_000;
    try {
      const i18n = createI18n({ locale: "en", now: 940_000, serverNow: 100 });
      expect(capture(i18n).relative(880_000)).toBe("1 minute ago");
    } finally {
      Date.now = real;
    }
  });

  it("a template's formatted output changes on a locale switch", async () => {
    const i18n = createI18n({ locale: "en", messages: { en: {}, de: {} } });
    const C = defineComponent({
      setup() {
        const fmt = useFormat();
        return () => h("p", fmt.number(1234.5));
      },
    });
    const w = mountWith(i18n, C);
    expect(w.text()).toBe("1,234.5");
    await i18n.setLocale("de");
    await nextTick();
    expect(w.text()).toBe("1.234,5");
  });

  it("re-renders a formatting component on a locale switch only: a namespace load does not (counted)", async () => {
    const l = manualLoader({ "en:shop": {}, "de:default": {} });
    const { i18n } = make({ locale: "en", messages: { en: {} }, loader: l.load });
    let fmt!: Formatters;
    const F = probe(() => fmt.number(1234.5));
    const Root = defineComponent({
      setup() {
        fmt = useFormat();
        return () => h(F.C);
      },
    });
    const w = mountWith(i18n, Root);
    void i18n.load("shop");
    await l.answer("en:shop");
    expect(F.counter.count).toBe(1);
    void i18n.setLocale("de");
    expect(F.counter.count).toBe(1);
    // `load("shop")` pins nothing (lot 4c): the switch waits for `default` only.
    await l.answer("de:default");
    expect(F.counter.count).toBe(2);
    expect(w.text()).toBe("1.234,5");
  });
});
