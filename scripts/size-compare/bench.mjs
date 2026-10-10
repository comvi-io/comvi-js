// ICU runtime micro-benchmark on PUBLISHED packages, Node, production mode.
// Run as: NODE_ENV=production node bench.mjs   (the script refuses to run otherwise)
//
// Scenarios, each on the same message text for every library that speaks ICU:
//   warm, equal work   the count is passed pre-formatted as {n}; both branches interpolate it, so every
//                      library does the same job (plural selection + interpolation). Comvi's `#` is
//                      inserted as plain digits while intl-messageformat localizes it, so a `#` message
//                      would make the libraries do different work; the "default #" row shows that case.
//   warm, same output  the `#` message on the libraries that localize `#`; Comvi formats the count with its own
//                      formatNumber() (Intl.NumberFormat, cached) and passes it as {n}. Every library produces the
//                      same localized string ("1,234 items in cart"), so the work and the output are equal.
//   warm, default #    the same message written with `#`, as a user would write it; unequal work by design.
//   catalog            one instance per library holding N distinct messages; every message is formatted
//                      exactly once per round. Message ids are unique across warmup and rounds so no
//                      module-level cache from an earlier round can serve a later one. This is the
//                      "first render of a catalog" case: parse plus format, once per message.
// Medians of ROUNDS rounds are printed; run the script three times and keep each output.
if (process.env.NODE_ENV !== "production") {
  console.error("Run with NODE_ENV=production so every library takes its production branch.");
  process.exit(1);
}
const { createI18n, formatNumber } = await import("@comvi/core");
const { icuCompiler } = await import("@comvi/core/icu");
const { IntlMessageFormat } = await import("intl-messageformat");
const i18next = (await import("i18next")).default;
const ICU = (await import("i18next-icu")).default;
const { createI18n: createVueI18n } = await import("vue-i18n");
const { createTranslator } = await import("use-intl/core");
const os = await import("node:os");

const EQUAL = "{count, plural, one {{n} item} other {{n} items}} in {name}";
const HASH = "{count, plural, one {# item} other {# items}} in {name}";
const VUE_EQUAL = "{n} item in {name} | {n} items in {name}"; // vue-i18n has no ICU; its pipe plural
const N_WARM = 200_000,
  ROUNDS = 7,
  CATALOG = 5_000;
let uid = 0;

