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
 *        failure is reported and the loop CONTINUES (one 503 must not leave
 *        the rest of the train unattempted);
 *     4. the SHA256SUMS set is the transaction: npm is asked again about
 *        EVERY candidate and a status table is logged. `--git-tag` makes the
 *        tag of every candidate npm has point at the checked-out commit
 *        (HEAD of the current directory) — including versions an earlier run
 *        published but never tagged — and, once the whole set is on npm, the
 *        release tag `v<train version>` too; `--push-tags` pushes the missing
 *        ones. An existing tag at any other commit is refused, naming both.
 *        GITHUB_OUTPUT gets `published=true` and `publishedPackages=<the
 *        whole set>` ONLY when every candidate is on npm and every tag holds;
 *        otherwise `published=false`, `publishedPackages=[]` and exit 1. A
 *        re-run skips what npm has, reconciles the tags and, when the set is
 *        complete, reports it complete — so the release step can run.
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

/**
 * The release train's version: the one version every candidate in the
 * `fixed` group of .changeset/config.json shares. It names the release tag.
 */
export function trainVersion(candidates, fixedGroup) {
  const train = candidates.filter((pkg) => fixedGroup.has(pkg.name));
  if (train.length === 0) {
    throw new Error(
      "no candidate is in the `fixed` group of .changeset/config.json: no release tag",
    );
  }
  const versions = [...new Set(train.map((pkg) => pkg.version))];
  if (versions.length > 1) {
    throw new Error(
      `the \`fixed\` group candidates disagree on the version: ${versions.join(", ")}`,
    );
  }
  return versions[0];
}

/** One line per candidate: on npm or MISSING, and what this run did about it. */
export function statusTable(rows) {
  const width = Math.max(...rows.map((row) => `${row.name}@${row.version}`.length));
  return rows
    .map(
      (row) =>
        `  ${`${row.name}@${row.version}`.padEnd(width)}  ${row.onNpm ? "on npm " : "MISSING"}  ${row.note}`,
    )
    .join("\n");
}

/**
 * Make each tag in `tags` name `head`, locally and (with `push`) on origin.
 * Every tag is checked before any is created: one that already exists at
 * another commit stops the whole set, naming both SHAs. `git(args)` runs git
 * in the release checkout and returns `{ status, stdout, stderr }`.
 */
export function reconcileTags(tags, { head, push, git }) {
  const commitOf = (args) => {
    const result = git(args);
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const remoteOf = (tag) => {
    const result = git([
      "ls-remote",
      "--tags",
      "origin",
      `refs/tags/${tag}`,
      `refs/tags/${tag}^{}`,
    ]);
    if (result.status !== 0) throw new Error(`git ls-remote failed:\n${result.stderr}`);
    const refs = Object.fromEntries(
      result.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("\t").reverse()),
    );
    // An annotated tag is reported twice; the peeled (^{}) line is its commit.
    return refs[`refs/tags/${tag}^{}`] ?? refs[`refs/tags/${tag}`] ?? null;
  };
  const plan = tags.map((tag) => ({
    tag,
    local: commitOf(["rev-parse", "-q", "--verify", `refs/tags/${tag}^{commit}`]),
    remote: push ? remoteOf(tag) : null,
  }));
  const wrong = plan.flatMap(({ tag, local, remote }) =>
    [local, remote]
      .filter((sha) => sha !== null && sha !== head)
      .map((sha) => `  ${tag} points at ${sha}, not at the release commit ${head}`),
  );
  if (wrong.length > 0) {
    throw new Error(
      `refusing to move or reuse a tag (delete it only if that commit was never released):\n${[...new Set(wrong)].join("\n")}`,
    );
  }
  for (const { tag, local } of plan) {
    if (local === null && git(["tag", tag, head]).status !== 0) {
      throw new Error(`git tag ${tag} failed`);
    }
  }
  const toPush = plan.filter(({ remote }) => push && remote === null).map(({ tag }) => tag);
  if (toPush.length > 0) {
    const result = git(["push", "origin", ...toPush.map((tag) => `refs/tags/${tag}`)]);
    if (result.status !== 0)
      throw new Error(`git push of ${toPush.join(", ")} failed:\n${result.stderr}`);
  }
  for (const tag of tags)
    console.log(`${toPush.includes(tag) ? "New tag" : "Tag in place"}: ${tag}`);
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
    cwd: options.cwd ?? REPO_ROOT,
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
  const candidates = publishOrder(candidatesFromSums(dir, recorded));
  // Git and the changeset config are read from the release checkout (the
  // current directory), whose HEAD is the commit every tag must name.
  const checkout = process.cwd();
  const git = (args) => sh("git", args, { capture: true, cwd: checkout });
  const tagging = options.gitTag && !options.dryRun;
  let releaseTag = null;
  let head = null;
  if (tagging) {
    const config = JSON.parse(
      fs.readFileSync(path.join(checkout, ".changeset", "config.json"), "utf8"),
    );
    releaseTag = `v${trainVersion(candidates, new Set((config.fixed ?? []).flat()))}`;
    head = git(["rev-parse", "HEAD"]).stdout.trim();
    if (!/^[0-9a-f]{40,64}$/.test(head))
      throw new Error("cannot read HEAD of the release checkout");
  }

  // A re-run after a partial failure: what made it to npm is skipped here and
  // reconciled (tagged) below like everything else.
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

  // The transaction: what npm has NOW, for every candidate. A dry run
  // publishes nothing, so there a successful `--dry-run` counts.
  const rows = candidates.map((pkg) => {
    const failure = failed.find((entry) => entry.name === pkg.name);
    let onNpm;
    let note = skipped.includes(pkg)
      ? "already on npm before this run"
      : failure
        ? `npm publish failed: ${failure.error}`
        : options.dryRun
          ? "published (dry run)"
          : "published by this run";
    try {
      onNpm = (options.dryRun && published.includes(pkg)) || !notOnNpm(pkg);
    } catch (error) {
      onNpm = false;
      note += `; npm view failed: ${error.message.split("\n")[0]}`;
    }
    return { ...pkg, onNpm, note };
  });
  const present = rows.filter((row) => row.onNpm);
  const complete = present.length === candidates.length;
  console.log(
    `release candidate: ${present.length} of ${candidates.length} on npm\n${statusTable(rows)}`,
  );

  let tagError = null;
  if (tagging) {
    const tags = present.map((pkg) => `${pkg.name}@${pkg.version}`);
    // The release tag names the whole set, so it waits for the whole set.
    if (complete) tags.push(releaseTag);
    try {
      reconcileTags(tags, { head, push: options.pushTags, git });
    } catch (error) {
      tagError = error.message;
    }
  } else {
    for (const pkg of published) console.log(`New tag: ${pkg.name}@${pkg.version}`);
  }

  const done = complete && tagError === null;
  output({
    published: String(done),
    publishedPackages: done
      ? JSON.stringify(candidates.map(({ name, version }) => ({ name, version })))
      : "[]",
  });
  if (tagError !== null) console.error(`tags not reconciled: ${tagError}`);
  if (!complete) {
    console.error(
      `the release is INCOMPLETE: ${candidates.length - present.length} candidate(s) MISSING on npm. ` +
        "Re-run this job: what npm has is skipped and tagged, the rest is published, and the " +
        "GitHub Release is created only once every candidate is on npm.",
    );
  }
  return done ? 0 : 1;
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
