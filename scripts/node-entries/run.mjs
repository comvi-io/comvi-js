/**
 * Can plain Node (a test runner, a script) import the entries meant for it,
 * from what npm would install?
 *
 * `@comvi/svelte`'s root re-exports `T.svelte`, which only a Svelte-aware
 * bundler can load, so code that runs in plain Node imports the standalone
 * formatters from `@comvi/svelte/format` instead. This packs the packages with
 * `pnpm pack`, extracts the tarballs into an empty `node_modules` (no install,
 * no network, nothing hoisted from the workspace) and imports each entry in a
 * fresh `node` process.
 *
 * Needs the workspace built (`pnpm build`). `pnpm check:node-entries`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const PACKAGES = ["core", "svelte"];

const CASES = [
  {
    specifier: "@comvi/svelte/format",
    exports: ["formatCurrency", "formatDate", "formatNumber", "formatRelativeTime"],
    probe: "m.formatNumber({ locale: 'de' }, 1234.5)",
    expected: "1.234,5",
  },
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-node-entries-"));

function fail(message) {
  console.error(`node-entries: ${message}`);
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(1);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    fail(`\`${command} ${args.join(" ")}\` failed in ${cwd}:\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

try {
  const tarballs = path.join(root, "tarballs");
  fs.mkdirSync(tarballs);
  for (const name of PACKAGES) {
    const dir = path.join(REPO_ROOT, "packages", name);
    if (!fs.existsSync(path.join(dir, "dist"))) {
      fail(`@comvi/${name} has no build output in ${dir}/dist. Run \`pnpm build\` first.`);
    }
    run("pnpm", ["pack", "--pack-destination", tarballs], dir);
  }

  const app = path.join(root, "app");
  for (const tarball of fs.readdirSync(tarballs)) {
    const name = tarball.replace(/^comvi-/, "").replace(/-\d+\.\d+\.\d+.*\.tgz$/, "");
    const target = path.join(app, "node_modules", "@comvi", name);
    fs.mkdirSync(target, { recursive: true });
    run("tar", ["-xzf", path.join(tarballs, tarball), "-C", target, "--strip-components=1"], app);
  }
  fs.writeFileSync(
    path.join(app, "package.json"),
    `${JSON.stringify({ name: "node-entries-app", private: true, type: "module" })}\n`,
  );

  for (const { specifier, exports, probe, expected } of CASES) {
    const script = [
      `const m = await import(${JSON.stringify(specifier)});`,
      `console.log(JSON.stringify({ keys: Object.keys(m).sort(), probe: ${probe} }));`,
    ].join("\n");
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: app,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      fail(`plain Node cannot import ${specifier}:\n${result.stderr.trim()}`);
    }
    const { keys, probe: actual } = JSON.parse(result.stdout);
    if (JSON.stringify(keys) !== JSON.stringify(exports)) {
      fail(`${specifier} exports ${keys.join(", ")}; expected ${exports.join(", ")}`);
    }
    if (actual !== expected)
      fail(`${specifier}: ${probe} returned ${actual}, expected ${expected}`);
    console.log(`node-entries: ${specifier} loads in plain Node (${keys.length} exports)`);
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
