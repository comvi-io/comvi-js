// Type-checking cost of @comvi/core's typed `t()` (synthesis §2.3 / R4-5 gates).
//
//   node scripts/types-bench/bench.mjs [--rounds 3]   gate run (pnpm check:types-bench)
//   node scripts/types-bench/bench.mjs --red          the same gates over the R3-1
//                                                     signature (`keyof Catalogs[N]`);
//                                                     exits 0 only if a gate FAILS
//
// Probes (2 namespaces, 300 calls a third with `ns`, every fifth with `locale`) are
// generated over packages/core/src/types.ts by gen.mjs and checked with the repo's tsc
// (--extendedDiagnostics, its own Check/Total time). Rounds are interleaved so machine
// load drifts across probes evenly; the gate reads medians.
//
// Gates:  check @ 20k keys × 300 calls ≤ 1.0 s · key typo @ 20k ≤ 5 s total ·
//         check 5k → 20k scaling ≤ 2.5× · memory @ 20k ≤ 250 MB
// Measured in lot 0 (S2, M1 Max): 0.23 s @5k, 0.44 s @20k (1.9×), typo 0.57 s total.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateProbe, TSC, TYPES_SOURCE } from "./gen.mjs";

const args = process.argv.slice(2);
const rounds = Number(args[args.indexOf("--rounds") + 1]) || 3;
const red = args.includes("--red");

const GATES = { check20k: 1.0, typoTotal: 5, scaling: 2.5, memMB: 250 };

let typesSource = fs.readFileSync(TYPES_SOURCE, "utf8");
if (red) {
  const planted = typesSource
    .replace(
      "<K extends KeysOf[N], N extends NsOf = NS>",
      "<K extends keyof Catalogs[N], N extends NsOf = NS>",
    )
    .replace(
      "export type ParamsFor<N extends NsOf, K extends KeysOf[N]> = [KeysOf[N]] extends [K]",
      "export type ParamsFor<N extends NsOf, K extends keyof Catalogs[N]> = [keyof Catalogs[N]] extends [K]",
    );
  if (planted === typesSource)
    throw new Error("--red: could not plant the R3-1 signature into types.ts");
  typesSource = planted;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-types-bench-"));
const probes = {
  app5k: generateProbe(path.join(tmp, "app5k"), { keys: 5000, kind: "app300", typesSource }).dir,
  app20k: generateProbe(path.join(tmp, "app20k"), { keys: 20000, kind: "app300", typesSource }).dir,
  typo20k: generateProbe(path.join(tmp, "typo20k"), { keys: 20000, kind: "typo", typesSource }).dir,
  file20k: generateProbe(path.join(tmp, "file20k"), { keys: 20000, kind: "app30", typesSource })
    .dir,
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
  `types bench${red ? " (RED: R3-1 signature)" : ""}: tsc ${tsVersion}, node ${process.version}, ${rounds} rounds, ` +
    `load1 ${Math.min(...loads).toFixed(1)}–${Math.max(...loads).toFixed(1)} on ${os.cpus().length} cpus`,
);
console.log("probe   | instantiations | mem MB | check s (median) [rounds] | total s | errors");
for (const [k, v] of Object.entries(m))
  console.log(
    `${k.padEnd(7)} | ${String(v.inst).padStart(14)} | ${v.mem.toFixed(0).padStart(6)} | ${v.check.toFixed(2)} [${v.all.join(", ")}] | ${v.total.toFixed(2)} | ${v.errors}`,
  );

const scaling = m.app20k.check / m.app5k.check;
const results = [
  ["check @20k×2ns×300 calls", m.app20k.check, GATES.check20k, "s"],
  ["key typo @20k, total", m.typo20k.total, GATES.typoTotal, "s"],
  ["scaling 5k → 20k (check)", scaling, GATES.scaling, "×"],
  ["memory @20k", m.app20k.mem, GATES.memMB, "MB"],
];
let failed = 0;
for (const [name, value, limit, unit] of results) {
  const ok = value <= limit;
  if (!ok) failed++;
  console.log(`${ok ? "+" : "x"} ${name}: ${value.toFixed(2)} ${unit} (gate ≤ ${limit} ${unit})`);
}
// The probes are valid code except the typo probe's two calls.
const unexpected =
  m.app5k.errors + m.app20k.errors + m.file20k.errors + (m.typo20k.errors === 2 ? 0 : 1);
if (unexpected) {
  failed++;
  console.log(
    `x probes report unexpected errors (app5k ${m.app5k.errors}, app20k ${m.app20k.errors}, file20k ${m.file20k.errors}, typo20k ${m.typo20k.errors} ≠ 2)`,
  );
}

if (red) {
  console.log(
    failed
      ? `RED run: ${failed} gate(s) failed, as they must`
      : "RED run: every gate PASSED on the planted signature — the gates are blind",
  );
  process.exitCode = failed ? 0 : 1;
} else process.exitCode = failed ? 1 : 0;
