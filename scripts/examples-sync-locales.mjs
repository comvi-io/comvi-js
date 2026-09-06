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

  if (check) {
    if (drifted.length === 0) {
      console.log(`examples-sync-locales: ${files.length} catalogs in sync everywhere.`);
      return 0;
    }
    console.error(
      `examples-sync-locales: ${drifted.length} copy(ies) differ from examples/locales:\n` +
        `${drifted.map((file) => `  ${file}`).join("\n")}\n` +
        "Run `pnpm examples:sync-locales`.",
    );
    return 1;
  }

  console.log(
    drifted.length === 0
      ? `examples-sync-locales: ${files.length} catalogs already in sync.`
      : `examples-sync-locales: updated ${drifted.length} file(s):\n${drifted.map((file) => `  ${file}`).join("\n")}`,
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
