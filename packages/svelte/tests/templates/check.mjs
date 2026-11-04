/**
 * `<T>` in real templates (lot 5): svelte-check over this directory. A line with an
 * `<!-- error: … -->` marker must get an error, every other line none, so a type that
 * loosens a check (a param no longer required, a key no longer checked) fails here.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";

const dir = import.meta.dirname;
const root = join(dir, "../..");
const bin = join(
  dirname(createRequire(join(root, "package.json")).resolve("svelte-check/package.json")),
  "bin/svelte-check",
);
let out;
try {
  out = execFileSync(
    process.execPath,
    [bin, "--tsconfig", join(dir, "tsconfig.json"), "--output", "machine"],
    { cwd: root, encoding: "utf8" },
  );
} catch (e) {
  // svelte-check exits 1 when it found errors: those are what this check compares.
  out = e.stdout;
}
const got = new Set();
for (const line of out.split("\n")) {
  const m = /^\d+ ERROR "([^"]+)" (\d+):\d+ /.exec(line);
  if (m) got.add(`${m[1]}:${m[2]}`);
}
const want = new Set();
for (const f of readdirSync(dir).filter((f) => f.endsWith(".svelte")))
  readFileSync(join(dir, f), "utf8")
    .split("\n")
    .forEach(
      (l, k) => /<!-- error: /.test(l) && want.add(`${relative(root, join(dir, f))}:${k + 1}`),
    );
const missed = [...want].filter((k) => !got.has(k));
const extra = [...got].filter((k) => !want.has(k));
if (missed.length || extra.length || !want.size) {
  console.error(out);
  if (missed.length) console.error(`no error where one is expected:\n  ${missed.join("\n  ")}`);
  if (extra.length) console.error(`an error where none is expected:\n  ${extra.join("\n  ")}`);
  process.exit(1);
}
console.log(`svelte-check: ${want.size} expected errors, none elsewhere`);
