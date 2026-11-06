/**
 * `withComvi({ types })` of `@comvi/next/plugin` under a real Next (design rev 3 R3-18,
 * lot 6b): a minimal App Router app, on Next 15 and 16, under webpack and Turbopack.
 *
 * - `next dev`: the declaration is written as the config loads; a new key in
 *   `en.json` reaches it and `tsc` accepts the call it rejected before; a wrong key and a
 *   wrong param are type errors; one watcher in the whole process tree;
 * - `next build`: creates a missing declaration (Next's own type check then reads it),
 *   generates in one process only (not again in the build workers), fails on a wrong key;
 *   `types: { check: true }` fails the build on a stale file and writes nothing;
 * - the bytes are the ones `comvi typegen --from` writes for the same catalogs.
 *
 * The app's processes are counted with a `--require` tracer (inherited through
 * NODE_OPTIONS): every config load, every `fs.watch` of the catalogs and every catalog
 * read, with its pid. Every gate counts or compares; the waits only wait for a state.
 * The dev servers are started here and stopped by their own PIDs (and the PIDs the tracer
 * recorded for their children).
 *
 *   pnpm build && pnpm typegen:e2e
 *
 * `@comvi/next/plugin` is the built `packages/next/dist/plugin.cjs`; while `@comvi/next`
 * is MIGRATION_PENDING (its other entries do not build yet), the same esbuild command its
 * build runs bundles `src/plugin.ts` for the test.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { MIGRATION_PENDING } from "../../tooling/migration-pending.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(ROOT, "packages/cli/bin/comvi.js");
const NEXT_PKG = path.join(ROOT, "packages/next");
/** Inside the repo, so Next and Turbopack find the workspace root and its `.pnpm` store. */
const APPS = path.join(ROOT, "scripts/typegen-e2e/.next-apps");

for (const file of [
  "packages/cli/dist/cli.js",
  "packages/typegen/dist/index.js",
  "packages/react/dist",
])
  if (!fs.existsSync(path.join(ROOT, file)))
    throw new Error(`typegen-e2e (next): ${file} is missing — run \`pnpm build\` first`);

/** The two ends of the `next` peer range, from the test apps that pin them. */
const VERSIONS = [
  { label: "Next 15", from: "test-apps/next", webpack: [], turbopack: ["--turbopack"] },
  { label: "Next 16", from: "test-apps/next16", webpack: ["--webpack"], turbopack: [] },
];

const EN = {
  hello: "Hello {name}",
  title: "Title",
};
const DE = { hello: "Hallo {name}", title: "Titel" };

/** Calls that must type-check, and two that must not. */
const GOOD = 'i18n.t("hello", { name: "Ada" });\ni18n.t("title");\n';
const WRONG_KEY = 'i18n.t("helo", { name: "Ada" });\n';
const WRONG_PARAM = 'i18n.t("hello", { nam: "Ada" });\n';
const ADDED = 'i18n.t("added", { fresh: 1 });\n';
const usage = (calls) =>
  `import type { I18n } from "@comvi/react";\ndeclare const i18n: I18n;\n${calls}export {};\n`;

const OUT = "src/types/i18n.d.ts";

const dirs = [];
const servers = [];
after(async () => {
  for (const server of servers) await stopServer(server);
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
  if (fs.existsSync(APPS) && fs.readdirSync(APPS).length === 0) fs.rmdirSync(APPS);
});

/** `@comvi/next` with `./plugin` only: the built one, or a bundle of the source. */
function pluginPackage() {
  const dir = path.join(APPS, "comvi-next");
  if (fs.existsSync(dir)) return dir;
  fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
  dirs.push(dir);
  const built = path.join(NEXT_PKG, "dist/plugin.cjs");
  if (!MIGRATION_PENDING["@comvi/next"]) fs.copyFileSync(built, path.join(dir, "dist/plugin.cjs"));
  else
    createRequire(path.join(NEXT_PKG, "package.json"))("esbuild").buildSync({
      absWorkingDir: NEXT_PKG,
      entryPoints: ["src/plugin.ts"],
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      external: ["next"],
      logLevel: "warning",
      outfile: path.join(dir, "dist/plugin.cjs"),
    });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "@comvi/next",
      exports: { "./plugin": { require: "./dist/plugin.cjs", default: "./dist/plugin.cjs" } },
    }),
  );
  return dir;
}

