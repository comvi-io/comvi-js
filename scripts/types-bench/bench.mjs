// Type-checking cost of @comvi/core's typed `t()` (synthesis §2.3 / R4-5 gates).
//
//   node scripts/types-bench/bench.mjs [--rounds 3]   gate run (pnpm check:types-bench)
//   node scripts/types-bench/bench.mjs --red <variant> the same gates over a planted
//                                                     regression (r3-1 | per-call |
//                                                     jsx-guard | vue-guard); exits
//                                                     0 only if ITS gate fails
//
// Probes (2 namespaces, 300 calls a third with `ns`, every fifth with `locale`) are
// generated over packages/core/src/types.ts by gen.mjs and checked with the repo's tsc
// (--extendedDiagnostics, its own Check/Total time). Rounds are interleaved so machine
// load drifts across probes evenly; the gate reads medians.
//
// BLOCKING gates are COUNTS of checker work — they do not depend on the runner (owner
// rule: no wall-clock blocking gates):
//   per-call instantiations   app300 − app2 @ 20k ≤ 50K (R4-5)
//   per-call union inputs     app300 − app2 @ 20k ≤ 50K (count-work.cjs: what R3-1's
//                             `keyof Catalogs[N]` rebuilds on every call)
//   counted scaling           per-call union inputs @20k / @5k ≤ 1.5× (R4-5's scaling
//                             gate, counted: flat when the key union is cached)
//   key typo                  typo20k − app2 @ 20k instantiations ≤ 50K (R3-2: a typo
//                             must not intersect every key's params)
//   Vue (lot 4)               vue / vueTypo − vueBase @ 5k and @ 20k, checked by vue-tsc:
//                             instantiations ≤ 50K and NestChecks ≤ 50K — `t()`, the bound
//                             `t()`, `$t()` in a template and `<T>` / the bound `<T>` elements
//                             of a .vue file carry the same typo guard (TComponentFor /
//                             BoundTFor with the slot flag); a capped probe fails them.
//   JSX <T>                   jsx20k / jsxTypo20k − app2 @ 20k: instantiations ≤ 50K and
//                             relation-stack checks (NestChecks, count-work.cjs) ≤ 50K — the
//                             component signature's typo guard (lot 3 review, BLOCK 1: without
//                             it a valid or misspelt `<T i18nKey>` took minutes at 5k keys;
//                             the time is in NestChecks, the other counters stay flat). A
//                             probe that hits the counted work cap fails these gates.
//   memory @ 20k ≤ 250 MB, and the probes compile with exactly the expected errors.
// INFORMATIONAL (seconds, printed, never failing): check @20k ≤ 1.0 s, typo total ≤ 5 s,
// check 5k → 20k ≤ 2.5×. Lot 0 (S2, M1 Max): 0.23 s @5k, 0.44 s @20k, typo 0.57 s.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateProbe, TSC, TYPES_SOURCE, VUE_TSC } from "./gen.mjs";

const args = process.argv.slice(2);
const rounds = Number(args[args.indexOf("--rounds") + 1]) || 3;

const GATES = {
  perCallInst: 50_000,
  perCallUnion: 50_000,
  unionScaling: 1.5,
  typoInst: 50_000,
  jsxInst: 50_000,
  jsxNest: 50_000,
  vueInst: 50_000,
  vueNest: 50_000,
  memMB: 250,
};
const INFO = { check20k: 1.0, typoTotal: 5, scaling: 2.5 };
const COUNT = path.join(path.dirname(fileURLToPath(import.meta.url)), "count-work.cjs");

