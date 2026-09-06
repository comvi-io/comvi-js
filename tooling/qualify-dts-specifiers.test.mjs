import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { moduleSpecifiers } from "./dts-specifier-scan.mjs";
import { qualifyDeclarationDir } from "./qualify-dts-specifiers.mjs";

const CLI = fileURLToPath(new URL("./qualify-dts-specifiers.mjs", import.meta.url));

/** Write a throwaway `dist/` from `{ relativePath: contents }` and return its path. */
function makeDist(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "qualify-dts-"));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return dir;
}

test("extensionless sibling specifier → rewritten to the .js form", () => {
  const dist = makeDist({
    "index.d.ts": "export { fetchLoader } from './installer';\n",
    "installer.d.ts": "export declare function fetchLoader(): void;\n",
  });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 1);
  assert.equal(
    readFileSync(path.join(dist, "index.d.ts"), "utf8"),
    "export { fetchLoader } from './installer.js';\n",
  );
  rmSync(dist, { recursive: true, force: true });
});

test("directory-index specifier → rewritten to the /index.js form", () => {
  const dist = makeDist({
    "cdn.d.ts": "export * from './cdn/index'\nexport {}\n",
    "cdn/index.d.ts": "export declare function cdnLoader(): void;\n",
  });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 1);
  assert.equal(
    readFileSync(path.join(dist, "cdn.d.ts"), "utf8"),
    "export * from './cdn/index.js'\nexport {}\n",
  );
  rmSync(dist, { recursive: true, force: true });
});

test("bare directory specifier → rewritten to the /index.js form", () => {
  const dist = makeDist({
    "entry.d.ts": "export * from './cdn';\n",
    "cdn/index.d.ts": "export declare function cdnLoader(): void;\n",
  });

  qualifyDeclarationDir(dist);

  assert.equal(
    readFileSync(path.join(dist, "entry.d.ts"), "utf8"),
    "export * from './cdn/index.js';\n",
  );
  rmSync(dist, { recursive: true, force: true });
});

test("sibling file and same-named directory both present → the file wins", () => {
  const dist = makeDist({
    "entry.d.ts": "export { a } from './x';\n",
    "x.d.ts": "export declare const a: number;\n",
    "x/index.d.ts": "export declare const b: number;\n",
  });

  qualifyDeclarationDir(dist);

  assert.equal(
    readFileSync(path.join(dist, "entry.d.ts"), "utf8"),
    "export { a } from './x.js';\n",
  );
  rmSync(dist, { recursive: true, force: true });
});

test("already-qualified specifier → left byte-identical", () => {
  const source = "export { a } from './installer.js';\n";
  const dist = makeDist({
    "index.d.ts": source,
    "installer.d.ts": "export declare const a: number;\n",
  });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 0);
  assert.equal(readFileSync(path.join(dist, "index.d.ts"), "utf8"), source);
  rmSync(dist, { recursive: true, force: true });
});

test("bare package specifier → left byte-identical", () => {
  const source = "export { attachLoader } from '@comvi/core/loader';\n";
  const dist = makeDist({ "index.d.ts": source });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 0);
  assert.equal(readFileSync(path.join(dist, "index.d.ts"), "utf8"), source);
  rmSync(dist, { recursive: true, force: true });
});

test("arbitrary-extension specifier → left byte-identical", () => {
  const source = 'export { default as T } from "./T.svelte";\n';
  const dist = makeDist({
    "index.d.ts": source,
    "T.svelte.d.ts": "declare const T: unknown;\nexport default T;\n",
  });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 0);
  assert.equal(readFileSync(path.join(dist, "index.d.ts"), "utf8"), source);
  rmSync(dist, { recursive: true, force: true });
});

test("specifier inside a JSDoc comment → left byte-identical", () => {
  const source = "/** Example: import x from './installer' */\nexport declare const a: number;\n";
  const dist = makeDist({
    "index.d.ts": source,
    "installer.d.ts": "export declare const b: number;\n",
  });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 0);
  assert.equal(readFileSync(path.join(dist, "index.d.ts"), "utf8"), source);
  rmSync(dist, { recursive: true, force: true });
});

