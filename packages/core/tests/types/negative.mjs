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
  // One-key and two-key namespaces: a real key that is the WHOLE key set is not a typo.
  ["const one = useI18n('one').t, r1 = useI18n('r1').t, pair = useI18n('pair').t;", ""],
  ["out.push(one('only', { name: 'x' }));", ""],
  ["rich.push(r1('terms', { link: tag }));", ""],
  ["out.push(pair(cond ? 'a' : 'b', { count: 1, name: 'x' }));", ""],
  ["one('only'); // E12 one-key namespace, missing param", "TS2554"],
  ["one('only', { nme: 'x' }); // E13 one-key namespace, wrong param name", "TS2353|TS2561"],
  ["const e14: string = r1('terms', { link: tag }); // E14 one-key rich into string", "TS2322"],
  ["r1('terms'); // E15 one-key rich without its handler", "TS2554"],
  [
    "pair(cond ? 'a' : 'b', { count: 1 }); // E16 union spanning the namespace, incomplete",
    "TS2345",
  ],
  ["one('zzz', { name: 'x' }); // E17 typo in a one-key namespace", "TS2345"],
  // A key with no params takes no params beyond ns/locale/markers (review lot 3: `never`
  // params once fell into the loose typo branch, because never extends NotAKey too).
  ["s('s0.k2', { extra: 1 }); // E21 a param on a key without params", "TS2353"],
  ["s('s0.k2', { ns: 'shop', extra: 1 }); // E22 the same, with ns", "TS2353"],
  [
    "const px = { extra: 1 }; s('s0.k2', px); // E23 a params object with nothing in common",
    "TS2559",
  ],
  // `markers` is a per-call option like ns and locale (R3-14 H9): a boolean, on every shape.
  ["out.push(s('s0.k0', { markers: false, count: 1 }));", ""],
  ["out.push(s('s0.k17', { markers: false }));", ""],
  ["out.push(s('s0.k12', { markers: true, name: 'x' }));", ""],
  ["s('s0.k0', { markers: 'no', count: 1 }); // E18 markers is a boolean", "TS2322"],
  ["s('s0.k17', { markers: 0 }); // E19 markers is a boolean (no-param key)", "TS2322"],
  // t as a value (lot 3): a callback typed by real keys takes it; `Parameters<typeof t>`
  // names the keys. A typed t is NOT `(k: string) => string` — that would let any string
  // through, which the key check exists to stop (the diagnostic names t's own type).
  ["const cb1: (k: 's0.k2') => string = t;", ""],
  ["const cb2: (k: 's0.k2' | 's0.k4') => string = t;", ""],
  ["const cb3: (k: 's0.k0', p: { count: number }) => string = t;", ""],
  ["const p0: Parameters<typeof t>[0] = 's0.k2'; out.push(t(p0 as 's0.k2'));", ""],
  ["out.push(...(['s0.k2', 's0.k4'] as const).map((k) => t(k)));", ""],
  // KNOWN HOLE, pinned so a change of it is seen: assigned to a one-argument callback, t
  // is accepted for a key WITH params (tsc does not check the arity of the generic rest
  // `...args`); the call then renders `{name}` and reports missing_param. Closing it needs
  // a non-rest signature, measured slower and less precise in S2 (handover, lot 3).
  ["const cb4: (k: 's0.k5') => string = t;", ""],
  [
    "const cb5: (k: string) => string = t; // E20 a typed t takes keys, not any string",
    "TS2322",
    "own",
  ],
];

/**
 * The ungenerated project (no Catalogs): any key, any params. A call whose params are all
 * printed as text is a string; one with an object or function param can return rich
 * parts, and is typed so (review A6, lot 3).
 */
const UNTYPED_CASES = [
  ["const u1: string = t('k', { n: 1, d: new Date(), l: [1, 2], ns: 'x', markers: false });", ""],
  ["const u2: string | RichParts = t('k', { node: { a: 1 }, link: (c: unknown) => c });", ""],
  [
    "const u3: string = t('k', { link: (c: unknown) => c }); // U1 a handler param may return rich parts",
    "TS2322",
  ],
  [
    "const u4: string = t('k', { node: { a: 1 } }); // U2 an object param may come back as is",
    "TS2322",
  ],
];
/**
 * Helper types that must never surface in a diagnostic. `NotAKey` (the typo marker) may,
 * but only in the key's own TS2345 line, where it reads as the verdict.
 */
const INTERNAL = /\b(Loose|ParamsFor|Args|KeysOf|U2I|OutOf|NsOf|TFor|TranslateFn)\b/;
const MARKER = /\bNotAKey\b/;

const tsc = (dir) => {
  const r = spawnSync(process.execPath, [TSC, "-p", dir, "--pretty", "false"], {
    encoding: "utf8",
  });
  return (r.stdout + r.stderr)
    .split("\n")
    .filter((l) => /error TS\d+/.test(l) || /^\s{2}\S/.test(l));
};

