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
 * The GA `publish` job is pinned the same way: its steps, and that it asks
 * jsDelivr to purge nothing.
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

// ---------------------------------------------------------------------------
// jsDelivr. The extension bakes the workspace `@comvi/editor` version into its
// build and asks the core's devtools handle for exactly that version, so the
// editor file it loads is `https://cdn.jsdelivr.net/npm/@comvi/editor@<exact
// version>/dist/standalone.iife.js`, never `@latest`. jsDelivr caches an exact
// version permanently, and its purge "does not affect exact-version links"
// (README of github.com/jsdelivr/jsdelivr, "Caching" and "Purge cache"). A
// version npm has just published has no edge copy to drop, so the release asks
// jsDelivr for nothing.
// ---------------------------------------------------------------------------

/** The steps of a job, in order: each one's name and its text. */
function readSteps(job) {
  return (job?.text ?? "")
    .split(/^ {6}- name: /m)
    .slice(1)
    .map((text) => ({ name: text.slice(0, text.indexOf("\n")), text }));
}

function readRepoFile(relative) {
  return fs.readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

test("the release workflow sends no request to jsDelivr's purge API", () => {
  assert.deepEqual(workflow.match(/purge\.jsdelivr\.net\S*/g) ?? [], []);
});

test("the GA publish job goes from the publish straight to the GitHub Release", () => {
  assert.deepEqual(
    readSteps(jobs.get("publish")).map((step) => step.name),
    [
      "Checkout",
      "Setup Node.js",
      "Ensure npm 11.21.0+ for OIDC trusted publishing and dist-tags",
      "Download the candidate (from pack)",
      "Publish the verified tarballs",
      "Create combined GitHub Release",
    ],
  );
});

// The premise of the two tests above. If the extension ever asks for a version
// alias, a new release reaches users only when jsDelivr's alias cache expires,
// and a purge of that alias belongs in the publish job again.
test("the extension loads the editor at the exact version it was built with, never an alias", () => {
  const config = readRepoFile("apps/chrome-extension/vite.config.ts");
  const detector = readRepoFile("apps/chrome-extension/src/content/detector.ts");

  assert.match(
    config,
    /readFileSync\(resolve\(__dirname, "\.\.\/\.\.\/packages\/editor\/package\.json"\)/,
  );
  assert.match(config, /__COMVI_EDITOR_VERSION__: JSON\.stringify\(editorVersion\)/);
  assert.match(detector, /load\.call\(handle, EDITOR_VERSION\)/);
  assert.doesNotMatch(detector, /load\.call\(handle\)|["']latest["']/);
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

// The GA `version` job: changesets/action opens the release PR through
// `pnpm release:version` and must do nothing else. v2 is the line for
// @changesets/cli 3; it reads the token only from its `github-token` input, and
// left alone it would push git tags (v1's `createGithubReleases: false` used to
// stop that) and, given a publish script, publish.
const RELEASE_PR_STEP = "Create or update the release PR";

function releasePrStep() {
  const step = readSteps(jobs.get("version")).find((s) => s.name === RELEASE_PR_STEP);
  assert.ok(step, `the version job has no \`${RELEASE_PR_STEP}\` step`);
  const inputs = Object.fromEntries(
    [...step.text.matchAll(/^ {10}([\w-]+): (.+)$/gm)].map((m) => [m[1], m[2].trim()]),
  );
  return { step, inputs };
}

test("the release PR step runs changesets/action v2", () => {
  const { step } = releasePrStep();

  assert.match(step.text, /^ {8}uses: changesets\/action@v2$/m);
});

test("the release PR step versions through `pnpm release:version` and has no publish script", () => {
  const { inputs } = releasePrStep();

  assert.equal(inputs["version-script"], "pnpm release:version");
  assert.equal(inputs["publish-script"], undefined);
});

test("the release PR step creates no GitHub release and pushes no git tag", () => {
  const { inputs } = releasePrStep();

  assert.equal(inputs["create-github-releases"], "false");
  assert.equal(inputs["push-git-tags"], "false");
});

test("the release PR step passes its token as the github-token input, not as env GITHUB_TOKEN", () => {
  const { step, inputs } = releasePrStep();

  assert.equal(inputs["github-token"], "${{ secrets.GITHUB_TOKEN }}");
  assert.doesNotMatch(step.text, /^ {8}env:/m);
  assert.doesNotMatch(step.text, /^ {10}GITHUB_TOKEN:/m);
});
