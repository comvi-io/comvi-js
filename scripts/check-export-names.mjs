#!/usr/bin/env node
// Do a published entry's runtime exports and its declarations name the same values?
//
// A runtime export the `.d.ts` does not declare is a public name nobody can see or is held to
// (0.7's `@comvi/solid` leaked `t`); a declared value the dist lacks is a crash at the call. For
// every `exports` entry of every published package, for every JS condition of that entry:
//
//   runtime names (esbuild's view of the file, its own relative chunks followed, nothing
//   executed: a Svelte entry cannot load in plain Node) == the value exports of the entry's
//   `types` (the TypeScript checker; type-only exports do not count).
//
// `export *` from another package hides names from this comparison, so it is a failure: entries
// use named re-exports only. Patterns (`./runtime/*`) name no one entry and are left out.
//
// `node scripts/check-export-names.mjs` skips a package with no dist and says so, because
// `pnpm test:release-tools` also runs in the CI job that builds nothing; `--require-dist` (the
// `build` job, `pnpm check:export-names`) fails on it instead.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import ts from "typescript";
import { TYPED_PACKAGES } from "../tooling/typed-packages.mjs";
import { partition } from "../tooling/migration-pending.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The `{ subpath, types, targets: [{ condition, file }] }` of one package's `exports` map. */
export function entriesOf(pkgDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  const entries = [];
  for (const [subpath, value] of Object.entries(manifest.exports ?? {})) {
    if (subpath.includes("*") || subpath === "./package.json") continue;
    const targets = [];
    let types;
    const walk = (node, conditions) => {
      if (typeof node === "string") {
        if (conditions.at(-1) === "types") types ??= node;
        else if (!targets.some((t) => t.file === node))
          targets.push({ condition: conditions.join(".") || "default", file: node });
        return;
      }
      for (const [condition, next] of Object.entries(node ?? {}))
        walk(next, [...conditions, condition]);
    };
    walk(value, []);
    if (types !== undefined) entries.push({ subpath, types, targets });
  }
  return entries;
}

/** The export names of a built JS entry, or a `failure` when `export *` hides some. */
export async function runtimeNames(file) {
  // A CommonJS entry (`@comvi/next/plugin`'s `require` target): bundled as ESM it shows only a
  // `default`; Node's own import of it reads the names it exports (cjs-module-lexer).
  if (file.endsWith(".cjs")) {
    const mod = await import(pathToFileURL(file).href);
    return {
      names: Object.keys(mod)
        .filter((n) => n !== "default" && n !== "module.exports")
        .sort(),
      failure: undefined,
    };
  }
  const result = await build({
    entryPoints: [file],
    bundle: true,
    packages: "external",
    format: "esm",
    platform: "neutral",
    write: false,
    metafile: true,
    outfile: "out.js",
    logLevel: "silent",
    // `@comvi/svelte` publishes `T.svelte` as source; what a component exports is not at issue.
    loader: { ".svelte": "empty" },
  });
  const [output] = Object.values(result.metafile.outputs);
  const star = /export\s*\*\s*from\s*"([^"]+)"/.exec(result.outputFiles[0].text);
  return {
    names: [...output.exports].sort(),
    failure: star ? `\`export *\` from ${star[1]} hides names from this check` : undefined,
  };
}

/** Reads the value exports of each `.d.ts` in `files` through ONE program: `Map<file, names>`. */
export function declaredValueNames(files) {
  const program = ts.createProgram(files, {
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  });
  const checker = program.getTypeChecker();
  return new Map(
    files.map((file) => {
      const source = program.getSourceFile(file);
      const symbol = source && checker.getSymbolAtLocation(source);
      if (!symbol) return [file, null];
      const names = checker
        .getExportsOfModule(symbol)
        .filter((s) => {
          // `export type { Foo }` of a class: its target is a value, this export is not.
          if (s.declarations?.some((d) => ts.isTypeOnlyImportOrExportDeclaration(d))) return false;
          const target = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
          // An alias the checker cannot follow is reported as a value, so it shows up as a
          // difference instead of passing unseen.
          return checker.isUnknownSymbol(target) || (target.flags & ts.SymbolFlags.Value) !== 0;
        })
        .map((s) => s.name);
      return [file, names.sort()];
    }),
  );
}

/** One line per difference between `runtime` and `declared` (empty when they agree). */
export function compareNames(runtime, declared) {
  const missing = runtime.filter((n) => !declared.includes(n));
  const absent = declared.filter((n) => !runtime.includes(n));
  return [
    ...(missing.length ? [`in the dist, not in the .d.ts: ${missing.join(", ")}`] : []),
    ...(absent.length ? [`in the .d.ts, not in the dist: ${absent.join(", ")}`] : []),
  ];
}

