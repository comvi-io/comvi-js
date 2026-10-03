#!/usr/bin/env node
/**
 * Pack once, verify those bytes in a browser, publish those bytes — in two
 * jobs that never share privileges.
 *
 * `changeset publish` and `pnpm publish` pack at publish time, so whatever was
 * tested before them is not, strictly, what npm receives. And the browser
 * suite installs every example with hundreds of unpinned third-party packages
 * and their lifecycle scripts, which must never run in a job that can mint an
 * npm publish token or push to the repository. Hence two subcommands, one per
 * job in `release.yml` (GA and RC alike):
 *
 *   verify  (job permissions: contents: read; no id-token)
 *     1. `pnpm pack:release` from the dist the job built and checked, every
 *        tarball moved into `--dir`, each sha256 printed and written to
 *        `<dir>/SHA256SUMS`;
 *     2. ask the registry which versions are not published yet and record
 *        them in `<dir>/pending.json`; with none, stop (every push to `main`
 *        after a release lands here);
 *     3. run `examples:e2e` in both modes against `--tarballs <dir>`, which
 *        installs exactly these files and checks every lockfile integrity
 *        against them, and say which candidate packages no example installed;
 *     4. with `GITHUB_OUTPUT`, emit `pending` and `sums` (the sha256 of
 *        SHA256SUMS) for the publishing job. The workflow uploads `<dir>`.
 *
 *   publish (job permissions: id-token: write [+ contents: write for tags];
 *            no install, no build — only this script and npm)
 *     1. the downloaded SHA256SUMS must hash to verify's `sums` output, and
 *        every tarball to its line in it;
 *     2. `npm publish <tgz>` each pending package not yet on npm, core first;
 *        a failure is reported and the loop CONTINUES;
 *     3. `--git-tag` tags every package that published, `--push-tags` pushes
 *        exactly those tags, even when another package failed — so a re-run,
 *        which skips what is already on npm, never leaves a published version
 *        untagged;
 *     4. with `GITHUB_OUTPUT`, emit `published` and `publishedPackages` for the
 *        combined GitHub Release; exit 1 if any package failed.
 *
 *   node scripts/publish-candidate.mjs verify  --dir <dir>
 *   node scripts/publish-candidate.mjs publish --dir <dir> --expect-sums <sha256>
 *                                      [--tag latest|next] [--git-tag]
 *                                      [--push-tags] [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { spawnSync } from "node:child_process";

import {
  REPO_ROOT,
  cleanTarballs,
  tarballFor,
  workspacePackages,
} from "./docs-snippets/link-sdk.mjs";
import { fileDigest } from "./examples-e2e/lib.mjs";

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== "verify" && command !== "publish") {
    throw new Error("usage: publish-candidate.mjs verify|publish --dir <dir> […]");
  }
  const options = {
    command,
    dir: null,
    tag: "latest",
    expectSums: null,
    gitTag: false,
    pushTags: false,
    dryRun: false,
  };
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index];
    const value = () => {
      const next = rest[++index];
      if (!next || next.startsWith("--")) throw new Error(`${arg} needs a value`);
      return next;
    };
    if (arg === "--dir") options.dir = value();
    else if (arg === "--tag" && command === "publish") options.tag = value();
    else if (arg === "--expect-sums" && command === "publish") options.expectSums = value();
    else if (arg === "--git-tag" && command === "publish") options.gitTag = true;
    else if (arg === "--push-tags" && command === "publish") options.pushTags = true;
    else if (arg === "--dry-run" && command === "publish") options.dryRun = true;
    else throw new Error(`unknown argument for ${command}: ${arg}`);
  }
  if (!options.dir) throw new Error("--dir is required");
  if (!/^[a-z][a-z0-9-]*$/.test(options.tag)) throw new Error(`not a dist-tag: ${options.tag}`);
  if (command === "publish" && !/^[0-9a-f]{64}$/.test(options.expectSums ?? "")) {
    throw new Error("publish needs --expect-sums <sha256 of SHA256SUMS>, from the verify job");
  }
  return options;
}

/**
 * Whether `npm view <name>@<version> version --json` says the version exists.
 * `status` and `stdout`/`stderr` are that command's. A 404 is "not published";
 * any other failure throws, because guessing either way is wrong: "published"
 * would skip a release, "not published" would fail at `npm publish`.
 */
