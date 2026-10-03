import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import {
  STEPS,
  allPassed,
  catalogFile,
  cdnEnv,
  cdnRoute,
  cdnVerdict,
  freePort,
  nuxtCatalogChunks,
  parseArgs,
  renderTable,
  serverCommand,
  startMockCdn,
  startPath,
  stepResults,
  summarizeError,
} from "./lib.mjs";

/**
 * The runner's pure parts. The browser path itself is not tested here: it
 * builds and serves seven real apps, and a test that fakes them would assert
 * the fake. `pnpm examples:e2e` is that path's own gate.
 */

// ── arguments ──────────────────────────────────────────────────────────────

test("parseArgs: defaults build, pack, no cdn", () => {
  assert.deepEqual(parseArgs([]), {
    only: [],
    cdn: false,
    build: true,
    pack: true,
    keep: false,
    headed: false,
  });
});

test("parseArgs: --only takes a comma list, repeats, and the = form", () => {
  assert.deepEqual(parseArgs(["--only", "react,next", "--only=vue"]).only, [
    "react",
    "next",
    "vue",
  ]);
});

test("parseArgs: --only without a value is an error, not an empty filter", () => {
  assert.throws(() => parseArgs(["--only"]), /needs a framework/);
  assert.throws(() => parseArgs(["--only", "--cdn"]), /needs a framework/);
});

test("parseArgs: flags and unknown arguments", () => {
  const options = parseArgs(["--cdn", "--no-build", "--no-pack", "--keep", "--headed"]);
  assert.equal(options.cdn, true);
  assert.equal(options.build, false);
  assert.equal(options.pack, false);
  assert.equal(options.keep, true);
  assert.equal(options.headed, true);
  assert.throws(() => parseArgs(["--cdnn"]), /unknown argument: --cdnn/);
});

// ── port choice ────────────────────────────────────────────────────────────

const listen = (port) =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });

test("freePort: returns a port that can actually be bound", async () => {
  const port = await freePort();
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536, `bad port ${port}`);
  const server = await listen(port);
  await new Promise((resolve) => server.close(resolve));
});

test("freePort: never hands out a port that is already taken", async () => {
  const held = await listen(0);
  const taken = held.address().port;
  try {
    for (let i = 0; i < 20; i++) assert.notEqual(await freePort(), taken);
  } finally {
    await new Promise((resolve) => held.close(resolve));
  }
});

// ── CDN layout ─────────────────────────────────────────────────────────────

test("cdnRoute: the default namespace is served from the root", () => {
  assert.deepEqual(cdnRoute("/cdn/e2e/uk.json", "/cdn/e2e"), {
    locale: "uk",
    namespace: "default",
  });
  assert.deepEqual(cdnRoute("/cdn/e2e/pt-BR.json", "/cdn/e2e/"), {
    locale: "pt-BR",
    namespace: "default",
  });
});

test("cdnRoute: other namespaces are {namespace}/{locale}.json", () => {
  assert.deepEqual(cdnRoute("/cdn/e2e/admin/de.json", "/cdn/e2e"), {
    locale: "de",
    namespace: "admin",
  });
});

test("cdnRoute: matches what plugin-fetch-loader's buildCdnUrl writes, and nothing else", () => {
  // `{cdnUrl}/default/en.json` is never built for the default namespace.
  assert.equal(cdnRoute("/cdn/e2e/default/en.json", "/cdn/e2e"), null);
  assert.equal(cdnRoute("/other/en.json", "/cdn/e2e"), null);
  assert.equal(cdnRoute("/cdn/e2e/en", "/cdn/e2e"), null);
  assert.equal(cdnRoute("/cdn/e2e/a/b/en.json", "/cdn/e2e"), null);
  assert.equal(cdnRoute("/cdn/e2e/../secret.json", "/cdn/e2e"), null);
  assert.equal(cdnRoute("/cdn/e2e/..%2Fsecret.json", "/cdn/e2e"), null);
  assert.equal(cdnRoute("/cdn/e2e/.json", "/cdn/e2e"), null);
});

test("cdnRoute: honours a non-default root namespace", () => {
  assert.deepEqual(cdnRoute("/c/en.json", "/c", "common"), { locale: "en", namespace: "common" });
  assert.equal(cdnRoute("/c/common/en.json", "/c", "common"), null);
  assert.deepEqual(cdnRoute("/c/default/en.json", "/c", "common"), {
    locale: "en",
    namespace: "default",
  });
});

test("catalogFile: mirrors the CDN layout inside examples/locales", () => {
  assert.equal(
    catalogFile("/l", { locale: "uk", namespace: "default" }),
    path.join("/l", "uk.json"),
  );
  assert.equal(
    catalogFile("/l", { locale: "uk", namespace: "admin" }),
    path.join("/l", "admin", "uk.json"),
  );
});

