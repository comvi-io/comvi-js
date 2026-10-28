/**
 * Typegen end to end on the BUILT artifacts (design rev 3 R3-18, lot 3b): a fixture app,
 * the CLI binary, the Vite plugin under a real `vite build`, and the Node API.
 *
 * - "correct": the CLI (`comvi typegen --from`), the Vite plugin, `generate()` and a wire
 *   schema file (`.comvi/schema.json`) write the same bytes for the same catalogs;
 * - a new key in `en.json` under `comvi typegen --watch` updates the declaration and `tsc`
 *   accepts the call it rejected before;
 * - "stable": broken JSON keeps the old file; a change that leaves the declaration as it
 *   was does not rewrite it (inode and mtime); two watchers of one file write it from one
 *   process, and the second takes over when the first stops.
 *
 * Every gate counts or compares; the waits only wait (file-system events lag under load).
 * Child processes are started here and stopped by their own PID.
 *
 *   pnpm build && pnpm typegen:e2e
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(ROOT, "packages/cli/bin/comvi.js");
const TSC = path.join(ROOT, "node_modules/typescript/bin/tsc");

for (const file of [
  "packages/cli/dist/cli.js",
  "packages/typegen/dist/index.js",
  "packages/vite-plugin/dist/index.js",
  "packages/react/dist",
])
  if (!fs.existsSync(path.join(ROOT, file)))
    throw new Error(`typegen-e2e: ${file} is missing — run \`pnpm build\` first`);

const typegen = await import(pathToFileURL(path.join(ROOT, "packages/typegen/dist/index.js")).href);
const { comviTypes } = await import(
  pathToFileURL(path.join(ROOT, "packages/vite-plugin/dist/index.js")).href
);
const { build } = await import(
  pathToFileURL(createRequire(path.join(ROOT, "packages/vite-plugin/package.json")).resolve("vite"))
    .href
);

const CATALOGS = {
  "en.json": {
    hello: "Hello {name}",
    terms: "Read the <link>terms</link>",
    gender: "{g, select, male {He} female {She} other {They}}",
    title: "Title",
  },
  "de.json": { hello: "Hallo {name}", terms: "Lies die <link>AGB</link>", title: "Titel" },
  "shop/en.json": { "cart.items": "{count, plural, one {# item} other {# items}}" },
  "shop/de.json": { "cart.items": "{count, plural, one {# Artikel} other {# Artikel}}" },
};

const tmp = [];
const children = [];
after(() => {
  for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  for (const dir of tmp) fs.rmSync(dir, { recursive: true, force: true });
});

/** An app declaring @comvi/react (linked, as pnpm links it), catalogs in locales/. */
function app() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "comvi-typegen-e2e-")));
  tmp.push(dir);
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "app",
      private: true,
      type: "module",
      dependencies: { "@comvi/react": "*" },
    }),
  );
  fs.mkdirSync(path.join(dir, "node_modules/@comvi"), { recursive: true });
  fs.symlinkSync(
    path.join(ROOT, "packages/react"),
    path.join(dir, "node_modules/@comvi/react"),
    "junction",
  );
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "nodenext",
        strict: true,
        noEmit: true,
        jsx: "react-jsx",
        types: [],
      },
      include: ["index.ts", "comvi.d.ts"],
    }),
  );
  fs.writeFileSync(path.join(dir, "main.js"), "export const x = 1;\n");
  for (const [rel, catalog] of Object.entries(CATALOGS)) write(dir, rel, catalog);
  return dir;
}

function write(dir, rel, content) {
  const file = path.join(dir, "locales", rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content, null, 2));
}

const read = (dir, file = "comvi.d.ts") => fs.readFileSync(path.join(dir, file), "utf8");

function cli(dir, args) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, COMVI_API_KEY: "", COMVI_NO_ENV: "1" },
  });
  assert.equal(r.status, 0, `comvi ${args.join(" ")}\n${r.stdout}${r.stderr}`);
  return r;
}

/** A long-running `comvi typegen --watch`, with its output so far. */
function watchCli(dir) {
  const child = spawn(
    process.execPath,
    [
      CLI,
      "typegen",
      "--from",
      "locales",
      "--source-locale",
      "en",
      "--out",
      "comvi.d.ts",
      "--watch",
    ],
    { cwd: dir, env: { ...process.env, COMVI_API_KEY: "", COMVI_NO_ENV: "1" } },
  );
  children.push(child);
  const run = { child, out: "" };
  child.stdout.on("data", (d) => (run.out += d));
  child.stderr.on("data", (d) => (run.out += d));
  return run;
}