export function isPublished({ status, stdout, stderr }, version) {
  if (status === 0) {
    const text = stdout.trim();
    if (text === "") return false;
    const value = JSON.parse(text);
    return Array.isArray(value) ? value.includes(version) : value === version;
  }
  if (/E404|404 Not Found|is not in this registry/.test(`${stdout}\n${stderr}`)) return false;
  throw new Error(`npm view failed (${status}):\n${stderr || stdout}`);
}

/** `<sha256>  <file>` lines, sorted by file name: the `sha256sum` format. */
export function checksums(files) {
  return [...files]
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
    .map((file) => `${fileDigest(file)}  ${path.basename(file)}`)
    .join("\n");
}

/** Fail unless every file still has the digest recorded before verification. */
export function assertChecksums(dir, recorded) {
  const files = recorded
    .split("\n")
    .filter(Boolean)
    .map((line) => path.join(dir, line.split(/\s+/)[1]));
  const now = checksums(files);
  if (now !== recorded.trim()) {
    throw new Error(
      `the tarballs in ${dir} changed after verification:\nverified:\n${recorded}\nnow:\n${now}`,
    );
  }
}

/**
 * The publishing job's integrity check: SHA256SUMS is the file the verify job
 * wrote (its sha256 is verify's `sums` output), and every tarball matches it.
 * Returns the SHA256SUMS text.
 */
export function assertVerifiedCandidate(dir, expectSums) {
  const sumsFile = path.join(dir, "SHA256SUMS");
  const actual = fileDigest(sumsFile);
  if (actual !== expectSums) {
    throw new Error(
      `SHA256SUMS hashes to ${actual}, but the verify job produced ${expectSums}: ` +
        "this is not the candidate that was verified",
    );
  }
  const recorded = fs.readFileSync(sumsFile, "utf8");
  assertChecksums(dir, recorded);
  return recorded;
}

