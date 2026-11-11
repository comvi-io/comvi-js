// Runs the gate on a package written here, so each direction of a difference is seen failing.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { BARREL_CLASHES, barrelDiagnostics, checkPackages } from "./check-export-names.mjs";

function fixture(js, dts, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-export-names-"));
  fs.mkdirSync(path.join(dir, "dist"));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "@fixture/pkg",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          development: "./dist/index.dev.js",
          default: "./dist/index.js",
        },
        "./runtime/*": "./dist/*.js",
      },
    }),
  );
  fs.writeFileSync(path.join(dir, "dist", "index.js"), js);
  fs.writeFileSync(path.join(dir, "dist", "index.dev.js"), extra.dev ?? js);
  fs.writeFileSync(path.join(dir, "dist", "index.d.ts"), dts);
  return dir;
}

const JS = "const a = 1;\nexport { a };\n";
const DTS = "export declare const a: number;\nexport type B = string;\nexport interface C {}\n";

test("equal names pass, and type-only exports do not count", async () => {
  const { failures, checked } = await checkPackages([fixture(JS, DTS)]);
  assert.deepEqual(failures, []);
  assert.equal(checked, 2);
});

test("a runtime export the declarations do not name fails, on the condition that has it", async () => {
  const dev = `${JS}export const leak = 2;\n`;
  const { failures } = await checkPackages([fixture(JS, DTS, { dev })]);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /\[development\].*in the dist, not in the \.d\.ts: leak/);
});

test("a declared value the dist lacks fails", async () => {
  const { failures } = await checkPackages([
    fixture(JS, `${DTS}export declare function gone(): void;\n`),
  ]);
  assert.equal(failures.length, 2);
  assert.match(failures[0], /in the \.d\.ts, not in the dist: gone/);
});

test("`export *` from another package fails: it hides names", async () => {
  const { failures } = await checkPackages([fixture(`${JS}export * from "other";\n`, DTS)]);
  assert.ok(failures.some((f) => /`export \*` from other/.test(f)));
});

test("no dist is reported as skipped, not as checked", async () => {
  const dir = fixture(JS, DTS);
  fs.rmSync(path.join(dir, "dist", "index.dev.js"));
  const { skipped, checked } = await checkPackages([dir]);
  assert.deepEqual(skipped, ["@fixture/pkg ."]);
  assert.equal(checked, 0);
});

test("a type-only re-export of a class is no value: a runtime export of that name fails", async () => {
  const dts = "declare class Foo {}\nexport type { Foo };\nexport declare const a: number;\n";
  const ok = await checkPackages([fixture(JS, dts)]);
  assert.deepEqual(ok.failures, []);
  const { failures } = await checkPackages([fixture(`${JS}export const Foo = 2;\n`, dts)]);
  assert.match(failures[0], /in the dist, not in the \.d\.ts: Foo/);
});

test("a CommonJS `require` target is read by its export names, not as one default", async () => {
  const withPlugin = (cjs) => {
    const dir = fixture("export const a = 1;\n", "export declare const a: number;\n");
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    manifest.exports["./plugin"] = {
      types: "./dist/plugin.d.ts",
      import: "./dist/plugin.js",
      require: "./dist/plugin.cjs",
    };
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest));
    fs.writeFileSync(path.join(dir, "dist", "plugin.js"), "export function p() {}\n");
    fs.writeFileSync(path.join(dir, "dist", "plugin.d.ts"), "export declare function p(): void;\n");
    fs.writeFileSync(path.join(dir, "dist", "plugin.cjs"), cjs);
    return dir;
  };
  assert.deepEqual(
    (await checkPackages([withPlugin("exports.p = function p() {};\n")])).failures,
    [],
  );
  const wrong = await checkPackages([withPlugin("exports.q = function q() {};\n")]);
  assert.deepEqual(
    wrong.failures.map((f) => f.split(": ").slice(1).join(": ")),
    ["in the dist, not in the .d.ts: q", "in the .d.ts, not in the dist: p"],
  );
});

/** A root with `node_modules/<name>` packages, each one `index.d.ts`. */
function barrelRoot(pkgs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-barrel-"));
  for (const [name, dts] of Object.entries(pkgs)) {
    const dir = path.join(root, "node_modules", ...name.split("/"));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name, types: "./index.d.ts", exports: { ".": { types: "./index.d.ts" } } }),
    );
    fs.writeFileSync(path.join(dir, "index.d.ts"), dts);
  }
  return root;
}

const CORE = "export declare const createI18n: () => 1;\nexport type UntypedParams = { a: 1 };\n";

test("barrel: a name core and a binding both declare is reported as TS2308", () => {
  const root = barrelRoot({
    "@comvi/core": CORE,
    "@comvi/react": "export type UntypedParams = { b: 2 };\n",
  });
  const out = barrelDiagnostics(["@comvi/react"], root);
  assert.equal(out.length, 1);
  assert.match(out[0], /^barrel core \+ @comvi\/react: TS2308 .*UntypedParams/);
});

test("barrel: the allowed Vue createI18n clash passes; without the allowance it is TS2308", () => {
  const root = barrelRoot({
    "@comvi/core": CORE,
    "@comvi/vue": "export declare const createI18n: () => 2;\n",
  });
  assert.deepEqual(barrelDiagnostics(["@comvi/vue"], root), []);
  const allowed = BARREL_CLASHES["@comvi/vue"];
  delete BARREL_CLASHES["@comvi/vue"];
  try {
    const out = barrelDiagnostics(["@comvi/vue"], root);
    assert.equal(out.length, 1);
    assert.match(out[0], /TS2308 .*createI18n/);
  } finally {
    BARREL_CLASHES["@comvi/vue"] = allowed;
  }
});