// REGRESSION GROUP: a string literal is not a comment.
//
// The previous comment-blanking regex treated `//` and `/*` inside string literals as
// comment openers. Two shapes actually lost specifiers, both verified against the old
// masking before this scanner replaced it:
//   * `//` in a string, with a specifier LATER ON THE SAME LINE → that specifier is
//     blanked away (old: 0 found, new: 1).
//   * `/*` in a string → the fake block comment runs to the next real `*/`, swallowing
//     every specifier in between (old: 1 of 3 found, new: 3 of 3).
// The two-line form below is the shape as first reported; on its own the newline ends
// the fake line comment before the specifier, so it is kept as a boundary case rather
// than as the reproduction.
test("URL string literal above a specifier → the specifier is still rewritten", () => {
  const dist = makeDist({
    "index.d.ts":
      'export declare const CDN: "https://cdn.example.com/x";\n' +
      'export type L = import("./later");\n',
    "later.d.ts": "export declare const l: number;\n",
  });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 1);
  assert.equal(
    readFileSync(path.join(dist, "index.d.ts"), "utf8"),
    'export declare const CDN: "https://cdn.example.com/x";\n' +
      'export type L = import("./later.js");\n',
  );
  rmSync(dist, { recursive: true, force: true });
});

test("URL string literal above an unbacked specifier → reported unresolved", () => {
  const dist = makeDist({
    "index.d.ts":
      'export declare const CDN: "https://cdn.example.com/x";\n' +
      'export type L = import("./later");\n',
  });

  const result = qualifyDeclarationDir(dist);

  assert.deepEqual(
    result.unresolved.map((u) => u.specifier),
    ["./later"],
  );
  rmSync(dist, { recursive: true, force: true });
});

test("URL string and specifier on ONE line → the specifier is still rewritten", () => {
  const dist = makeDist({
    "index.d.ts":
      'export declare const CDN: "https://cdn.example.com/x"; export type L = import("./later");\n',
    "later.d.ts": "export declare const l: number;\n",
  });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 1);
  assert.match(readFileSync(path.join(dist, "index.d.ts"), "utf8"), /import\("\.\/later\.js"\)/);
  rmSync(dist, { recursive: true, force: true });
});

test("string literal containing /* → the specifiers after it are still rewritten", () => {
  const dist = makeDist({
    "index.d.ts":
      'export declare const G: "glob/*.json";\n' +
      'export { a } from "./x";\n' +
      'export { b } from "./y";\n' +
      "/* a real comment */\n" +
      'export { c } from "./z";\n',
    "x.d.ts": "export declare const a: number;\n",
    "y.d.ts": "export declare const b: number;\n",
    "z.d.ts": "export declare const c: number;\n",
  });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 3);
  rmSync(dist, { recursive: true, force: true });
});

// REGRESSION: indices are UTF-16 code units, not code points. Iterating the text with
// spread made the character array one entry shorter per astral character, desyncing
// every later index; a single emoji anywhere above a specifier returned ZERO specifiers
// for the whole file, so the rewriter and the gate went blind together and both passed.
test("astral character in a JSDoc comment → the specifier below is still rewritten", () => {
  const dist = makeDist({
    "index.d.ts": "/** ships 🚀 fast */\nexport { a } from './x';\n",
    "x.d.ts": "export declare const a: number;\n",
  });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 1);
  assert.equal(
    readFileSync(path.join(dist, "index.d.ts"), "utf8"),
    "/** ships 🚀 fast */\nexport { a } from './x.js';\n",
  );
  rmSync(dist, { recursive: true, force: true });
});

