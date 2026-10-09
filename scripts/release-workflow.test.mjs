/**
 * The branch guard of .github/workflows/release.yml.
 *
 * A dispatch without `rc` is the GA path: it publishes under the npm dist-tag
 * `latest`, pushes tags and creates the GitHub Release, and none of that can be
 * undone. It must run from `main` only. The RC rehearsal (`rc` set) runs from
 * any ref and must keep doing so.
 *
 * The workflow is read as text, by its two-space job layout, the way
 * scripts/examples-e2e/lib.test.mjs reads ci.yml: the repo declares no YAML
 * parser. The guard's own shell is executed, so its verdict is tested and not
 * only its presence.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workflow = fs.readFileSync(
  fileURLToPath(new URL("../.github/workflows/release.yml", import.meta.url)),
  "utf8",
);

/** Every job of the workflow: its name, its text, its `if` and its `needs`. */
function readJobs(source) {
  const body = source.slice(source.indexOf("\njobs:\n") + "\njobs:\n".length);
  const jobs = new Map();
  let current = null;
  for (const line of body.split("\n")) {
    const start = /^ {2}([\w-]+):\s*$/.exec(line);
    if (start) {
      current = { name: start[1], lines: [] };
      jobs.set(current.name, current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  for (const job of jobs.values()) {
    job.text = job.lines.join("\n");
    job.if = /^ {4}if: (.+)$/m.exec(job.text)?.[1] ?? "";
    const needs = /^ {4}needs: (.+)$/m.exec(job.text)?.[1] ?? "";
    job.needs = needs
      .replace(/[[\]]/g, "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
  }
  return jobs;
}

/** `name` and every job it waits for, directly or through another job. */
function ancestry(jobs, name, seen = new Set()) {
  if (seen.has(name)) return seen;
  seen.add(name);
  for (const need of jobs.get(name)?.needs ?? []) ancestry(jobs, need, seen);
  return seen;
}

const jobs = readJobs(workflow);
const GUARD = "ga-guard";
const RC_ROOT = "rc-pack";

function runGuard(ref) {
  const script = /^ {8}run: \|\n((?: {10}.*\n?)+)/m.exec(jobs.get(GUARD)?.text ?? "")?.[1];
  assert.ok(script, `release.yml has no \`${GUARD}\` job with a \`run: |\` step`);
  return spawnSync("bash", ["-eo", "pipefail", "-c", script.replace(/^ {10}/gm, "")], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, GITHUB_REF: ref },
  });
}

test("the workflow has the jobs this file reasons about", () => {
  assert.deepEqual(
    [...jobs.keys()],
    ["rc-pack", "rc-verify", "rc-publish", GUARD, "version", "pack", "verify", "publish"],
  );
});

test("the GA guard on a branch other than main → exit 1 and a message naming the ref", () => {
  const result = runGuard("refs/heads/feat/weight-refactor-0.5");

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /^::error title=GA release refused::.*refs\/heads\/feat\/weight-refactor-0\.5.*refs\/heads\/main/m,
  );
});

test("the GA guard on a tag ref → exit 1", () => {
  const result = runGuard("refs/tags/v0.5.0");

  assert.equal(result.status, 1, result.stdout + result.stderr);
});

test("the GA guard on main → exit 0", () => {
  const result = runGuard("refs/heads/main");

  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("the GA guard runs on every event except a dispatch that sets rc", () => {
  assert.equal(
    jobs.get(GUARD)?.if,
    "github.repository == 'comvi-io/comvi-js' && (github.event_name != 'workflow_dispatch' || inputs.rc == '')",
  );
});

for (const name of ["version", "pack", "verify", "publish"]) {
  test(`GA job \`${name}\` waits for the guard, so a refused ref skips it`, () => {
    assert.equal(
      ancestry(jobs, name).has(GUARD),
      true,
      `needs of ${name}: ${jobs.get(name)?.needs}`,
    );
  });
}

test("every job that is not behind the GA guard is behind rc-pack, which needs the rc input", () => {
  const unguarded = [...jobs.keys()].filter(
    (name) => name !== GUARD && !ancestry(jobs, name).has(GUARD),
  );

  assert.deepEqual(unguarded, ["rc-pack", "rc-verify", "rc-publish"]);
  assert.deepEqual(
    unguarded.filter((name) => !ancestry(jobs, name).has(RC_ROOT)),
    [],
  );
  assert.match(
    jobs.get(RC_ROOT).if,
    /github\.event_name == 'workflow_dispatch' && inputs\.rc != ''/,
  );
});

test("the RC jobs do not wait for the GA guard: the rehearsal runs from any ref", () => {
  const behindGuard = ["rc-pack", "rc-verify", "rc-publish"].filter((name) =>
    ancestry(jobs, name).has(GUARD),
  );

  assert.deepEqual(behindGuard, []);
});

test("the job that publishes under `latest` also names main in its own condition", () => {
  const latest = [...jobs.values()].filter((job) => /--tag latest\b/.test(job.text));

  assert.deepEqual(
    latest.map((job) => [job.name, job.if]),
    [["publish", "needs.pack.outputs.pending == 'true' && github.ref == 'refs/heads/main'"]],
  );
});