const TRACER = `const fs = require("node:fs");
const path = require("node:path");
const log = process.env.E2E_TRACE;
const locales = path.join(process.env.E2E_APP, "src/locales");
const note = (line) => fs.appendFileSync(log, process.pid + "\\t" + process.ppid + "\\t" + line + "\\n");
note("start");
const watch = fs.watch;
fs.watch = function (dir, ...rest) {
  if (String(dir).startsWith(locales)) note("watch");
  return watch.call(this, dir, ...rest);
};
const read = fs.readFileSync;
fs.readFileSync = function (file, ...rest) {
  if (typeof file === "string" && file.startsWith(locales)) note("read " + path.relative(locales, file));
  return read.call(this, file, ...rest);
};
`;

const NEXT_CONFIG = `import fs from "node:fs";
import { withComvi } from "@comvi/next/plugin";

export default withComvi({
  types: {
    from: "./src/locales",
    sourceLocale: "en",
    check: process.env.E2E_CHECK === "1",
  },
})((phase) => {
  fs.appendFileSync(process.env.E2E_TRACE!, process.pid + "\\t" + process.ppid + "\\tconfig " + phase + "\\n");
  return {};
});
`;

/** A minimal App Router app on `version`'s Next, its catalogs in src/locales. */
function app(version) {
  fs.mkdirSync(APPS, { recursive: true });
  const dir = fs.mkdtempSync(path.join(APPS, "app-"));
  dirs.push(dir);
  const from = path.join(ROOT, version.from, "node_modules");
  const link = (name, target) => {
    fs.mkdirSync(path.dirname(path.join(dir, "node_modules", name)), { recursive: true });
    fs.symlinkSync(target, path.join(dir, "node_modules", name), "junction");
  };
  for (const name of [
    "next",
    "react",
    "react-dom",
    "typescript",
    "@types/react",
    "@types/react-dom",
    "@types/node",
  ])
    link(name, fs.realpathSync(path.join(from, name)));
  link("@comvi/react", path.join(ROOT, "packages/react"));
  link("@comvi/next", pluginPackage());
  const files = {
    "package.json": JSON.stringify({
      name: "next-types-e2e",
      private: true,
      dependencies: { "@comvi/react": "*", next: "*", react: "*", "react-dom": "*" },
    }),
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "esnext"],
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        esModuleInterop: true,
        jsx: "preserve",
        plugins: [{ name: "next" }],
      },
      include: ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx"],
      exclude: ["node_modules"],
    }),
    "next.config.ts": NEXT_CONFIG,
    "tracer.cjs": TRACER,
    "src/app/layout.tsx":
      'export default function Layout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n',
    "src/app/page.tsx": "export default function Page() {\n  return <p>types e2e page</p>;\n}\n",
    "src/usage.ts": usage(GOOD),
    "src/locales/en.json": JSON.stringify(EN, null, 2),
    "src/locales/de.json": JSON.stringify(DE, null, 2),
  };
  for (const [rel, content] of Object.entries(files)) write(dir, rel, content);
  return {
    dir,
    tsc: path.join(from, "typescript/bin/tsc"),
    next: path.join(from, "next/dist/bin/next"),
  };
}

function write(dir, rel, content) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), content);
}

const readOut = (dir) => fs.readFileSync(path.join(dir, OUT), "utf8");

/** The tracer's lines: `{ pid, ppid, what }`. */
const trace = (dir) =>
  fs.existsSync(path.join(dir, "trace.log"))
    ? fs
        .readFileSync(path.join(dir, "trace.log"), "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const [pid, ppid, what] = line.split("\t");
          return { pid: Number(pid), ppid: Number(ppid), what };
        })
    : [];

