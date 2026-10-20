// ICU runtime micro-benchmark on PUBLISHED packages, Node, production mode.
// Run as: NODE_ENV=production node bench.mjs   (the script refuses to run otherwise)
//
// Scenarios, each on the same message text for every library:
//   warm, static key    t("key") on a message with no parameters; the most common call in a UI.
//   warm, one parameter t("key", { name }) on "Hello, {name}!" ("{{name}}" in i18next's own syntax).
//   warm, equal work   the count is passed pre-formatted as {n}; both branches interpolate it, so every
//                      library does the same job (plural selection + interpolation) and none of them
//                      formats a number.
//   warm, same output  the `#` message, written the same way on every library. From @comvi/core 0.6.0
//                      Comvi formats `#` for the locale as ICU MessageFormat defines it, so the plain
//                      `#` message is the equal-work, equal-output row; a second Comvi row passes the
//                      count through formatNumber() into {n}, the shape 0.5.0 needed, for comparison.
//                      Every library produces the same localized string ("1,234 items in cart").
//   warm, small count  the same `#` message with counts 0..3, the integers Comvi's `#` serves from its
//                      fast path; both sides localize `#`, so this is equal work on a short number.
//   catalog            one instance per library holding N distinct messages; every message is formatted
//                      exactly once per round. Message ids are unique across warmup and rounds so no
//                      module-level cache from an earlier round can serve a later one; they restart at the
//                      same fixed width for every library, and one message of a fresh catalog is asserted
//                      before timing. This is the
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

// Printed before any timing, so a result file says on sight which Node took it and how busy
// the machine was. A loaded machine makes these numbers meaningless: a run taken above a load
// average of about 4 is not comparable with a quiet one and should be taken again.
console.log(
  `node ${process.version} | ${os.platform()} ${os.arch()} | ${os.cpus()[0]?.model ?? "cpu ?"} | NODE_ENV=${process.env.NODE_ENV} | load ${os
    .loadavg()
    .map((n) => n.toFixed(2))
    .join(" ")} | ${new Date().toISOString()}`,
);

const EQUAL = "{count, plural, one {{n} item} other {{n} items}} in {name}";
const HASH = "{count, plural, one {# item} other {# items}} in {name}";
const VUE_EQUAL = "{n} item in {name} | {n} items in {name}"; // vue-i18n has no ICU; its pipe plural
const N_START = 200_000, // only where calibration starts; it scales up from here
  ROUNDS = 7,
  CATALOG = 5_000,
  // Every timed sample is scaled until it spans at least this long. A sample of a few
  // milliseconds cannot average out one scheduler slice taken by something else on the machine:
  // that is what made the short rows of this benchmark swing 20 % between runs while the long
  // ones held inside 2 %. The work per call is identical on every library, so only the NUMBER of
  // calls differs between them, and the reported figure is a rate, which that does not change.
  // A fast library simply gets the iterations it needs to be measured as precisely as a slow one.
  TARGET_MS = 500,
  // Ceiling on the cold instances one catalog sample may build, and the id width that follows
  // from it. A catalog id is part of the message text, which is what the compiler caches on, so
  // every id has to be the same number of characters or the later messages of a long run would
  // parse longer text than the earlier ones. The width is derived from the ceiling rather than
  // guessed: at MAX_BLOCKS, one library consumes CATALOG * (1 assertion + 2*MAX_BLOCKS
  // calibration + MAX_BLOCKS warmup + ROUNDS*MAX_BLOCKS timed) ids, and ID_WIDTH is wide enough
  // to write that number. Below the ceiling it is wider than needed, which costs nothing because
  // it is the same for every library.
  MAX_BLOCKS = 4096;

// Doubles `n` until one pass of `fn` takes at least TARGET_MS, starting from `n0`. The
// calibration passes also serve as warmup, and their timings are thrown away.
const ID_WIDTH = String(CATALOG * (1 + 3 * MAX_BLOCKS + ROUNDS * MAX_BLOCKS)).length;

