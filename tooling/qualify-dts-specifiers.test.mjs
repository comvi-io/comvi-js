import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { qualifyDeclarationDir } from "./qualify-dts-specifiers.mjs";

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
