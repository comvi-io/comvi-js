/**
 * `comvi.types` of `@comvi/nuxt` under a real Nuxt (lot 7 PR 2): a minimal app on Nuxt 4 and
 * Nuxt 3, type-checked by Nuxt's own `nuxt typecheck` (vue-tsc) on real `.vue` files.
 *
 * - `nuxt prepare` and `nuxt typecheck` alone (no dev, no build before) write the declaration
 *   into the build directory and add it to the generated tsconfigs;
 * - in `.vue` files a known key, a nested key, a namespace key through `useI18n(ns)`, a
 *   supplied param, `$t` in the template and `t` of `useI18n()` in `<script setup>` compile;
 *   a wrong key, a wrong namespace, a missing param and a wrong-typed param each fail the
 *   type check on their own line (a negative component, checked by a failing run); the same
 *   for `useTranslation(event)` in a Nitro route where Nuxt type-checks the server (Nuxt 4);
 * - `nuxt dev`: a new key in `en.json` reaches the declaration while the server runs;
 * - `nuxt build`: generates, fails on a broken catalog, and no generator code reaches the
 *   client output; the package's `dist/runtime` does not import typegen;
 * - the bytes are the ones `comvi typegen --from` writes for the same catalogs.
 *
 *   pnpm build && pnpm typegen:e2e
 *
 * `@comvi/nuxt` is the built package (`packages/nuxt`), linked into each app with Nuxt,
 * vue-tsc and TypeScript from the workspace. The dev server is started here with
 * `--no-fork` (one process) and stopped by its own PID.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(ROOT, "packages/cli/bin/comvi.js");
const NUXT_PKG = path.join(ROOT, "packages/nuxt");
/** Inside the repo, so the app resolves the workspace's hoisted packages (vue, h3, …). */
const APPS = path.join(ROOT, "scripts/typegen-e2e/.nuxt-apps");

for (const file of [
  "packages/cli/dist/cli.js",
  "packages/typegen/dist/index.js",
  "packages/nuxt/dist/module.mjs",
  "packages/vue/dist",
])
  if (!fs.existsSync(path.join(ROOT, file)))
    throw new Error(`typegen-e2e (nuxt): ${file} is missing — run \`pnpm build\` first`);

/** The two Nuxt majors of the peer range, from the test apps that pin them. */
const VERSIONS = [
  { label: "Nuxt 4", from: "test-apps/nuxt4", major: 4 },
  { label: "Nuxt 3", from: "test-apps/nuxt", major: 3 },
];

// `nav` is nested: typegen flattens it to `nav.home`. `admin` is a second namespace.
const EN = {
  hello: "Hello {name}",
  title: "Title",
  nav: { home: "Home of {site}" },
  count: "{n, plural, one {# item} other {# items}}",
};
const DE = {
  hello: "Hallo {name}",
  title: "Titel",
  nav: { home: "Start von {site}" },
  count: "{n, plural, one {# Ding} other {# Dinge}}",
};
const ADMIN_EN = { welcome: "Welcome, {who}" };

const OUT = ".nuxt/types/comvi.d.ts";
/** A string only typegen's emitter writes: generator code in a bundle would carry it. */
const EMITTER_MARK = "this file is generated from your translation schema";

const GOOD_VUE = `<script setup lang="ts">
const { t } = useI18n();
const admin = useI18n("admin");
const hello: string = t("hello", { name: "Ada" });
const title: string = t("title");
const home: string = t("nav.home", { site: "x" });
const count: string = t("count", { n: 2 });
const welcome: string = admin.t("welcome", { who: "Ada" });
const viaOption: string = t("welcome", { ns: "admin", who: "Ada" });
</script>

<template>
  <p>{{ $t("hello", { name: "Ada" }) }} {{ $t("nav.home", { site: "x" }) }}</p>
  <p>{{ hello }} {{ title }} {{ home }} {{ count }} {{ welcome }} {{ viaOption }}</p>
</template>
`;