function bench(label, fn, n) {
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
    `${label.padEnd(58)} median ${med.toFixed(1).padStart(8)} ms  ${(((n / med) * 1000) / 1e6).toFixed(2).padStart(6)} M ops/s`,
  );
}
// Catalog scenario: `make(ids)` builds one instance holding the messages for the given ids and
// returns a function formatting message `id`; a fresh set of ids is generated for every round.
function benchCatalog(label, make) {
  const run = () => {
    const ids = Array.from({ length: CATALOG }, () => `m${uid++}`);
    const t0 = process.hrtime.bigint();
    const t = make(ids);
    for (const id of ids) t(id);
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };
  run(); // warmup, its ids are never reused
  const times = Array.from({ length: ROUNDS }, run).sort((a, b) => a - b);
  const med = times[Math.floor(ROUNDS / 2)];
  console.log(
    `${label.padEnd(58)} median ${med.toFixed(1).padStart(8)} ms  ${(((CATALOG / med) * 1000) / 1e3).toFixed(1).padStart(6)} K msgs/s`,
  );
}
const expect = (label, got, want) => {
  if (got !== want) throw new Error(`${label}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
};
const P = { count: 2, n: "2", name: "cart" };

console.log(`\n## warm, equal work: same key ${N_WARM} times, count pre-formatted as {n}`);
{
  const i18n = createI18n({ locale: "en", messages: { en: { m: EQUAL } }, compiler: icuCompiler });
  expect("comvi", i18n.t("m", P), "2 items in cart");
  bench(
    "@comvi/core + icuCompiler",
    (i) => i18n.t("m", { count: i & 3, n: String(i & 3), name: "cart" }),
    N_WARM,
  );
}
{
  const mf = new IntlMessageFormat(EQUAL, "en");
  expect("imf", mf.format(P), "2 items in cart");
  bench(
    "intl-messageformat (instance reused)",
    (i) => mf.format({ count: i & 3, n: String(i & 3), name: "cart" }),
    N_WARM,
  );
}
{
  await i18next.use(ICU).init({ lng: "en", resources: { en: { translation: { m: EQUAL } } } });
  expect("i18next-icu", i18next.t("m", P), "2 items in cart");
  bench(
    "i18next + i18next-icu",
    (i) => i18next.t("m", { count: i & 3, n: String(i & 3), name: "cart" }),
    N_WARM,
  );
}
{
  const t = createTranslator({ locale: "en", messages: { m: EQUAL } });
  expect("use-intl", t("m", P), "2 items in cart");
  bench(
    "use-intl/core createTranslator",
    (i) => t("m", { count: i & 3, n: String(i & 3), name: "cart" }),
    N_WARM,
  );
}
{
  const v = createVueI18n({ legacy: false, locale: "en", messages: { en: { m: VUE_EQUAL } } });
  expect("vue-i18n", v.global.t("m", P, 2), "2 items in cart");
  bench(
    "vue-i18n (pipe plural, own syntax)",
    (i) => v.global.t("m", { n: String(i & 3), name: "cart" }, i & 3),
    N_WARM,
  );
}

console.log(
  `\n## warm, same output: same key ${N_WARM} times, count 1234..1237, localized digits on every side`,
);
const BIG = (i) => 1234 + (i & 3);
{
  const i18n = createI18n({ locale: "en", messages: { en: { m: EQUAL } }, compiler: icuCompiler });
  expect(
    "comvi same output",
    i18n.t("m", { count: 1234, n: formatNumber(i18n, 1234), name: "cart" }),
    "1,234 items in cart",
  );
  bench(
    "@comvi/core + icuCompiler, formatNumber() into {n}",
    (i) => i18n.t("m", { count: BIG(i), n: formatNumber(i18n, BIG(i)), name: "cart" }),
    N_WARM,
  );
}
{
  const mf = new IntlMessageFormat(HASH, "en");
  expect("imf same output", mf.format({ count: 1234, name: "cart" }), "1,234 items in cart");
  bench(
    "intl-messageformat (instance reused), #",
    (i) => mf.format({ count: BIG(i), name: "cart" }),
    N_WARM,
  );
}
{
  const inst = i18next.createInstance();
  await inst.use(ICU).init({ lng: "en", resources: { en: { translation: { m: HASH } } } });
  expect(
    "i18next-icu same output",
    inst.t("m", { count: 1234, name: "cart" }),
    "1,234 items in cart",
  );
  bench("i18next + i18next-icu, #", (i) => inst.t("m", { count: BIG(i), name: "cart" }), N_WARM);
}
{
  const t = createTranslator({ locale: "en", messages: { m: HASH } });
  expect("use-intl same output", t("m", { count: 1234, name: "cart" }), "1,234 items in cart");
  bench(
    "use-intl/core createTranslator, #",
    (i) => t("m", { count: BIG(i), name: "cart" }),
    N_WARM,
  );
}
{
  // A named number format is vue-i18n's documented, cached path; n(value) with no name is ~8x slower.
  const v = createVueI18n({
    legacy: false,
    locale: "en",
    messages: { en: { m: VUE_EQUAL } },
    numberFormats: { en: { decimal: { style: "decimal" } } },
  });
  expect(
    "vue-i18n same output",
    v.global.t("m", { n: v.global.n(1234, "decimal"), name: "cart" }, 1234),
    "1,234 items in cart",
  );
  bench(
    "vue-i18n (pipe plural), n(x, 'decimal') into {n}",
    (i) => v.global.t("m", { n: v.global.n(BIG(i), "decimal"), name: "cart" }, BIG(i)),
    N_WARM,
  );
}

console.log(
  `\n## warm, default #: same key ${N_WARM} times, # inserted by the library (Comvi: plain digits; others: localized)`,
);
{
  const i18n = createI18n({ locale: "en", messages: { en: { m: HASH } }, compiler: icuCompiler });
  expect("comvi #", i18n.t("m", P), "2 items in cart");
  bench("@comvi/core + icuCompiler, #", (i) => i18n.t("m", { count: i & 3, name: "cart" }), N_WARM);
}
{
  const mf = new IntlMessageFormat(HASH, "en");
  expect("imf #", mf.format(P), "2 items in cart");
  bench(
    "intl-messageformat (instance reused), #",
    (i) => mf.format({ count: i & 3, name: "cart" }),
    N_WARM,
  );
}

console.log(
  `\n## catalog: one instance, ${CATALOG} distinct messages formatted once each (parse + format), fresh ids every round`,
);
const text = (id) => `{count, plural, one {{n} item} other {{n} items}} in {name} ${id}`;
benchCatalog("@comvi/core + icuCompiler", (ids) => {
  const i18n = createI18n({
    locale: "en",
    messages: { en: Object.fromEntries(ids.map((id) => [id, text(id)])) },
    compiler: icuCompiler,
  });
  return (id) => i18n.t(id, P);
});
benchCatalog("intl-messageformat, new instance per message, shared formatters", (ids) => {
  const shared = new IntlMessageFormat("x", "en").formatters;
  const msgs = Object.fromEntries(ids.map((id) => [id, text(id)]));
  return (id) => new IntlMessageFormat(msgs[id], "en", undefined, { formatters: shared }).format(P);
});
benchCatalog("intl-messageformat, new instance per message, default formatters", (ids) => {
  const msgs = Object.fromEntries(ids.map((id) => [id, text(id)]));
  return (id) => new IntlMessageFormat(msgs[id], "en").format(P);
});
benchCatalog("i18next + i18next-icu, one instance", (ids) => {
  const inst = i18next.createInstance();
  inst.use(ICU).init({
    lng: "en",
    initImmediate: false,
    resources: { en: { translation: Object.fromEntries(ids.map((id) => [id, text(id)])) } },
  });
  return (id) => inst.t(id, P);
});
benchCatalog("use-intl/core, one translator", (ids) => {
  const t = createTranslator({
    locale: "en",
    messages: Object.fromEntries(ids.map((id) => [id, text(id)])),
  });
  return (id) => t(id, P);
});
benchCatalog("vue-i18n, one instance (pipe plural)", (ids) => {
  const v = createVueI18n({
    legacy: false,
    locale: "en",
    messages: {
      en: Object.fromEntries(
        ids.map((id) => [id, `{n} item in {name} ${id} | {n} items in {name} ${id}`]),
      ),
    },
  });
  return (id) => v.global.t(id, P, 2);
});

console.log(
  `\nnode ${process.version} | ${os.platform()} ${os.arch()} | ${os.cpus()[0]?.model ?? "cpu ?"} | NODE_ENV=${process.env.NODE_ENV}`,
);
console.log(
  "comvi core 0.5.0 | intl-messageformat 12.1.3 | i18next 26.4.3 + i18next-icu 2.5.0 | use-intl 4.14.9 | vue-i18n 11.4.14",
);
