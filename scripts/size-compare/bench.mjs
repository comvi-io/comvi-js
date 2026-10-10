// Runtime micro-benchmark on PUBLISHED packages, Node, same messages for everyone.
// Two scenarios per library:
//   warm: the same key formatted repeatedly (parse cached by the library, as in a render loop)
//   cold: a fresh message string each call (parse + format), to compare parser cost
import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import { IntlMessageFormat } from "intl-messageformat";
import i18next from "i18next";
import ICU from "i18next-icu";
import { createI18n as createVueI18n } from "vue-i18n";
import { createTranslator } from "use-intl/core";

const MSG_ICU = "{count, plural, one {# item} other {# items}} in {name}";
const MSG_VUE = "{count} item in {name} | {count} items in {name}"; // vue-i18n pipe plural, its own syntax
const N_WARM = 200_000,
  N_COLD = 20_000,
  ROUNDS = 7;

function bench(label, fn, n) {
  // warmup
  for (let i = 0; i < Math.min(n, 5000); i++) fn(i);
  const times = [];
  for (let r = 0; r < ROUNDS; r++) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < n; i++) fn(i);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  const med = times[Math.floor(ROUNDS / 2)];
  console.log(
    `${label.padEnd(44)} median ${med.toFixed(1).padStart(8)} ms  ${(((n / med) * 1000) / 1e6).toFixed(2).padStart(6)} M ops/s`,
  );
}

// ---- warm ----
console.log(`\n## warm: same key, ${N_WARM} calls (plural + param)`);
{
  const i18n = createI18n({
    locale: "en",
    messages: { en: { m: MSG_ICU } },
    compiler: icuCompiler,
  });
  const r = i18n.t("m", { count: 2, name: "cart" });
  if (r !== "2 items in cart") throw new Error("comvi: " + r);
  bench("@comvi/core + icuCompiler", (i) => i18n.t("m", { count: i & 3, name: "cart" }), N_WARM);
}
{
  const mf = new IntlMessageFormat(MSG_ICU, "en");
  const r = mf.format({ count: 2, name: "cart" });
  if (r !== "2 items in cart") throw new Error("imf: " + r);
  bench(
    "intl-messageformat (instance reused)",
    (i) => mf.format({ count: i & 3, name: "cart" }),
    N_WARM,
  );
}
{
  await i18next.use(ICU).init({ lng: "en", resources: { en: { translation: { m: MSG_ICU } } } });
  const r = i18next.t("m", { count: 2, name: "cart" });
  if (r !== "2 items in cart") throw new Error("i18next-icu: " + r);
  bench("i18next + i18next-icu", (i) => i18next.t("m", { count: i & 3, name: "cart" }), N_WARM);
}
{
  const t = createTranslator({ locale: "en", messages: { m: MSG_ICU } });
  const r = t("m", { count: 2, name: "cart" });
  if (r !== "2 items in cart") throw new Error("use-intl: " + r);
  bench("use-intl/core createTranslator", (i) => t("m", { count: i & 3, name: "cart" }), N_WARM);
}
{
  const v = createVueI18n({ legacy: false, locale: "en", messages: { en: { m: MSG_VUE } } });
  const r = v.global.t("m", { count: 2, name: "cart" }, 2);
  if (r !== "2 items in cart") throw new Error("vue-i18n: " + r);
  bench(
    "vue-i18n (pipe plural, own syntax)",
    (i) => v.global.t("m", { count: i & 3, name: "cart" }, i & 3),
    N_WARM,
  );
}
{
  const i18n = createI18n({ locale: "en", messages: { en: { m: "{count} items in {name}" } } });
  bench(
    "@comvi/core simple compiler (no ICU, same text)",
    (i) => i18n.t("m", { count: i & 3, name: "cart" }),
    N_WARM,
  );
}

// ---- cold ----
console.log(`\n## cold: new message string every call (parse + format), ${N_COLD} calls`);
const fresh = (i) => `{count, plural, one {# item} other {# items}} in {name} ${i}`;
{
  bench(
    "@comvi/core icuCompiler (compile + run)",
    (i) => {
      const i18n = createI18n({
        locale: "en",
        messages: { en: { m: fresh(i) } },
        compiler: icuCompiler,
      });
      return i18n.t("m", { count: 2, name: "cart" });
    },
    N_COLD,
  );
}
{
  bench(
    "intl-messageformat (new instance + format)",
    (i) => new IntlMessageFormat(fresh(i), "en").format({ count: 2, name: "cart" }),
    N_COLD,
  );
}
{
  bench(
    "use-intl/core (new translator + call)",
    (i) =>
      createTranslator({ locale: "en", messages: { m: fresh(i) } })("m", {
        count: 2,
        name: "cart",
      }),
    N_COLD,
  );
}
{
  bench(
    "vue-i18n (new instance + call, pipe plural)",
    (i) =>
      createVueI18n({
        legacy: false,
        locale: "en",
        messages: { en: { m: `{count} item in {name} ${i} | {count} items in {name} ${i}` } },
      }).global.t("m", { count: 2, name: "cart" }, 2),
    N_COLD,
  );
}
console.log(
  "\nnode",
  process.version,
  "| comvi core 0.5.0 | intl-messageformat 12.1.3 | i18next 26.4.3 + i18next-icu 2.5.0 | use-intl 4.14.9 | vue-i18n 11.4.14",
);
