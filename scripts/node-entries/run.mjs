/**
 * Can plain Node (a test runner, a script) import the entries meant for it,
 * from what npm would install?
 *
 * The Svelte binding's entries publish `.svelte` and rune modules, which only a Svelte-aware
 * bundler can load, so code that runs in plain Node formats through `@comvi/core/format` with a
 * real instance. This packs the package with `pnpm pack`, extracts the tarball into an empty
 * `node_modules` (no install, no network, nothing hoisted from the workspace) and imports the
 * entry in a fresh `node` process.
 *
 * Two copies of the core. A binding that resolves one `@comvi/core` while the app created its
 * instance with another must fail with an error that names both copies' versions, in the
 * production build and in the development one (`-C development`). Two layouts from the packed
 * tarball: the binding's own copy carries a second version (the same build relabelled, which is
 * what a different published version looks like to the check), and both copies carry the SAME
 * version (a peer range does not prevent that). A binding that reaches the app's copy is
 * the control: no error.
 *
 * Needs the workspace built (`pnpm build`). `pnpm check:node-entries`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const PACKAGES = ["core"];

const CASES = [
  {
    specifier: "@comvi/core/format",
    exports: [
      "displayName",
      "formatCurrency",
      "formatDate",
      "formatDateRange",
      "formatList",
      "formatNumber",
      "formatRelativeTime",
    ],
    probe: "m.formatNumber((await import('@comvi/core')).createI18n({ locale: 'de' }), 1234.5)",
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

  twoCopies(path.join(app, "node_modules", "@comvi", "core"));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

/**
 * The two-copies cases against `coreDir`, the extracted tarball. Each layout is an app whose
 * `node_modules` holds `@comvi/core` (the app's copy, which creates the instance) and `binding`,
 * a package that reads the instance the way every binding does — `core(i18n)` from
 * `@comvi/core/internal` — through its OWN nested copy when the case gives it one.
 */
function twoCopies(coreDir) {
  const { version } = JSON.parse(fs.readFileSync(path.join(coreDir, "package.json"), "utf8"));
  const OTHER = "0.0.0-copy";
  // The exact texts, both builds: the instance's copy first, then the copy reading it.
  const twoVersions = {
    prod: `two copies of @comvi/core: ${OTHER}, ${version}`,
    dev:
      `[@comvi/core] two copies of @comvi/core are loaded: the instance was created by ` +
      `@comvi/core@${OTHER}, and a second copy, @comvi/core@${version}, reads it. ` +
      `Put @comvi/core and every binding on one version and install it once.`,
  };
  const oneVersion = {
    prod: `two copies of @comvi/core: ${version}, ${version}`,
    dev:
      `[@comvi/core] this instance was not created by this copy of @comvi/core, though both ` +
      `are @comvi/core@${version}: one version is installed twice (install it once), or the ` +
      `instance is a copy or a Proxy of the real one (pass the instance itself; in Vue, ` +
      `toRaw() it), or the development and production builds of one install meet.`,
  };
  const untagged = {
    prod: `two copies of @comvi/core: undefined, ${version}`,
    dev:
      "[@comvi/core] not an instance of createI18n(), or it was created by a copy of " +
      "@comvi/core older than 0.8",
  };

  /**
   * A copy of the extracted core under `target`, its manifest and inlined version set to `to`.
   * `untag` takes the version tag off the instance in both builds: what a core older than 0.8
   * (0.7.x, no tag) creates.
   */
  const copyCore = (target, to, untag = false) => {
    fs.cpSync(coreDir, target, { recursive: true });
    const at = new RegExp(`(?<![\\d.])${version.replace(/\./g, "\\.")}(?![\\d.])`, "g");
    let cut = 0;
    for (const f of fs.readdirSync(path.join(target, "dist"), { recursive: true })) {
      const file = path.join(target, "dist", f);
      if (!/\.js$/.test(f)) continue;
      let src = fs.readFileSync(file, "utf8");
      if (to !== version) src = src.replace(at, to);
      if (untag) src = src.replace(/^\s*\[VER(?:\$\d+)?\]: [^,\n]+,\n/m, () => (cut++, ""));
      fs.writeFileSync(file, src);
    }
    // Both builds carry the tag once: anything else is a probe that tests nothing.
    if (untag && cut !== 2) fail(`two copies: took the tag off ${cut} files, not 2`);
    if (to === version) return;
    const manifest = path.join(target, "package.json");
    const pkg = JSON.parse(fs.readFileSync(manifest, "utf8"));
    fs.writeFileSync(manifest, `${JSON.stringify({ ...pkg, version: to }, null, 2)}\n`);
  };

  const layouts = [
    { name: "different versions", app: OTHER, binding: version, want: twoVersions },
    { name: "the same version", app: version, binding: version, want: oneVersion },
    {
      name: "an untagged instance (a core older than 0.8)",
      app: version,
      untag: true,
      binding: version,
      want: untagged,
    },
    { name: "one copy (control)", app: version, binding: null },
  ];
  for (const layout of layouts) {
    const app = path.join(root, `two-copies-${layouts.indexOf(layout)}`);
    copyCore(path.join(app, "node_modules", "@comvi", "core"), layout.app, layout.untag);
    const binding = path.join(app, "node_modules", "binding");
    fs.mkdirSync(binding, { recursive: true });
    fs.writeFileSync(
      path.join(binding, "package.json"),
      `${JSON.stringify({ name: "binding", type: "module", exports: "./index.js" })}\n`,
    );
    fs.writeFileSync(
      path.join(binding, "index.js"),
      'import { core } from "@comvi/core/internal";\nexport const read = (i18n) => core(i18n).s().locale;\n',
    );
    if (layout.binding)
      copyCore(path.join(binding, "node_modules", "@comvi", "core"), layout.binding);
    fs.writeFileSync(
      path.join(app, "package.json"),
      `${JSON.stringify({ name: "two-copies-app", private: true, type: "module" })}\n`,
    );
    const script = [
      'const { createI18n } = await import("@comvi/core");',
      'const { read } = await import("binding");',
      'try { console.log(JSON.stringify({ read: read(createI18n({ locale: "en" })) })); }',
      "catch (e) { console.log(JSON.stringify({ error: e.message })); }",
    ].join("\n");
    for (const build of ["prod", "dev"]) {
      const args = build === "dev" ? ["-C", "development"] : [];
      const result = spawnSync(process.execPath, [...args, "--input-type=module", "-e", script], {
        cwd: app,
        encoding: "utf8",
      });
      if (result.status !== 0)
        fail(`two copies, ${layout.name}, ${build}:\n${result.stderr.trim()}`);
      const actual = JSON.parse(result.stdout);
      const want = layout.binding ? { error: layout.want[build] } : { read: "en" };
      if (JSON.stringify(actual) !== JSON.stringify(want)) {
        fail(
          `two copies, ${layout.name}, ${build} build:\n  got      ${JSON.stringify(actual)}\n  expected ${JSON.stringify(want)}`,
        );
      }
      console.log(
        `node-entries: two copies, ${layout.name}, ${build} build: ${JSON.stringify(actual)}`,
      );
    }
  }
}
