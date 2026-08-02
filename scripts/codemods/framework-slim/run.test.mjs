import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

import { runCodemod, transformSource } from "./run.mjs";
import { HOOKS, MEMBER_TO_HOOK } from "./rules/capabilities.mjs";

/**
 * The §3.1 verification gate: a golden per transform-matrix row AND per
 * report-only shape, idempotence, `tsc --noEmit` over the transformed TS
 * goldens, and the CLI's exit-code contract.
 */
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");
const FIXTURES = path.join(HERE, "__fixtures__");

const inputs = fs
  .readdirSync(FIXTURES)
  .filter((name) => name.includes(".input."))
  .sort();

const caseNameOf = (input) => input.replace(/\.input\.[^.]+$/, "");
const expectedOf = (input) => path.join(FIXTURES, input.replace(".input.", ".expected."));
const reportOf = (input) => path.join(FIXTURES, `${caseNameOf(input)}.report.json`);

// Every matrix row and every report-only shape needs a fixture — a silently
// missing golden is the failure mode this list exists to prevent.
const REQUIRED_CASES = [
  "t1-pure-loader",
  "t2-pure-plugins",
  "t3-mixed",
  "t4-aliased",
  "t5-repeated",
  "sfc-vue",
  "sfc-svelte",
  "report-collision",
  "report-stored-result",
  "report-rest-spread",
  "report-computed",
  "report-vue-proxy",
  // P4 (§6.2): the same shape in nuxt's `comvi.setup` hook, whose context
  // `i18n` is a VueI18n — detected by filename, not by extension.
  "comvi.setup",
  "report-script-extract",
];

test("every matrix row and report-only shape has a golden fixture", () => {
  assert.deepEqual(inputs.map(caseNameOf).sort(), [...REQUIRED_CASES].sort());
});

for (const input of inputs) {
  test(`golden: ${caseNameOf(input)}`, () => {
    const source = fs.readFileSync(path.join(FIXTURES, input), "utf8");
    const result = transformSource(source, path.join(FIXTURES, input));

    assert.equal(result.text, fs.readFileSync(expectedOf(input), "utf8"));
    assert.deepEqual(
      result.manual.map(({ line, column, shape, detail }) => ({ line, column, shape, detail })),
      JSON.parse(fs.readFileSync(reportOf(input), "utf8")),
    );
  });

  test(`idempotent: ${caseNameOf(input)}`, () => {
    const source = fs.readFileSync(path.join(FIXTURES, input), "utf8");
    const once = transformSource(source, path.join(FIXTURES, input)).text;
    const twice = transformSource(once, path.join(FIXTURES, input));

    assert.equal(twice.text, once, "second run must be a byte-identical no-op");
    assert.equal(twice.rewrites, 0, "second run must plan no rewrites");
  });
}

test("report-only fixtures are never rewritten", () => {
  for (const input of inputs.filter((name) => name.startsWith("report-"))) {
    const source = fs.readFileSync(path.join(FIXTURES, input), "utf8");
    const result = transformSource(source, path.join(FIXTURES, input));
    assert.equal(result.text, source, `${input} must come back byte-identical`);
    assert.ok(result.manual.length > 0, `${input} must produce a manual action`);
  }
});

test("the migration table is the single source of truth", () => {
  assert.deepEqual([...MEMBER_TO_HOOK.entries()].sort(), [
    ["addActiveNamespace", "useI18nLoader"],
    ["addActiveNamespaces", "useI18nLoader"],
    ["onLoadError", "useI18nLoader"],
    ["onMissingKey", "useI18nPlugins"],
    ["reloadTranslations", "useI18nLoader"],
  ]);
  assert.deepEqual(
    HOOKS.map(({ capability }) => capability),
    ["loader", "plugins"],
  );
});

