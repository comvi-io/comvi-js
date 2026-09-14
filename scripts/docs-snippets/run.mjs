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
 *                        <dir> is a GATE BOUNDARY, not a convenience: it decides
 *                        which pages are held to these rules. `docs/docs/i18n`
 *                        and `docs/docs/api` are different corpora with different
 *                        owners — the platform's REST-API pages carry no
 *                        `@comvi/*` version stamp and report 16
 *                        `required/version-stamp` findings that mean nothing
 *                        there — and two people pointing this at two roots get
 *                        two baselines that look like a regression in each
 *                        other. So CI must PIN it. For the i18n gate that is
 *                        `src/content/docs/docs/i18n`, and the js-sdk and www
 *                        runners pin the same path.
 *
 * `--typecheck --sdk-root <dir>` adds the type-check pass (lot D2b) on top of the
 * symbol lint. `<dir>` is any directory whose `node_modules` holds `@comvi/*` and
 * the framework types — the workspace root here, whatever
 * `scripts/docs-snippets/link-sdk.mjs` prints for a pre-publication run, or the
 * www app for a run against the published packages. Without `--typecheck`
 * nothing about the D2a behaviour changes, including the exit code.
 *
 * Exit 1 on any finding except the advisory ones (`typecheck/node16-only`),
 * which are counted and printed but do not fail a run: they describe the
 * reader's tsconfig, not the snippet. `--json` prints the machine form for a CI
 * annotation.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lintDocument } from "./lint.mjs";
import { loadRepoSurface } from "./surface.mjs";
import { createTypecheckContext, typecheckDocument } from "./typecheck.mjs";
import { sfcCheckDocuments } from "./sfc-check.mjs";

const DOC_EXTENSIONS = new Set([".md", ".mdx"]);

