#!/usr/bin/env node
/**
 * framework-slim 0.5.0 codemod — the checked-in migration deliverable
 * (`.omc/plans/comvi-framework-slim.md` §3.1).
 *
 * Moves the four members that left `useI18n()` onto the capability hooks
 * `useI18nLoader()` / `useI18nPlugins()` and reports — deterministically,
 * never silently — every shape it refuses to rewrite.
 *
 *   node scripts/codemods/framework-slim/run.mjs "<glob>" [--report report.json]
 *
 * Exit codes: 0 = clean or fully transformed; 2 = rewrites applied and manual
 * items remain; 1 = error. No changeset may claim "mechanical migration"
 * before `node --test scripts/codemods/framework-slim/run.test.mjs` is green.
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
  extractScriptBlocks,
  positionAt,
} from "./rules/script-blocks.mjs";

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

/** Every extension the codemod knows how to open. */
export const SUPPORTED_EXTENSIONS = [...LANG_BY_EXTENSION.keys(), ...SFC_EXTENSIONS];

// ---------------------------------------------------------------------------
// Import maintenance
// ---------------------------------------------------------------------------

/**
 * Adds the hooks a rewrite introduced to the import that already provides
 * `useI18n`. Bare specifiers merge in place; anything else (a relative import
 * of the wrapper's source, a nuxt auto-import) is a manual action, because
 * guessing the module path would be a silent breakage.
 */
function planHookImport(root, text, hooksUsed) {
  const wanted = hooksUsed.filter((hook) => !hasLocalBinding(root, hook));
  if (wanted.length === 0) return { edits: [], manual: [] };

  for (const declaration of root.findAll({ rule: { kind: "import_statement" } })) {
    const clause = declaration.text();
    if (!new RegExp(`\\b${SOURCE_HOOK}\\b`).test(clause)) continue;

    const source = declaration.field("source");
    if (source === null) continue;
    const specifier = source.text().slice(1, -1);

    const named = declaration.find({ rule: { kind: "named_imports" } });
    if (named === null) continue;

    if (specifier.startsWith(".") || specifier.startsWith("/")) {
      return {
        edits: [],
        manual: [
          {
            offset: declaration.range().start.index,
            shape: "manual-import",
            detail: `\`${SOURCE_HOOK}\` comes from the relative module "${specifier}" — add \`${wanted.join(
              ", ",
            )}\` to the import that fits your layout`,
          },
        ],
      };
    }

    return { edits: [braceListInsertion(named, wanted)], manual: [] };
  }

  return {
    edits: [],
    manual: [
      {
        offset: 0,
        shape: "manual-import",
        detail: `no import of \`${SOURCE_HOOK}\` found — import \`${wanted.join(", ")}\` from your comvi binding`,
      },
    ],
  };
}

function hasLocalBinding(root, name) {
  return root.findAll({ rule: { kind: "import_specifier" } }).some((specifier) => {
    const alias = specifier.field("alias");
    return (alias === null ? specifier.field("name")?.text() : alias.text()) === name;
  });
}

// ---------------------------------------------------------------------------
// Per-source transform
// ---------------------------------------------------------------------------

/**
 * Transforms one JS/TS body.
 *
 * @returns {{ text: string, rewrites: number, manual: Array<{offset:number,shape:string,detail:string}> }}
 */
export function transformBody(body, lang, { vueProxies = false } = {}) {
  const root = parse(lang, body).root();

  const manual = [
    ...detectEscapedHookResults(root),
    ...(vueProxies ? detectVueProxyCalls(root) : []),
  ];

  const plan = planDestructures(root, body);
  manual.push(...plan.manual);
  if (plan.edits.length === 0) return { text: body, rewrites: 0, manual };

  // A shadowing local only matters once there IS something to rewrite — the
  // module that DEFINES `useI18nLoader` is not a migration candidate.
  const collisions = detectHookNameCollisions(root);
  if (collisions.length > 0) return { text: body, rewrites: 0, manual: [...manual, ...collisions] };

  const importPlan = planHookImport(root, body, plan.hooksUsed);
  manual.push(...importPlan.manual);

  const rewritten = applyEdits(body, [...plan.edits, ...importPlan.edits]);

  return { text: pruneOrphanedSourceHook(rewritten, lang), rewrites: plan.rewrites, manual };
}

