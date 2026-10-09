import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import crypto from "node:crypto";

import {
  CDN_CONTROL_STEPS,
  CDN_MARK,
  CORRUPT_BODY,
  EXPECTED_FAILURES,
  F15_VARIANT,
  STEPS,
  STEP_LEGEND,
  allPassed,
  allowedSkips,
  applyExpectedFailures,
  applyVariant,
  assertCandidateIntegrity,
  candidatePackages,
  catalogFile,
  catalogKey,
  cdnCatalog,
  cdnEnv,
  cdnRoute,
  cdnVerdict,
  collectFindings,
  enforceSkipMatrix,
  freePort,
  nuxtCatalogChunks,
  parseArgs,
  renderFindings,
  renderTable,
  serverCommand,
  startMockCdn,
  startPath,
  stepFindings,
  stepResults,
  summarizeError,
  tarballName,
  comviLockEntries,
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
    tarballs: null,
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

test("parseArgs: --tarballs forces --no-build and --no-pack", () => {
  for (const argv of [["--tarballs", "rc"], ["--tarballs=rc"]]) {
    const options = parseArgs(argv);
    assert.equal(options.tarballs, "rc");
    assert.equal(options.build, false);
    assert.equal(options.pack, false);
  }
  assert.throws(() => parseArgs(["--tarballs"]), /--tarballs needs a directory/);
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
    assert.deepEqual(await root.json(), { a: `${CDN_MARK}b` });
    const namespaced = await fetch(`${cdn.url}/admin/de.json`);
    assert.deepEqual(await namespaced.json(), { c: `${CDN_MARK}d` });
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

test("startMockCdn: hold withholds until released, in the order the test chooses", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-e2e-lib-"));
  for (const locale of ["en", "uk", "de"]) {
    fs.writeFileSync(path.join(dir, `${locale}.json`), JSON.stringify({ a: locale }));
  }
  const cdn = await startMockCdn({ localesDir: dir });
  const control = (action, init) => fetch(`${cdn.controlUrl}/${action}`, init);
  const post = (action, body) =>
    control(action, { method: "POST", body: body && JSON.stringify(body) });
  try {
    await post("mode", { hold: ["uk", "de"] });
    const arrived = [];
    const uk = fetch(`${cdn.url}/uk.json`).then(async (r) => (arrived.push("uk"), r.json()));
    const de = fetch(`${cdn.url}/de.json`).then(async (r) => (arrived.push("de"), r.json()));
    // en is not held: it is answered while uk and de wait.
    assert.deepEqual(await (await fetch(`${cdn.url}/en.json`)).json(), { a: `${CDN_MARK}en` });
    let state;
    for (let i = 0; i < 50; i++) {
      state = await (await control("state")).json();
      if (state.held.length === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual([...state.held].sort(), ["de", "uk"]);
    assert.deepEqual(arrived, []);
    assert.deepEqual(cdn.requests.map((entry) => `${entry.route.locale}:${entry.status}`).sort(), [
      "de:held",
      "en:200",
      "uk:held",
    ]);
    // de first: its response is written before the release call returns.
    assert.deepEqual(await (await post("release?key=de")).json(), { released: 1 });
    assert.deepEqual(await de, { a: `${CDN_MARK}de` });
    assert.deepEqual((await (await control("state")).json()).held, ["uk"]);
    assert.deepEqual(await (await post("release?key=uk")).json(), { released: 1 });
    assert.deepEqual(await uk, { a: `${CDN_MARK}uk` });
    assert.deepEqual(arrived, ["de", "uk"]);
    // Nothing held: a release is a 409, not a silent no-op.
    assert.equal((await post("release?key=uk")).status, 409);
    assert.ok(cdn.requests.every((entry) => entry.status === 200));
  } finally {
    await cdn.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("startMockCdn: a mode names one catalog, so a namespace is steered apart from its locale", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-e2e-lib-"));
  fs.mkdirSync(path.join(dir, "account"));
  for (const locale of ["uk", "de"]) {
    fs.writeFileSync(path.join(dir, `${locale}.json`), JSON.stringify({ a: locale }));
    fs.writeFileSync(path.join(dir, "account", `${locale}.json`), JSON.stringify({ b: locale }));
  }
  const cdn = await startMockCdn({ localesDir: dir });
  const control = (action, init) => fetch(`${cdn.controlUrl}/${action}`, init);
  const post = (action, body) =>
    control(action, { method: "POST", body: body && JSON.stringify(body) });
  const held = async (count) => {
    let state;
    for (let i = 0; i < 50; i++) {
      state = await (await control("state")).json();
      if (state.held.length === count) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return state.held;
  };
  try {
    assert.equal(catalogKey({ locale: "uk", namespace: "default" }), "uk");
    assert.equal(catalogKey({ locale: "uk", namespace: "account" }), "uk:account");
    assert.equal(catalogKey({ locale: "uk", namespace: "main" }, "main"), "uk");

    // Only the namespace's file is held: the same locale's default catalog answers.
    await post("mode", { hold: ["uk:account"] });
    const account = fetch(`${cdn.url}/account/uk.json`).then((r) => r.json());
    assert.deepEqual(await (await fetch(`${cdn.url}/uk.json`)).json(), { a: `${CDN_MARK}uk` });
    assert.deepEqual(await held(1), ["uk:account"]);
    // A release names the catalog too: the locale alone releases nothing here.
    assert.equal((await post("release?key=uk")).status, 409);
    assert.deepEqual(await (await post("release?key=uk%3Aaccount")).json(), { released: 1 });
    assert.deepEqual(await account, { b: `${CDN_MARK}uk` });

    // Both of a locale's files held, the default one released first.
    await post("mode", { hold: ["de", "de:account"] });
    const order = [];
    const root = fetch(`${cdn.url}/de.json`).then((r) => (order.push("de"), r.json()));
    const namespaced = fetch(`${cdn.url}/account/de.json`).then(
      (r) => (order.push("de:account"), r.json()),
    );
    assert.deepEqual([...(await held(2))].sort(), ["de", "de:account"]);
    await post("release?key=de");
    await root;
    assert.deepEqual((await (await control("state")).json()).held, ["de:account"]);
    await post("release?key=de%3Aaccount");
    await namespaced;
    assert.deepEqual(order, ["de", "de:account"]);

    // hang and corrupt are keyed the same way.
    await post("mode", { corrupt: ["uk:account"], hang: ["de:account"] });
    assert.equal(await (await fetch(`${cdn.url}/account/uk.json`)).text(), CORRUPT_BODY);
    assert.deepEqual(await (await fetch(`${cdn.url}/uk.json`)).json(), { a: `${CDN_MARK}uk` });
    const hung = await fetch(`${cdn.url}/account/de.json`, {
      signal: AbortSignal.timeout(300),
    }).catch((error) => error.name);
    assert.equal(hung, "TimeoutError");
    assert.deepEqual(await (await fetch(`${cdn.url}/de.json`)).json(), { a: `${CDN_MARK}de` });
  } finally {
    await cdn.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("startMockCdn: hang never answers, corrupt is not JSON, missing overrides CDN_MISSING", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-e2e-lib-"));
  fs.writeFileSync(path.join(dir, "uk.json"), '{"a":"b"}');
  fs.writeFileSync(path.join(dir, "de.json"), '{"a":"b","fallback":{"only_en":"x"}}');
  const cdn = await startMockCdn({ localesDir: dir });
  const post = (action, body) =>
    fetch(`${cdn.controlUrl}/${action}`, { method: "POST", body: JSON.stringify(body) });
  try {
    await post("mode", { hang: ["uk"], missing: { de: ["fallback.only_en"] } });
    const hung = await fetch(`${cdn.url}/uk.json`, { signal: AbortSignal.timeout(300) }).catch(
      (error) => error.name,
    );
    assert.equal(hung, "TimeoutError");
    assert.equal(cdn.requests.at(-1).status, "hang");
    assert.deepEqual(await (await fetch(`${cdn.url}/de.json`)).json(), {
      a: `${CDN_MARK}b`,
      fallback: {},
    });

    // A new mode drops what the old one left hanging, and resets `missing`.
    await post("mode", { corrupt: ["uk"] });
    assert.deepEqual((await (await fetch(`${cdn.controlUrl}/state`)).json()).hanging, []);
    const corrupt = await fetch(`${cdn.url}/uk.json`);
    assert.equal(corrupt.status, 200);
    assert.equal(await corrupt.text(), CORRUPT_BODY);
    assert.throws(() => JSON.parse(CORRUPT_BODY));
    assert.equal(cdn.requests.at(-1).corrupt, true);
    assert.deepEqual((await (await fetch(`${cdn.url}/de.json`)).json()).fallback, {
      only_en: `${CDN_MARK}x`,
    });
    // A mode that is not JSON is refused and changes nothing; the mock stays up.
    const bad = await fetch(`${cdn.controlUrl}/mode`, { method: "POST", body: "{not json" });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /not JSON/);
    assert.equal(await (await fetch(`${cdn.url}/uk.json`)).text(), CORRUPT_BODY);
    // reset() is plain serving again: the corrupt mode does not outlive the step.
    cdn.reset();
    assert.deepEqual(await (await fetch(`${cdn.url}/uk.json`)).json(), { a: `${CDN_MARK}b` });
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

test("nuxtCatalogChunks: maps each catalog to its hash-named chunk, under its import-map key", () => {
  const manifest = {
    "locales/uk.json": { file: "FOGPGq4F.js" },
    "src/locales/de.json": { file: "NPGEZfEc.js" },
    // A namespace folder: its own key, never the locale's.
    "src/locales/account/uk.json": { file: "Bq1nsAcc.js" },
    "locales/account/de.json": { file: "Cq2nsAcc.js" },
    "pages/index.vue": { file: "x.js" },
    "locales/broken.json": {},
    "src/locales/a/b/uk.json": { file: "deep.js" },
  };
  assert.deepEqual(nuxtCatalogChunks(manifest), {
    uk: "/_nuxt/FOGPGq4F.js",
    de: "/_nuxt/NPGEZfEc.js",
    "uk:account": "/_nuxt/Bq1nsAcc.js",
    "de:account": "/_nuxt/Cq2nsAcc.js",
  });
  assert.deepEqual(nuxtCatalogChunks(undefined), {});
});

const pass = { status: "pass" };
const allSteps = (entry) => Object.fromEntries(STEPS.map((step) => [step, entry]));

test("STEPS: a column per scenario, k2/k3 beside k, g2 beside g", () => {
  assert.deepEqual(STEPS.slice(STEPS.indexOf("j"), STEPS.indexOf("l") + 1), [
    "j",
    "k",
    "k2",
    "k3",
    "l",
  ]);
  assert.equal(STEPS[STEPS.indexOf("g") + 1], "g2");
  assert.deepEqual(STEPS.slice(STEPS.indexOf("q")), [
    "q",
    "r",
    "s",
    ...CDN_CONTROL_STEPS,
    // The `account` namespace, after every step that predates it.
    "w",
    "x",
    "y",
    "z",
  ]);
  assert.deepEqual(CDN_CONTROL_STEPS, ["t", "t2", "u", "v", "v2"]);
  for (const step of STEPS) assert.ok(STEP_LEGEND[step], `a legend line for ${step}`);
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
  const afterF = STEPS.length - STEPS.indexOf("f") - 1;
  assert.match(
    lines[2],
    new RegExp(`^react\\s+ok\\s+ok\\s+ok\\s+ok\\s+ok\\s+ok\\s+skip(\\s+ok){${afterF}}$`),
  );
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

// ── where the suite runs ───────────────────────────────────────────────────

const REPO = path.resolve(import.meta.dirname, "../..");

test("CI shards every example, in both modes", async () => {
  const { exampleDirs } = await import("../examples-verify.mjs");
  const ci = fs.readFileSync(path.join(REPO, ".github/workflows/ci.yml"), "utf8");
  const list = (name) => {
    const match = new RegExp(`^\\s+${name}: \\[([^\\]]*)\\]$`, "m").exec(ci);
    assert.ok(match, `ci.yml has no one-line \`${name}: [...]\` matrix axis`);
    return match[1].split(",").map((entry) => entry.trim());
  };
  // A new example with no shard would never run in CI, and nothing else says so.
  assert.deepEqual(
    list("framework").sort(),
    exampleDirs().map((entry) => entry.name),
  );
  assert.deepEqual(list("mode"), ["default", "cdn"]);
});

test("examples:e2e:all runs both modes, and closes test:release", () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
  const runs = scripts["examples:e2e:all"]
    .split("&&")
    .map((command) => command.trim().split(/\s+/));
  assert.deepEqual(
    runs.map((argv) => argv.slice(0, 2)),
    [
      ["node", "scripts/examples-e2e/run.mjs"],
      ["node", "scripts/examples-e2e/run.mjs"],
    ],
  );
  const [first, second] = runs.map((argv) => parseArgs(argv.slice(2)));
  assert.equal(first.cdn, false);
  assert.equal(second.cdn, true);
  // The --cdn pass reuses the first pass's tarballs; run.mjs refuses stale ones.
  assert.equal(second.build || second.pack, false);
  assert.match(scripts["test:release"], /&& pnpm examples:e2e:all$/);
});

// ── provenance of the catalogs ─────────────────────────────────────────────

test("cdnCatalog: every message marked, nested too; the CDN-missing keys dropped", () => {
  const bundled = {
    greeting: { hello: "Привіт, {name}!" },
    fallback: { only_en: "x" },
    cart: { items: "{count, plural, one {# товар} other {# товарів}}" },
  };
  assert.deepEqual(cdnCatalog(bundled, "uk"), {
    greeting: { hello: `${CDN_MARK}Привіт, {name}!` },
    fallback: {},
    cart: { items: `${CDN_MARK}{count, plural, one {# товар} other {# товарів}}` },
  });
  // en keeps the key the CDN's uk lacks, marked: k3's en value differs from the bundle's.
  assert.equal(cdnCatalog(bundled, "en").fallback.only_en, `${CDN_MARK}x`);
});

// ── skips and expected failures ────────────────────────────────────────────

test("allowedSkips: SSR-only steps for vite, CDN steps without --cdn, s with --cdn", () => {
  assert.deepEqual([...allowedSkips({ kind: "vite", cdn: false })].sort(), [
    "f",
    "g2",
    "i",
    "k",
    "k2",
    "k3",
    "o",
    "s",
    "t",
    "t2",
    "u",
    "v",
    "v2",
    "y",
    "z",
  ]);
  assert.deepEqual([...allowedSkips({ kind: "vite", cdn: true })].sort(), [
    "f",
    "i",
    "o",
    "s",
    "t",
    "t2",
    "y",
  ]);
  assert.deepEqual([...allowedSkips({ kind: "next", cdn: true })], ["s"]);
  assert.deepEqual([...allowedSkips({ kind: "nuxt", cdn: false })].sort(), [
    "g2",
    "k",
    "k2",
    "k3",
    "t",
    "t2",
    "u",
    "v",
    "v2",
    "z",
  ]);
});

test("enforceSkipMatrix: an unlisted skip fails its step, a listed one stays a skip", () => {
  const steps = enforceSkipMatrix(
    {
      a: { status: "skip", message: "SSR examples only" },
      f: { status: "skip", message: "client-rendered" },
      b: pass,
    },
    { kind: "vite", cdn: true },
  );
  assert.equal(steps.a.status, "fail");
  assert.match(steps.a.message, /unexpected skip.*SSR examples only/);
  assert.deepEqual(steps.f, { status: "skip", message: "client-rendered" });
  assert.deepEqual(steps.b, pass);
});

test("applyExpectedFailures: only the listed failure is xfail; a pass or another failure is not", () => {
  const list = [{ framework: "nuxt", step: "s", ref: "F-15", reason: "r", match: /fallback/ }];
  const failing = applyExpectedFailures(
    "nuxt",
    { s: { status: "fail", message: "the en-only key: fallback.only_en" } },
    list,
  );
  assert.equal(failing.s.status, "xfail");
  assert.match(failing.s.message, /^F-15 \(r\): /);
  const other = applyExpectedFailures(
    "nuxt",
    { s: { status: "fail", message: "the server exited (1)" } },
    list,
  );
  assert.equal(other.s.status, "fail");
  const passing = applyExpectedFailures("nuxt", { s: pass }, list);
  assert.equal(passing.s.status, "fail");
  assert.match(passing.s.message, /F-15 is listed in EXPECTED_FAILURES but passed/);
  assert.deepEqual(applyExpectedFailures("next", { s: { status: "fail" } }, list).s.status, "fail");
  for (const stale of [{ s: { status: "skip", message: "x" } }, {}]) {
    const steps = applyExpectedFailures("nuxt", stale, list);
    assert.equal(steps.s.status, "fail");
    assert.match(steps.s.message, /the entry is stale/);
  }
  // A /g pattern is not stateful across calls.
  const global = [{ ...list[0], match: /fallback/g }];
  for (let i = 0; i < 3; i++) {
    const steps = applyExpectedFailures(
      "nuxt",
      { s: { status: "fail", message: "fallback" } },
      global,
    );
    assert.equal(steps.s.status, "xfail");
  }
});

test("EXPECTED_FAILURES: each entry has a reference and a message to match", () => {
  for (const entry of EXPECTED_FAILURES) {
    assert.ok(STEPS.includes(entry.step));
    assert.match(entry.ref, /\S/);
    assert.ok(entry.match instanceof RegExp);
  }
});

test("renderTable / allPassed: an xfail is listed with its reference and keeps the run green", () => {
  const steps = { ...allSteps(pass), s: { status: "xfail", message: "F-15 (r): boom" } };
  const text = renderTable([{ name: "nuxt", build: pass, steps }]);
  // s's cell, followed by every column after it.
  assert.match(
    text.split("\n")[2],
    new RegExp(`\\sxfail${"\\s+ok".repeat(STEPS.length - 1 - STEPS.indexOf("s"))}$`),
  );
  assert.ok(text.includes("expected failures:\nnuxt/s: F-15 (r): boom"));
  assert.equal(allPassed([{ name: "nuxt", build: pass, steps }]), true);
});

// ── the F-15 variant ───────────────────────────────────────────────────────

test("applyVariant: edits the copy once, and refuses a config it does not recognise", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-e2e-variant-"));
  try {
    fs.writeFileSync(
      path.join(dir, "nuxt.config.ts"),
      'comvi: { defaultLocale: "en", fallbackLocale: "en" }',
    );
    applyVariant(dir, F15_VARIANT.nuxt);
    assert.equal(
      fs.readFileSync(path.join(dir, "nuxt.config.ts"), "utf8"),
      'comvi: { defaultLocale: "uk", fallbackLocale: "en" }',
    );
    // Applied twice, the edit no longer matches: never a silent no-op.
    assert.throws(() => applyVariant(dir, F15_VARIANT.nuxt), /exactly once.*found 0/);
    fs.writeFileSync(path.join(dir, "nuxt.config.ts"), 'comvi: { defaultLocale: "en" }');
    assert.throws(() => applyVariant(dir, F15_VARIANT.nuxt), /no longer contains/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("F15_VARIANT matches the committed next and nuxt examples", () => {
  for (const kind of ["next", "nuxt"]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `comvi-e2e-${kind}-`));
    try {
      fs.cpSync(path.join(REPO, "examples", kind), dir, {
        recursive: true,
        filter: (source) => !source.includes("node_modules"),
      });
      applyVariant(dir, F15_VARIANT[kind]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

// ── candidate tarballs ─────────────────────────────────────────────────────

const sri = (body) => `sha512-${crypto.createHash("sha512").update(body).digest("base64")}`;

test("candidatePackages: names and versions come from the tarballs; gaps and strays refused", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-e2e-candidate-"));
  // The checkout says 0.4.0; the candidate (an RC packed elsewhere) says 0.5.0-rc.1.
  const packages = [
    { name: "@comvi/core", version: "0.4.0" },
    { name: "@comvi/react", version: "0.4.0" },
  ];
  const manifests = {};
  const put = (file, manifest) => {
    fs.writeFileSync(path.join(dir, file), file);
    manifests[file] = manifest;
  };
  const read = (tarball) => manifests[path.basename(tarball)];
  try {
    assert.equal(tarballName(packages[0]), "comvi-core-0.4.0.tgz");
    put("comvi-core-0.5.0-rc.1.tgz", { name: "@comvi/core", version: "0.5.0-rc.1" });
    assert.throws(() => candidatePackages(dir, packages, read), /no tarball .* for @comvi\/react/);
    put("comvi-react-0.5.0-rc.1.tgz", { name: "@comvi/react", version: "0.5.0-rc.1" });
    assert.deepEqual(
      candidatePackages(dir, packages, read).map((pkg) => [pkg.name, pkg.version, pkg.tarball]),
      [
        ["@comvi/core", "0.5.0-rc.1", path.join(dir, "comvi-core-0.5.0-rc.1.tgz")],
        ["@comvi/react", "0.5.0-rc.1", path.join(dir, "comvi-react-0.5.0-rc.1.tgz")],
      ],
    );
    put("comvi-core-0.4.0.tgz", { name: "@comvi/core", version: "0.4.0" });
    assert.throws(
      () => candidatePackages(dir, packages, read),
      /more than one tarball for @comvi\/core/,
    );
    fs.rmSync(path.join(dir, "comvi-core-0.4.0.tgz"));
    put("comvi-evil-1.0.0.tgz", { name: "@comvi/evil", version: "1.0.0" });
    assert.throws(() => candidatePackages(dir, packages, read), /no workspace package names/);
    fs.rmSync(path.join(dir, "comvi-evil-1.0.0.tgz"));
    put("comvi-vue-0.5.0-rc.1.tgz", { name: "@comvi/react", version: "0.5.0-rc.1" });
    assert.throws(() => candidatePackages(dir, packages, read), /pnpm would name it/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("assertCandidateIntegrity: the lockfile must name the candidate's file with its sha512", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-e2e-integrity-"));
  try {
    const install = path.join(root, "install");
    const candidate = path.join(root, "candidate");
    fs.mkdirSync(install);
    fs.mkdirSync(candidate);
    const tarball = path.join(candidate, "comvi-core-0.5.0.tgz");
    fs.writeFileSync(tarball, "core bytes");
    const packages = [{ name: "@comvi/core", version: "0.5.0", tarball }];
    const lock = (integrity, file = "../candidate/comvi-core-0.5.0.tgz") =>
      [
        "packages:",
        "",
        `  '@comvi/core@file:${file}':`,
        `    resolution: {integrity: ${integrity}, tarball: file:${file}}`,
        "    version: 0.5.0",
        "",
      ].join("\n");

    assert.deepEqual(comviLockEntries(lock(sri("core bytes")), install), [
      {
        name: "@comvi/core",
        reference: "file:../candidate/comvi-core-0.5.0.tgz",
        integrity: sri("core bytes"),
        tarball,
      },
    ]);
    assertCandidateIntegrity(lock(sri("core bytes")), install, packages);
    assert.throws(
      () => assertCandidateIntegrity(lock(sri("other bytes")), install, packages),
      /lockfile's integrity .* is not the candidate tarball's/,
    );
    assert.throws(
      () =>
        assertCandidateIntegrity(
          lock(sri("core bytes"), "../elsewhere/comvi-core-0.5.0.tgz"),
          install,
          packages,
        ),
      /not the candidate's/,
    );
    assert.throws(
      () => assertCandidateIntegrity("lockfileVersion: '9.0'\n", install, packages),
      /names no @comvi package resolution/,
    );

    // A peer resolved through the candidate registry: a version key, the
    // registry's URL, and the same bytes. Accepted only with the candidate's
    // version AND the candidate's sha512.
    const registryLock = (version, integrity) =>
      [
        "lockfileVersion: '9.0'",
        "",
        "packages:",
        "",
        `  '@comvi/core@${version}':`,
        `    resolution: {integrity: ${integrity}, tarball: http://127.0.0.1:1234/-/tarballs/comvi-core-${version}.tgz}`,
        "",
        "  vue@3.5.43:",
        "    resolution: {integrity: sha512-x}",
        "",
        "snapshots:",
        "",
        `  '@comvi/core@${version}': {}`,
        "",
      ].join("\n");
    const [entry] = comviLockEntries(registryLock("0.5.0", sri("core bytes")), install);
    assert.equal(entry.reference, "0.5.0");
    assert.equal(entry.tarball, "http://127.0.0.1:1234/-/tarballs/comvi-core-0.5.0.tgz");
    assertCandidateIntegrity(registryLock("0.5.0", sri("core bytes")), install, packages);
    assert.throws(
      () => assertCandidateIntegrity(registryLock("0.5.0", sri("npm bytes")), install, packages),
      /is not the candidate tarball's/,
    );
    assert.throws(
      () => assertCandidateIntegrity(registryLock("0.4.1", sri("core bytes")), install, packages),
      /@comvi\/core@0\.4\.1 resolved, but the candidate is 0\.5\.0/,
    );
    // Any other shape is an error, never skipped.
    assert.throws(
      () =>
        assertCandidateIntegrity(
          registryLock("0.5.0", sri("core bytes")).replace(
            "'@comvi/core@0.5.0':",
            "'@comvi/core@link:../core':",
          ),
          install,
          packages,
        ),
      /unexplained @comvi lockfile entry/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ── findings ───────────────────────────────────────────────────────────────

test("stepFindings → collectFindings → renderFindings: mixed states are reported with paint diagnostics", () => {
  const state = {
    problem: 'en text under <html lang="uk">',
    lang: "uk",
    text: "Hello",
    painted: false,
  };
  const report = {
    suites: [
      {
        specs: [
          {
            title: "r: DOM states",
            tests: [
              {
                // Playwright repeats a runtime annotation on the test itself.
                annotations: [{ type: "finding:mixedState", description: JSON.stringify(state) }],
                results: [
                  {
                    status: "passed",
                    annotations: [
                      { type: "finding:mixedState", description: JSON.stringify(state) },
                      { type: "note", description: "ignored" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const found = stepFindings(report);
  assert.deepEqual(found, [{ kind: "mixedState", step: "r", ...state }]);
  const findings = collectFindings(
    [{ name: "next", findings: found.map((entry) => ({ ...entry, phase: "main" })) }],
    "default",
  );
  assert.deepEqual(findings.mixedStates, [
    { framework: "next", mode: "default", step: "r", phase: "main", ...state },
  ]);
  const text = renderFindings(findings);
  assert.match(text, /each one fails its step/);
  assert.match(
    text,
    /next\/r \(main\): en text under <html lang="uk">; lang=uk, greeting="Hello", painted=no/,
  );
  // A step that watches other elements names the one it quotes.
  assert.match(
    renderFindings({ mixedStates: [{ ...findings.mixedStates[0], field: "account-signed-in" }] }),
    /lang=uk, account-signed-in="Hello", painted=no/,
  );
  assert.equal(renderFindings(collectFindings([{ name: "react", findings: [] }], "cdn")), "");
});

test("renderFindings: a hydration stall lists the requests that never finished", () => {
  const findings = collectFindings(
    [
      {
        name: "next",
        findings: [
          {
            kind: "hydrationStall",
            step: "t",
            phase: "cdn-t",
            what: "de hydration",
            afterMs: 15012,
            hydrated: null,
            pending: [{ method: "GET", url: "/_next/static/chunks/x.js", ageMs: 14990 }],
          },
        ],
      },
    ],
    "cdn",
  );
  assert.equal(
    renderFindings(findings),
    "\nhydration stalls (each one failed its step):\n" +
      "next/t (cdn-t): de hydration stalled after 15012 ms, hydrated=null; " +
      "pending: GET /_next/static/chunks/x.js (14990 ms)",
  );
});

// ── the candidate registry ─────────────────────────────────────────────────

test("startCandidateRegistry: serves only the candidate's versions, and 404s the rest", async () => {
  const { startCandidateRegistry, scopeRegistryLine } = await import("./candidate-registry.mjs");
  const { execFileSync } = await import("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-e2e-registry-"));
  try {
    fs.mkdirSync(path.join(dir, "package"));
    fs.writeFileSync(
      path.join(dir, "package", "package.json"),
      JSON.stringify({ name: "@comvi/core", version: "0.5.0-rc.1" }),
    );
    const tarball = path.join(dir, "comvi-core-0.5.0-rc.1.tgz");
    execFileSync("tar", ["-czf", tarball, "-C", dir, "package"]);
    const registry = await startCandidateRegistry([tarball]);
    try {
      const packument = await (await fetch(`${registry.url}@comvi%2fcore`)).json();
      assert.deepEqual(Object.keys(packument.versions), ["0.5.0-rc.1"]);
      const { dist } = packument.versions["0.5.0-rc.1"];
      assert.equal(dist.integrity, sri(fs.readFileSync(tarball)));
      const bytes = Buffer.from(await (await fetch(dist.tarball)).arrayBuffer());
      assert.ok(bytes.equals(fs.readFileSync(tarball)));
      assert.equal((await fetch(`${registry.url}@comvi%2freact`)).status, 404);
      assert.equal((await fetch(`${registry.url}%E0%A4%A`)).status, 400);
      assert.deepEqual(
        registry.requests.map((entry) => entry.status),
        [200, 200, 404, 400],
      );
      assert.equal(scopeRegistryLine(registry.url), `@comvi:registry=${registry.url}\n`);
    } finally {
      await registry.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
