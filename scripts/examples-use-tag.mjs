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

const USAGE = "usage: node scripts/examples-use-tag.mjs <dist-tag|range> | --print";

/**
 * A dist-tag or a semver range, and nothing else.
 *
 * This script writes whatever it is handed into every example's manifest, so an
 * unvalidated argument is an arbitrary-value write: a stray flag
 * (`--print` misspelled), a shell-mangled range, or a `file:` /
 * `git+ssh://` specifier that would make the examples install from somewhere
 * other than npm — the one thing they exist to prove they do not do.
 *
 * The first character is its own class for one reason only: `-` must not start
 * the string, because `-anything` is a flag the caller thought they were
 * passing rather than a version. It still has to admit the range operators, or
 * the pattern would reject `^0.5.0` — the exact argument the README documents
 * for coming back off a dist-tag, and the half of the round trip that makes
 * this script reversible.
 *
 * Named, not inlined, because the rejection message quotes it: a hand-copied
 * pattern in the error text drifted from the real one the first time this was
 * edited, and told the caller `^0.5.0` was invalid while the code accepted it.
 */
export const SPECIFIER_RE = /^[a-z0-9^~<>=*][a-z0-9.^~<>=* -]*$/i;

export function isValidSpecifier(value) {
  return typeof value === "string" && SPECIFIER_RE.test(value);
}

function main(argv) {
  if (argv.length === 0) {
    console.error(USAGE);
    return 2;
  }

  if (argv.includes("--print")) {
    // Silently ignoring the rest would answer a question nobody asked:
    // `--print next` reads as "print, then set", and half of that happening is
    // worse than an error.
    if (argv.length > 1) {
      console.error(
        `--print takes no other argument (got: ${argv.filter((arg) => arg !== "--print").join(" ")}).\n${USAGE}`,
      );
      return 2;
    }
    for (const file of manifests()) {
      const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
      const ranges = Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })
        .filter(([name]) => name.startsWith("@comvi/"))
        .map(([name, range]) => `${name}@${range}`);
      console.log(`${path.relative(REPO_ROOT, path.dirname(file))}: ${ranges.join(", ")}`);
    }
    return 0;
  }

  if (argv.length > 1) {
    console.error(`expected one specifier, got ${argv.length}: ${argv.join(" ")}\n${USAGE}`);
    return 2;
  }

  const specifier = argv[0];
  if (!isValidSpecifier(specifier)) {
    console.error(
      `refusing to write ${JSON.stringify(specifier)} into every example manifest: it is neither a ` +
        `dist-tag nor a semver range. Expected ${SPECIFIER_RE} — e.g. \`next\` or \`^0.5.0\`. ` +
        `A leading \`-\` is a flag, and a \`file:\` or git specifier would stop the examples ` +
        `installing from npm.\n${USAGE}`,
    );
    return 2;
  }

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