test("astral character in a string literal → the specifier below is still rewritten", () => {
  const dist = makeDist({
    "index.d.ts": "export declare const E: '🚀';\nexport { a } from './x';\n",
    "x.d.ts": "export declare const a: number;\n",
  });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 1);
  assert.equal(
    readFileSync(path.join(dist, "index.d.ts"), "utf8"),
    "export declare const E: '🚀';\nexport { a } from './x.js';\n",
  );
  rmSync(dist, { recursive: true, force: true });
});

test("astral character above an unbacked specifier → still reported unresolved", () => {
  const dist = makeDist({ "index.d.ts": "/** 🚀 */\nexport { a } from './missing';\n" });

  const result = qualifyDeclarationDir(dist);

  assert.deepEqual(
    result.unresolved.map((u) => u.specifier),
    ["./missing"],
  );
  rmSync(dist, { recursive: true, force: true });
});

test("dynamic import() type specifier → rewritten to the .js form", () => {
  const dist = makeDist({
    "index.d.ts": "export type Loader = typeof import('./installer');\n",
    "installer.d.ts": "export declare const b: number;\n",
  });

  qualifyDeclarationDir(dist);

  assert.equal(
    readFileSync(path.join(dist, "index.d.ts"), "utf8"),
    "export type Loader = typeof import('./installer.js');\n",
  );
  rmSync(dist, { recursive: true, force: true });
});

test(".d.mts importing a sibling .d.mts → rewritten to the .mjs form", () => {
  const dist = makeDist({
    "types.d.mts": "export { default } from './module';\n",
    "module.d.mts": "declare const m: number;\nexport default m;\n",
  });

  qualifyDeclarationDir(dist);

  assert.equal(
    readFileSync(path.join(dist, "types.d.mts"), "utf8"),
    "export { default } from './module.mjs';\n",
  );
  rmSync(dist, { recursive: true, force: true });
});

test(".d.cts importing a sibling .d.cts → rewritten to the .cjs form", () => {
  const dist = makeDist({
    "types.d.cts": "export { c } from './helper';\n",
    "helper.d.cts": "export declare const c: number;\n",
  });

  qualifyDeclarationDir(dist);

  assert.equal(
    readFileSync(path.join(dist, "types.d.cts"), "utf8"),
    "export { c } from './helper.cjs';\n",
  );
  rmSync(dist, { recursive: true, force: true });
});

test("multiple specifiers in one file → every one rewritten", () => {
  const dist = makeDist({
    "index.d.ts": "export { a } from './x';\nexport type { B } from './y';\n",
    "x.d.ts": "export declare const a: number;\n",
    "y.d.ts": "export type B = string;\n",
  });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 2);
  assert.equal(
    readFileSync(path.join(dist, "index.d.ts"), "utf8"),
    "export { a } from './x.js';\nexport type { B } from './y.js';\n",
  );
  rmSync(dist, { recursive: true, force: true });
});

// The splice walks the file with a cursor; an off-by-one in any edit but the last
// would corrupt the text between them rather than fail outright.
test("many specifiers in one file → only the specifiers change, byte for byte", () => {
  const before =
    "/** doc */\n" +
    "export { a } from './x';\n" +
    "export declare const URL_A: 'https://a.example/1';\n" +
    "export type { B } from './y';\n" +
    "export declare const KEEP: number;\n" +
    "export type C = import('./z');\n";
  const dist = makeDist({
    "index.d.ts": before,
    "x.d.ts": "export declare const a: number;\n",
    "y.d.ts": "export type B = string;\n",
    "z.d.ts": "export declare const z: number;\n",
  });

  const result = qualifyDeclarationDir(dist);

  const after = readFileSync(path.join(dist, "index.d.ts"), "utf8");
  assert.equal(result.rewrites, 3);
  assert.equal(after, before.replaceAll(/'\.\/([xyz])'/g, "'./$1.js'"));
  rmSync(dist, { recursive: true, force: true });
});