async function until(check, what) {
  for (let i = 0; i < 600; i++) {
    try {
      if (await check()) return;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`typegen-e2e: timed out waiting for ${what}`);
}

function stop(run) {
  return new Promise((resolve) => {
    if (run.child.exitCode !== null) return resolve();
    run.child.once("exit", resolve);
    run.child.kill("SIGTERM");
  });
}

/** Type-checks `source` in the app; returns the diagnostics of its own files. */
function tsc(dir, source) {
  fs.writeFileSync(path.join(dir, "index.ts"), source);
  const r = spawnSync(process.execPath, [TSC, "-p", "tsconfig.json", "--pretty", "false"], {
    cwd: dir,
    encoding: "utf8",
  });
  return `${r.stdout}${r.stderr}`
    .split("\n")
    .filter((l) => /^(index\.ts|comvi\.d\.ts)\(/.test(l))
    .join("\n");
}

const USES_ADDED = [
  'import type { I18n } from "@comvi/react";',
  "declare const i18n: I18n;",
  'i18n.t("hello", { name: "Ada" });',
  'i18n.t("added", { fresh: 1 });',
  "",
].join("\n");

describe("one output from every input", () => {
  let dir;
  before(() => {
    dir = app();
  });

  it("the CLI, the Vite plugin, generate() and the schema file write the same bytes", async () => {
    cli(dir, ["typegen", "--from", "locales", "--source-locale", "en", "--out", "cli.d.ts"]);
    await build({
      root: dir,
      configFile: false,
      logLevel: "silent",
      plugins: [comviTypes({ from: "./locales", sourceLocale: "en", out: "vite.d.ts" })],
      build: { write: false, lib: { entry: "main.js", formats: ["es"], fileName: "main" } },
    });
    const api = await typegen.generate({
      from: "locales",
      out: "api.d.ts",
      root: dir,
      sourceLocale: "en",
      onMessage: () => {},
    });
    const source = new typegen.LocalSource({ dir: path.join(dir, "locales"), sourceLocale: "en" });
    source.refresh();
    fs.mkdirSync(path.join(dir, ".comvi"));
    fs.writeFileSync(
      path.join(dir, ".comvi/schema.json"),
      typegen.serializeWireSchema(source.schema().schema),
    );
    cli(dir, ["typegen", "--from", ".comvi/schema.json", "--out", "schema.d.ts"]);

    const bytes = read(dir, "api.d.ts");
    assert.equal(bytes, api.content);
    assert.equal(read(dir, "cli.d.ts"), bytes, "CLI vs Node API");
    assert.equal(read(dir, "vite.d.ts"), bytes, "Vite plugin vs Node API");
    assert.equal(read(dir, "schema.d.ts"), bytes, "schema file vs directory");
    assert.match(bytes, /declare module '@comvi\/react'/);
    assert.match(bytes, /"gender": \{ "g": "male" \| "female" \| \(string & \{\}\) \};/);
    // And --check agrees with all of them.
    cli(dir, [
      "typegen",
      "--from",
      "locales",
      "--source-locale",
      "en",
      "--out",
      "vite.d.ts",
      "--check",
    ]);
  });
});

describe("comvi typegen --watch on a fixture app", { timeout: 120_000 }, () => {
  it("a new key in en.json updates comvi.d.ts and tsc sees it", async () => {
    const dir = app();
    const run = watchCli(dir);
    await until(() => run.out.includes("Watching for changes"), "the watcher");
    await until(() => read(dir).includes('"title": never;'), "the first generation");
    assert.match(
      tsc(dir, USES_ADDED),
      /index\.ts\(4,8\): error TS2345: Argument of type '"added"'/,
    );

    write(dir, "en.json", { ...CATALOGS["en.json"], added: "New {fresh}" });
    await until(() => read(dir).includes('"added": { "fresh": string | number };'), "the new key");
    assert.equal(tsc(dir, USES_ADDED), "");
    await stop(run);
  });

  it("broken JSON keeps the old file (same bytes, same inode); a fix writes again", async () => {
    const dir = app();
    const run = watchCli(dir);
    await until(() => read(dir).includes('"title": never;'), "the first generation");
    const before = { text: read(dir), ino: fs.statSync(path.join(dir, "comvi.d.ts")).ino };

    write(dir, "shop/en.json", '{ "cart.items": ');
    await until(() => run.out.includes("invalid JSON"), "the error");
    assert.match(run.out, /shop\/en\.json: invalid JSON .*comvi\.d\.ts is kept as it was/);
    assert.equal(read(dir), before.text);
    assert.equal(fs.statSync(path.join(dir, "comvi.d.ts")).ino, before.ino);
    assert.equal(run.child.exitCode, null, "the watcher keeps running");

    write(dir, "shop/en.json", { "cart.items": "{count, plural, other {#}}", fixed: "x" });
    await until(() => read(dir).includes('"fixed": never;'), "the fix");
    await stop(run);
  });

  it("a change that leaves the declaration as it was does not rewrite it", async () => {
    const dir = app();
    const w = typegen.watch({
      from: "locales",
      out: "comvi.d.ts",
      root: dir,
      sourceLocale: "en",
      onMessage: () => {},
    });
    try {
      await w.ready;
      const file = path.join(dir, "comvi.d.ts");
      const before = fs.statSync(file);
      // New text, same types: a translator's edit.
      write(dir, "de.json", { hello: "Servus {name}", terms: "Die <link>AGB</link>", title: "T" });
      await until(() => w.stats.runs >= 2, "the second run");
      await w.idle();
      const after = fs.statSync(file);
      assert.deepEqual([after.ino, after.mtimeMs], [before.ino, before.mtimeMs]);
      assert.equal(w.stats.writes, 1);
    } finally {
      w.close();
    }
  });

  it("two watchers of one file: one process writes, the other takes over when it stops", async () => {
    const dir = app();
    const first = watchCli(dir);
    await until(() => first.out.includes("Watching for changes"), "the first watcher");
    const second = watchCli(dir);
    await until(
      () =>
        second.out.includes(`already generated by another watcher (process ${first.child.pid})`),
      "the second watcher to stand by",
    );

    write(dir, "en.json", { ...CATALOGS["en.json"], one: "x" });
    await until(() => read(dir).includes('"one": never;'), "the change");
    await stop(first);
    await until(() => second.out.includes("took over comvi.d.ts"), "the takeover");

    write(dir, "en.json", { ...CATALOGS["en.json"], one: "x", two: "y" });
    await until(() => read(dir).includes('"two": never;'), "the change after the takeover");
    await stop(second);

    const wrote = (run) => run.out.split("\n").filter((l) => l.includes("wrote comvi.d.ts")).length;
    // The first generation and the first change by the first process; the second process
    // found the file as it was left (no write) and wrote only the second change.
    assert.equal(wrote(first), 2, first.out);
    assert.equal(wrote(second), 1, second.out);
  });
});
