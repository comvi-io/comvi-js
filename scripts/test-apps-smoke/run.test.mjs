import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { preflight, readiness, stopGroup } from "./run.mjs";

const NEXT_LOG = [
  "   ▲ Next.js 16.4.3\n   - Local:         http://localhost:4102\n",
  " ✓ Ready in 85ms\n",
];
const NITRO_LOG = ["Listening on http://127.0.0.1:4104\n"];

test("readiness: a response while our server announced no listener on the port → not ready", () => {
  // Another process on the port answers; ours has printed nothing yet.
  const state = readiness({ exited: null, answered: true, log: [], port: 4102 });

  assert.deepEqual(state, { ready: false });
});

test("readiness: a response while our server announced a DIFFERENT port → not ready", () => {
  const state = readiness({ exited: null, answered: true, log: NEXT_LOG, port: 4999 });

  assert.deepEqual(state, { ready: false });
});

test("readiness: EADDRINUSE in the child's output → a collision error", () => {
  const log = ["Error: listen EADDRINUSE: address already in use :::4102\n"];

  const state = readiness({ exited: null, answered: true, log, port: 4102 });

  assert.equal(state.collision, true);
  assert.match(state.error, /port 4102 is already in use/);
});

test("readiness: the child exited → an error, even if something answered", () => {
  const state = readiness({
    exited: { code: 1, signal: null },
    answered: true,
    log: NEXT_LOG,
    port: 4102,
  });

  assert.match(state.error, /server exited/);
  assert.equal(state.collision, false);
});

for (const [kind, log, port] of [
  ["next start", NEXT_LOG, 4102],
  ["nitro", NITRO_LOG, 4104],
]) {
  test(`readiness: ${kind} answered and announced our port → ready`, () => {
    const state = readiness({ exited: null, answered: true, log, port });

    assert.deepEqual(state, { ready: true });
  });

  test(`readiness: ${kind} announced our port but nothing answered yet → not ready`, () => {
    const state = readiness({ exited: null, answered: false, log, port });

    assert.deepEqual(state, { ready: false });
  });
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

/** Spawns `script` as the leader of a new process group; resolves with it once it printed a line. */
function spawnGroup(script) {
  const child = spawn(process.execPath, ["-e", script], {
    detached: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.stdout.once("data", (chunk) => resolve({ child, line: String(chunk).trim() }));
  });
}

test(
  "stopGroup: the leader already exited, a forked worker lives on → the worker is stopped",
  { timeout: 10_000 },
  async () => {
    const { child, line } = await spawnGroup(
      "const w = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });" +
        "console.log(w.pid); setTimeout(() => process.exit(0), 50);",
    );
    const worker = Number(line);
    await new Promise((resolve) => child.once("exit", resolve));
    assert.equal(alive(worker), true);

    await stopGroup(child.pid, { graceMs: 2_000 });

    assert.equal(alive(worker), false);
  },
);

test(
  "stopGroup: a group that ignores SIGTERM → SIGKILL after the grace period, bounded",
  { timeout: 10_000 },
  async () => {
    const { child } = await spawnGroup(
      "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); console.log('up');",
    );
    const started = Date.now();

    const outcome = await stopGroup(child.pid, { graceMs: 300 });

    assert.equal(outcome, "killed");
    assert.equal(alive(child.pid), false);
    assert.ok(Date.now() - started < 5_000, `took ${Date.now() - started} ms`);
  },
);

test("stopGroup: EPERM from the liveness probe means the group is still going (macOS), not an error", async () => {
  const probes = ["EPERM", "EPERM", "ESRCH"];
  const kill = (_pid, signal) => {
    if (signal !== 0) return;
    const code = probes.shift();
    throw Object.assign(new Error(`kill ${code}`), { code });
  };

  const outcome = await stopGroup(123456, { kill, graceMs: 1_000 });

  assert.equal(outcome, "terminated");
  assert.deepEqual(probes, []);
});

test("stopGroup: a group that is already gone → resolves (ESRCH is not an error)", async () => {
  const kill = () => {
    throw Object.assign(new Error("kill ESRCH"), { code: "ESRCH" });
  };

  const outcome = await stopGroup(123456, { kill });

  assert.equal(outcome, "gone");
});

test("stopGroup: any other kill error (EPERM) → rejects instead of being swallowed", async () => {
  const kill = () => {
    throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
  };

  await assert.rejects(stopGroup(123456, { kill }), { code: "EPERM" });
});

function standWith({ declared, installed }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-preflight-"));
  fs.mkdirSync(path.join(dir, "node_modules", "next"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".next"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".next", "BUILD_ID"), "x");
  fs.writeFileSync(
    path.join(dir, "node_modules", "next", "package.json"),
    JSON.stringify({ version: installed }),
  );
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ dependencies: { next: declared } }),
  );
  return dir;
}
const NEXT_APP = { kind: "next", framework: "next", major: 15 };

