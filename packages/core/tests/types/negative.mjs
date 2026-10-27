// Type test for the typed `t()` (packages/core/src/types.ts): the 11 negative cases of
// lot-0 spike S2 must fail with exactly the expected diagnostic on exactly their line,
// the positive cases must compile, no diagnostic may name an internal helper type, and
// an ungenerated project (no Catalogs) must compile with any key.
//
//   node tests/types/negative.mjs        (run by `pnpm test:types`)
//
// A tsc probe is generated per run (scripts/types-bench/gen.mjs) over the real
// types.ts, so this checks the signature that ships. Before the real run, a RED run
// over a planted variant of types.ts without the typo guard (R3-2) must fail — a
// suite that cannot fail proves nothing.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateProbe, TSC, TYPES_SOURCE } from "../../../../scripts/types-bench/gen.mjs";

/** [code line, expected TS codes ("" = must compile)]. Codes: S2 neg-body.ts (E1–E10). */
const CASES = [
  ["import { useI18n } from './lib';", ""],
  ["const s = useI18n('shop').t;", ""],
  ["out.push(s('s0.k0', { count: 1 }));", ""],
  ["out.push(s('s0.k0', { ns: 'default', count: 1 }));", ""],
  ["out.push(s('s0.k2', { locale: 'de' }));", ""],
  ["out.push(s(cond ? 's0.k0' : 's0.k1', { count: 1, name: 'x' }));", ""],
  ["out.push(s('s0.k12', { name: 'x' }));", ""],
  ["out.push(s('s0.k12', { name: 'x', brand: 'B' }));", ""],
  ["out.push(s('s0.k17'));", ""],
  ["out.push(s('s0.k17', { brand: 'B' }));", ""],
  ["rich.push(s('s0.k7', { link: tag }));", ""],
  ["rich.push(s('s0.k7', { ns: 'default', link: tag }));", ""],
  ["out.push(t('s0.k3', { g: 'female' }), t('s0.k3', { g: 'other-value' }));", ""],
  ["s('s0.k0'); // E1 missing param", "TS2554"],
  ["s('s0.k0', { ns: 'default' }); // E2 ns + key, missing param", "TS2345"],
  ["s('s0.k0', { cnt: 1 }); // E3 wrong param name", "TS2353|TS2561"],
  ["s('s0.k2', { ns: 'nope' }); // E4 unknown ns", "TS2322"],
  ["s('s0.zzz'); // E5 typo key, no params", "TS2345"],
  ["s('s0.zzz', { count: 1 }); // E5b typo key, with params", "TS2345"],
  ["s('s0.k0', { ns: 'default', count: 'x' }); // E6 wrong type", "TS2322"],
  ["const e7: string = s('s0.k7', { link: tag }); // E7 rich key into string", "TS2322"],
  ["s('s0.k7'); // E8 rich key without its handler", "TS2554"],
  ["s(cond ? 's0.k0' : 's0.k1', { count: 1 }); // E9 union key, incomplete params", "TS2345"],
  ["s('s0.k12', { brand: 'B' }); // E10 defaulted param given, required one missing", "TS2345"],
  ["t('s0.k3', { g: 1 }); // E11 select param of the wrong type", "TS2322"],
];
/** Helper types that must never surface in a diagnostic. */
const INTERNAL = /\b(Loose|ParamsFor|Args|KeysOf|U2I|OutOf|NsOf|TFor|TranslateFn)\b/;

const tsc = (dir) => {
  const r = spawnSync(process.execPath, [TSC, "-p", dir, "--pretty", "false"], {
    encoding: "utf8",
  });
  return (r.stdout + r.stderr)
    .split("\n")
    .filter((l) => /error TS\d+/.test(l) || /^\s{2}\S/.test(l));
};

const check = (typesSource, keys = 1000) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-types-neg-"));
  const failures = [];
  try {
    const { headerLines } = generateProbe(path.join(tmp, "neg"), {
      keys,
      kind: "body",
      body: CASES.map((c) => c[0]),
      typesSource,
    });
    const lines = tsc(path.join(tmp, "neg"));
    const byLine = new Map();
    let last;
    for (const l of lines) {
      const m = /app\.ts\((\d+),\d+\): error (TS\d+): (.*)$/.exec(l);
      if (m) {
        last = +m[1] - headerLines - 1;
        (byLine.get(last) ?? byLine.set(last, []).get(last)).push({ code: m[2], text: m[3] });
      } else if (/error TS/.test(l)) failures.push(`unexpected diagnostic outside app.ts: ${l}`);
      else if (last !== undefined) byLine.get(last).at(-1).text += " " + l.trim();
    }
    CASES.forEach(([code, want], i) => {
      const got = byLine.get(i) ?? [];
      if (!want && got.length)
        failures.push(
          `line ${i} must compile: ${code}\n    ${got.map((g) => `${g.code} ${g.text}`).join("\n    ")}`,
        );
      if (want && (got.length !== 1 || !want.split("|").includes(got[0].code)))
        failures.push(
          `line ${i} expected ${want}: ${code}\n    got ${got.map((g) => g.code).join(", ") || "nothing"}`,
        );
      for (const g of got)
        if (INTERNAL.test(g.text)) failures.push(`line ${i} names an internal type: ${g.text}`);
    });
    for (const n of byLine.keys())
      if (n < 0 || n >= CASES.length) failures.push(`diagnostic on probe line ${n}`);

    generateProbe(path.join(tmp, "untyped"), { keys: 50, kind: "untyped", typesSource });
    const untyped = tsc(path.join(tmp, "untyped"));
    if (untyped.length)
      failures.push(`ungenerated project must compile:\n    ${untyped.join("\n    ")}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return failures;
};

// Red run first: the suite must notice a signature without the typo guard (R3-2) — a
// typo then intersects every key's params and E5b reports a different diagnostic.
const unguarded = fs
  .readFileSync(TYPES_SOURCE, "utf8")
  .replace("[KeysOf[N]] extends [K]\n  ? Loose\n  : ", "");
if (unguarded === fs.readFileSync(TYPES_SOURCE, "utf8")) {
  console.error("negative.mjs: could not plant the red variant (typo guard not found in types.ts)");
  process.exit(1);
}
const red = check(unguarded, 1000);
if (red.length === 0) {
  console.error("negative.mjs: the suite did NOT fail on a signature without the typo guard");
  process.exit(1);
}

const failures = check();
if (failures.length) {
  console.error(`types: ${failures.length} failure(s)\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `types: ${CASES.filter((c) => c[1]).length} negative + ${CASES.filter((c) => !c[1]).length} positive cases OK, ` +
    `ungenerated project compiles; red variant (no typo guard) caught with ${red.length} failure(s)`,
);