test("transformed TypeScript goldens compile", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-codemod-tsc-"));
  // Only the goldens the codemod actually REWROTE: the report-only fixtures
  // keep their unmigrated shape on purpose, and TypeScript rejecting that
  // shape is the point of reporting it.
  const tsGoldens = inputs.filter(
    (name) =>
      /\.(ts|tsx)$/.test(name) &&
      fs.readFileSync(expectedOf(name), "utf8") !==
        fs.readFileSync(path.join(FIXTURES, name), "utf8"),
  );
  assert.equal(tsGoldens.length, 5, "every T1-T5 golden must reach the tsc gate");

  // A local stand-in for the wrapper package: the point is that the EMITTED
  // code type-checks (hook arity, alias bindings, no leftover members), not
  // that the workspace resolves.
  fs.mkdirSync(path.join(dir, "comvi"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "comvi", "react.ts"),
    `export interface UseI18nReturn { t: (key: string) => string; locale: string }
export interface UseI18nLoaderReturn {
  addActiveNamespace: (ns: string) => Promise<void>;
  addActiveNamespaces: (ns: string[]) => Promise<void>;
  reloadTranslations: (locale?: string, ns?: string) => Promise<void>;
  onLoadError: (cb: (locale: string, ns: string, error: Error) => void) => () => void;
}
export interface UseI18nPluginsReturn {
  onMissingKey: (cb: (key: string, locale: string, ns: string) => string | void) => () => void;
}
export declare function useI18n(ns?: string): UseI18nReturn;
export declare function useI18nLoader(): UseI18nLoaderReturn;
export declare function useI18nPlugins(): UseI18nPluginsReturn;
`,
  );

  for (const input of tsGoldens) {
    const emitted = fs
      .readFileSync(expectedOf(input), "utf8")
      .replaceAll('"@comvi/react"', '"./comvi/react"');
    fs.writeFileSync(path.join(dir, input.replace(".input.", ".")), emitted);
  }
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
        },
        include: ["**/*.ts", "**/*.tsx"],
      },
      null,
      2,
    ),
  );

  execFileSync(process.execPath, [tscBin(), "--noEmit", "-p", dir], { stdio: "pipe" });
  fs.rmSync(dir, { recursive: true, force: true });
});

function tscBin() {
  const candidate = path.join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
  if (!fs.existsSync(candidate)) throw new Error(`typescript not found at ${candidate}`);
  return candidate;
}

test("CLI exits 0 on a clean tree and 2 when manual actions remain", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-codemod-cli-"));

  fs.copyFileSync(path.join(FIXTURES, "t3-mixed.input.tsx"), path.join(dir, "a.tsx"));
  const applied = run(["*.tsx", "--report", "report.json"], dir);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(
    fs.readFileSync(path.join(dir, "a.tsx"), "utf8"),
    fs.readFileSync(expectedOf("t3-mixed.input.tsx"), "utf8"),
  );
  const report = JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8"));
  assert.equal(report.summary.filesChanged, 1);
  assert.equal(report.summary.manualActions, 0);

  const rerun = run(["*.tsx"], dir);
  assert.equal(rerun.status, 0);
  assert.match(rerun.stdout, /0 rewritten/);

  fs.copyFileSync(path.join(FIXTURES, "report-rest-spread.input.tsx"), path.join(dir, "b.tsx"));
  const partial = run(["*.tsx", "--report", "report.json"], dir);
  assert.equal(partial.status, 2, "manual items remaining must exit 2");
  assert.match(partial.stdout, /MANUAL .*rest spread/);

  const noArgs = run([], dir);
  assert.equal(noArgs.status, 1);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("the report is sorted by path:line", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-codemod-sort-"));
  fs.copyFileSync(path.join(FIXTURES, "report-stored-result.input.tsx"), path.join(dir, "z.tsx"));
  fs.copyFileSync(path.join(FIXTURES, "report-rest-spread.input.tsx"), path.join(dir, "a.tsx"));

  const report = runCodemod({ patterns: ["*.tsx"], cwd: dir, write: false });
  const keys = report.manual.map((item) => `${item.path}:${String(item.line).padStart(4, "0")}`);
  assert.deepEqual(keys, [...keys].sort());
  assert.ok(report.manual[0].path.endsWith("a.tsx"));

  fs.rmSync(dir, { recursive: true, force: true });
});

function run(args, cwd) {
  const result = spawnSync(process.execPath, [path.join(HERE, "run.mjs"), ...args], {
    cwd,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