/** Each wrong call on its own line: the diagnostics name these lines. */
const WRONG_VUE = `<script setup lang="ts">
const { t } = useI18n();
const nope = useI18n("nope");
t("helo", { name: "Ada" });
nope.t("welcome", { who: "Ada" });
t("hello");
t("count", { n: "two" });
t("welcome", { ns: "nope", who: "Ada" });
</script>

<template>
  <p>{{ $t("helo") }}</p>
</template>
`;
/** `file(line,…): error TSxxxx` for each wrong call of {@link WRONG_VUE}. */
const WRONG_VUE_ERRORS = [
  [4, /TS2345: Argument of type '"helo"'/],
  [5, /TS2349: This expression is not callable/],
  [6, /TS2554: Expected 2 arguments, but got 1/],
  [7, /TS2322: Type 'string' is not assignable to type 'number'/],
  [8, /TS2322: Type '"nope"' is not assignable to type/],
  [12, /TS2345: Argument of type '"helo"'/],
];

const GOOD_ROUTE = `export default defineEventHandler(async (event) => {
  const { t } = await useTranslation(event);
  const admin = await useTranslation(event, { ns: "admin" });
  const text: string = t("hello", { name: "Ada" }) + t("nav.home", { site: "x" });
  return text + admin.t("welcome", { who: "Ada" });
});
`;
const WRONG_ROUTE = `export default defineEventHandler(async (event) => {
  const { t } = await useTranslation(event);
  t("helo", { name: "Ada" });
  t("hello");
  return "";
});
`;
const WRONG_ROUTE_ERRORS = [
  [3, /TS2345: Argument of type '"helo"'/],
  [4, /TS2554: Expected 2 arguments, but got 1/],
];

const nuxtConfig = (major, extra = "") => `export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
${major === 3 ? '  srcDir: "app/",\n  serverDir: "server",\n' : ""}  comvi: {
    locales: ["en", "de"],
    defaultLocale: "en",
    timeZone: "UTC",
    types: { from: "./i18n/locales" },
  },
  devtools: { enabled: false },
  telemetry: false,
  sourcemap: false,
  compatibilityDate: "2024-11-01",${extra}
});
`;

const dirs = [];
const servers = [];
after(async () => {
  for (const server of servers) await stopServer(server);
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
  if (fs.existsSync(APPS) && fs.readdirSync(APPS).length === 0) fs.rmdirSync(APPS);
});

function write(dir, rel, content) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), content);
}

/** A minimal app on `version`'s Nuxt, its catalogs in i18n/locales. */
function app(version) {
  fs.mkdirSync(APPS, { recursive: true });
  const dir = fs.mkdtempSync(path.join(APPS, "app-"));
  dirs.push(dir);
  const link = (name, target) => {
    fs.mkdirSync(path.dirname(path.join(dir, "node_modules", name)), { recursive: true });
    fs.symlinkSync(target, path.join(dir, "node_modules", name), "junction");
  };
  const nuxt = fs.realpathSync(path.join(ROOT, version.from, "node_modules/nuxt"));
  link("nuxt", nuxt);
  link("@comvi/nuxt", NUXT_PKG);
  // `nuxt typecheck` resolves both from the app.
  link("vue-tsc", fs.realpathSync(path.join(ROOT, "node_modules/vue-tsc")));
  link("typescript", fs.realpathSync(path.join(ROOT, "node_modules/typescript")));
  const files = {
    "package.json": JSON.stringify({
      name: "nuxt-types-e2e",
      private: true,
      type: "module",
      dependencies: { "@comvi/nuxt": "*", nuxt: "*" },
    }),
    // Nuxt 4: the generated projects (app, server, shared, node), checked in build mode;
    // Nuxt 3: the one generated config.
    "tsconfig.json": JSON.stringify(
      version.major === 4
        ? {
            files: [],
            references: ["app", "server", "shared", "node"].map((p) => ({
              path: `./.nuxt/tsconfig.${p}.json`,
            })),
          }
        : { extends: "./.nuxt/tsconfig.json" },
    ),
    "nuxt.config.ts": nuxtConfig(version.major),
    "app/app.vue": "<template>\n  <Good />\n</template>\n",
    "app/components/Good.vue": GOOD_VUE,
    "server/api/hello.ts": GOOD_ROUTE,
    "i18n/locales/en.json": JSON.stringify(EN, null, 2),
    "i18n/locales/de.json": JSON.stringify(DE, null, 2),
    "i18n/locales/admin/en.json": JSON.stringify(ADMIN_EN, null, 2),
  };
  for (const [rel, content] of Object.entries(files)) write(dir, rel, content);
  return { dir, version, bin: path.join(nuxt, "bin/nuxt.mjs") };
}