export function parseArgs(argv) {
  const options = {
    readmes: false,
    content: null,
    sdkVersion: null,
    json: false,
    root: process.cwd(),
    typecheck: false,
    sdkRoot: null,
    sfc: true,
  };
  // A flag's value must not itself look like a flag. `--sdk-root --json` used to
  // swallow `--json` as the directory and then fail much later, deep inside the
  // type driver, with a message about node_modules.
  const value = (flag, index) => {
    const next = argv[index];
    if (next === undefined) throw new Error(`${flag} needs a value`);
    if (next.startsWith("--")) throw new Error(`${flag} needs a value, but got the flag "${next}"`);
    return next;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--readmes") options.readmes = true;
    else if (arg === "--content") options.content = value(arg, ++index);
    else if (arg === "--sdk-version") options.sdkVersion = value(arg, ++index);
    else if (arg === "--root") options.root = value(arg, ++index);
    else if (arg === "--typecheck") options.typecheck = true;
    else if (arg === "--sdk-root") options.sdkRoot = value(arg, ++index);
    else if (arg === "--no-sfc") options.sfc = false;
    else if (arg === "--json") options.json = true;
    else throw new Error(`unknown argument "${arg}"`);
  }
  if (!options.readmes && !options.content) {
    throw new Error("nothing to check: pass --readmes or --content <dir>");
  }
  if (options.typecheck && !options.sdkRoot) {
    throw new Error(
      "--typecheck needs --sdk-root <dir>: a directory whose node_modules holds @comvi/* " +
        "and the framework types. `node scripts/docs-snippets/link-sdk.mjs` prints one.",
    );
  }
  if (options.sdkRoot && !options.typecheck) {
    throw new Error("--sdk-root does nothing without --typecheck");
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

/**
 * The js-sdk npm surface: every package README, MIGRATION.md, the root README,
 * `examples/README.md`, and the design notes under `docs/design/`.
 *
 * `examples/README.md` is here because it was missing. It is a reader-facing
 * page — the index every example app is reached through — and no gate covered
 * it, which is exactly how it drifted while the pages beside it were migrated.
 * A page a reader copies from is either gated or it rots.
 *
 * `docs/design/` is here for the same reason and is the harder case, because
 * nothing publishes it. The wave-5 restructure MOVED the rationale essays out of
 * the READMEs into those notes, fences and all, and an essay that leaves a gated
 * page for an ungated one has not been tidied away — it has been un-checked. The
 * fences a reader copies are the same fences; only the file changed. Collected
 * last, and as a TREE, so a note added in a subdirectory is covered the day it
 * lands rather than the day somebody remembers this list.
 */
export function collectReadmes(root) {
  const out = [];
  const packagesDir = path.join(root, "packages");
  if (fs.existsSync(packagesDir)) {
    for (const entry of fs.readdirSync(packagesDir).sort()) {
      const readme = path.join(packagesDir, entry, "README.md");
      if (fs.existsSync(readme)) out.push(readme);
    }
  }
  for (const name of ["MIGRATION.md", "README.md", path.join("examples", "README.md")]) {
    const abs = path.join(root, name);
    if (fs.existsSync(abs)) out.push(abs);
  }
  out.push(...collectDocs(path.join(root, "docs", "design")));
  return out;
}

/**
 * The measured size baselines, keyed by fixture name, or `null` when this root
 * has none.
 *
 * `scripts/size-budgets.json` is the repo's own measurement record, and it is
 * the authority `prose/stale-size-figure` reads: a README row quoting a byte
 * figure beside a fixture name is a transcription of a row in that file, and a
 * transcription drifts. `null` for a root without the file — the www copy has no
 * `scripts/` tree — leaves the rule inert rather than guessing.
 */
export function loadSizeBaselines(root) {
  const file = path.join(root, "scripts", "size-budgets.json");
  if (!fs.existsSync(file)) return null;
  const budgets = JSON.parse(fs.readFileSync(file, "utf8"));
  const baselines = new Map();
  for (const fixture of budgets.fixtures ?? []) {
    baselines.set(fixture.name, {
      minBytes: fixture.baseline?.minBytes,
      gzipBytes: fixture.baseline?.gzipBytes,
      gzipBudgetBytes: fixture.gzipBudgetBytes,
    });
  }
  return baselines;
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
  const typeStats = [];
  const sfcStats = [];
  // One context for the whole run: the lib files and every `.d.ts` under the SDK
  // root are parsed once and reused by every page's program. Per-page contexts
  // would re-parse `@types/react` forty times.
  const context = options.typecheck ? createTypecheckContext({ sdkRoot: options.sdkRoot }) : null;
  // One surface for the whole run: every package.json and entry source is read
  // once and memoised, so resolving four hundred fences costs one pass over
  // `packages/*`. `null` here — no `packages/` tree under `--root`, which is
  // the www case — leaves `banned/unresolved-comvi-import` inert.
  const surface = loadRepoSurface(options.root);
  // One read for the whole run, like the surface: the baseline file does not
  // change between two documents of the same run, and `null` becomes `undefined`
  // at the call site so the rule's own "inert without it" contract is the only
  // thing lint.mjs has to know.
  const sizeBaselines = loadSizeBaselines(options.root) ?? undefined;

  const sources = new Map();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(options.root, file) || file;
    sources.set(relative, source);
    const result = lintDocument({
      file: relative,
      source,
      sdkVersion: options.sdkVersion,
      surface,
      sizeBaselines,
    });
    findings.push(...result.findings);
    stats.push(result.stats);

    if (context) {
      const typed = typecheckDocument({ file: relative, source, context });
      findings.push(...typed.findings);
      typeStats.push(typed.stats);
    }
  }

  // SFC fences go last and in one batch: vue-tsc and svelte-check are separate
  // processes, and the cost is per invocation, not per file.
  if (context && options.sfc) {
    const sfc = sfcCheckDocuments({ sources, sdkRoot: context.sdkRoot });
    findings.push(...sfc.findings);
    sfcStats.push(...sfc.stats);
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);
  return { files, findings, stats, typeStats, sfcStats };
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Group findings by file, then render `file:line:col rule` lines under each. */
export function formatReport({ files, findings, stats, typeStats = [], sfcStats = [] }) {
  const lines = [];
  // Advisories are printed apart from failures, never mixed in: a
  // `typecheck/node16-only` line describes the reader's tsconfig, and a reader
  // who cannot tell it from a broken snippet ends up fixing the wrong thing.
  const errors = findings.filter((finding) => !finding.advisory);
  const advisories = findings.filter((finding) => finding.advisory);
  const byFile = new Map();
  for (const finding of errors) {
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
  for (const finding of errors) byRule.set(finding.rule, (byRule.get(finding.rule) ?? 0) + 1);
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
  // registerLoader on an instance, and which owe a `.use(` they never write.
  // Call sites and mentions are counted separately on purpose — a page that only
  // NAMES registerLoader in a sentence is not a lint failure, but it is still a
  // page the rewrite has to touch.
  const flagged = new Set(
    findings.filter((f) => f.rule === "banned/register-loader-on-instance").map((f) => f.file),
  );
  const callers = stats.filter((stat) => stat.registerLoaderCalls > 0);
  const mentions = stats.filter((stat) => stat.registerLoaderMentions > 0);
  const missingUse = stats.filter((stat) => stat.classes.includes("framework") && !stat.hasUse);
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
  if (missingUse.length > 0) {
    lines.push(`  framework pages missing .use(installer): ${missingUse.length}`);
    for (const stat of missingUse) lines.push(`    ${stat.file}`);
  }

  if (typeStats.length > 0 || sfcStats.length > 0) {
    let tsPrograms = 0;
    let sfcPrograms = 0;
    let checked = 0;
    let virtual = 0;
    let node16 = 0;
    const sfc = { vue: 0, svelte: 0 };
    const typeSkips = new Map();
    for (const stat of typeStats) {
      tsPrograms += stat.projects ?? 0;
      checked += stat.checkedFences ?? 0;
      virtual += stat.files ?? 0;
      node16 += stat.node16Only ?? 0;
      for (const [category, count] of Object.entries(stat.skips ?? {})) {
        typeSkips.set(category, (typeSkips.get(category) ?? 0) + count);
      }
    }
    for (const stat of sfcStats) {
      sfcPrograms += stat.sfcProjects ?? 0;
      sfc.vue += stat.sfc?.vue ?? 0;
      sfc.svelte += stat.sfc?.svelte ?? 0;
    }
    lines.push("");
    // Two program counts, never one sum. A project holding both a `.ts` and a
    // `.vue` fence is compiled twice — once in memory, once by vue-tsc — and
    // adding the two made the site read as 272 projects when it has 213.
    lines.push(
      `typecheck: ${tsPrograms} tsc programs over ${virtual} virtual files ` +
        `(${checked} ts/tsx fences), ${sfcPrograms} SFC programs ` +
        `(${sfc.vue} vue, ${sfc.svelte} svelte).`,
    );

    // The skip budget is computed on both sides and was only ever printed on
    // one. Printing both, and saying so when they differ, is what makes the
    // budget auditable rather than decorative.
    if (typeSkips.size > 0 || skips.size > 0) {
      const same =
        typeSkips.size === skips.size &&
        [...skips].every(([category, count]) => typeSkips.get(category) === count);
      lines.push(
        same
          ? `  skip budget: lint and typecheck agree (${[...typeSkips]
              .sort()
              .map(([category, count]) => `${category}: ${count}`)
              .join(", ")}).`
          : `  SKIP BUDGETS DISAGREE — lint ${JSON.stringify(
              Object.fromEntries([...skips].sort()),
            )}, typecheck ${JSON.stringify(Object.fromEntries([...typeSkips].sort()))}. ` +
              "One pass is reading fences the other is not.",
      );
    }

    const typeErrors = errors.filter((finding) => finding.rule.startsWith("typecheck/"));
    if (typeErrors.length > 0) {
      const codes = new Map();
      for (const finding of typeErrors) {
        const code = finding.message.match(/^TS(\d+)/)?.[1] ?? "(no code)";
        codes.set(code, (codes.get(code) ?? 0) + 1);
      }
      lines.push(
        `  codes: ${[...codes]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([code, count]) => `${code === "(no code)" ? code : `TS${code}`}×${count}`)
          .join(", ")}`,
      );
      // The single largest class in the corpus, split by the only distinction
      // that changes the fix: a fence that continues the fence above it wants a
      // `check=group=` or an import; a fence naming something nobody declared is
      // simply wrong.
      const continued = typeErrors.filter(
        (finding) => finding.cause === "continues-an-earlier-fence",
      ).length;
      if (continued > 0) {
        lines.push(
          `    of these, ${continued} name something an earlier fence on the same page declares ` +
            "(add check=group= or an import); the rest name something nobody declares.",
        );
      }
    }

    if (advisories.length > 0) {
      const byAdvisory = new Map();
      for (const finding of advisories) {
        byAdvisory.set(finding.rule, (byAdvisory.get(finding.rule) ?? 0) + 1);
      }
      lines.push(`  advisory, not counted against the gate: ${advisories.length}`);
      for (const [rule, count] of [...byAdvisory].sort()) lines.push(`    ${rule}: ${count}`);
      // The whole point of running node16 as well as bundler. Printing the
      // codes rather than the lines keeps the advisory block short enough that
      // people read it.
      const codes = new Map();
      for (const finding of advisories) {
        const code = finding.message.match(/^TS(\d+)/)?.[1];
        if (code) codes.set(code, (codes.get(code) ?? 0) + 1);
      }
      if (codes.size > 0) {
        lines.push(
          `    codes: ${[...codes]
            .sort((a, b) => b[1] - a[1])
            .map(([code, count]) => `TS${code}×${count}`)
            .join(", ")}`,
        );
      }
    } else if (node16 === 0) {
      lines.push("  bundler and node16 agree on every fence.");
    }
  }

  lines.push("");
  lines.push(
    errors.length === 0
      ? `docs-snippets: OK — no findings.${advisories.length > 0 ? ` (${advisories.length} advisory)` : ""}`
      : `docs-snippets: FAIL — ${plural(errors.length, "finding")} in ${plural(byFile.size, "document")}.`,
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
      "usage: node scripts/docs-snippets/run.mjs (--readmes | --content <dir>) " +
        "[--sdk-version <v>] [--typecheck --sdk-root <dir>] [--no-sfc] [--json]",
    );
    process.exit(2);
  }
  const result = runGate(options);
  if (options.json)
    console.log(
      JSON.stringify(
        {
          findings: result.findings,
          stats: result.stats,
          typeStats: result.typeStats,
          sfcStats: result.sfcStats,
        },
        null,
        2,
      ),
    );
  else console.log(formatReport(result));
  process.exit(result.findings.some((finding) => !finding.advisory) ? 1 : 0);
}
