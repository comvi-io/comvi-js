#!/usr/bin/env node
/**
 * The checked-in 0.5.0 migration deliverable — ONE command for two rule
 * families, because a user migrates once:
 *
 *   • the four members that left `useI18n()` move onto the capability hooks
 *     `useI18nLoader()` / `useI18nPlugins()`;
 *   • `/slim` specifiers and `createSlimI18n` collapse into the one entry,
 *     chained `.use(Plugin(o))` becomes `.with(installer(o))`, and the
 *     constructor options that became capabilities (`compiler: icuCompiler`,
 *     `devtools({ exposeGlobal, instanceId })`, `flattenCatalog`) move with
 *     their imports.
 *
 * Both report — deterministically, never silently — every shape they refuse to
 * rewrite.
 *
 *   node scripts/codemods/framework-slim/run.mjs "<glob>" [--report report.json]
 *
 * Exit codes: 0 = clean or fully transformed; 2 = rewrites applied and manual
 * items remain; 1 = error.
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { parse, Lang } from "@ast-grep/napi";

import { HOOKS, SOURCE_HOOK } from "./rules/capabilities.mjs";
import { planDestructures } from "./rules/destructure.mjs";
import {
  detectEscapedHookResults,
  detectHookNameCollisions,
  detectVueProxyCalls,
} from "./rules/report-only.mjs";
import {
  applyEdits,
  braceListInsertion,
  braceListMembers,
  braceListRemoval,
  extractScriptBlocks,
  positionAt,
} from "./rules/script-blocks.mjs";
import { planSingleEntry } from "./rules/single-entry.mjs";
import { namedImports } from "./rules/imports.mjs";

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../../..");

const LANG_BY_EXTENSION = new Map([
  [".ts", Lang.TypeScript],
  [".mts", Lang.TypeScript],
  [".cts", Lang.TypeScript],
  [".tsx", Lang.Tsx],
  [".jsx", Lang.Tsx],
  [".js", Lang.JavaScript],
  [".mjs", Lang.JavaScript],
  [".cjs", Lang.JavaScript],
]);

const SFC_EXTENSIONS = new Set([".vue", ".svelte"]);
const HOOK_MODULES = new Set([
  "@comvi/react",
  "@comvi/solid",
  "@comvi/svelte",
  "@comvi/vue",
  "@comvi/next/client",
]);

function detectNamespaceHookCalls(root) {
  const namespaces = new Map();
  for (const declaration of root.findAll({ rule: { kind: "import_statement" } })) {
    const namespace = declaration.find({ rule: { kind: "namespace_import" } });
    const source = declaration.field("source");
    const match =
      namespace === null ? undefined : /^\*\s+as\s+([A-Za-z_$][\w$]*)$/.exec(namespace.text());
    if (
      match !== undefined &&
      match !== null &&
      source?.kind() === "string" &&
      HOOK_MODULES.has(source.text().slice(1, -1))
    ) {
      namespaces.set(match[1], source.text().slice(1, -1));
    }
  }

  const findings = [];
  for (const declarator of root.findAll({ rule: { kind: "variable_declarator" } })) {
    const name = declarator.field("name");
    let value = declarator.field("value");
    if (name?.kind() !== "identifier" || value === null) continue;
    if (value.kind() === "await_expression") {
      value = value.find({ rule: { kind: "call_expression" } });
    }
    if (value?.kind() !== "call_expression") continue;
    const loader = value.field("function")?.text();
    if (loader !== "import" && loader !== "require") continue;
    const source = value
      .field("arguments")
      ?.find({ rule: { kind: "string" } })
      ?.text()
      .slice(1, -1);
    if (source !== undefined && HOOK_MODULES.has(source)) namespaces.set(name.text(), source);
  }
  for (const call of root.findAll({ rule: { kind: "call_expression" } })) {
    const callee = call.field("function");
    if (callee?.kind() !== "member_expression") continue;
    const object = callee.field("object");
    const property = callee.field("property");
    if (
      object?.kind() !== "identifier" ||
      property?.text() !== SOURCE_HOOK ||
      !namespaces.has(object.text())
    ) {
      continue;
    }
    findings.push({
      offset: call.range().start.index,
      shape: "namespace-hook-source",
      detail:
        `\`${callee.text()}()\` comes through a namespace import from ` +
        `"${namespaces.get(object.text())}" — use a named hook import and re-run`,
    });
  }
  return findings;
}

/** Every extension the codemod knows how to open. */
export const SUPPORTED_EXTENSIONS = [...LANG_BY_EXTENSION.keys(), ...SFC_EXTENSIONS];