/** `@comvi/core` first, so a consumer never resolves a binding before its core. */
export function publishOrder(packages) {
  return [...packages].sort((a, b) => {
    if (a.name === "@comvi/core") return -1;
    if (b.name === "@comvi/core") return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Publish each package with `publishOne`, never stopping at a failure.
 * Returns `{ published, failed }`; `published` is what the caller tags.
 */
export function publishAll(packages, publishOne) {
  const published = [];
  const failed = [];
  for (const pkg of publishOrder(packages)) {
    try {
      publishOne(pkg);
      published.push(pkg);
    } catch (error) {
      failed.push({ ...pkg, error: error.message });
    }
  }
  return { published, failed };
}

/** Candidate packages no example install resolved, read from the runner's reports. */
export function unexercised(candidates, reports) {
  const resolved = new Set(
    reports.flatMap((report) => report.results.flatMap((result) => result.resolved ?? [])),
  );
  return candidates.filter((name) => !resolved.has(name));
}

function sh(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (!options.capture && !options.allowFailure && result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}`);
  }
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function output(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
}

function notOnNpm(pkg) {
  const view = sh("npm", ["view", `${pkg.name}@${pkg.version}`, "version", "--json"], {
    capture: true,
  });
  return !isPublished(view, pkg.version);
}

function verify(options) {
  const dir = path.resolve(REPO_ROOT, options.dir);

  // 1. Pack once, from the dist already built and checked by the job.
  cleanTarballs(REPO_ROOT);
  sh("pnpm", ["pack:release"]);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const packages = workspacePackages(REPO_ROOT).map((pkg) => {
    const tarball = path.join(dir, path.basename(tarballFor(pkg)));
    fs.renameSync(tarballFor(pkg), tarball);
    return { name: pkg.name, version: pkg.version, file: path.basename(tarball), tarball };
  });
  const recorded = checksums(packages.map((pkg) => pkg.tarball));
  fs.writeFileSync(path.join(dir, "SHA256SUMS"), `${recorded}\n`);
  const sums = fileDigest(path.join(dir, "SHA256SUMS"));
  console.log(`candidate tarballs (sha256), ${dir}:\n${recorded}\nSHA256SUMS sha256: ${sums}`);

  // 2. What is new.
  const pending = packages.filter(notOnNpm);
  fs.writeFileSync(
    path.join(dir, "pending.json"),
    `${JSON.stringify(
      pending.map(({ name, version, file }) => ({ name, version, file })),
      null,
      2,
    )}\n`,
  );
  if (pending.length === 0) {
    console.log("every candidate version is already on npm; nothing to verify or publish");
    output({ pending: "false", sums });
    return 0;
  }
  console.log(`unpublished: ${pending.map((pkg) => `${pkg.name}@${pkg.version}`).join(", ")}`);

  // 3. Both e2e modes against exactly these files.
  const runner = path.join(REPO_ROOT, "scripts", "examples-e2e", "run.mjs");
  for (const mode of [[], ["--cdn"]]) {
    const { status } = sh(process.execPath, [runner, "--tarballs", dir, ...mode], {
      allowFailure: true,
    });
    if (status !== 0) {
      console.error(
        `examples:e2e ${mode.join(" ")} failed on the candidate; nothing was published`,
      );
      output({ pending: "false", sums });
      return 1;
    }
  }
  assertChecksums(dir, recorded);
  const reports = ["report.json", "report-cdn.json"].map((file) =>
    JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "test-results", "examples-e2e", file), "utf8")),
  );
  const missed = unexercised(
    packages.map((pkg) => pkg.name),
    reports,
  );
  if (missed.length > 0) {
    console.log(
      `not installed by any example, so published without a browser check: ${missed.join(", ")}`,
    );
  }

  // 4. Hand over to the publishing job.
  output({ pending: "true", sums });
  return 0;
}

function publish(options) {
  const dir = path.resolve(REPO_ROOT, options.dir);
  assertVerifiedCandidate(dir, options.expectSums);
  const candidates = JSON.parse(fs.readFileSync(path.join(dir, "pending.json"), "utf8")).map(
    (pkg) => ({ ...pkg, tarball: path.join(dir, pkg.file) }),
  );
  // A re-run after a partial failure: what made it to npm is skipped (its tag
  // was pushed by the run that published it).
  const pending = candidates.filter(notOnNpm);
  const skipped = candidates.filter((pkg) => !pending.includes(pkg));
  if (skipped.length > 0) {
    console.log(
      `already on npm, skipped: ${skipped.map((pkg) => `${pkg.name}@${pkg.version}`).join(", ")}`,
    );
  }

  const { published, failed } = publishAll(pending, (pkg) => {
    const args = ["publish", pkg.tarball, "--access", "public", "--tag", options.tag];
    if (options.dryRun) args.push("--dry-run");
    console.log(`publishing ${pkg.file} (sha256 ${fileDigest(pkg.tarball)})`);
    sh("npm", args);
  });

  const tags = published.map((pkg) => `${pkg.name}@${pkg.version}`);
  for (const tag of tags) {
    if (options.gitTag && !options.dryRun) sh("git", ["tag", tag]);
    console.log(`New tag: ${tag}`);
  }
  if (options.pushTags && !options.dryRun && tags.length > 0) {
    sh("git", ["push", "origin", ...tags.map((tag) => `refs/tags/${tag}`)]);
  }
  output({
    published: String(published.length > 0),
    publishedPackages: JSON.stringify(published.map(({ name, version }) => ({ name, version }))),
  });
  if (failed.length > 0) {
    console.error(
      `failed to publish (re-run the job; what published is tagged and will be skipped):\n` +
        failed.map((pkg) => `  ${pkg.name}@${pkg.version}: ${pkg.error}`).join("\n"),
    );
    return 1;
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    process.exitCode = options.command === "verify" ? verify(options) : publish(options);
  } catch (error) {
    console.error(`publish-candidate: ${error.message}`);
    process.exitCode = 1;
  }
}
