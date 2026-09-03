// D1 — `@comvi/cli` and `@comvi/vite-plugin` emit the SAME `TranslationKeys` lines.
//
// Two independent copies of the same emitter ship in two packages:
// `packages/cli/src/core/TypeEmitter.ts` and `packages/vite-plugin/src/emit.ts`.
// A user who generates types with the CLI in CI and with the Vite plugin in dev
// must get the same declarations, so any drift between the copies is a release
// blocker. The copies produce different file headers by design, so parity is
// asserted on the `TranslationKeys` member lines only.
//
// The fixture lives in a NON-default namespace: both copies strip the default
// namespace prefix, and keeping every key prefixed takes that behaviour out of
// the comparison so this file measures escaping and ordering alone.
//
// TODO: extract one emitter into a shared module (P2 in the 0.5 review, "emitter
// dedupe (cli <-> vite-plugin)") and delete this file with the second copy.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Transpiled sources land here so their relative imports and `node_modules` still resolve. */
const OUT_ROOT = path.join(REPO_ROOT, "node_modules", ".cache", "comvi-typegen-parity");

/**
 * Transpile one TypeScript module and every local module it imports, writing
 * `.mjs` siblings under `OUT_ROOT` at the same relative paths. Type-only imports
 * are erased by the transpile, so only value imports are followed.
 */
function emitModule(absTsPath, seen) {
  const cached = seen.get(absTsPath);
  if (cached) return cached;

  const outAbs = path.join(OUT_ROOT, path.relative(REPO_ROOT, absTsPath)).replace(/\.ts$/, ".mjs");
  seen.set(absTsPath, outAbs);

  const { outputText } = ts.transpileModule(fs.readFileSync(absTsPath, "utf8"), {
    fileName: absTsPath,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      useDefineForClassFields: true,
    },
  });

  const rewritten = outputText.replace(
    /(from\s*")(\.\.?\/[^"]*)(")/g,
    (_match, before, specifier, after) => {
      emitModule(resolveTsModule(path.resolve(path.dirname(absTsPath), specifier)), seen);
      return `${before}${specifier}.mjs${after}`;
    },
  );

  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, rewritten, "utf8");
  return outAbs;
}

function resolveTsModule(withoutExtension) {
  for (const candidate of [`${withoutExtension}.ts`, path.join(withoutExtension, "index.ts")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot resolve local module: ${withoutExtension}`);
}

async function loadEmitter(relativePath) {
  const entry = emitModule(path.join(REPO_ROOT, relativePath), new Map());
  return import(`${entry}?t=${Date.now()}`);
}

/** The `TranslationKeys` member lines, in emitted order, without indentation. */
export function keyLinesOf(output) {
  return (output.match(/^ {4}\S.*$/gm) ?? []).map((line) => line.trim());
}

/**
 * Keys that a naive emitter gets wrong: an apostrophe closes a single-quoted
 * property, a hyphen cannot be a bare param name, and the `Zed`/`apple` pair
 * orders one way by code unit and the other by `localeCompare`.
 */
const SCHEMA = {
  keys: {
    "admin:Zed": { params: [] },
    "admin:apple": { params: [] },
    "admin:a-b": { params: [] },
    "admin:ab": { params: [] },
    "admin:errors.it's": { params: [] },
    "admin:ключ": { params: [] },
    "admin:greeting": { params: [{ name: "user-name", type: "string" }] },
  },
};

test("the cli and vite-plugin emitters agree on every TranslationKeys line", async () => {
  const { TypeEmitter } = await loadEmitter("packages/cli/src/core/TypeEmitter.ts");
  const { emitDeclarations } = await loadEmitter("packages/vite-plugin/src/emit.ts");

  const fromCli = keyLinesOf(new TypeEmitter().generate(SCHEMA));
  const fromVitePlugin = keyLinesOf(emitDeclarations(SCHEMA));

  assert.deepEqual(fromVitePlugin, fromCli);
});

test("both emitters quote every key and param name as JSON", async () => {
  const { TypeEmitter } = await loadEmitter("packages/cli/src/core/TypeEmitter.ts");
  const { emitDeclarations } = await loadEmitter("packages/vite-plugin/src/emit.ts");

  const expected = [
    '"admin:Zed": never;',
    '"admin:a-b": never;',
    '"admin:ab": never;',
    '"admin:apple": never;',
    '"admin:errors.it\'s": never;',
    '"admin:greeting": { "user-name": string };',
    '"admin:ключ": never;',
  ];

  assert.deepEqual(keyLinesOf(new TypeEmitter().generate(SCHEMA)), expected);
  assert.deepEqual(keyLinesOf(emitDeclarations(SCHEMA)), expected);
});

after(() => {
  fs.rmSync(OUT_ROOT, { recursive: true, force: true });
});
