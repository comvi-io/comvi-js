#!/usr/bin/env node
// One-off migration: turns `// Stryker disable next-line <Mutators>: <reason>` directives (and the
// `//` comment blocks that argue about mutants) into scripts/mutation/accepted.json entries keyed by
// the TEXT of the mutated line, then strips them from src. Usage: node extract-accepted.mjs <pkgdir> [--strip]
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../..");
const [pkg, ...flags] = process.argv.slice(2);
const strip = flags.includes("--strip");
const ACCEPTED = path.join(ROOT, "scripts/mutation/accepted.json");
const RATIONALE = path.join(ROOT, "scripts/mutation/ACCEPTED.md");
const store = fs.existsSync(ACCEPTED)
  ? JSON.parse(fs.readFileSync(ACCEPTED, "utf8"))
  : { entries: [] };
const rationale = [];

function walk(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((d) =>
      d.isDirectory()
        ? walk(path.join(dir, d.name))
        : /\.(ts|tsx)$/.test(d.name)
          ? [path.join(dir, d.name)]
          : [],
    );
}
// Directives sit either on their own line or after a ternary `:` (prettier's reflow); in the
// second form the arm was one line before the directive was added and is re-joined on strip.
const DIRECTIVE = /^(\s*(?::\s*)?)\/\/\s*Stryker disable next-line ([A-Za-z,\s]+?):\s*(.*)$/;
let added = 0;
for (const abs of walk(path.join(ROOT, pkg, "src"))) {
  const rel = path.relative(path.join(ROOT, pkg), abs);
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  const keep = [];
  for (let i = 0; i < lines.length; i++) {
    const m = DIRECTIVE.exec(lines[i]);
    if (m) {
      let j = i + 1;
      while (j < lines.length && /^\s*\/\//.test(lines[j])) j++;
      const prefix = m[1];
      // A directive after a ternary `:` split the arm over two lines; re-join it so the stripped
      // source (and the snippet the matcher keys on) is the one-line form.
      if (prefix.trim() === ":") lines[j] = prefix.replace(/\s+$/, " ") + (lines[j] ?? "").trim();
      const snippet = (lines[j] ?? "").trim();
      const mutators = m[2]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const reason = m[3].trim();
      // One entry per directive: it accepts the listed mutators on ONE line whose text matches;
      // `lineHint` is only a tiebreaker when the same text occurs more than once in the file.
      const kind = /prod(uction)?[- ]only|__DEV__|IS_DEV|this build defines/i.test(reason)
        ? "gap:prod-build"
        : "equivalent";
      store.entries.push({
        package: pkg,
        file: rel,
        mutators,
        snippet,
        lineHint: j + 1,
        kind,
        reason,
      });
      added++;
      continue; // drop the directive line
    }
    keep.push(lines[i]);
  }
  // `//` comment blocks that reason about mutants (block notes) — move to ACCEPTED.md, then drop.
  const out = [];
  for (let i = 0; i < keep.length; i++) {
    if (/^\s*\/\//.test(keep[i])) {
      let j = i;
      while (j < keep.length && /^\s*\/\//.test(keep[j])) j++;
      const block = keep.slice(i, j);
      if (block.some((l) => /\bmutants?\b/i.test(l))) {
        rationale.push(
          `### ${rel} (near \`${(keep[j] ?? "").trim().slice(0, 60)}\`)\n${block.map((l) => l.replace(/^\s*\/\/ ?/, "")).join("\n")}\n`,
        );
        i = j - 1;
        continue;
      }
      out.push(...block);
      i = j - 1;
      continue;
    }
    out.push(keep[i]);
  }
  if (strip && out.join("\n") !== lines.join("\n")) fs.writeFileSync(abs, out.join("\n"));
}
fs.writeFileSync(ACCEPTED, JSON.stringify(store, null, 2) + "\n");
if (rationale.length) {
  const head = fs.existsSync(RATIONALE)
    ? fs.readFileSync(RATIONALE, "utf8")
    : "# Accepted mutants — rationale\n\nEntries in `accepted.json` are matched by file + mutator + the text of the mutated line. Longer arguments live here.\n";
  fs.writeFileSync(RATIONALE, head + "\n" + rationale.join("\n"));
}
console.log(
  `accepted.json: +${added} (total ${store.entries.length}); rationale blocks: ${rationale.length}; strip=${strip}`,
);