// ---------------------------------------------------------------------------
// Import maintenance
// ---------------------------------------------------------------------------

/**
 * Adds capability hooks to the exact value import that provides Comvi's
 * `useI18n`. Provenance is load-bearing: a same-spelled local hook or an
 * unrelated package must never be rewritten.
 */
function planHookImport(root, sourceImport, hooksUsed) {
  const wanted = [];
  const manual = [];
  const imports = namedImports(root);
  for (const hook of hooksUsed) {
    const existing = imports.filter((entry) => entry.local === hook);
    if (existing.length === 0) {
      wanted.push(hook);
      continue;
    }
    const valid = existing.some(
      (entry) =>
        !entry.typeOnly &&
        entry.imported === hook &&
        (entry.source === sourceImport.source ||
          (sourceImport.source === "@comvi/next/client" && entry.source === "@comvi/react")),
    );
    if (!valid || existing.length > 1) {
      manual.push({
        offset: existing[0].specifier.range().start.index,
        shape: "local-name-collision",
        detail: `\`${hook}\` is not the expected value import for ${sourceImport.source} — the destructures here are left alone`,
      });
    }
  }
  return {
    blocked: manual.length > 0,
    edits:
      manual.length === 0 && wanted.length > 0
        ? [braceListInsertion(sourceImport.clause, wanted)]
        : [],
    manual,
  };
}

// ---------------------------------------------------------------------------
// Per-source transform
// ---------------------------------------------------------------------------

/**
 * Transforms one JS/TS body.
 *
 * The two rule families are INDEPENDENT and are planned against the same parse
 * of the original text: the single-entry rewrites never touch a `useI18n()`
 * destructure, and the capability-hook rewrites never touch a host
 * construction. So a hook-name collision refuses the destructures alone,
 * and a refused chain refuses itself alone — one undecidable shape never
 * silently withdraws a migration a human already read in the report.
 *
 * @returns {{ text: string, rewrites: number,
 *             transforms: Map<string, number>,
 *             manual: Array<{offset:number,shape:string,detail:string}> }}
 */
export function transformBody(body, lang, { vueProxies = false } = {}) {
  const root = parse(lang, body).root();

  const manual = [...(vueProxies ? detectVueProxyCalls(root) : [])];
  manual.push(...detectNamespaceHookCalls(root));

  const single = planSingleEntry(root, body);
  manual.push(...single.manual);

  const edits = [...single.edits];
  const transforms = new Map(single.transforms);
  const orphaned = [...single.prunable];
  let rewrites = [...single.transforms.values()].reduce((sum, count) => sum + count, 0);

  const sourceImports = namedImports(root).filter((entry) => entry.imported === SOURCE_HOOK);
  const supported = sourceImports.filter(
    (entry) => !entry.typeOnly && HOOK_MODULES.has(entry.source),
  );

  if (supported.length === 1) {
    const [sourceImport] = supported;
    const plan = planDestructures(root, body, sourceImport.local);
    manual.push(...plan.manual, ...detectEscapedHookResults(root, sourceImport.local));
    if (plan.edits.length > 0) {
      // A shadowing local only matters once there IS something to rewrite —
      // the module that defines a capability hook is not a migration target.
      const collisions = detectHookNameCollisions(root);
      if (collisions.length > 0) {
        manual.push(...collisions);
      } else {
        const importPlan = planHookImport(root, sourceImport, plan.hooksUsed);
        manual.push(...importPlan.manual);
        if (!importPlan.blocked) {
          edits.push(...plan.edits, ...importPlan.edits);
          transforms.set("capability-hook", plan.rewrites);
          rewrites += plan.rewrites;
          orphaned.push(sourceImport.local);
        }
      }
    }
  } else {
    const locals = new Set([SOURCE_HOOK, ...sourceImports.map((entry) => entry.local)]);
    const hasCandidate = [...locals].some((local) => {
      const probe = planDestructures(root, body, local);
      return (
        probe.edits.length > 0 ||
        probe.manual.length > 0 ||
        detectEscapedHookResults(root, local).length > 0
      );
    });
    if (hasCandidate) {
      manual.push({
        offset: sourceImports[0]?.declaration.range().start.index ?? 0,
        shape: "unproven-hook-source",
        detail:
          supported.length > 1
            ? `multiple Comvi imports provide \`${SOURCE_HOOK}\` — keep one binding and re-run`
            : `\`${SOURCE_HOOK}\` is not a value import from a supported Comvi binding — its calls are left untouched`,
      });
    }
  }

  // One report order, and it is the reader's: two rule families and six
  // detectors contribute findings, and a list that jumps around the file is a
  // list nobody reads. The CLI sorts across files; this sorts within one.
  manual.sort((a, b) => a.offset - b.offset);

  if (edits.length === 0) return { text: body, rewrites: 0, transforms, manual };

  return {
    text: pruneOrphanedImports(applyEdits(body, edits), lang, orphaned),
    rewrites,
    transforms,
    manual,
  };
}

