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
 *
 * The jsDelivr purge of the GA `publish` job is pinned the same way: its shell
 * runs here against a stub `curl`, so no request leaves the machine.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

// ---------------------------------------------------------------------------
// The jsDelivr purge. The devtools() editor loader requests one file under
// `@latest`; the release asks jsDelivr to drop its edge copy once npm has the
// whole train. The request is never allowed to fail a release that is already
// on npm.
// ---------------------------------------------------------------------------

const PURGE_STEP = "Purge jsDelivr's @latest editor file";
const PURGE_URL =
  "https://purge.jsdelivr.net/npm/@comvi/plugin-in-context-editor@latest/dist/standalone.iife.js";

/** The steps of a job, in order: each one's name and its text. */
function readSteps(job) {
  return (job?.text ?? "")
    .split(/^ {6}- name: /m)
    .slice(1)
    .map((text) => ({ name: text.slice(0, text.indexOf("\n")), text }));
}

function purgeStep() {
  const step = readSteps(jobs.get("publish")).find((s) => s.name === PURGE_STEP);
  assert.ok(step, `the publish job has no \`${PURGE_STEP}\` step`);
  return step;
}

/**
 * Runs the purge step's shell with `curl` and `sleep` replaced by stubs.
 * `curlExits` is the exit status of each call in turn (the last one repeats);
 * `body` is what a successful call prints. Returns the shell's result and the
 * arguments of every `curl` call.
 */
const PURGED =
  '{"id":"x","status":"finished","paths":{"/npm/x":{"throttled":false,"providers":{"CF":true,"FY":true}}}}';