test("preflight: a stand pinned to an exact version that is not the installed one → a problem naming both", () => {
  const dir = standWith({ declared: "15.5.29", installed: "15.5.30" });

  const problems = preflight("next", NEXT_APP, dir);

  assert.deepEqual(problems, ["test-apps/next pins next@15.5.29 but 15.5.30 is installed"]);
});

test("preflight: an exact pin that is installed, and a range, are not flagged", () => {
  assert.deepEqual(
    preflight("next", NEXT_APP, standWith({ declared: "15.5.29", installed: "15.5.29" })),
    [],
  );
  assert.deepEqual(
    preflight("next", NEXT_APP, standWith({ declared: "^15.5.28", installed: "15.5.30" })),
    [],
  );
});

function floorStandWith({ nuxt, nitropack }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-floor-"));
  for (const [name, version] of [
    ["nuxt", nuxt],
    ["nitropack", nitropack],
  ]) {
    fs.mkdirSync(path.join(dir, "node_modules", name), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "node_modules", name, "package.json"),
      JSON.stringify({ version }),
    );
  }
  fs.mkdirSync(path.join(dir, ".output", "server"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".output", "server", "index.mjs"), "");
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ dependencies: { nuxt: "4.0.0" } }),
  );
  return dir;
}
const FLOOR_APP = {
  kind: "nuxt",
  framework: "nuxt",
  major: 4,
  node: 22,
  floor: { from: "nuxt4", pins: { nuxt: "4.0.0" }, overrides: { nitropack: "2.12.9" } },
};

test("preflight: a floor stand on its Node major with the exact Nuxt and override → no problem", () => {
  const dir = floorStandWith({ nuxt: "4.0.0", nitropack: "2.12.9" });

  assert.deepEqual(preflight("nuxt4-floor", FLOOR_APP, dir, "22.22.3"), []);
});

test("preflight: a floor stand run on another Node major → a problem naming both", () => {
  const dir = floorStandWith({ nuxt: "4.0.0", nitropack: "2.12.9" });

  assert.deepEqual(preflight("nuxt4-floor", FLOOR_APP, dir, "24.22.1"), [
    "the nuxt4-floor stand runs on Node 22, this is Node 24.22.1",
  ]);
});

test("preflight: a floor stand whose installed override differs from the one it names → a problem", () => {
  const dir = floorStandWith({ nuxt: "4.0.0", nitropack: "2.12.0" });

  assert.deepEqual(preflight("nuxt4-floor", FLOOR_APP, dir, "22.22.3"), [
    "the nuxt4-floor stand overrides nitropack@2.12.9 but 2.12.0 is installed",
  ]);
});

test("preflight: a floor stand whose Nuxt resolved past the exact pin → a problem", () => {
  const dir = floorStandWith({ nuxt: "4.0.3", nitropack: "2.12.9" });

  assert.deepEqual(preflight("nuxt4-floor", FLOOR_APP, dir, "22.22.3"), [
    "the nuxt4-floor stand pins nuxt@4.0.0 but 4.0.3 is installed",
  ]);
});
