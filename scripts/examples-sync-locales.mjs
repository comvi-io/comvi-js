import fs from "node:fs";
import path from "node:path";
import url from "node:url";

/**
 * Re-copy `examples/locales/*.json` into every `examples/<name>/src/locales/`.
 *
 * One scenario, one set of catalogs — but a symlink is not an option: StackBlitz
 * opens ONE directory out of the GitHub tree, so anything an example imports has
 * to be a real file inside that directory. So the catalogs are copied, and this
 * script is what keeps the copies honest.
 *
 *   node scripts/examples-sync-locales.mjs           copy, report what changed
 *   node scripts/examples-sync-locales.mjs --check   exit 1 if any copy drifted
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const SOURCE = path.join(REPO_ROOT, "examples", "locales");

export function targets(root = REPO_ROOT) {
  const examples = path.join(root, "examples");
  return fs
    .readdirSync(examples)
    .sort()
    .filter((entry) => fs.existsSync(path.join(examples, entry, "package.json")))
    .map((entry) => path.join(examples, entry, "src", "locales"));
}

function catalogs(source = SOURCE) {
  return fs
    .readdirSync(source)
    .filter((entry) => entry.endsWith(".json"))
    .sort();
}

/**
 * Catalogs an example carries that the shared source does not.
 *
 * The copy loop below only ever walks the SOURCE list, so a file that exists
 * only in an example is invisible to it — and that is precisely the shape of
 * the drift that matters: someone adds `fr.json` to one app, the demo works for
 * them, and four examples silently stop showing the same scenario. Extra is
 * drift in the same way different is.
 */
export function strays(root = REPO_ROOT, source = SOURCE) {
  const shared = new Set(catalogs(source));
  const found = [];
  for (const dir of targets(root)) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir).sort()) {
      if (!entry.endsWith(".json") || shared.has(entry)) continue;
      found.push(path.relative(root, path.join(dir, entry)));
    }
  }
  return found;
}

function main(argv) {
  const check = argv.includes("--check");
  const files = catalogs();
  const drifted = [];
  for (const dir of targets()) {
    fs.mkdirSync(dir, { recursive: true });
    for (const file of files) {
      const from = path.join(SOURCE, file);
      const to = path.join(dir, file);
      const wanted = fs.readFileSync(from);
      const current = fs.existsSync(to) ? fs.readFileSync(to) : null;
      if (current !== null && current.equals(wanted)) continue;
      drifted.push(path.relative(REPO_ROOT, to));
      if (!check) fs.writeFileSync(to, wanted);
    }
  }
  const extra = strays();

  if (check) {
    if (drifted.length === 0 && extra.length === 0) {
      console.log(`examples-sync-locales: ${files.length} catalogs in sync everywhere.`);
      return 0;
    }
    const report = [];
    if (drifted.length > 0) {
      report.push(
        `${drifted.length} copy(ies) differ from examples/locales:`,
        ...drifted.map((file) => `  ${file}`),
        "Run `pnpm examples:sync-locales`.",
      );
    }
    if (extra.length > 0) {
      report.push(
        `${extra.length} catalog(s) exist only in an example, not in examples/locales:`,
        ...extra.map((file) => `  ${file}`),
        "One scenario, one set of catalogs — move it into examples/locales and sync, or delete it.",
      );
    }
    console.error(`examples-sync-locales: ${report.join("\n")}`);
    return 1;
  }

  // Copying cannot fix a stray, so `--check`'s finding is reported here too
  // rather than being silently absent from the mode people actually run.
  const notes = [];
  notes.push(
    drifted.length === 0
      ? `${files.length} catalogs already in sync.`
      : `updated ${drifted.length} file(s):\n${drifted.map((file) => `  ${file}`).join("\n")}`,
  );
  if (extra.length > 0) {
    notes.push(
      `${extra.length} catalog(s) exist only in an example and were NOT touched:\n` +
        `${extra.map((file) => `  ${file}`).join("\n")}`,
    );
  }
  console.log(`examples-sync-locales: ${notes.join("\n")}`);
  return extra.length > 0 ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