test("specifier backed by no emitted file → reported unresolved and left alone", () => {
  const source = "export { a } from './missing';\n";
  const dist = makeDist({ "index.d.ts": source });

  const result = qualifyDeclarationDir(dist);

  assert.equal(result.rewrites, 0);
  assert.deepEqual(
    result.unresolved.map((u) => u.specifier),
    ["./missing"],
  );
  assert.equal(readFileSync(path.join(dist, "index.d.ts"), "utf8"), source);
  rmSync(dist, { recursive: true, force: true });
});

test("re-running over an already-qualified dist → no further rewrites", () => {
  const dist = makeDist({
    "cdn.d.ts": "export * from './cdn/index'\n",
    "cdn/index.d.ts": "export declare function cdnLoader(): void;\n",
  });
  qualifyDeclarationDir(dist);

  const second = qualifyDeclarationDir(dist);

  assert.equal(second.rewrites, 0);
  assert.deepEqual(second.unresolved, []);
  rmSync(dist, { recursive: true, force: true });
});

// INVARIANT: nothing may be silently dropped. Every relative specifier the scanner
// sees must end up either rewritten or listed in `unresolved` — a specifier that is
// neither is a hole exactly like the string-literal bug above.
test("every relative specifier is either rewritten or reported — none silently skipped", () => {
  const files = {
    "index.d.ts":
      "export { a } from './x';\n" +
      "export { b } from './deep/y';\n" +
      "export { c } from './missing';\n" +
      "export { d } from './already.js';\n" +
      'export declare const U: "http://x//y";\n' +
      "export type E = import('./dir');\n" +
      "export { f } from '@comvi/core';\n",
    "x.d.ts": "export declare const a: number;\n",
    "deep/y.d.ts": "export declare const b: number;\n",
    "already.d.ts": "export declare const d: number;\n",
    "dir/index.d.ts": "export declare const e: number;\n",
  };
  const dist = makeDist(files);
  const relative = moduleSpecifiers(files["index.d.ts"]).filter((s) => s.specifier.startsWith("."));

  const result = qualifyDeclarationDir(dist);

  // 6 relative specifiers: 3 rewritten (./x, ./deep/y, ./dir), 1 unresolved
  // (./missing), 1 already qualified (./already.js), and the URL is not a specifier.
  assert.equal(relative.length, 5);
  assert.equal(result.rewrites + result.unresolved.length, 4);
  const accounted = new Set([
    ...result.unresolved.map((u) => u.specifier),
    ...["./x", "./deep/y", "./dir"],
    "./already.js",
  ]);
  for (const { specifier } of relative) {
    assert.ok(accounted.has(specifier), `specifier '${specifier}' was silently skipped`);
  }
  rmSync(dist, { recursive: true, force: true });
});

test("star re-export → reported with kind 'star'", () => {
  const found = moduleSpecifiers("export * from './cdn/index'\n");

  assert.deepEqual(
    found.map((f) => f.kind),
    ["star"],
  );
});

test("named re-export → reported with kind 'named'", () => {
  const found = moduleSpecifiers("export { a } from './cdn/index'\n");

  assert.deepEqual(
    found.map((f) => f.kind),
    ["named"],
  );
});

test("CLI over a clean dist → exit code 0", () => {
  const dist = makeDist({
    "index.d.ts": "export { a } from './x';\n",
    "x.d.ts": "export declare const a: number;\n",
  });

  const status = execFileSync(process.execPath, [CLI, dist], { encoding: "utf8" });

  assert.match(status, /1 specifier\(s\)/);
  rmSync(dist, { recursive: true, force: true });
});

test("CLI over a dist with an unresolvable specifier → non-zero exit", () => {
  const dist = makeDist({ "index.d.ts": "export { a } from './missing';\n" });

  const run = () => execFileSync(process.execPath, [CLI, dist], { stdio: "pipe" });

  assert.throws(run, (err) => err.status === 1 && /'\.\/missing'/.test(String(err.stderr)));
  rmSync(dist, { recursive: true, force: true });
});