function runPurge(t, { curlExits, body = PURGED }) {
  const script = /^ {8}run: \|\n((?: {10}.*\n?)+)/m.exec(purgeStep().text)?.[1];
  assert.ok(script, `\`${PURGE_STEP}\` has no \`run: |\` body`);

  const bin = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-purge-"));
  t.after(() => fs.rmSync(bin, { recursive: true, force: true }));
  const calls = path.join(bin, "calls");
  fs.writeFileSync(calls, "");
  fs.writeFileSync(
    path.join(bin, "curl"),
    [
      "#!/bin/bash",
      `echo "$*" >> "${calls}"`,
      `n=$(wc -l < "${calls}")`,
      `exits=(${curlExits.join(" ")})`,
      "status=${exits[$((n - 1))]:-${exits[${#exits[@]}-1]}}",
      `if [ "$status" = 0 ]; then printf '%s\\n' '${body}'; else echo "curl: (22) refused" >&2; fi`,
      'exit "$status"',
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(bin, "sleep"), "#!/bin/bash\nexit 0\n", { mode: 0o755 });

  const result = spawnSync("bash", ["-eo", "pipefail", "-c", script.replace(/^ {10}/gm, "")], {
    encoding: "utf8",
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
  return { ...result, curl: fs.readFileSync(calls, "utf8").split("\n").filter(Boolean) };
}

test("the purge step sits in the GA publish job right after the publish, behind published == 'true'", () => {
  const steps = readSteps(jobs.get("publish"));
  const index = steps.findIndex((step) => step.name === PURGE_STEP);

  assert.equal(steps[index - 1]?.name, "Publish the verified tarballs");
  assert.match(steps[index].text, /^ {8}if: steps\.publish\.outputs\.published == 'true'$/m);
});

test("the purge step cannot fail or stall the job: continue-on-error and a step timeout", () => {
  const step = purgeStep();

  assert.match(step.text, /^ {8}continue-on-error: true$/m);
  assert.match(step.text, /^ {8}timeout-minutes: 2$/m);
});

test("the workflow names one purge URL, the @latest editor file, and only in the GA publish job", () => {
  const urls = workflow.match(/https:\/\/purge\.jsdelivr\.net\/\S*?(?=["'\s])/g);
  const jobsWithPurge = [...jobs.values()]
    .filter((job) => /purge\.jsdelivr\.net/.test(job.text))
    .map((job) => job.name);

  assert.deepEqual(urls, [PURGE_URL]);
  assert.deepEqual(jobsWithPurge, ["publish"]);
});

test("the purge takes no secret: the step has no env and names no token", () => {
  const step = purgeStep();

  assert.doesNotMatch(step.text, /^ {8}env:|secrets\.|[Tt]oken=|Authorization/m);
});

test("purge accepted on the first request → exit 0, one bounded curl call, no warning", (t) => {
  const result = runPurge(t, { curlExits: [0] });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.curl.length, 1);
  assert.match(result.curl[0], /--fail\b.*--max-time 30\b/);
  assert.equal(result.curl[0].endsWith(PURGE_URL), true, result.curl[0]);
  assert.doesNotMatch(result.stdout, /::warning/);
});

test("purge refused once, then accepted → exit 0 after a single retry, no warning", (t) => {
  const result = runPurge(t, { curlExits: [22, 0] });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.curl.length, 2);
  assert.doesNotMatch(result.stdout, /::warning/);
});

test("purge refused twice → exit 0 with a ::warning naming the URL and the 12 hours, and no third request", (t) => {
  const result = runPurge(t, { curlExits: [22] });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.curl.length, 2);
  assert.match(result.stdout, /^::warning title=jsDelivr purge failed::.*12 hours/m);
  assert.equal(result.stdout.includes(PURGE_URL), true, result.stdout);
});

test("purge answered but throttled → exit 0 with a ::warning, not a success line", (t) => {
  const result = runPurge(t, {
    curlExits: [0],
    body: '{"status":"finished","paths":{"/npm/x":{"throttled":true}}}',
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.curl.length, 1);
  assert.match(result.stdout, /^::warning title=jsDelivr purge throttled::/m);
  assert.doesNotMatch(result.stdout, /accepted the purge/);
});

// Anything but a finished purge on every provider must leave a warning: the
// rollout tells the owner to purge by hand only when the log warns.
for (const [answer, body] of [
  ["an HTML challenge page", "<html><title>Just a moment...</title></html>"],
  ["an empty body", ""],
  ["a failed status", '{"status":"failed"}'],
  ["a pending status", '{"id":"x","status":"pending"}'],
  [
    "a provider that did not purge",
    '{"status":"finished","paths":{"/npm/x":{"throttled":false,"providers":{"CF":false,"FY":true}}}}',
  ],
]) {
  test(`purge answered with ${answer} → exit 0 with a ::warning, never "accepted"`, (t) => {
    const result = runPurge(t, { curlExits: [0], body });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.curl.length, 1);
    assert.match(result.stdout, /^::warning title=jsDelivr purge not confirmed::.*12 hours/m);
    assert.doesNotMatch(result.stdout, /accepted the purge/);
  });
}

test("a response line that begins with :: is printed behind a prefix, not as a workflow command", (t) => {
  const result = runPurge(t, { curlExits: [0], body: "::error::forged" });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^jsDelivr: ::error::forged$/m);
  assert.doesNotMatch(result.stdout, /^::error/m);
});

// ---------------------------------------------------------------------------
// The release notes gate. The changesets release PR is opened with
// GITHUB_TOKEN and may get no CI run, so the GA path checks the notes itself,
// in `pack`, before anything is built or published.
// ---------------------------------------------------------------------------

const NOTES_STEP = "Refuse release notes that still hold an HTML comment";

test("the GA pack job checks the release notes on a release commit, before it installs or packs", () => {
  const steps = readSteps(jobs.get("pack"));
  const names = steps.map((step) => step.name);
  const step = steps.find((s) => s.name === NOTES_STEP);

  assert.ok(step, `the pack job has no \`${NOTES_STEP}\` step`);
  assert.match(step.text, /^ {8}if: steps\.changesets\.outputs\.pending == 'false'$/m);
  assert.match(step.text, /^ {8}run: node \.github\/scripts\/check-release-notes\.mjs$/m);
  assert.doesNotMatch(step.text, /continue-on-error/);
  assert.equal(names.indexOf(NOTES_STEP) > names.indexOf("Pending changesets?"), true);
  assert.equal(names.indexOf(NOTES_STEP) < names.indexOf("Install dependencies"), true);
  assert.equal(names.indexOf(NOTES_STEP) < names.indexOf("Pack the candidate"), true);
});

test("the job that publishes waits for the job that checks the notes", () => {
  assert.equal(ancestry(jobs, "publish").has("pack"), true);
});
