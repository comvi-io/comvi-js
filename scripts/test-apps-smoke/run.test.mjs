import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { readiness, stopGroup } from "./run.mjs";

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
