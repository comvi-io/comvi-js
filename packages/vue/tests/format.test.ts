/**
 * @comvi/vue/format — useFormat() (design §3.3, lot 4 gate: "reactivity of useFormat on a
 * locale change, a test"). Ported by meaning from 0.7 useI18n's formatter cases and
 * @comvi/react's format test: the locale on screen, the instance's timeZone, named
 * formats, relative time from the instance's `now`. Vue's formatters read the locale when
 * they are CALLED (a reactive read), so a template that formats re-renders on a switch —
 * and only on a switch; React's are bound to the render's locale instead.
 */
import { defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import { createI18n, type VueI18n } from "../src";
import { useFormat, type Formatters } from "../src/format";
import { manualLoader, make, mountWith, probe } from "./helpers";

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

  it("a handed-over serverNow holds for the hydration render, the browser clock after mount (lot 4b)", async () => {
    const real = Date.now;
    Date.now = () => 1_000_000;
    try {
      const i18n = createI18n({ locale: "en", timeZone: "UTC", serverNow: 940_000 });
      const tick = ref(0);
      const C = defineComponent({
        setup() {
          const f = useFormat();
          return () => h("p", (tick.value, f.relative(880_000)));
        },
      });
      const w = mountWith(i18n, C);
      expect(w.text()).toBe("1 minute ago"); // the hydration render: the server's clock
      tick.value++;
      await nextTick();
      expect(w.text()).toBe("2 minutes ago"); // mounted: the browser's clock
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
    await l.answer("de:default");
    // `shop` is active: the switch waits for its catalog too.
    expect(F.counter.count).toBe(1);
    await l.answer("de:shop");
    expect(F.counter.count).toBe(2);
    expect(w.text()).toBe("1.234,5");
  });
});
