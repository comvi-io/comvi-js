import fs from "node:fs";
import path from "node:path";
import url from "node:url";

/**
 * Point every example's `@comvi/*` range at a dist-tag, or back at a range.
 *
 * The examples ship `^0.5.0`, which is the right thing on `main` the day 0.5.0
 * is on npm and the wrong thing before it: StackBlitz installs from the
 * registry, so a demo branch opened during the RC has to ask for `next`. This
 * rewrites the ranges and nothing else — no other dependency is touched, and
 * the file stays byte-stable apart from those values.
 *
 *   node scripts/examples-use-tag.mjs next        →  "@comvi/react": "next"
 *   node scripts/examples-use-tag.mjs ^0.5.0      →  back to the release range
 *   node scripts/examples-use-tag.mjs --print     →  what each example asks for now
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

export function manifests(root = REPO_ROOT) {
  const examples = path.join(root, "examples");
  return fs
    .readdirSync(examples)
    .sort()
    .map((entry) => path.join(examples, entry, "package.json"))
    .filter((file) => fs.existsSync(file));
}

/** The rewritten manifest plus the ranges it changed. */
export function retag(manifest, specifier) {
  const changes = [];
  const next = { ...manifest };
  for (const pool of ["dependencies", "devDependencies"]) {
    if (!manifest[pool]) continue;
    const updated = { ...manifest[pool] };
    for (const [name, range] of Object.entries(updated)) {
      if (!name.startsWith("@comvi/") || range === specifier) continue;
      changes.push({ pool, name, from: range, to: specifier });
      updated[name] = specifier;
    }
    next[pool] = updated;
  }
  return { manifest: next, changes };
}

function main(argv) {
  if (argv.includes("--print") || argv.length === 0) {
    for (const file of manifests()) {
      const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
      const ranges = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })
        .filter(([name]) => name.startsWith("@comvi/"))
        .map(([name, range]) => `${name}@${range}`);
      console.log(`${path.relative(REPO_ROOT, path.dirname(file))}: ${ranges.join(", ")}`);
    }
    if (argv.length === 0) {
      console.error("\nusage: node scripts/examples-use-tag.mjs <dist-tag|range> | --print");
      return 2;
    }
    return 0;
  }

  const specifier = argv[0];
  let total = 0;
  for (const file of manifests()) {
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    const { manifest: next, changes } = retag(manifest, specifier);
    if (changes.length === 0) continue;
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    total += changes.length;
    for (const change of changes) {
      console.log(
        `${path.relative(REPO_ROOT, path.dirname(file))}: ${change.name} ${change.from} → ${change.to}`,
      );
    }
  }
  console.log(
    total === 0
      ? `examples-use-tag: every @comvi range is already "${specifier}".`
      : `examples-use-tag: ${total} range(s) now "${specifier}".`,
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