/**
 * Drops the names a rewrite left with no remaining reference from their import:
 * `useI18n` after a pure T1/T2 destructure move, `FetchLoader` after its
 * `.use(FetchLoader(o))` became `.with(fetchLoader(o))`. Without this every
 * migrated file inherits a fresh `no-unused-vars` error from the codemod.
 *
 * Runs on the REWRITTEN text, because "no remaining reference" is a property of
 * the output, not of the input.
 */
function pruneOrphanedImports(text, lang, names) {
  let out = text;
  for (const name of new Set(names)) out = pruneOrphanedImport(out, lang, name);
  return out;
}

function pruneOrphanedImport(text, lang, name) {
  const root = parse(lang, text).root();

  const specifiers = root.findAll({ rule: { kind: "import_specifier" } }).filter((specifier) => {
    const local = specifier.field("alias") ?? specifier.field("name");
    return local?.text() === name;
  });
  if (specifiers.length !== 1) return text;

  const stillUsed = root
    .findAll({ rule: { kind: "identifier", regex: `^${name}$` } })
    .some((identifier) => identifier.parent()?.kind() !== "import_specifier");
  if (stillUsed) return text;

  const [specifier] = specifiers;
  const clause = specifier.parent();
  if (clause === null || clause.kind() !== "named_imports") return text;

  const members = braceListMembers(clause);
  if (members.length === 1) return text; // sole import: removing the statement is the user's call

  const at = specifier.range().start.index;
  const doomed = braceListRemoval(clause, (member) => member.range().start.index === at);
  return applyEdits(text, doomed);
}

/**
 * Transforms one file's contents, `.vue` / `.svelte` script blocks included.
 *
 * @returns {{ text: string, rewrites: number, transforms: Map<string, number>,
 *             manual: Array<{line:number,column:number,shape:string,detail:string}> }}
 */
export function transformSource(source, filePath) {
  const extension = path.extname(filePath);
  // Receiver set for the dropped VueI18n proxies: `.vue` components, plus
  // nuxt's `comvi.setup` hook — its context `i18n` is
  // a VueI18n in the app plugin, so `i18n.registerLoader(...)` there is exactly
  // the shape that must become `i18n.core.registerLoader(...)`. Everywhere else
  // the same shape is overwhelmingly a raw core instance, and reporting it
  // would be noise.
  const vueProxies = extension === ".vue" || /^comvi\.setup\./.test(path.basename(filePath));

  if (!SFC_EXTENSIONS.has(extension)) {
    const lang = LANG_BY_EXTENSION.get(extension);
    if (lang === undefined) throw new Error(`unsupported extension: ${filePath}`);
    const result = transformBody(source, lang, { vueProxies });
    return {
      text: result.text,
      rewrites: result.rewrites,
      transforms: result.transforms,
      manual: result.manual.map((item) => ({ ...positionAt(source, item.offset), ...item })),
    };
  }

  const { blocks, failures } = extractScriptBlocks(source);
  const manual = failures.map((failure) => ({ ...failure, shape: "script-block-extraction" }));
  const transforms = new Map();
  const edits = [];
  let rewrites = 0;

  for (const block of blocks) {
    const lang = block.lang === "ts" ? Lang.TypeScript : Lang.JavaScript;
    const result = transformBody(block.body, lang, { vueProxies });
    rewrites += result.rewrites;
    for (const [kind, count] of result.transforms) {
      transforms.set(kind, (transforms.get(kind) ?? 0) + count);
    }
    for (const item of result.manual) {
      manual.push({ ...positionAt(source, block.offset + item.offset), ...item });
    }
    if (result.text !== block.body) {
      edits.push({ start: block.offset, end: block.offset + block.body.length, text: result.text });
    }
  }

  return { text: applyEdits(source, edits), rewrites, transforms, manual };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function runCodemod({ patterns, cwd = REPO_ROOT, write = true }) {
  const files = collectFiles(patterns, cwd);
  const changed = [];
  const manual = [];
  const transforms = new Map();
  let rewrites = 0;

  for (const file of files) {
    const absolute = path.resolve(cwd, file);
    const source = fs.readFileSync(absolute, "utf8");
    const result = transformSource(source, absolute);
    const relative = path.relative(cwd, absolute).split(path.sep).join("/");
    rewrites += result.rewrites;
    for (const [kind, count] of result.transforms) {
      transforms.set(kind, (transforms.get(kind) ?? 0) + count);
    }
    for (const item of result.manual) manual.push({ path: relative, ...item });
    if (result.text !== source) {
      changed.push(relative);
      if (write) fs.writeFileSync(absolute, result.text);
    }
  }

  manual.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column);

  return {
    generatedAt: new Date().toISOString(),
    root: path.relative(REPO_ROOT, cwd).split(path.sep).join("/") || ".",
    summary: {
      filesScanned: files.length,
      filesChanged: changed.length,
      rewrites,
      manualActions: manual.length,
      // Per shape, so a release checklist can say WHICH migrations a tree
      // needed instead of just how many edits landed.
      transforms: Object.fromEntries([...transforms].sort()),
    },
    changed,
    manual,
  };
}

