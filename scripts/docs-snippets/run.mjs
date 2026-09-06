#!/usr/bin/env node
/**
 * Runner for the docs snippet gate (lot D2a).
 *
 * Two surfaces, one module (docs-0.5 plan §6.2):
 *
 *   --readmes            js-sdk CI: packages/<pkg>/README.md, MIGRATION.md and the
 *                        root README.md — the npm surface, checked by its owner,
 *                        BEFORE publication.
 *   --content <dir>      the www site: every .md/.mdx under <dir>, plus the README
 *                        of every installed `@comvi` package under node_modules, so
 *                        the published READMEs are checked against the same rules
 *                        after publication (owner's decision §5.3: both surfaces,
 *                        identically, or the copies drift again — as they have).
 *
 * Exit 1 on any finding. `--json` prints the machine form for a CI annotation.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lintDocument } from "./lint.mjs";

const DOC_EXTENSIONS = new Set([".md", ".mdx"]);

export function parseArgs(argv) {
  const options = {
    readmes: false,
    content: null,
    sdkVersion: null,
    json: false,
    root: process.cwd(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--readmes") options.readmes = true;
    else if (arg === "--content") options.content = argv[++index] ?? null;
    else if (arg === "--sdk-version") options.sdkVersion = argv[++index] ?? null;
    else if (arg === "--root") options.root = argv[++index] ?? process.cwd();
    else if (arg === "--json") options.json = true;
    else throw new Error(`unknown argument "${arg}"`);
  }
  if (!options.readmes && !options.content) {
    throw new Error("nothing to check: pass --readmes or --content <dir>");
  }
  if (options.content === null && argv.includes("--content")) {
    throw new Error("--content needs a directory");
  }
  return options;
}

/** Every .md/.mdx under `dir`, sorted, so a report reads the same on every run. */
export function collectDocs(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...collectDocs(abs));
    } else if (DOC_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(abs);
    }
  }
  return out;
}

/** The js-sdk npm surface: every package README, MIGRATION.md, the root README. */
export function collectReadmes(root) {
  const out = [];
  const packagesDir = path.join(root, "packages");
  if (fs.existsSync(packagesDir)) {
    for (const entry of fs.readdirSync(packagesDir).sort()) {
      const readme = path.join(packagesDir, entry, "README.md");
      if (fs.existsSync(readme)) out.push(readme);
    }
  }
  for (const name of ["MIGRATION.md", "README.md"]) {
    const abs = path.join(root, name);
    if (fs.existsSync(abs)) out.push(abs);
  }
  return out;
}

/** Installed `@comvi/*` READMEs, when the content root has them (post-publication parity). */
export function collectInstalledReadmes(root) {
  const scope = path.join(root, "node_modules", "@comvi");
  if (!fs.existsSync(scope)) return [];
  const out = [];
  for (const entry of fs.readdirSync(scope).sort()) {
    const readme = path.join(scope, entry, "README.md");
    if (fs.existsSync(readme)) out.push(readme);
  }
  return out;
}

export function runGate(options) {
  const files = [];
  if (options.readmes) files.push(...collectReadmes(options.root));
  if (options.content) {
    const contentDir = path.resolve(options.root, options.content);
    files.push(...collectDocs(contentDir));
    files.push(...collectInstalledReadmes(options.root));
  }

  const findings = [];
  const stats = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(options.root, file) || file;
    const result = lintDocument({ file: relative, source, sdkVersion: options.sdkVersion });
    findings.push(...result.findings);
    stats.push(result.stats);
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);
  return { files, findings, stats };
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Group findings by file, then render `file:line:col rule` lines under each. */
export function formatReport({ files, findings, stats }) {
  const lines = [];
  const byFile = new Map();
  for (const finding of findings) {
    if (!byFile.has(finding.file)) byFile.set(finding.file, []);
    byFile.get(finding.file).push(finding);
  }

  for (const [file, list] of byFile) {
    lines.push(`\n${file}`);
    for (const finding of list) {
      lines.push(`  ${file}:${finding.line}:${finding.col}  ${finding.rule}`);
      lines.push(`    ${finding.message}`);
      if (finding.migration) lines.push(`    see ${finding.migration}`);
    }
  }

  const byRule = new Map();
  for (const finding of findings) byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1);
  const skips = new Map();
  let fenceCount = 0;
  let lintedCount = 0;
  for (const stat of stats) {
    fenceCount += stat.fences;
    lintedCount += stat.linted;
    for (const [category, count] of Object.entries(stat.skips)) {
      skips.set(category, (skips.get(category) ?? 0) + count);
    }
  }

  lines.push("");
  lines.push(
    `docs-snippets: ${files.length} documents, ${fenceCount} fences, ${lintedCount} linted.`,
  );
  if (skips.size > 0) {
    lines.push("  skipped by category:");
    for (const [category, count] of [...skips].sort()) lines.push(`    ${category}: ${count}`);
  }
  if (byRule.size > 0) {
    lines.push("  findings by rule:");
    for (const [rule, count] of [...byRule].sort()) lines.push(`    ${rule}: ${count}`);
  }

  // The divergence baseline D3–D5 is measured against: which pages still call
  // registerLoader on an instance, and which owe a `.with(` they never write.
  // Call sites and mentions are counted separately on purpose — a page that only
  // NAMES registerLoader in a sentence is not a lint failure, but it is still a
  // page the rewrite has to touch.
  const flagged = new Set(
    findings.filter((f) => f.rule === "banned/register-loader-on-instance").map((f) => f.file),
  );
  const callers = stats.filter((stat) => stat.registerLoaderCalls > 0);
  const mentions = stats.filter((stat) => stat.registerLoaderMentions > 0);
  const missingWith = stats.filter((stat) => stat.classes.includes("framework") && !stat.hasWith);
  if (mentions.length > 0) {
    lines.push(`  pages mentioning registerLoader at all: ${mentions.length}`);
    for (const stat of mentions) {
      const mark = flagged.has(stat.file)
        ? "banned"
        : stat.registerLoaderCalls > 0
          ? "call site, chain-exempt"
          : "prose only";
      lines.push(
        `    ${stat.file} — ${stat.registerLoaderCalls} call site(s), ${stat.registerLoaderMentions} mention(s) [${mark}]`,
      );
    }
    lines.push(
      `  of those, pages with a banned registerLoader call: ${flagged.size} (call sites on ${callers.length} pages)`,
    );
  }
  if (missingWith.length > 0) {
    lines.push(`  framework pages missing .with(: ${missingWith.length}`);
    for (const stat of missingWith) lines.push(`    ${stat.file}`);
  }

  lines.push("");
  lines.push(
    findings.length === 0
      ? "docs-snippets: OK — no findings."
      : `docs-snippets: FAIL — ${plural(findings.length, "finding")} in ${plural(byFile.size, "document")}.`,
  );
  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`docs-snippets: ${error.message}`);
    console.error(
      "usage: node scripts/docs-snippets/run.mjs (--readmes | --content <dir>) [--sdk-version <v>] [--json]",
    );
    process.exit(2);
  }
  const result = runGate(options);
  if (options.json)
    console.log(JSON.stringify({ findings: result.findings, stats: result.stats }, null, 2));
  else console.log(formatReport(result));
  process.exit(result.findings.length === 0 ? 0 : 1);
}