function calibrate(fn, n0) {
  let n = n0;
  for (;;) {
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < n; i++) fn(i);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms >= TARGET_MS || n >= 1e9) return n;
    // Aim straight at the target from what this pass measured, then at least double, so a
    // pathologically slow first pass cannot make the loop crawl upwards.
    n = Math.max(n * 2, Math.ceil((n * TARGET_MS * 1.1) / Math.max(ms, 0.001)));
  }
}

function bench(label, fn, n0 = 200_000) {
  // Calibration can undershoot: if the pass that reached TARGET_MS was itself slowed by
  // something else on the machine, the n it settles on is too small, and the timed rounds then
  // come out under the window on a quieter moment. So the window is checked against the result,
  // not against the calibration, and n is raised until the reported median really spans it.
  let n = calibrate(fn, n0);
  let times, med;
  for (let retry = 0; ; retry++) {
    times = [];
    for (let r = 0; r < ROUNDS; r++) {
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < n; i++) fn(i);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    times.sort((a, b) => a - b);
    med = times[Math.floor(ROUNDS / 2)];
    if (med >= TARGET_MS || retry >= 3 || n >= 1e9) break;
    n = Math.ceil((n * TARGET_MS * 1.1) / med);
  }
  console.log(
    `${label.padEnd(58)} median ${med.toFixed(1).padStart(8)} ms  ${(((n / med) * 1000) / 1e6).toFixed(2).padStart(6)} M ops/s   n=${n}`,
  );
}
// Catalog scenario: `make(ids)` builds one instance holding the messages for the given ids and
// returns a function formatting message `id`. One sample builds BLOCKS such instances, each from
// its own block of CATALOG ids that no instance in this process has seen before, and times the
// whole lot; BLOCKS is scaled per library until the sample spans TARGET_MS.
//
// The ids must be disjoint between blocks, not merely fresh per sample. @comvi/core's compiled
// templates live in one process-global FIFO, so repeating a block would warm it and the later
// repetitions would stop measuring a cold catalog. With disjoint ids nothing can hit, and since
// one block of 5,000 messages already overflows that 1,000-entry FIFO, messages inside a single
// block evict each other as well: "cold" here means every message is compiled, which is the
// case the row is about.
function benchCatalog(label, make, want) {
  // Ids are unique across this library's calibration, warmup and rounds, and restart at 0 for
  // every library, so no library parses systematically longer text. See ID_WIDTH: the 6-digit pad
  // this used while a sample was one block stopped padding at 1,000,000, and scaling to a 500 ms
  // window costs millions of ids per library, so it would have made the later messages of a long
  // run one character longer than the earlier ones.
  let uid = 0;
  const nextIds = () =>
    Array.from({ length: CATALOG }, () => `m${String(uid++).padStart(ID_WIDTH, "0")}`);
  // Correctness first: the library must render one message of a fresh catalog correctly
  // before any timing; a fallback path would otherwise look like a fast result.
  {
    const ids = nextIds();
    const got = make(ids)(ids[7]);
    if (got !== want(ids[7]))
      throw new Error(`${label}: ${JSON.stringify(got)} != ${JSON.stringify(want(ids[7]))}`);
  }
  const sample = (blocks) => {
    const idSets = Array.from({ length: blocks }, nextIds);
    const t0 = process.hrtime.bigint();
    for (const ids of idSets) {
      const t = make(ids);
      for (const id of ids) t(id);
    }
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };
  let blocks = 1;
  for (;;) {
    const ms = sample(blocks);
    if (ms >= TARGET_MS || blocks >= MAX_BLOCKS) break;
    blocks = Math.max(blocks * 2, Math.ceil((blocks * TARGET_MS * 1.1) / Math.max(ms, 0.001)));
  }
  // As in bench(): the window is checked against the timed result, not against the calibration.
  let times, med;
  for (let retry = 0; ; retry++) {
    sample(blocks); // warmup at this size; its ids are never reused either
    times = Array.from({ length: ROUNDS }, () => sample(blocks)).sort((a, b) => a - b);
    med = times[Math.floor(ROUNDS / 2)];
    if (med >= TARGET_MS || retry >= 3 || blocks >= MAX_BLOCKS) break;
    blocks = Math.min(MAX_BLOCKS, Math.ceil((blocks * TARGET_MS * 1.1) / med));
  }
  const msgs = CATALOG * blocks;
  console.log(
    `${label.padEnd(58)} median ${med.toFixed(1).padStart(8)} ms  ${(((msgs / med) * 1000) / 1e3).toFixed(1).padStart(6)} K msgs/s   n=${msgs}`,
  );
}
const expect = (label, got, want) => {
  if (got !== want) throw new Error(`${label}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
};
const P = { count: 2, n: "2", name: "cart" };

console.log(`\n## warm, equal work: the same key, count pre-formatted as {n}; n per library below`);
{
  const i18n = createI18n({ locale: "en", messages: { en: { m: EQUAL } }, compiler: icuCompiler });
  expect("comvi", i18n.t("m", P), "2 items in cart");
  bench("@comvi/core + icuCompiler", (i) =>
    i18n.t("m", { count: i & 3, n: String(i & 3), name: "cart" }),
  );
}
{
  const mf = new IntlMessageFormat(EQUAL, "en");
  expect("imf", mf.format(P), "2 items in cart");
  bench("intl-messageformat (instance reused)", (i) =>
    mf.format({ count: i & 3, n: String(i & 3), name: "cart" }),
  );
}
{
  await i18next.use(ICU).init({ lng: "en", resources: { en: { translation: { m: EQUAL } } } });
  expect("i18next-icu", i18next.t("m", P), "2 items in cart");
  bench("i18next + i18next-icu", (i) =>
    i18next.t("m", { count: i & 3, n: String(i & 3), name: "cart" }),
  );
}
{
  const t = createTranslator({ locale: "en", messages: { m: EQUAL } });
  expect("use-intl", t("m", P), "2 items in cart");
  bench("use-intl/core createTranslator", (i) =>
    t("m", { count: i & 3, n: String(i & 3), name: "cart" }),
  );
}
{
  const v = createVueI18n({ legacy: false, locale: "en", messages: { en: { m: VUE_EQUAL } } });
  expect("vue-i18n", v.global.t("m", P, 2), "2 items in cart");
  bench("vue-i18n (pipe plural, own syntax)", (i) =>
    v.global.t("m", { n: String(i & 3), name: "cart" }, i & 3),
  );
}

console.log(
  `\n## warm, static key: the same key, message "Saved" with no parameters; n per library below`,
);
{
  const i18n = createI18n({ locale: "en", messages: { en: { s: "Saved", g: "Hello, {name}!" } } });
  expect("comvi static", i18n.t("s"), "Saved");
  bench("@comvi/core, simple compiler", () => i18n.t("s"));
}
{
  const i18nIcu = createI18n({
    locale: "en",
    messages: { en: { s: "Saved", g: "Hello, {name}!" } },
    compiler: icuCompiler,
  });
  expect("comvi icu static", i18nIcu.t("s"), "Saved");
  bench("@comvi/core + icuCompiler", () => i18nIcu.t("s"));
}
{
  const mf = new IntlMessageFormat("Saved", "en");
  expect("imf static", mf.format(), "Saved");
  bench("intl-messageformat (instance reused)", () => mf.format());
}
{
  const inst = i18next.createInstance();
  await inst.init({
    lng: "en",
    resources: { en: { translation: { s: "Saved", g: "Hello, {{name}}!" } } },
  });
  expect("i18next static", inst.t("s"), "Saved");
  bench("i18next (no plugins)", () => inst.t("s"));
}
{
  const t = createTranslator({ locale: "en", messages: { s: "Saved", g: "Hello, {name}!" } });
  expect("use-intl static", t("s"), "Saved");
  bench("use-intl/core createTranslator", () => t("s"));
}
{
  const v = createVueI18n({
    legacy: false,
    locale: "en",
    messages: { en: { s: "Saved", g: "Hello, {name}!" } },
  });
  expect("vue-i18n static", v.global.t("s"), "Saved");
  bench("vue-i18n", () => v.global.t("s"));
}

console.log(
  `\n## warm, one parameter: the same key, "Hello, {name}!" with a changing name; n per library below`,
);
const NAMES = ["Ann", "Bo", "Cy", "Di"];
{
  const i18n = createI18n({ locale: "en", messages: { en: { g: "Hello, {name}!" } } });
  expect("comvi param", i18n.t("g", { name: "Ann" }), "Hello, Ann!");
  bench("@comvi/core, simple compiler", (i) => i18n.t("g", { name: NAMES[i & 3] }));
}
{
  const i18nIcu = createI18n({
    locale: "en",
    messages: { en: { g: "Hello, {name}!" } },
    compiler: icuCompiler,
  });
  expect("comvi icu param", i18nIcu.t("g", { name: "Ann" }), "Hello, Ann!");
  bench("@comvi/core + icuCompiler", (i) => i18nIcu.t("g", { name: NAMES[i & 3] }));
}
{
  const mf = new IntlMessageFormat("Hello, {name}!", "en");
  expect("imf param", mf.format({ name: "Ann" }), "Hello, Ann!");
  bench("intl-messageformat (instance reused)", (i) => mf.format({ name: NAMES[i & 3] }));
}
{
  const inst = i18next.createInstance();
  await inst.init({ lng: "en", resources: { en: { translation: { g: "Hello, {{name}}!" } } } });
  expect("i18next param", inst.t("g", { name: "Ann" }), "Hello, Ann!");
  bench("i18next (no plugins), {{name}}", (i) => inst.t("g", { name: NAMES[i & 3] }));
}
{
  const t = createTranslator({ locale: "en", messages: { g: "Hello, {name}!" } });
  expect("use-intl param", t("g", { name: "Ann" }), "Hello, Ann!");
  bench("use-intl/core createTranslator", (i) => t("g", { name: NAMES[i & 3] }));
}
{
  const v = createVueI18n({
    legacy: false,
    locale: "en",
    messages: { en: { g: "Hello, {name}!" } },
  });
  expect("vue-i18n param", v.global.t("g", { name: "Ann" }), "Hello, Ann!");
  bench("vue-i18n, {name}", (i) => v.global.t("g", { name: NAMES[i & 3] }));
}

console.log(
  `\n## warm, same output: the same key, count 1234..1237, localized digits on every side; n per library below`,
);
const BIG = (i) => 1234 + (i & 3);
{
  // From @comvi/core 0.6.0 `#` is formatted for the locale, so the plain `#` message is what a
  // Comvi app writes and what the other libraries are measured on: same message, same output.
  const i18n = createI18n({ locale: "en", messages: { en: { m: HASH } }, compiler: icuCompiler });
  expect("comvi same output, #", i18n.t("m", { count: 1234, name: "cart" }), "1,234 items in cart");
  bench("@comvi/core + icuCompiler, #", (i) => i18n.t("m", { count: BIG(i), name: "cart" }));
}
{
  // The shape 0.5.0 needed for a localized count, kept for comparison with the row above.
  const i18n = createI18n({ locale: "en", messages: { en: { m: EQUAL } }, compiler: icuCompiler });
  expect(
    "comvi same output",
    i18n.t("m", { count: 1234, n: formatNumber(i18n, 1234), name: "cart" }),
    "1,234 items in cart",
  );
  bench("@comvi/core + icuCompiler, formatNumber() into {n}", (i) =>
    i18n.t("m", { count: BIG(i), n: formatNumber(i18n, BIG(i)), name: "cart" }),
  );
}
{
  const mf = new IntlMessageFormat(HASH, "en");
  expect("imf same output", mf.format({ count: 1234, name: "cart" }), "1,234 items in cart");
  bench("intl-messageformat (instance reused), #", (i) =>
    mf.format({ count: BIG(i), name: "cart" }),
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
  bench("i18next + i18next-icu, #", (i) => inst.t("m", { count: BIG(i), name: "cart" }));
}
{
  const t = createTranslator({ locale: "en", messages: { m: HASH } });
  expect("use-intl same output", t("m", { count: 1234, name: "cart" }), "1,234 items in cart");
  bench("use-intl/core createTranslator, #", (i) => t("m", { count: BIG(i), name: "cart" }));
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
  bench("vue-i18n (pipe plural), n(x, 'decimal') into {n}", (i) =>
    v.global.t("m", { n: v.global.n(BIG(i), "decimal"), name: "cart" }, BIG(i)),
  );
}

console.log(
  `\n## warm, small count: the same # message with counts 0..3; both sides localize #, equal work`,
);
{
  const i18n = createI18n({ locale: "en", messages: { en: { m: HASH } }, compiler: icuCompiler });
  expect("comvi #", i18n.t("m", P), "2 items in cart");
  bench("@comvi/core + icuCompiler, #", (i) => i18n.t("m", { count: i & 3, name: "cart" }));
}
{
  const mf = new IntlMessageFormat(HASH, "en");
  expect("imf #", mf.format(P), "2 items in cart");
  bench("intl-messageformat (instance reused), #", (i) =>
    mf.format({ count: i & 3, name: "cart" }),
  );
}

console.log(
  `\n## catalog: ${CATALOG} distinct messages per instance, formatted once each (parse + format), every id compiled once in this process; instances per sample below`,
);
const text = (id) => `{count, plural, one {{n} item} other {{n} items}} in {name} ${id}`;
benchCatalog(
  "@comvi/core + icuCompiler",
  (ids) => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: Object.fromEntries(ids.map((id) => [id, text(id)])) },
      compiler: icuCompiler,
    });
    return (id) => i18n.t(id, P);
  },
  (id) => `2 items in cart ${id}`,
);
benchCatalog(
  "intl-messageformat, new instance per message, shared formatters",
  (ids) => {
    const shared = new IntlMessageFormat("x", "en").formatters;
    const msgs = Object.fromEntries(ids.map((id) => [id, text(id)]));
    return (id) =>
      new IntlMessageFormat(msgs[id], "en", undefined, { formatters: shared }).format(P);
  },
  (id) => `2 items in cart ${id}`,
);
benchCatalog(
  "intl-messageformat, new instance per message, default formatters",
  (ids) => {
    const msgs = Object.fromEntries(ids.map((id) => [id, text(id)]));
    return (id) => new IntlMessageFormat(msgs[id], "en").format(P);
  },
  (id) => `2 items in cart ${id}`,
);
benchCatalog(
  "i18next + i18next-icu, one instance",
  (ids) => {
    const inst = i18next.createInstance();
    inst.use(ICU).init({
      lng: "en",
      initImmediate: false,
      resources: { en: { translation: Object.fromEntries(ids.map((id) => [id, text(id)])) } },
    });
    return (id) => inst.t(id, P);
  },
  (id) => `2 items in cart ${id}`,
);
benchCatalog(
  "use-intl/core, one translator",
  (ids) => {
    const t = createTranslator({
      locale: "en",
      messages: Object.fromEntries(ids.map((id) => [id, text(id)])),
    });
    return (id) => t(id, P);
  },
  (id) => `2 items in cart ${id}`,
);
benchCatalog(
  "vue-i18n, one instance (pipe plural)",
  (ids) => {
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
  },
  (id) => `2 items in cart ${id}`,
);

console.log(
  `\nnode ${process.version} | ${os.platform()} ${os.arch()} | ${os.cpus()[0]?.model ?? "cpu ?"} | NODE_ENV=${process.env.NODE_ENV} | load at end ${os
    .loadavg()
    .map((n) => n.toFixed(2))
    .join(" ")}`,
);
// The versions are read from the packages this run actually loaded, so the line can never
// name a version other than the one measured.
const { readFileSync } = await import("node:fs");
const installed = (name) =>
  `${name} ${JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")).version}`;
console.log(
  [
    installed("@comvi/core"),
    installed("intl-messageformat"),
    `${installed("i18next")} + ${installed("i18next-icu")}`,
    installed("use-intl"),
    installed("vue-i18n"),
  ].join(" | "),
);