/**
 * Directories a migration never touches: build output, dependencies and
 * framework caches. Without this, a recursive glob would walk node_modules
 * and rewrite third-party code.
 */
const IGNORED_SEGMENTS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".git",
  ".svelte-kit",
]);

function isIgnored(relative) {
  return relative.split("/").some((segment) => IGNORED_SEGMENTS.has(segment));
}

function collectFiles(patterns, cwd) {
  const out = new Set();
  for (const pattern of patterns) {
    const absolute = path.resolve(cwd, pattern);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
      out.add(absolute);
      continue;
    }
    for (const match of fs.globSync(pattern, { cwd })) {
      const normalized = match.split(path.sep).join("/");
      if (isIgnored(normalized)) continue;
      const file = path.resolve(cwd, match);
      if (!fs.statSync(file).isFile()) continue;
      if (!SUPPORTED_EXTENSIONS.includes(path.extname(file))) continue;
      out.add(file);
    }
  }
  return [...out].sort();
}

export function renderReport(report) {
  const lines = [
    `framework-slim codemod: ${report.summary.filesScanned} file(s) scanned, ` +
      `${report.summary.filesChanged} rewritten (${report.summary.rewrites} rewrite(s)), ` +
      `${report.summary.manualActions} manual action(s)`,
  ];
  for (const file of report.changed) lines.push(`  rewritten  ${file}`);
  for (const [kind, count] of Object.entries(report.summary.transforms)) {
    lines.push(`  transform  ${kind} x${count}`);
  }
  for (const item of report.manual) {
    lines.push(
      `  MANUAL     ${item.path}:${item.line}:${item.column}  [${item.shape}] ${item.detail}`,
    );
  }
  if (report.summary.manualActions === 0 && report.summary.filesChanged === 0) {
    lines.push("  nothing to migrate — this tree is already on the 0.5.0 surface");
  }
  lines.push(
    "",
    `Migration table: ${HOOKS.map(({ hook, members }) => `${hook}() -> ${members.join(", ")}`).join(" | ")}`,
  );
  return lines.join("\n");
}

function main(argv) {
  const patterns = [];
  let reportPath;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--report") {
      reportPath = argv[i + 1];
      if (reportPath === undefined) {
        console.error("--report needs a file path");
        return 1;
      }
      i += 1;
      continue;
    }
    patterns.push(argv[i]);
  }
  if (patterns.length === 0) {
    console.error(
      'usage: node scripts/codemods/framework-slim/run.mjs "<glob>" [--report report.json]',
    );
    return 1;
  }

  const cwd = process.cwd();
  const report = runCodemod({ patterns, cwd });
  if (reportPath !== undefined) {
    fs.writeFileSync(path.resolve(cwd, reportPath), `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(renderReport(report));
  return report.summary.manualActions > 0 ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
