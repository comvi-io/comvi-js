// Type-checking cost of @comvi/core's typed `t()` (synthesis §2.3 / R4-5 gates).
//
//   node scripts/types-bench/bench.mjs [--rounds 3]   gate run (pnpm check:types-bench)
//   node scripts/types-bench/bench.mjs --red <variant> the same gates over a planted
//                                                     regression (r3-1 | per-call); exits
//                                                     0 only if ITS gate fails
//
// Probes (2 namespaces, 300 calls a third with `ns`, every fifth with `locale`) are
// generated over packages/core/src/types.ts by gen.mjs and checked with the repo's tsc
// (--extendedDiagnostics, its own Check/Total time). Rounds are interleaved so machine
// load drifts across probes evenly; the gate reads medians.
//
// Gates:  check @ 20k keys × 300 calls ≤ 1.0 s · key typo @ 20k ≤ 5 s total ·
//         check 5k → 20k scaling ≤ 2.5× · memory @ 20k ≤ 250 MB ·
//         per-call instantiations (app300 − app2 @ 20k) ≤ 50K — a COUNT, the gate that
//         does not depend on the runner (R4-5)
// Measured in lot 0 (S2, M1 Max): 0.23 s @5k, 0.44 s @20k (1.9×), typo 0.57 s total.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateProbe, TSC, TYPES_SOURCE } from "./gen.mjs";

const args = process.argv.slice(2);
const rounds = Number(args[args.indexOf("--rounds") + 1]) || 3;

const GATES = { check20k: 1.0, typoTotal: 5, scaling: 2.5, memMB: 250, perCallInst: 50_000 };

// Red variants: each plants one known regression into types.ts; the run exits 0 only if
// the gate that exists for that regression FAILS (a gate never seen red is unverified).
const REDS = {
  // R3-1: keys as `keyof Catalogs[N]` instead of the cached mapped `KeysOf[N]` — check
  // time grows with the catalog (fails the check and scaling gates).
  "r3-1": {
    gates: ["check", "scaling"],
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
};

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
        [TSC, "-p", dir, "--extendedDiagnostics", "--pretty", "false"],
        {
          encoding: "utf8",
          maxBuffer: 1 << 28,
        },
      ).stdout;
      runs[name].push({
        inst: pick(o, "Instantiations"),
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
console.log("probe   | instantiations | mem MB | check s (median) [rounds] | total s | errors");
for (const [k, v] of Object.entries(m))
  console.log(
    `${k.padEnd(7)} | ${String(v.inst).padStart(14)} | ${v.mem.toFixed(0).padStart(6)} | ${v.check.toFixed(2)} [${v.all.join(", ")}] | ${v.total.toFixed(2)} | ${v.errors}`,
  );

const scaling = m.app20k.check / m.app5k.check;
const perCall = m.app20k.inst - m.base20k.inst;
const results = [
  ["inst", "instantiations, 298 more calls @20k", perCall, GATES.perCallInst, ""],
  ["check", "check @20k×2ns×300 calls", m.app20k.check, GATES.check20k, "s"],
  ["typo", "key typo @20k, total", m.typo20k.total, GATES.typoTotal, "s"],
  ["scaling", "scaling 5k → 20k (check)", scaling, GATES.scaling, "×"],
  ["mem", "memory @20k", m.app20k.mem, GATES.memMB, "MB"],
];
let failed = 0;
const failedIds = [];
for (const [id, name, value, limit, unit] of results) {
  const ok = value <= limit;
  if (!ok) {
    failed++;
    failedIds.push(id);
  }
  const v = unit ? value.toFixed(2) : String(value);
  console.log(
    `${ok ? "+" : "x"} ${name}: ${v} ${unit} (gate ≤ ${limit} ${unit})`.replace(/ +\)/, ")"),
  );
}
// The probes are valid code except the typo probe's two calls.
const unexpected =
  m.app5k.errors +
  m.app20k.errors +
  m.file20k.errors +
  m.base20k.errors +
  (m.typo20k.errors === 2 ? 0 : 1);
if (unexpected) {
  failed++;
  console.log(
    `x probes report unexpected errors (app5k ${m.app5k.errors}, app20k ${m.app20k.errors}, file20k ${m.file20k.errors}, typo20k ${m.typo20k.errors} ≠ 2)`,
  );
}

if (red) {
  const want = REDS[red].gates;
  const caught = want.some((g) => failedIds.includes(g));
  console.log(
    caught
      ? `RED run (${red}): failed ${failedIds.join(", ")} — the ${want.join("/")} gate sees this regression`
      : `RED run (${red}): the ${want.join("/")} gate PASSED on the planted regression — it is blind`,
  );
  process.exitCode = caught ? 0 : 1;
} else process.exitCode = failed ? 1 : 0;
