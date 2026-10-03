#!/usr/bin/env node
/**
 * Pack once, verify those bytes in a browser, publish those bytes.
 *
 * `changeset publish` and `pnpm publish` both pack at publish time, so
 * whatever was tested before them is not, strictly, what npm receives. This
 * script closes that gap for the release job (`release.yml`, both the GA path
 * through `changesets/action` and the RC rehearsal):
 *
 *   1. `pnpm pack:release` from the dist the job already built and checked
 *      (no rebuild here), and move every tarball into `--dir`; print each
 *      file's sha256 and write them to `<dir>/SHA256SUMS`;
 *   2. ask the registry which of those versions are not published yet, and
 *      stop with nothing to do when none is (every push to `main` after a
 *      release lands here);
 *   3. run `examples:e2e` in both modes against `--tarballs <dir>`, which
 *      installs exactly these files and checks the lockfile's integrity
 *      against each one;
 *   4. re-check the sha256 of every file, then `npm publish <file>` each
 *      unpublished one, printing `New tag: <name>@<version>` (the line
 *      `changesets/action` reads to report what it published) and, with
 *      `--git-tag`, creating that git tag as `changeset publish` would.
 *
 *   node scripts/publish-candidate.mjs --dir <dir> [--tag latest|next]
 *                                      [--git-tag] [--dry-run]
 *
 * `--dry-run` passes `--dry-run` to `npm publish` and creates no tag.
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
  const options = { dir: null, tag: "latest", gitTag: false, dryRun: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--dir" || arg === "--tag") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value`);
      options[arg.slice(2)] = value;
    } else if (arg === "--git-tag") options.gitTag = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.dir) throw new Error("--dir is required");
  if (!/^[a-z][a-z0-9-]*$/.test(options.tag)) throw new Error(`not a dist-tag: ${options.tag}`);
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
  if (now !== recorded) {
    throw new Error(
      `the tarballs in ${dir} changed after verification:\nverified:\n${recorded}\nnow:\n${now}`,
    );
  }
}

/** `@comvi/core` first, so a consumer never resolves a binding before its core. */
export function publishOrder(packages) {
  return [...packages].sort((a, b) => {
    if (a.name === "@comvi/core") return -1;
    if (b.name === "@comvi/core") return 1;
    return a.name.localeCompare(b.name);
  });
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

function main(argv) {
  const options = parseArgs(argv);
  const dir = path.resolve(REPO_ROOT, options.dir);

  // 1. Pack once, from the dist already built and checked by the job.
  cleanTarballs(REPO_ROOT);
  sh("pnpm", ["pack:release"]);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const packages = workspacePackages(REPO_ROOT).map((pkg) => {
    const tarball = path.join(dir, path.basename(tarballFor(pkg)));
    fs.renameSync(tarballFor(pkg), tarball);
    return { ...pkg, tarball };
  });
  const recorded = checksums(packages.map((pkg) => pkg.tarball));
  fs.writeFileSync(path.join(dir, "SHA256SUMS"), `${recorded}\n`);
  console.log(`candidate tarballs (sha256), ${dir}:\n${recorded}`);

  // 2. What is new.
  const pending = packages.filter((pkg) => {
    const view = sh("npm", ["view", `${pkg.name}@${pkg.version}`, "version", "--json"], {
      capture: true,
    });
    return !isPublished(view, pkg.version);
  });
  if (pending.length === 0) {
    console.log("every candidate version is already on npm; nothing to verify or publish");
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
      return 1;
    }
  }

  // 4. The verified bytes, unchanged, to the registry.
  assertChecksums(dir, recorded);
  for (const pkg of publishOrder(pending)) {
    const args = ["publish", pkg.tarball, "--access", "public", "--tag", options.tag];
    if (options.dryRun) args.push("--dry-run");
    console.log(`publishing ${path.basename(pkg.tarball)} (sha256 ${fileDigest(pkg.tarball)})`);
    sh("npm", args);
    const tag = `${pkg.name}@${pkg.version}`;
    if (options.gitTag && !options.dryRun) sh("git", ["tag", tag]);
    console.log(`New tag: ${tag}`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`publish-candidate: ${error.message}`);
    process.exitCode = 1;
  }
}