// Plain output: diagnostics in tsc's `file(line,col): error TS…` form, no colours.
const env = () => ({ ...process.env, NUXT_TELEMETRY_DISABLED: "1", CI: "1", NO_COLOR: "1" });

function nuxt(a, args) {
  const r = spawnSync(process.execPath, [a.bin, ...args], {
    cwd: a.dir,
    encoding: "utf8",
    env: env(),
    timeout: 600_000,
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/** TypeScript's own `tsc` on one of the app's generated projects; paths print from the app. */
function tsc(a, project) {
  const r = spawnSync(
    process.execPath,
    [
      path.join(ROOT, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--pretty",
      "false",
      "-p",
      project,
    ],
    { cwd: a.dir, encoding: "utf8" },
  );
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const readOut = (a) => fs.readFileSync(path.join(a.dir, OUT), "utf8");

/** The declaration `.nuxt/nuxt.d.ts` (what the app's tsconfig includes) references. */
function referenced(a) {
  const dts = fs.readFileSync(path.join(a.dir, ".nuxt/nuxt.d.ts"), "utf8");
  const [, rel] = dts.match(/\/\/\/ <reference path="([^"]*comvi\.d\.ts)" \/>/) ?? [];
  assert.ok(rel, dts);
  return fs.readFileSync(path.resolve(a.dir, ".nuxt", rel), "utf8");
}

/** The diagnostics `out` reports for `file` (path relative to the app), by line. */
function diagnostics(out, file) {
  const lines = [];
  const re = new RegExp(
    `${file.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\((\\d+),\\d+\\): error (TS\\d+: .*)`,
    "g",
  );
  // A file in two of Nuxt 4's projects is reported once per project: one entry per line.
  const seen = new Set();
  for (const m of out.matchAll(re)) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    lines.push([Number(m[1]), m[2]]);
  }
  return lines;
}

/** Every expected `[line, pattern]` has its error, and `file` has no other. */
function assertErrors(out, file, expected) {
  const found = diagnostics(out, file);
  for (const [line, pattern] of expected)
    assert.ok(
      found.some(([l, text]) => l === line && pattern.test(text)),
      `expected ${file}:${line} ${pattern}; found ${JSON.stringify(found)}\n${out}`,
    );
  assert.equal(found.length, expected.length, `${JSON.stringify(found)}\n${out}`);
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

async function startServer(a) {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [a.bin, "dev", "--no-fork", "--port", String(port), "--host", "127.0.0.1"],
    { cwd: a.dir, env: env() },
  );
  const server = { child, port, out: "" };
  servers.push(server);
  child.stdout.on("data", (d) => (server.out += d));
  child.stderr.on("data", (d) => (server.out += d));
  return server;
}

/** Stops the dev server by its own PID. */
async function stopServer(server) {
  if (server.child.exitCode !== null || server.child.signalCode !== null) return;
  const exited = new Promise((resolve) => server.child.once("exit", resolve));
  server.child.kill("SIGTERM");
  await exited;
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
  throw new Error(`typegen-e2e (nuxt): timed out waiting for ${what}\n${log()}`);
}

/** Every file under `dir` whose content includes `text`. */
function filesWith(dir, text) {
  const hits = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    if (fs.readFileSync(file, "utf8").includes(text)) hits.push(file);
  }
  return hits;
}

describe("the package", () => {
  it("dist/runtime does not name typegen, and the module carries it inlined", () => {
    const runtime = path.join(NUXT_PKG, "dist/runtime");
    for (const text of ["@comvi/typegen", "typegen", EMITTER_MARK])
      assert.deepEqual(filesWith(runtime, text), [], text);
    const module = fs.readFileSync(path.join(NUXT_PKG, "dist/module.mjs"), "utf8");
    assert.ok(module.includes(EMITTER_MARK), "the emitter is inlined into dist/module.mjs");
    assert.ok(!module.includes("@comvi/typegen"));
  });
});

for (const version of VERSIONS) {
  describe(`${version.label}, nuxt prepare and nuxt typecheck`, { timeout: 600_000 }, () => {
    it("nuxt prepare alone writes the declaration and references it", () => {
      const a = app(version);
      const r = nuxt(a, ["prepare"]);
      assert.equal(r.status, 0, r.out);
      assert.match(readOut(a), /declare module '@comvi\/nuxt' \{/);
      assert.match(readOut(a), /"nav\.home": \{ "site": string \| number \};/);
      assert.match(readOut(a), /"admin": \{\n\s+"welcome": \{ "who": string \| number \};/);
      assert.match(
        fs.readFileSync(path.join(a.dir, ".nuxt/nuxt.d.ts"), "utf8"),
        /\/\/\/ <reference path="types\/comvi\.d\.ts" \/>/,
      );
      assert.match(
        fs.readFileSync(path.join(a.dir, ".nuxt/types/nitro-nuxt.d.ts"), "utf8"),
        /\/\/\/ <reference path="comvi\.d\.ts" \/>/,
      );

      // The same bytes as the CLI on the same catalogs (`sourceLocale` from `defaultLocale`).
      const cli = spawnSync(
        process.execPath,
        [CLI, "typegen", "--from", "i18n/locales", "--source-locale", "en", "--out", "cli.d.ts"],
        {
          cwd: a.dir,
          encoding: "utf8",
          env: { ...process.env, COMVI_API_KEY: "", COMVI_NO_ENV: "1" },
        },
      );
      assert.equal(cli.status, 0, `${cli.stdout}${cli.stderr}`);
      assert.equal(fs.readFileSync(path.join(a.dir, "cli.d.ts"), "utf8"), readOut(a));
    });

    it("nuxt typecheck on a clean app: the right calls compile, each wrong one is rejected", () => {
      const a = app(version);
      const good = nuxt(a, ["typecheck"]);
      assert.equal(good.status, 0, good.out);
      assert.match(readOut(a), /"hello": \{ "name": string \| number \};/);

      write(a.dir, "app/components/Wrong.vue", WRONG_VUE);
      const wrong = nuxt(a, ["typecheck"]);
      assert.notEqual(wrong.status, 0, wrong.out);
      assertErrors(wrong.out, "app/components/Wrong.vue", WRONG_VUE_ERRORS);
      assert.deepEqual(diagnostics(wrong.out, "app/components/Good.vue"), [], wrong.out);
      fs.rmSync(path.join(a.dir, "app/components/Wrong.vue"));

      // Nitro routes. The server project alone (`.nuxt/tsconfig.server.json`, which the
      // module's `nitro:prepare:types` reference reaches): Nuxt 4's app project also pulls
      // the routes in through its typed `$fetch`, so `nuxt typecheck` alone would not show
      // that the server project sees the keys.
      write(a.dir, "server/api/wrong.ts", WRONG_ROUTE);
      const server = tsc(a, ".nuxt/tsconfig.server.json");
      assert.notEqual(server.status, 0, server.out);
      assertErrors(server.out, "server/api/wrong.ts", WRONG_ROUTE_ERRORS);
      assert.deepEqual(diagnostics(server.out, "server/api/hello.ts"), [], server.out);
      // Nuxt 4's `nuxt typecheck` checks the routes too (Nuxt 3's checks the app only).
      if (version.major === 4) {
        const all = nuxt(a, ["typecheck"]);
        assert.notEqual(all.status, 0, all.out);
        assertErrors(all.out, "server/api/wrong.ts", WRONG_ROUTE_ERRORS);
      }
    });
  });

  describe(`${version.label}, nuxt dev`, { timeout: 300_000 }, () => {
    it("writes the declaration, reports a broken en.json and follows the repair, without a restart", async () => {
      const a = app(version);
      assert.equal(fs.existsSync(path.join(a.dir, OUT)), false);
      const server = await startServer(a);
      await until(
        () => /"hello": \{ "name": string \| number \};/.test(readOut(a)),
        "the first generation",
        () => server.out,
      );
      await until(
        async () => (await fetch(`http://127.0.0.1:${server.port}/`)).status === 200,
        "the dev server",
        () => server.out,
      );

      // A broken catalog: reported, the server goes on, the last file stays.
      const before = readOut(a);
      write(a.dir, "i18n/locales/en.json", '{ "hello": ');
      await until(
        () => /\[@comvi\/nuxt\] .*en\.json/.test(server.out),
        "the reported error",
        () => server.out,
      );
      assert.equal(server.child.exitCode, null);
      assert.equal((await fetch(`http://127.0.0.1:${server.port}/`)).status, 200);
      assert.equal(readOut(a), before);

      // Repaired, with a new key.
      write(a.dir, "i18n/locales/en.json", JSON.stringify({ ...EN, added: "New {fresh}" }));
      await until(
        () => readOut(a).includes('"added": { "fresh": string | number };'),
        "the new key",
        () => server.out,
      );
      // The same process, still serving: no restart.
      assert.equal(server.child.exitCode, null);
      const page = await fetch(`http://127.0.0.1:${server.port}/`);
      assert.equal(page.status, 200);
      await stopServer(server);
    });
  });

  describe(`${version.label}, nuxt build`, { timeout: 600_000 }, () => {
    it("generates, keeps the generator out of the client, regenerates where the tsconfig looks, fails on a broken catalog", () => {
      const a = app(version);
      const r = nuxt(a, ["build"]);
      assert.equal(r.status, 0, r.out);
      assert.match(readOut(a), /"hello": \{ "name": string \| number \};/);
      const output = path.join(a.dir, ".output");
      assert.ok(fs.existsSync(path.join(output, "public")));
      for (const text of [EMITTER_MARK, "comvi-typegen-"])
        assert.deepEqual(filesWith(path.join(output, "public"), text), [], text);

      // A second build after a catalog change: Nuxt 4 builds it in a directory of its own
      // (`node_modules/.cache/nuxt/.nuxt`, the first one's `.nuxt` exists) but keeps the
      // tsconfigs in `.nuxt`. The file those reference has the new key.
      write(a.dir, "i18n/locales/en.json", JSON.stringify({ ...EN, added: "New {fresh}" }));
      const second = nuxt(a, ["build"]);
      assert.equal(second.status, 0, second.out);
      assert.match(referenced(a), /"added": \{ "fresh": string \| number \};/);

      // A broken catalog fails every command that generates.
      write(a.dir, "i18n/locales/en.json", '{ "hello": ');
      for (const command of ["build", "prepare", "typecheck"]) {
        const broken = nuxt(a, [command]);
        assert.notEqual(broken.status, 0, `${command}: ${broken.out}`);
        assert.match(
          broken.out,
          /\[@comvi\/nuxt\] Cannot generate \.nuxt\/types\/comvi\.d\.ts: .*en\.json: invalid JSON/,
          command,
        );
      }
    });
  });
}