// Red variants: each plants one known regression into types.ts; the run exits 0 only if
// the gate that exists for that regression FAILS (a gate never seen red is unverified).
const REDS = {
  // R3-1: keys as `keyof Catalogs[N]` instead of the cached mapped `KeysOf[N]` — every
  // call rebuilds the key union (fails the counted union and scaling gates; instantiations
  // do not see it).
  "r3-1": {
    gates: ["union", "unionScaling"],
    edits: [
      [
        "  K extends KeysOf[N] | NotAKey,\n  N extends NsOf = NS,",
        "  K extends keyof Catalogs[N] | NotAKey,\n  N extends NsOf = NS,",
      ],
      [
        "export type ParamsFor<N extends NsOf, K extends KeysOf[N] | NotAKey>",
        "export type ParamsFor<N extends NsOf, K extends keyof Catalogs[N] | NotAKey>",
      ],
    ],
  },
  // A per-call walk over the namespace's key union (fails the counted per-call gate).
  // The component signatures without the typo guard (lot 3 review, BLOCK 1): a `<T>`
  // element intersects every key's params while it types the attributes.
  "jsx-guard": {
    gates: ["jsx:inst", "jsx:nest", "jsxTypo:inst", "jsxTypo:nest"],
    edits: [
      [
        "export type TComponentFor<Out, S = 0, C = never> = <\n  K extends KeysOf[N] | NotAKey,\n  N extends NsOf",
        "export type TComponentFor<Out, S = 0, C = never> = <\n  K extends KeysOf[N],\n  N extends NsOf",
      ],
      [
        "export type BoundTFor<NS extends NsOf, Out, S = 0, C = never> = <K extends KeysOf[NS] | NotAKey>(",
        "export type BoundTFor<NS extends NsOf, Out, S = 0, C = never> = <K extends KeysOf[NS]>(",
      ],
    ],
  },
  // The same unguarded signatures, seen from a .vue file through vue-tsc (lot 4): `<T>`
  // elements in a template and the bound `<T>` hang the checker as JSX does.
  "vue-guard": {
    gates: [
      "vue5k:inst",
      "vue5k:nest",
      "vue20k:inst",
      "vue20k:nest",
      "vueTypo5k:inst",
      "vueTypo5k:nest",
      "vueTypo20k:inst",
      "vueTypo20k:nest",
    ],
    edits: [
      [
        "export type TComponentFor<Out, S = 0, C = never> = <\n  K extends KeysOf[N] | NotAKey,\n  N extends NsOf",
        "export type TComponentFor<Out, S = 0, C = never> = <\n  K extends KeysOf[N],\n  N extends NsOf",
      ],
      [
        "export type BoundTFor<NS extends NsOf, Out, S = 0, C = never> = <K extends KeysOf[NS] | NotAKey>(",
        "export type BoundTFor<NS extends NsOf, Out, S = 0, C = never> = <K extends KeysOf[NS]>(",
      ],
    ],
  },
  "per-call": {
    gates: ["inst"],
    edits: [
      [
        "  : [Catalogs[N][Exclude<K, NotAKey>]] extends [never]",
        "  : [Exclude<KeysOf[N], K>] extends [never]\n    ? never\n    : [Catalogs[N][Exclude<K, NotAKey>]] extends [never]",
      ],
    ],
  },
};
const redArg = args.indexOf("--red");
const red =
  redArg < 0
    ? undefined
    : args[redArg + 1] && !args[redArg + 1].startsWith("--")
      ? args[redArg + 1]
      : "r3-1";
if (red && !REDS[red])
  throw new Error(`--red: unknown variant "${red}" (${Object.keys(REDS).join(", ")})`);

