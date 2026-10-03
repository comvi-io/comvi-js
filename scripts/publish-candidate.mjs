#!/usr/bin/env node
/**
 * Pack once, verify those bytes in a browser, publish those bytes — in three
 * jobs that never share privileges or outputs they should not.
 *
 * `changeset publish` and `pnpm publish` pack at publish time, so whatever was
 * tested before them is not, strictly, what npm receives. And the browser
 * suite installs every example with hundreds of unpinned third-party packages
 * and their lifecycle scripts, so the job that runs it is treated as hostile:
 * it can neither publish nor tell the publishing job what to publish. Hence
 * three subcommands, one per job in `release.yml` (GA and RC alike):
 *
 *   pack    (contents: read; no e2e, no browser, no example installs)
 *     packs the dist the job built and checked into `--dir`, writes
 *     `<dir>/SHA256SUMS` (the ONLY list of what may be published), asks npm
 *     which versions are new (`<dir>/pending.json`, for humans), and emits
 *     `sums` (the sha256 of SHA256SUMS) and `pending` to GITHUB_OUTPUT, once.
 *     The workflow uploads `<dir>` as the candidate artifact.
 *
 *   verify  (contents: read; downloads pack's artifact; writes NO outputs)
 *     checks every tarball against SHA256SUMS, runs `examples:e2e` in both
 *     modes with `--tarballs <dir>`, and says which candidate packages no
 *     example installed. Its only effect on publishing is its exit status.
 *
 *   publish (id-token: write [+ contents: write for GA tags]; no install,
 *            no build; downloads PACK's artifact, never verify's)
 *     1. SHA256SUMS must hash to pack's `sums`; every listed file must be
 *        present with its digest, and any other file in the directory is
 *        refused;
 *     2. the candidates come from SHA256SUMS alone — each tarball's name and
 *        version are read from `package/package.json` inside it, and the file
 *        name must be the one `pnpm pack` gives that name and version;
 *        `pending.json` is not read;
 *     3. `npm publish <tgz>` each one npm does not have yet, core first; a
 *        failure is reported and the loop CONTINUES;
 *     4. `--git-tag` tags what published, `--push-tags` pushes exactly those
 *        tags, so a re-run (which skips what npm has) never leaves a
 *        published version untagged; GITHUB_OUTPUT gets `published` and
 *        `publishedPackages`; exit 1 if any package failed.
 *
 *   node scripts/publish-candidate.mjs pack    --dir <dir>
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
import { fileDigest, tarballName } from "./examples-e2e/lib.mjs";
import { packedManifest } from "./examples-e2e/candidate-registry.mjs";

const COMMANDS = ["pack", "verify", "publish"];
/** The files a candidate directory may hold besides its tarballs. */
const BOOKKEEPING = new Set(["SHA256SUMS", "pending.json"]);

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command)) {
    throw new Error("usage: publish-candidate.mjs pack|verify|publish --dir <dir> […]");
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
    throw new Error("publish needs --expect-sums <sha256 of SHA256SUMS>, from the pack job");
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

/** The file names SHA256SUMS lists, in order; a malformed line is an error. */
export function listedFiles(recorded) {
  return recorded
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = /^[0-9a-f]{64} {2}([A-Za-z0-9._-]+\.tgz)$/.exec(line);
      if (!match) throw new Error(`not a SHA256SUMS line for a tarball: ${JSON.stringify(line)}`);
      return match[1];
    });
}

/**
 * Fail unless the directory holds exactly what SHA256SUMS lists, byte for
 * byte: every listed file present with its digest, and no other file except
 * the bookkeeping (`SHA256SUMS`, `pending.json`).
 */