/** Runs `cases` in a probe of `kind` and pushes every mismatch onto `failures`. */
const run = (dir, kind, cases, typesSource, keys, failures, offset = 0) => {
  const { headerLines } = generateProbe(dir, {
    keys,
    kind,
    body: cases.map((c) => c[0]),
    typesSource,
  });
  const lines = tsc(dir);
  {
    const byLine = new Map();
    let last;
    for (const l of lines) {
      const m = /app\.ts\((\d+),\d+\): error (TS\d+): (.*)$/.exec(l);
      if (m) {
        last = +m[1] - headerLines - 1 - offset;
        (byLine.get(last) ?? byLine.set(last, []).get(last)).push({ code: m[2], text: m[3] });
      } else if (/error TS/.test(l)) failures.push(`unexpected diagnostic outside app.ts: ${l}`);
      else if (last !== undefined) byLine.get(last).at(-1).text += " " + l.trim();
    }
    cases.forEach(([code, want, own], i) => {
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
        if (
          // "own": the diagnostic is about t itself, so it may name t's public type.
          INTERNAL.test(own ? g.text.replace(/'TranslateFn<[^']*>'/g, "") : g.text) ||
          (MARKER.test(g.text) &&
            !/^Argument of type '"[^']*"' is not assignable/.test(g.text) &&
            !own)
        )
          failures.push(`line ${i} names an internal type: ${g.text}`);
    });
    for (const n of byLine.keys())
      if (n < 0 || n >= cases.length)
        failures.push(`${kind}: diagnostic on probe line ${n}: ${JSON.stringify(byLine.get(n))}`);
  }
};

const check = (typesSource, keys = 1000) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-types-neg-"));
  const failures = [];
  try {
    run(path.join(tmp, "neg"), "body", CASES, typesSource, keys, failures);
    // The untyped probe has one fixed line before the cases.
    run(path.join(tmp, "untyped"), "untyped", UNTYPED_CASES, typesSource, 50, failures, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return failures;
};

// Red runs first: the suite must notice (1) a signature without the typo guard (R3-2) — a
// typo then intersects every key's params and E5b reports a different diagnostic —
// (2) the 1a guard `[KeysOf[N]] extends [K]`, which took a one-key namespace for a typo
// and let E12–E16 compile.
const source = fs.readFileSync(TYPES_SOURCE, "utf8");
const plant = (label, edits) => {
  let out = source;
  for (const [from, to] of edits) {
    if (!out.includes(from)) {
      console.error(`negative.mjs: could not plant the red variant "${label}" (${from})`);
      process.exit(1);
    }
    out = out.replace(from, to);
  }
  return out;
};
const GUARD = "[NotAKey] extends [K]\n  ? NotAKey\n  : ";
const REDS = {
  "no typo guard": plant("no typo guard", [[GUARD, ""]]),
  "1a guard [KeysOf[N]] extends [K]": plant("1a guard", [
    [GUARD, "[KeysOf[N]] extends [Exclude<K, NotAKey>]\n  ? NotAKey\n  : "],
  ]),
  // (4) `never` params tested after the typo marker: a key without params took any params.
  "never after NotAKey": plant("never after NotAKey", [
    [
      "export type Args<N, P> = [P] extends [never]",
      "export type Args<N, P> = [P] extends [NotAKey]\n  ? [params?: { ns?: NsOf; locale?: string; markers?: boolean } & Record<string, unknown>]\n  : [P] extends [never]",
    ],
  ]),
  // (3) The untyped t() of lot 1, typed `string` for any params (review A6).
  "untyped t() always a string": plant("untyped string", [
    [
      "export interface UntypedT<Rich = RichParts> {",
      "export type UntypedT<Rich = RichParts> = (key: string, params?: Record<string, unknown>) => string;\ninterface Unused<Rich> {",
    ],
  ]),
};
const reds = [];
for (const [label, variant] of Object.entries(REDS)) {
  const red = check(variant, 1000);
  if (red.length === 0) {
    console.error(`negative.mjs: the suite did NOT fail on the red variant "${label}"`);
    process.exit(1);
  }
  reds.push(`${label}: ${red.length}`);
}

const failures = check();
if (failures.length) {
  console.error(`types: ${failures.length} failure(s)\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(
  `types: ${CASES.filter((c) => c[1]).length} negative + ${CASES.filter((c) => !c[1]).length} positive cases OK, ` +
    `ungenerated project: ${UNTYPED_CASES.filter((c) => c[1]).length} negative + ${UNTYPED_CASES.filter((c) => !c[1]).length} positive; red variants caught (${reds.join("; ")} failure(s))`,
);