test("startMockCdn: serves the catalogs with CORS, 404s the rest, and logs both", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-e2e-lib-"));
  fs.writeFileSync(path.join(dir, "en.json"), '{"a":"b"}');
  fs.mkdirSync(path.join(dir, "admin"));
  fs.writeFileSync(path.join(dir, "admin", "de.json"), '{"c":"d"}');
  const cdn = await startMockCdn({ localesDir: dir });
  try {
    const root = await fetch(`${cdn.url}/en.json`);
    assert.equal(root.status, 200);
    assert.equal(root.headers.get("access-control-allow-origin"), "*");
    assert.deepEqual(await root.json(), { a: "b" });
    const namespaced = await fetch(`${cdn.url}/admin/de.json`);
    assert.deepEqual(await namespaced.json(), { c: "d" });
    assert.equal((await fetch(`${cdn.url}/uk.json`)).status, 404);
    assert.deepEqual(
      cdn.requests.map((entry) => [entry.pathname, entry.status]),
      [
        ["/cdn/e2e/en.json", 200],
        ["/cdn/e2e/admin/de.json", 200],
        ["/cdn/e2e/uk.json", 404],
      ],
    );
  } finally {
    await cdn.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("cdnVerdict: ok only when every locale came from the mock and nothing 404'd", () => {
  const hit = (locale, status = 200) => ({
    pathname: `/cdn/e2e/${locale}.json`,
    status,
    route: { locale, namespace: "default" },
  });
  assert.deepEqual(cdnVerdict([hit("en"), hit("uk"), hit("de"), hit("en")]), { ok: true });
  const none = cdnVerdict([]);
  assert.equal(none.ok, false);
  assert.match(none.message, /never served en, uk, de \(served: nothing\)/);
  const partial = cdnVerdict([hit("en"), hit("fr", 404)]);
  assert.match(partial.message, /never served uk, de \(served: en\)/);
  assert.match(partial.message, /404 for \/cdn\/e2e\/fr\.json/);
});

test("cdnEnv: one variable per kind, and an unknown kind is an error", () => {
  assert.deepEqual(cdnEnv("vite", "u"), { VITE_COMVI_CDN_URL: "u" });
  assert.deepEqual(cdnEnv("next", "u"), { NEXT_PUBLIC_COMVI_CDN_URL: "u" });
  assert.deepEqual(cdnEnv("nuxt", "u"), { NUXT_PUBLIC_COMVI_CDN_URL: "u" });
  assert.throws(() => cdnEnv("astro", "u"), /no CDN switch/);
});

// ── servers ────────────────────────────────────────────────────────────────

test("serverCommand: a reader's command per kind, on the chosen port", () => {
  const vite = serverCommand("vite", { dir: "/x", port: 4000 });
  assert.equal(vite.command, path.join("/x", "node_modules", ".bin", "vite"));
  assert.deepEqual(vite.args, ["preview", "--host", "127.0.0.1", "--port", "4000", "--strictPort"]);
  const next = serverCommand("next", { dir: "/x", port: 4001 });
  assert.deepEqual(next.args, ["start", "-H", "127.0.0.1", "-p", "4001"]);
  const nuxt = serverCommand("nuxt", { dir: "/x", port: 4002, env: { A: "1" } });
  assert.equal(nuxt.command, process.execPath);
  assert.deepEqual(nuxt.args, [path.join("/x", ".output", "server", "index.mjs")]);
  assert.equal(nuxt.env.PORT, "4002");
  assert.equal(nuxt.env.A, "1");
  assert.throws(() => serverCommand("astro", { dir: "/x", port: 1 }), /no server command/);
});

test("startPath: SSR examples start on a locale URL", () => {
  assert.equal(startPath("vite"), "/");
  assert.equal(startPath("next"), "/en");
  assert.equal(startPath("nuxt"), "/en");
});

// ── report ─────────────────────────────────────────────────────────────────

const report = {
  suites: [
    {
      title: "scenario.spec.ts",
      specs: [
        { title: "a: initial", tests: [{ results: [{ status: "passed" }] }] },
        {
          title: "c: plural",
          tests: [
            {
              results: [
                {
                  status: "failed",
                  errors: [
                    {
                      message:
                        "\u001b[31mError: uk, count 2\u001b[39m\n\nexpect(locator).toHaveText(expected) failed\n    at x.ts:1",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          title: "f: SSR",
          tests: [
            {
              annotations: [{ type: "skip", description: "client-rendered example" }],
              results: [{ status: "skipped" }],
            },
          ],
        },
        { title: "k2: dead CDN", tests: [{ results: [{ status: "passed" }] }] },
        { title: "o: no reason", tests: [{ results: [{ status: "skipped" }] }] },
        { title: "not a step", tests: [{ results: [{ status: "passed" }] }] },
      ],
      suites: [
        {
          title: "nested",
          specs: [{ title: "g: console", tests: [{ results: [{ status: "timedOut" }] }] }],
        },
      ],
    },
  ],
};

test("stepResults: one verdict per step id, from nested suites too", () => {
  const steps = stepResults(report);
  assert.deepEqual(Object.keys(steps).sort(), ["a", "c", "f", "g", "k2", "o"]);
  assert.deepEqual(steps.a, { status: "pass", message: undefined });
  assert.equal(steps.c.status, "fail");
  assert.equal(steps.c.message, "Error: uk, count 2 | expect(locator).toHaveText(expected) failed");
  assert.deepEqual(steps.k2, { status: "pass", message: undefined });
  assert.deepEqual(steps.g, { status: "fail", message: "timedOut" });
});

test("stepResults: a skip carries the reason the spec gave, and says so when there was none", () => {
  const steps = stepResults(report);
  assert.deepEqual(steps.f, { status: "skip", message: "client-rendered example" });
  assert.deepEqual(steps.o, { status: "skip", message: "skipped without a reason" });
});

test("summarizeError: strips colour, stack, code frame and diff scaffolding, keeps the values", () => {
  const message = [
    "Error: raw keys in the rendered page",
    "",
    "expect(received).toEqual(expected) // deep equality",
    "- Expected  - 1",
    "+ Received  + 3",
    "- Array []",
    "+ Array [",
    '+   "app.language",',
    "+ ]",
    "  325 |   await open(page);",
    "> 326 |   expect(x).toEqual([]);",
    "      |             ^",
    "    at scenario.spec.ts:10:3",
  ].join("\n");
  assert.equal(
    summarizeError(message),
    'Error: raw keys in the rendered page | expect(received).toEqual(expected) // deep equality | +   "app.language",',
  );
  assert.equal(summarizeError("x".repeat(500), 10), `${"x".repeat(9)}…`);
});

test("nuxtCatalogChunks: maps each locale's catalog to its hash-named chunk", () => {
  const manifest = {
    "locales/uk.json": { file: "FOGPGq4F.js" },
    "src/locales/de.json": { file: "NPGEZfEc.js" },
    "pages/index.vue": { file: "x.js" },
    "locales/broken.json": {},
  };
  assert.deepEqual(nuxtCatalogChunks(manifest), {
    uk: "/_nuxt/FOGPGq4F.js",
    de: "/_nuxt/NPGEZfEc.js",
  });
  assert.deepEqual(nuxtCatalogChunks(undefined), {});
});

const pass = { status: "pass" };
const allSteps = (entry) => Object.fromEntries(STEPS.map((step) => [step, entry]));

test("STEPS: a column per scenario, k2/k3 beside k", () => {
  assert.deepEqual(STEPS.slice(STEPS.indexOf("j"), STEPS.indexOf("l") + 1), [
    "j",
    "k",
    "k2",
    "k3",
    "l",
  ]);
  assert.equal(STEPS.at(-1), "p");
});

test("renderTable: a row per framework; failures and skip reasons listed once per message", () => {
  const results = [
    {
      name: "react",
      build: pass,
      steps: { ...allSteps(pass), f: { status: "skip", message: "client-rendered" } },
    },
    {
      name: "nuxt",
      build: pass,
      steps: {
        ...allSteps({ status: "fail", message: "GET /en answered 500" }),
        k: { status: "fail", message: "never served en" },
      },
    },
    { name: "vue", build: { status: "fail", message: "vite build exited 1" }, steps: {} },
  ];
  const text = renderTable(results);
  const lines = text.split("\n");
  assert.match(lines[0], new RegExp(`^framework\\s+build\\s+${STEPS.join("\\s+")}$`));
  assert.match(lines[2], /^react\s+ok\s+ok\s+ok\s+ok\s+ok\s+ok\s+skip(\s+ok){12}$/);
  assert.match(lines[3], new RegExp(`^nuxt\\s+ok(\\s+FAIL){${STEPS.length}}$`));
  assert.match(lines[4], new RegExp(`^vue\\s+FAIL(\\s+·){${STEPS.length}}$`));
  const others = STEPS.filter((step) => step !== "k").join(",");
  assert.ok(text.includes(`nuxt/${others}: GET /en answered 500`));
  assert.ok(text.includes("nuxt/k: never served en"));
  assert.ok(text.includes("vue/build: vite build exited 1"));
  assert.ok(text.includes("skipped:\nreact/f: client-rendered"));
  assert.ok(text.indexOf("skipped:") < text.indexOf("failures:"));
});

test("renderTable: a green run has no failures section and explains every column", () => {
  const text = renderTable([{ name: "react", build: pass, steps: allSteps(pass) }]);
  assert.ok(!text.includes("failures:"));
  assert.ok(!text.includes("skipped:"));
  for (const step of STEPS) assert.match(text, new RegExp(`^${step}\\s+\\S`, "m"));
});

test("allPassed: skips are fine, failures and unreached steps are not", () => {
  const green = {
    name: "x",
    build: pass,
    steps: { ...allSteps(pass), f: { status: "skip", message: "r" } },
  };
  assert.equal(allPassed([green]), true);
  assert.equal(allPassed([{ ...green, steps: { ...green.steps, c: { status: "fail" } } }]), false);
  assert.equal(allPassed([{ ...green, steps: { ...green.steps, k2: undefined } }]), false);
  assert.equal(allPassed([{ ...green, steps: {} }]), false);
  assert.equal(allPassed([{ ...green, build: { status: "fail" } }]), false);
});