export function assertChecksums(dir, recorded) {
  const listed = listedFiles(recorded);
  const missing = listed.filter((file) => !fs.existsSync(path.join(dir, file)));
  if (missing.length > 0) throw new Error(`listed in SHA256SUMS but absent: ${missing.join(", ")}`);
  const extra = fs
    .readdirSync(dir)
    .filter((file) => !BOOKKEEPING.has(file) && !listed.includes(file));
  if (extra.length > 0) {
    throw new Error(`in ${dir} but not in SHA256SUMS, refused: ${extra.join(", ")}`);
  }
  const now = checksums(listed.map((file) => path.join(dir, file)));
  if (now !== recorded.trim()) {
    throw new Error(
      `the tarballs in ${dir} changed after packing:\npacked:\n${recorded}\nnow:\n${now}`,
    );
  }
}

/**
 * The publishing job's integrity check: SHA256SUMS is the file the pack job
 * wrote (its sha256 is pack's `sums` output), and the directory matches it.
 * Returns the SHA256SUMS text.
 */
export function assertVerifiedCandidate(dir, expectSums) {
  const sumsFile = path.join(dir, "SHA256SUMS");
  const actual = fileDigest(sumsFile);
  if (actual !== expectSums) {
    throw new Error(
      `SHA256SUMS hashes to ${actual}, but the pack job produced ${expectSums}: ` +
        "this is not the candidate that was packed and verified",
    );
  }
  const recorded = fs.readFileSync(sumsFile, "utf8");
  assertChecksums(dir, recorded);
  return recorded;
}

/**
 * What may be published: one entry per SHA256SUMS line, its name and version
 * read from the tarball itself. The file name must be `pnpm pack`'s name for
 * that manifest, and the name must be in the `@comvi` scope — a tarball that
 * says it is something else is refused, not published under its own claim.
 */
export function candidatesFromSums(dir, recorded, readManifest = packedManifest) {
  return listedFiles(recorded).map((file) => {
    const tarball = path.join(dir, file);
    const { name, version } = readManifest(tarball);
    if (typeof name !== "string" || !name.startsWith("@comvi/")) {
      throw new Error(`${file} is not an @comvi package (package.json says ${name})`);
    }
    if (tarballName({ name, version }) !== file) {
      throw new Error(
        `${file} holds ${name}@${version}, which pnpm would pack as ${tarballName({ name, version })}`,
      );
    }
    return { name, version, file, tarball };
  });
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

/** One append per job: everything this job outputs, together. */
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

function pack(options) {
  const dir = path.resolve(REPO_ROOT, options.dir);
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

  const pending = packages.filter(notOnNpm);
  // For humans reading the artifact; the publishing job never reads it.
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
  } else {
    console.log(`unpublished: ${pending.map((pkg) => `${pkg.name}@${pkg.version}`).join(", ")}`);
  }
  output({ pending: String(pending.length > 0), sums });
  return 0;
}

function verify(options) {
  const dir = path.resolve(REPO_ROOT, options.dir);
  const recorded = fs.readFileSync(path.join(dir, "SHA256SUMS"), "utf8");
  assertChecksums(dir, recorded);
  const runner = path.join(REPO_ROOT, "scripts", "examples-e2e", "run.mjs");
  for (const mode of [[], ["--cdn"]]) {
    const { status } = sh(process.execPath, [runner, "--tarballs", dir, ...mode], {
      allowFailure: true,
    });
    if (status !== 0) {
      console.error(
        `examples:e2e ${mode.join(" ")} failed on the candidate; nothing was published`,
      );
      return 1;
    }
  }
  const reports = ["report.json", "report-cdn.json"].map((file) =>
    JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "test-results", "examples-e2e", file), "utf8")),
  );
  const missed = unexercised(
    candidatesFromSums(dir, recorded).map((pkg) => pkg.name),
    reports,
  );
  if (missed.length > 0) {
    console.log(
      `not installed by any example, so published without a browser check: ${missed.join(", ")}`,
    );
  }
  return 0;
}

function publish(options) {
  const dir = path.resolve(REPO_ROOT, options.dir);
  const recorded = assertVerifiedCandidate(dir, options.expectSums);
  const candidates = candidatesFromSums(dir, recorded);
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
    process.exitCode = { pack, verify, publish }[options.command](options);
  } catch (error) {
    console.error(`publish-candidate: ${error.message}`);
    process.exitCode = 1;
  }
}