/** The bindings an app's barrel may `export *` next to `@comvi/core`. */
export const BARREL_BINDINGS = ["@comvi/react", "@comvi/vue", "@comvi/solid", "@comvi/svelte"];

/**
 * Clashes a barrel of core and a binding has on purpose: `@comvi/vue`'s `createI18n()` returns a
 * Vue plugin, not the core instance. Such a barrel names the one it means.
 */
export const BARREL_CLASHES = { "@comvi/vue": ["createI18n"] };

/**
 * Compiles `export * from "@comvi/core"; export * from "<binding>";` for each binding over the
 * built declarations; returns one line per diagnostic. A name both export as different
 * declarations is TS2308 in such a barrel; that is why the core's params type is
 * `CoreUntypedParams`, and each binding's own `UntypedParams`.
 */
export function barrelDiagnostics(bindings = BARREL_BINDINGS, root = ROOT) {
  const files = new Map(
    bindings.map((b) => [
      path.join(root, `__barrel-${b.split("/").pop()}.ts`).replaceAll("\\", "/"),
      `export * from "@comvi/core";\nexport * from "${b}";\n`,
    ]),
  );
  const options = {
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  };
  const host = ts.createCompilerHost(options);
  const { fileExists, readFile, getSourceFile } = host;
  host.fileExists = (f) => files.has(f) || fileExists(f);
  host.readFile = (f) => files.get(f) ?? readFile(f);
  host.getSourceFile = (f, ...rest) =>
    files.has(f)
      ? ts.createSourceFile(f, files.get(f), ts.ScriptTarget.ES2022)
      : getSourceFile(f, ...rest);
  const program = ts.createProgram([...files.keys()], options, host);
  return [...files.keys()].flatMap((f, i) =>
    ts
      .getPreEmitDiagnostics(program, program.getSourceFile(f))
      .filter(
        (d) =>
          d.code !== 2308 ||
          !(BARREL_CLASHES[bindings[i]] ?? []).some((n) =>
            ts.flattenDiagnosticMessageText(d.messageText, " ").includes(`member named '${n}'`),
          ),
      )
      .map(
        (d) =>
          `barrel core + ${bindings[i]}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`,
      ),
  );
}

/** Checks `pkgDirs`; returns `{ failures, checked, skipped }`. */
export async function checkPackages(pkgDirs) {
  const failures = [];
  const skipped = [];
  const jobs = [];
  for (const dir of pkgDirs) {
    const name = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).name;
    for (const { subpath, types, targets } of entriesOf(dir)) {
      const typesFile = path.join(dir, types);
      const present = targets.filter((t) => fs.existsSync(path.join(dir, t.file)));
      if (!fs.existsSync(typesFile) || present.length < targets.length) {
        skipped.push(`${name} ${subpath}`);
        continue;
      }
      jobs.push({ name, subpath, typesFile, dir, targets });
    }
  }
  const declared = declaredValueNames([...new Set(jobs.map((j) => j.typesFile))]);
  let checked = 0;
  for (const { name, subpath, typesFile, dir, targets } of jobs) {
    const names = declared.get(typesFile);
    if (!names) {
      failures.push(`${name} ${subpath}: ${path.relative(dir, typesFile)} did not load`);
      continue;
    }
    for (const { condition, file } of targets) {
      checked++;
      const label = `${name} ${subpath} [${condition}] ${file}`;
      const runtime = await runtimeNames(path.join(dir, file));
      if (runtime.failure) failures.push(`${label}: ${runtime.failure}`);
      for (const line of compareNames(runtime.names, names)) failures.push(`${label}: ${line}`);
    }
  }
  return { failures, checked, skipped };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { active } = partition(TYPED_PACKAGES, "check-export-names");
  const { failures, checked, skipped } = await checkPackages(
    active.map((dir) => path.join(ROOT, "packages", dir)),
  );
  for (const entry of skipped) console.log(`check-export-names: no dist for ${entry}`);
  if (process.argv.includes("--require-dist") && skipped.length > 0) {
    console.error("check-export-names: FAIL — run `pnpm build` first");
    process.exit(1);
  }
  const built = ["core", ...BARREL_BINDINGS.map((b) => b.split("/").pop())].every((d) =>
    fs.existsSync(path.join(ROOT, "packages", d, "dist/index.d.ts")),
  );
  if (built) failures.push(...barrelDiagnostics());
  else console.log("check-export-names: no dist for the barrel check");
  if (failures.length > 0) {
    for (const failure of failures) console.error(`check-export-names: FAIL ${failure}`);
    process.exit(1);
  }
  console.log(
    `check-export-names: ${checked} built entries match their declarations` +
      (built ? `; \`export *\` of core with each of ${BARREL_BINDINGS.join(", ")} compiles` : ""),
  );
}