const env = (dir, extra = {}) => ({
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${path.join(dir, "tracer.cjs")}`]
    .filter(Boolean)
    .join(" "),
  E2E_TRACE: path.join(dir, "trace.log"),
  E2E_APP: dir,
  NEXT_TELEMETRY_DISABLED: "1",
  ...extra,
});

/** Type-checks the app with its own `tsc`; returns the diagnostics of `src/usage.ts`. */
function tsc(a, calls) {
  write(a.dir, "src/usage.ts", usage(calls));
  const r = spawnSync(process.execPath, [a.tsc, "-p", "tsconfig.json", "--pretty", "false"], {
    cwd: a.dir,
    encoding: "utf8",
  });
  return `${r.stdout}${r.stderr}`
    .split("\n")
    .filter((l) => l.startsWith("src/usage.ts("))
    .join("\n");
}

function nextBuild(a, args = [], extra = {}) {
  return spawnSync(process.execPath, [a.next, "build", ...args], {
    cwd: a.dir,
    encoding: "utf8",
    env: env(a.dir, extra),
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function startServer(a, args) {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [a.next, "dev", ...args, "--port", String(port), "--hostname", "127.0.0.1"],
    { cwd: a.dir, env: env(a.dir) },
  );
  const server = { child, port, dir: a.dir, out: "" };
  servers.push(server);
  child.stdout.on("data", (d) => (server.out += d));
  child.stderr.on("data", (d) => (server.out += d));
  return server;
}

/** Stops the dev server by its PID, then any process it started that still runs. */
async function stopServer(server) {
  if (server.child.exitCode === null && server.child.signalCode === null) {
    const exited = new Promise((resolve) => server.child.once("exit", resolve));
    server.child.kill("SIGTERM");
    await exited;
  }
  // Next starts more on its way out (a detached telemetry flush): look again until every
  // process of the family has exited.
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  for (let round = 0; round < 200; round++) {
    const family = new Set([server.child.pid]);
    for (const { pid, ppid } of trace(server.dir)) if (family.has(ppid)) family.add(pid);
    // The flush is detached and outside the trace; it names this app's directory.
    const ps = spawnSync("ps", ["-eo", "pid=,command="], { encoding: "utf8" }).stdout ?? "";
    for (const line of ps.split("\n"))
      if (line.includes(`detached-flush.js dev ${server.dir} `))
        family.add(Number.parseInt(line, 10));
    const running = [...family].filter(alive);
    if (running.length === 0) return;
    for (const pid of running) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Exited meanwhile.
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function until(check, what, log = () => "") {
  for (let i = 0; i < 2400; i++) {
    try {
      if (await check()) return;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`typegen-e2e (next): timed out waiting for ${what}\n${log()}`);
}

/** The pids that watched the catalogs, and the `withComvi` watchers that stood by. */
function watchers(server) {
  const watching = trace(server.dir)
    .filter((l) => l.what === "watch")
    .map((l) => l.pid);
  const idle = server.out.match(/already generated by another watcher/g)?.length ?? 0;
  return { watching, idle };
}

for (const version of VERSIONS) {
  for (const bundler of ["webpack", "turbopack"]) {
    describe(`${version.label}, next dev (${bundler})`, { timeout: 300_000 }, () => {
      it("writes the declaration, follows en.json, and runs one watcher", async () => {
        const a = app(version);
        assert.equal(fs.existsSync(path.join(a.dir, OUT)), false);
        const server = await startServer(a, version[bundler]);
        await until(
          () => /Ready in/.test(server.out),
          "the dev server",
          () => server.out,
        );
        // Written while the config loads: Next 15 loads it before it reports ready, Next 16
        // in its server process right after.
        await until(
          () => /"hello": \{ "name": string \| number \};/.test(readOut(a.dir)),
          "the first generation",
          () => server.out,
        );

        assert.equal(tsc(a, GOOD), "");
        assert.match(
          tsc(a, WRONG_KEY),
          /src\/usage\.ts\(3,8\): error TS2345: Argument of type '"helo"'/,
        );
        assert.match(
          tsc(a, WRONG_PARAM),
          /src\/usage\.ts\(3,\d+\): error TS\d+: .*'nam' does not exist/,
        );
        assert.match(
          tsc(a, ADDED),
          /src\/usage\.ts\(3,8\): error TS2345: Argument of type '"added"'/,
        );

        write(a.dir, "src/locales/en.json", JSON.stringify({ ...EN, added: "New {fresh}" }));
        await until(
          () => readOut(a.dir).includes('"added": { "fresh": string | number };'),
          "the new key",
          () => server.out,
        );
        assert.equal(tsc(a, ADDED), "");

        // The app itself still serves under this bundler.
        const page = await fetch(`http://127.0.0.1:${server.port}/`);
        assert.equal(page.status, 200);
        assert.match(await page.text(), /types e2e page/);

        // One watcher in the process tree, however often Next loaded the config.
        const loads = trace(a.dir).filter((l) => l.what === "config phase-development-server");
        assert.ok(loads.length >= 1, "the config was loaded");
        const { watching, idle } = watchers(server);
        assert.deepEqual(
          { watching: watching.length, idle },
          { watching: 1, idle: 0 },
          `${server.out}\n${JSON.stringify(trace(a.dir))}`,
        );
        await stopServer(server);
      });
    });
  }

  describe(`${version.label}, next build`, { timeout: 600_000 }, () => {
    it("creates a missing declaration in one process, and Next's type check reads it", () => {
      const a = app(version);
      const r = nextBuild(a);
      assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
      assert.match(readOut(a.dir), /"hello": \{ "name": string \| number \};/);
      // Generated once: the catalogs were read by one process, however many loaded the config.
      const lines = trace(a.dir);
      const readers = new Set(lines.filter((l) => l.what.startsWith("read ")).map((l) => l.pid));
      const loaders = new Set(
        lines.filter((l) => l.what === "config phase-production-build").map((l) => l.pid),
      );
      assert.equal(
        readers.size,
        1,
        JSON.stringify(lines.filter((l) => !l.what.startsWith("read "))) +
          JSON.stringify(lines.filter((l) => l.what.startsWith("read "))),
      );
      assert.ok(loaders.size >= 1);
      assert.equal(lines.filter((l) => l.what === "read en.json").length, 1);

      // The same bytes as the CLI on the same catalogs.
      const cli = spawnSync(
        process.execPath,
        [CLI, "typegen", "--from", "src/locales", "--source-locale", "en", "--out", "cli.d.ts"],
        {
          cwd: a.dir,
          encoding: "utf8",
          env: { ...process.env, COMVI_API_KEY: "", COMVI_NO_ENV: "1" },
        },
      );
      assert.equal(cli.status, 0, `${cli.stdout}${cli.stderr}`);
      assert.equal(fs.readFileSync(path.join(a.dir, "cli.d.ts"), "utf8"), readOut(a.dir));

      // A wrong key fails Next's own type check of the build.
      write(a.dir, "src/usage.ts", usage(GOOD + WRONG_KEY));
      const wrong = nextBuild(a);
      assert.notEqual(wrong.status, 0);
      assert.match(
        `${wrong.stdout}${wrong.stderr}`,
        /(Type error: |error TS2345: )Argument of type '"helo"'/,
      );
    });

    it("types.check fails the build on a stale file and writes nothing", () => {
      const a = app(version);
      const fresh = nextBuild(a);
      assert.equal(fresh.status, 0, `${fresh.stdout}${fresh.stderr}`);
      const ok = nextBuild(a, [], { E2E_CHECK: "1" });
      assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);

      const before = readOut(a.dir);
      write(a.dir, "src/locales/en.json", JSON.stringify({ ...EN, added: "New {fresh}" }));
      const stale = nextBuild(a, [], { E2E_CHECK: "1" });
      assert.notEqual(stale.status, 0);
      assert.match(
        `${stale.stdout}${stale.stderr}`,
        /\[@comvi\/next\] src\/types\/i18n\.d\.ts is outdated/,
      );
      assert.equal(readOut(a.dir), before);
    });
  });
}