let typesSource = fs.readFileSync(TYPES_SOURCE, "utf8");
if (red) {
  // Every edit must land, or the red run measures nothing.
  for (const [from, to] of REDS[red].edits) {
    if (!typesSource.includes(from))
      throw new Error(`--red ${red}: could not plant (missing: ${JSON.stringify(from)})`);
    typesSource = typesSource.replace(from, to);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-types-bench-"));
const probes = {
  app5k: generateProbe(path.join(tmp, "app5k"), { keys: 5000, kind: "app300", typesSource }).dir,
  app20k: generateProbe(path.join(tmp, "app20k"), { keys: 20000, kind: "app300", typesSource }).dir,
  typo20k: generateProbe(path.join(tmp, "typo20k"), { keys: 20000, kind: "typo", typesSource }).dir,
  file20k: generateProbe(path.join(tmp, "file20k"), { keys: 20000, kind: "app30", typesSource })
    .dir,
  base20k: generateProbe(path.join(tmp, "base20k"), { keys: 20000, kind: "app2", typesSource }).dir,
  base5k: generateProbe(path.join(tmp, "base5k"), { keys: 5000, kind: "app2", typesSource }).dir,
  jsx20k: generateProbe(path.join(tmp, "jsx20k"), { keys: 20000, kind: "jsx", typesSource }).dir,
  jsxTypo20k: generateProbe(path.join(tmp, "jsxTypo20k"), {
    keys: 20000,
    kind: "jsxTypo",
    typesSource,
  }).dir,
  ...Object.fromEntries(
    ["vue", "vueTypo", "vueBase"].flatMap((kind) =>
      [5000, 20000].map((keys) => [
        `${kind}${keys / 1000}k`,
        generateProbe(path.join(tmp, `${kind}${keys / 1000}k`), { keys, kind, typesSource }).dir,
      ]),
    ),
  ),
};
/** The probes vue-tsc checks (their .vue templates); every other probe runs the repo's tsc. */
const checker = (name) => (name.startsWith("vue") ? VUE_TSC : TSC);

const pick = (o, label) => {
  const m = o.match(new RegExp(`^${label}:\\s+([\\d.,]+)`, "m"));
  return m ? +m[1].replace(/,/g, "") : NaN;
};
const runs = Object.fromEntries(Object.keys(probes).map((k) => [k, []]));
const loads = [];
try {
  for (let r = 0; r < rounds; r++)
    for (const [name, dir] of Object.entries(probes)) {
      loads.push(os.loadavg()[0]);
      const o = spawnSync(
        process.execPath,
        // --expose-gc: tsc's sys.getMemoryUsage() collects before it reads the heap, so
        // "Memory used" is the live heap, not whatever garbage the run left behind.
        [
          "--expose-gc",
          "-r",
          COUNT,
          checker(name),
          "-p",
          dir,
          "--extendedDiagnostics",
          "--pretty",
          "false",
        ],
        {
          encoding: "utf8",
          maxBuffer: 1 << 28,
        },
      ).stdout;
      runs[name].push({
        inst: pick(o, "Instantiations"),
        union: pick(o, "UnionInputs"),
        nest: pick(o, "NestChecks"),
        // Stopped by count-work.cjs's counted cap: the probe's work is unbounded.
        capped: /^WorkCap: exceeded/m.test(o),
        mem: pick(o, "Memory used") / 1024,
        check: pick(o, "Check time"),
        total: pick(o, "Total time"),
        errors: (o.match(/error TS/g) || []).length,
      });
    }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const m = Object.fromEntries(
  Object.entries(runs).map(([k, a]) => [
    k,
    {
      inst: a[0].inst,
      union: a[0].union,
      nest: a[0].nest,
      capped: a[0].capped,
      mem: med(a.map((x) => x.mem)),
      check: med(a.map((x) => x.check)),
      total: med(a.map((x) => x.total)),
      errors: a[0].errors,
      all: a.map((x) => x.check),
    },
  ]),
);

const tsVersion = JSON.parse(
  fs.readFileSync(path.join(path.dirname(TSC), "../package.json"), "utf8"),
).version;
console.log(
  `types bench${red ? ` (RED: ${red})` : ""}: tsc ${tsVersion}, node ${process.version}, ${rounds} rounds, ` +
    `load1 ${Math.min(...loads).toFixed(1)}–${Math.max(...loads).toFixed(1)} on ${os.cpus().length} cpus`,
);
console.log(
  "probe      | instantiations | union inputs | mem MB | check s (median) [rounds] | total s | errors",
);
for (const [k, v] of Object.entries(m))
  console.log(
    `${k.padEnd(10)} | ${String(v.capped ? "CAPPED" : v.inst).padStart(14)} | ${String(v.union).padStart(12)} | ${v.mem.toFixed(0).padStart(6)} | ${v.check.toFixed(2)} [${v.all.join(", ")}] | ${v.total.toFixed(2)} | ${v.errors}`,
  );
if ([m.app20k, m.base20k, m.app5k, m.base5k].some((v) => !(v.union > 0)))
  throw new Error(
    "types-bench: count-work.cjs reported no union inputs — the counted gates cannot run",
  );

const perCall = m.app20k.inst - m.base20k.inst;
const perCallUnion20k = m.app20k.union - m.base20k.union;
const perCallUnion5k = m.app5k.union - m.base5k.union;
// BLOCKING: counts only.
const results = [
  ["inst", "instantiations, 298 more calls @20k", perCall, GATES.perCallInst, ""],
  ["union", "union inputs, 298 more calls @20k", perCallUnion20k, GATES.perCallUnion, ""],
  [
    "unionScaling",
    "counted scaling 5k → 20k (per-call union inputs)",
    perCallUnion20k / perCallUnion5k,
    GATES.unionScaling,
    "×",
  ],
  [
    "typo",
    "key typo @20k, instantiations over app2",
    m.typo20k.inst - m.base20k.inst,
    GATES.typoInst,
    "",
  ],
  ...["jsx", "jsxTypo"].flatMap((p) => {
    const v = m[`${p}20k`];
    const what = p === "jsx" ? "JSX <T>, valid keys" : "JSX <T>, key typos";
    // A capped probe never reached the end of its check: its work is unbounded.
    const work = (x) => (v.capped ? Infinity : x);
    return [
      [
        `${p}:inst`,
        `${what} @20k, instantiations over app2`,
        work(v.inst - m.base20k.inst),
        GATES.jsxInst,
        "",
      ],
      [
        `${p}:nest`,
        `${what} @20k, relation-stack checks over app2`,
        work(v.nest - m.base20k.nest),
        GATES.jsxNest,
        "",
      ],
    ];
  }),
  ...["vue", "vueTypo"].flatMap((p) =>
    ["5k", "20k"].flatMap((size) => {
      const v = m[`${p}${size}`];
      const base = m[`vueBase${size}`];
      const what = p === "vue" ? "Vue t/$t/<T>, valid keys" : "Vue t/$t/<T>, key typos";
      const work = (x) => (v.capped || base.capped ? Infinity : x);
      return [
        [
          `${p}${size}:inst`,
          `${what} @${size}, instantiations over vueBase`,
          work(v.inst - base.inst),
          GATES.vueInst,
          "",
        ],
        [
          `${p}${size}:nest`,
          `${what} @${size}, relation-stack checks over vueBase`,
          work(v.nest - base.nest),
          GATES.vueNest,
          "",
        ],
      ];
    }),
  ),
  ["mem", "memory @20k", m.app20k.mem, GATES.memMB, "MB"],
];
// INFORMATIONAL: seconds depend on the runner; printed, never failing.
const info = [
  ["check @20k×2ns×300 calls", m.app20k.check, INFO.check20k, "s"],
  ["key typo @20k, total", m.typo20k.total, INFO.typoTotal, "s"],
  ["scaling 5k → 20k (check)", m.app20k.check / m.app5k.check, INFO.scaling, "×"],
];
let failed = 0;
const failedIds = [];
for (const [id, name, value, limit, unit] of results) {
  const ok = value <= limit;
  if (!ok) {
    failed++;
    failedIds.push(id);
  }
  const v = unit === "" ? String(value) : value.toFixed(2);
  console.log(
    `${ok ? "+" : "x"} ${name}: ${v} ${unit} (gate ≤ ${limit} ${unit})`.replace(/ +\)/, ")"),
  );
}
for (const [name, value, target, unit] of info)
  console.log(`i ${name}: ${value.toFixed(2)} ${unit} (informational, target ≤ ${target} ${unit})`);
// The probes are valid code except the typo probe's two calls.
const unexpected =
  m.app5k.errors +
  m.app20k.errors +
  m.file20k.errors +
  m.base20k.errors +
  m.base5k.errors +
  (m.typo20k.errors === 2 ? 0 : 1);
if (unexpected) {
  failed++;
  failedIds.push("errors");
  console.log(
    `x probes report unexpected errors (app5k ${m.app5k.errors}, app20k ${m.app20k.errors}, file20k ${m.file20k.errors}, typo20k ${m.typo20k.errors} ≠ 2)`,
  );
}
// The JSX probes: valid elements compile, each of the three typo elements errs once (a
// capped probe printed no diagnostics: its gates above already failed).
for (const [p, want] of [
  ["jsx20k", 0],
  ["jsxTypo20k", 3],
  // The Vue probes: the valid template compiles; five key typos ($t, t, two <T>, the bound
  // <T>) err once each — on the key only.
  ["vue5k", 0],
  ["vue20k", 0],
  ["vueBase5k", 0],
  ["vueBase20k", 0],
  ["vueTypo5k", 5],
  ["vueTypo20k", 5],
])
  if (!m[p].capped && m[p].errors !== want) {
    failed++;
    failedIds.push(`${p.replace(/\d+k$/, "")}:errors`);
    console.log(`x ${p} reports ${m[p].errors} errors (want ${want})`);
  }

if (red) {
  const want = REDS[red].gates;
  // Every gate the variant exists for must fail, not just any gate.
  const caught = want.every((g) => failedIds.includes(g));
  console.log(
    caught
      ? `RED run (${red}): failed ${failedIds.join(", ")} — the ${want.join("/")} gate sees this regression`
      : `RED run (${red}): the ${want.join("/")} gate PASSED on the planted regression — it is blind`,
  );
  process.exitCode = caught ? 0 : 1;
} else process.exitCode = failed ? 1 : 0;