/**
 * Drops `useI18n` from its import when a pure T1/T2 rewrite left it with no
 * remaining reference. Without this every migrated loader-only component
 * inherits a fresh `no-unused-vars` error from the codemod.
 */
function pruneOrphanedSourceHook(text, lang) {
  const root = parse(lang, text).root();

  const specifiers = root
    .findAll({ rule: { kind: "import_specifier" } })
    .filter((specifier) => specifier.field("name")?.text() === SOURCE_HOOK);
  if (specifiers.length !== 1) return text;

  const stillUsed = root
    .findAll({ rule: { kind: "identifier", regex: `^${SOURCE_HOOK}$` } })
    .some((identifier) => identifier.parent()?.kind() !== "import_specifier");
  if (stillUsed) return text;

  const [specifier] = specifiers;
  const clause = specifier.parent();
  if (clause === null || clause.kind() !== "named_imports") return text;

  const members = clause.children().filter((child) => child.kind() === "import_specifier");
  if (members.length === 1) return text; // sole import: removing the statement is the user's call

  const index = members.findIndex(
    (member) => member.range().start.index === specifier.range().start.index,
  );
  const span =
    index === members.length - 1
      ? { start: members[index - 1].range().end.index, end: specifier.range().end.index }
      : { start: specifier.range().start.index, end: members[index + 1].range().start.index };

  return applyEdits(text, [{ ...span, text: "" }]);
}

/**
 * Transforms one file's contents, `.vue` / `.svelte` script blocks included.
 *
 * @returns {{ text: string, rewrites: number, manual: Array<{line:number,column:number,shape:string,detail:string}> }}
 */
export function transformSource(source, filePath) {
  const extension = path.extname(filePath);
  // Receiver set for the dropped VueI18n proxies (plan §3.1 report-only, §6.2):
  // `.vue` components, plus nuxt's `comvi.setup` hook — its context `i18n` is
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
      manual: result.manual.map((item) => ({ ...positionAt(source, item.offset), ...item })),
    };
  }

  const { blocks, failures } = extractScriptBlocks(source);
  const manual = failures.map((failure) => ({ ...failure, shape: "script-block-extraction" }));
  const edits = [];
  let rewrites = 0;

  for (const block of blocks) {
    const lang = block.lang === "ts" ? Lang.TypeScript : Lang.JavaScript;
    const result = transformBody(block.body, lang, { vueProxies });
    rewrites += result.rewrites;
    for (const item of result.manual) {
      // Remap: positions are relative to the extracted body.
      manual.push({ ...positionAt(source, block.offset + item.offset), ...item });
    }
    if (result.text !== block.body) {
      edits.push({ start: block.offset, end: block.offset + block.body.length, text: result.text });
    }
  }

  return { text: applyEdits(source, edits), rewrites, manual };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function runCodemod({ patterns, cwd = REPO_ROOT, write = true }) {
  const files = collectFiles(patterns, cwd);
  const changed = [];
  const manual = [];
  let rewrites = 0;

  for (const file of files) {
    const absolute = path.resolve(cwd, file);
    const source = fs.readFileSync(absolute, "utf8");
    const result = transformSource(source, absolute);
    const relative = path.relative(cwd, absolute).split(path.sep).join("/");
    rewrites += result.rewrites;
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
      `${report.summary.filesChanged} rewritten (${report.summary.rewrites} destructure(s)), ` +
      `${report.summary.manualActions} manual action(s)`,
  ];
  for (const file of report.changed) lines.push(`  rewritten  ${file}`);
  for (const item of report.manual) {
    lines.push(
      `  MANUAL     ${item.path}:${item.line}:${item.column}  [${item.shape}] ${item.detail}`,
    );
  }
  if (report.summary.manualActions === 0 && report.summary.filesChanged === 0) {
    lines.push("  nothing to migrate — every call site already uses the 0.5.0 hooks");
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
