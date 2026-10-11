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
 *     modes with `--tarballs <dir>`, and fails when a candidate package no
 *     example installed is missing from `BROWSER_UNCOVERED`. Its only effect
 *     on publishing is its exit status.
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
 *     3. `npm publish <tgz> --tag release-<sums prefix>` each one npm does not
 *        have yet, core first: a STAGING dist-tag of this candidate, so no
 *        user resolves a half-published train through `--tag`. A failure is
 *        reported and the loop CONTINUES (one 503 must not leave the rest of
 *        the train unattempted);
 *     4. the SHA256SUMS set is the transaction: npm is asked again about
 *        EVERY candidate and a status table is logged. `--git-tag` makes the
 *        tag of every candidate npm has point at the checked-out commit
 *        (HEAD of the current directory) — including versions an earlier run
 *        published but never tagged — and, once the whole set is on npm, the
 *        release tag `v<train version>` too; `--push-tags` pushes the missing
 *        ones. An existing tag at any other commit is refused, naming both.
 *        Before publishing, a version already on npm whose git tag names
 *        another commit stops the run: a fresh run at a newer commit never
 *        completes an older commit's train. And whenever something is still
 *        to publish, every version npm already has must carry THIS
 *        candidate's staging tag or THIS candidate's bytes (git-tagged or
 *        not, RC or GA): a version from another candidate stops the run
 *        before anything is published. That check is an early, cheap one and
 *        authorises nothing. What authorises promotion and git tags is BYTE
 *        IDENTITY: npm's `dist.integrity` of every candidate on npm, however
 *        it got there (published now, skipped, refused as already
 *        published, or all present), must be the sha512 of this candidate's
 *        own tarball, or nothing is promoted or tagged. A dry run also
 *        refuses on foreign bytes already on npm. A version this run
 *        published that npm does not show yet, and an integrity npm does not
 *        show yet, are asked again with backoff (npm's reads lag its writes).
 *        Only once npm has the whole set does `--tag` (latest, or next for an
 *        RC) move, and never backwards (a newer version already on the tag
 *        refuses the whole promotion): `npm dist-tag add <name>@<version> <tag>` per package
 *        whose tag is not there yet (so a re-run finishes a half-done
 *        promotion), then every `release-*` tag naming the promoted version
 *        is removed, best effort.
 *        GITHUB_OUTPUT gets `published=true` and `publishedPackages=<the
 *        whole set>` ONLY when every candidate is on npm under `--tag` and
 *        every tag holds;
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

import crypto from "node:crypto";
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

/**
 * The Subresource Integrity string npm records as `dist.integrity` for a
 * tarball: `sha512-<base64 of the sha512 of its bytes>`.
 */
export function tarballIntegrity(file) {
  return `sha512-${crypto.createHash("sha512").update(fs.readFileSync(file)).digest("base64")}`;
}

/**
 * `npm view <name>@<version> dist.integrity --json`: the integrity string,
 * or null when npm shows none (no such version yet, or a replica that has
 * the version but not its metadata). Any other failure throws.
 */
export function parseIntegrity({ status, stdout, stderr }) {
  if (status === 0) {
    const text = stdout.trim();
    if (text === "") return null;
    const value = JSON.parse(text);
    return typeof value === "string" && value !== "" ? value : null;
  }
  if (/E404|404 Not Found|is not in this registry/.test(`${stdout}\n${stderr}`)) return null;
  throw new Error(`npm view dist.integrity failed (${status}):\n${stderr || stdout}`);
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

/**
 * The dist-tag a candidate is published under before promotion: derived from
 * the candidate (its SHA256SUMS digest), so a re-run of the same candidate
 * reuses it and no other candidate shares it.
 */
export function stagingTag(sums) {
  return `release-${sums.slice(0, 12)}`;
}

/**
 * Semver precedence of two versions: negative, 0 or positive. Build metadata
 * is ignored; a prerelease sorts below its release, identifiers compare
 * numerically when both are numbers, and numbers sort below words.
 */
export function compareVersions(a, b) {
  const parse = (version) => {
    const plain = version.split("+")[0];
    const dash = plain.indexOf("-");
    const core = (dash === -1 ? plain : plain.slice(0, dash)).split(".").map(Number);
    return { core, pre: dash === -1 ? [] : plain.slice(dash + 1).split(".") };
  };
  const [x, y] = [parse(a), parse(b)];
  for (let index = 0; index < 3; index++) {
    if (x.core[index] !== y.core[index]) return x.core[index] - y.core[index];
  }
  if (x.pre.length === 0 || y.pre.length === 0) return y.pre.length - x.pre.length;
  for (let index = 0; index < Math.max(x.pre.length, y.pre.length); index++) {
    const [p, q] = [x.pre[index], y.pre[index]];
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
    if (p === q) continue;
    const [pn, qn] = [/^\d+$/.test(p), /^\d+$/.test(q)];
    if (pn && qn) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/**
 * One line per candidate: on npm or MISSING, whether `tag` names it, and what
 * this run did about it.
 */
export function statusTable(rows, tag) {
  const width = Math.max(...rows.map((row) => `${row.name}@${row.version}`.length));
  const onTag = `on ${tag}`;
  const notOnTag = `NOT on ${tag}`;
  return rows
    .map(
      (row) =>
        `  ${`${row.name}@${row.version}`.padEnd(width)}  ${row.onNpm ? "on npm " : "MISSING"}  ` +
        `${(row.onTag ? onTag : notOnTag).padEnd(notOnTag.length)}  ${row.note}`,
    )
    .join("\n");
}

/**
 * `npm view <name> dist-tags --json`: the package's dist-tags, `{}` for a
 * package npm does not know; any other failure throws.
 */
export function parseDistTags({ status, stdout, stderr }) {
  if (status === 0) return stdout.trim() === "" ? {} : JSON.parse(stdout);
  if (/E404|404 Not Found|is not in this registry/.test(`${stdout}\n${stderr}`)) return {};
  throw new Error(`npm view dist-tags failed (${status}):\n${stderr || stdout}`);
}

/**
 * The read-only half of `reconcileTags`: where each tag is, locally and (with
 * `push`) on origin. Throws, naming both SHAs, when any tag already exists at
 * a commit other than `head`. `git(args)` runs git in the release checkout and
 * returns `{ status, stdout, stderr }`.
 */
export function inspectTags(tags, { head, push, git }) {
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
  return plan;
}

/**
 * Make each tag in `tags` name `head`, locally and (with `push`) on origin.
 * Every tag is checked (`inspectTags`) before any is created.
 */
export function reconcileTags(tags, { head, push, git }) {
  const plan = inspectTags(tags, { head, push, git });
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

/**
 * The publishable packages NO example installs, on purpose, each with the
 * reason. Every other candidate must be resolved by some example's install in
 * the browser suite, or `verify` fails: a binding that silently dropped out of
 * every example would otherwise be published with no browser check at all.
 *
 * An entry is removed in the change that gives the package an example; an
 * entry for a package an example DOES install, or for one that is no longer a
 * candidate, fails `verify` as stale.
 */
export const BROWSER_UNCOVERED = {
  "@comvi/cli": "a command-line tool; no browser runtime to exercise",
  "@comvi/vite-plugin": "a build-time plugin; no example builds with it",
  "@comvi/plugin-in-context-editor":
    "the editor overlay needs a platform session; no example ships it",
};

/**
 * What the browser-coverage check refuses: candidates neither installed by an
 * example nor listed in `allowlist` (`uncovered`), and allowlist entries that
 * are installed after all or are not candidates (`stale`).
 */
export function coverageGaps(candidates, reports, allowlist = BROWSER_UNCOVERED) {
  const missed = unexercised(candidates, reports);
  const listed = Object.keys(allowlist);
  return {
    uncovered: missed.filter((name) => !listed.includes(name)),
    stale: listed.filter((name) => !missed.includes(name)),
  };
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

function distTagsOf(pkg) {
  return parseDistTags(sh("npm", ["view", pkg.name, "dist-tags", "--json"], { capture: true }));
}

/**
 * `read()` until `settled(value)`, and return the last value. npm's reads can
 * lag its writes, so an observation that is not settled yet is asked again a
 * few times, backing off from COMVI_PUBLISH_RECHECK_MS (2 s) and doubling:
 * about 30 s in all. A read that throws (a transient registry error) is asked
 * again the same way; the last attempt's error is rethrown.
 */
function askAgain(read, settled = () => true) {
  const base = Number(process.env.COMVI_PUBLISH_RECHECK_MS ?? 2000);
  for (let attempt = 0; ; attempt++) {
    try {
      const value = read();
      if (settled(value) || attempt === 4) return value;
    } catch (error) {
      if (attempt === 4) throw error;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, base * 2 ** attempt);
  }
}

/** The last non-empty line of an error message: where npm puts the cause. */
function lastLine(message) {
  return message.trim().split("\n").at(-1).trim();
}

/** Whether a version this run just published is visible yet. */
function visibleAfterPublish(pkg) {
  return askAgain(() => !notOnNpm(pkg), Boolean);
}

/**
 * npm's `dist.integrity` of the candidate's version, or null. A missing value
 * is asked again (a stale replica); a present one is final, because npm never
 * lets a published version's bytes change.
 */
function registryIntegrity(pkg) {
  return askAgain(
    () =>
      parseIntegrity(
        sh("npm", ["view", `${pkg.name}@${pkg.version}`, "dist.integrity", "--json"], {
          capture: true,
        }),
      ),
    (found) => found !== null,
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
  const { uncovered, stale } = coverageGaps(
    candidatesFromSums(dir, recorded).map((pkg) => pkg.name),
    reports,
  );
  for (const [name, reason] of Object.entries(BROWSER_UNCOVERED)) {
    if (!stale.includes(name)) console.log(`no browser check, by design: ${name} (${reason})`);
  }
  if (uncovered.length > 0) {
    console.error(
      `not installed by any example and not in BROWSER_UNCOVERED, so it would be published ` +
        `without a browser check: ${uncovered.join(", ")}; nothing was published`,
    );
  }
  if (stale.length > 0) {
    console.error(
      `BROWSER_UNCOVERED lists ${stale.join(", ")}, which an example installs or which is no ` +
        "candidate: remove the entry (scripts/publish-candidate.mjs)",
    );
  }
  return uncovered.length > 0 || stale.length > 0 ? 1 : 0;
}

function publish(options) {
  const dir = path.resolve(REPO_ROOT, options.dir);
  const recorded = assertVerifiedCandidate(dir, options.expectSums);
  // The integrity of each tarball is taken from the bytes SHA256SUMS pins.
  const candidates = publishOrder(candidatesFromSums(dir, recorded)).map((pkg) => ({
    ...pkg,
    integrity: tarballIntegrity(pkg.tarball),
  }));
  // Git and the changeset config are read from the release checkout (the
  // current directory), whose HEAD is the commit every tag must name.
  const checkout = process.cwd();
  const git = (args) => sh("git", args, { capture: true, cwd: checkout });
  const tagging = options.gitTag && !options.dryRun;
  const staging = stagingTag(options.expectSums);
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

  // One train, one commit: a version already on npm must have been tagged at
  // THIS commit. A fresh run at a newer commit after a partial publish would
  // otherwise publish the rest from different sources and promote the mix.
  if (tagging && skipped.length > 0) {
    try {
      const plan = inspectTags(
        skipped.map((pkg) => `${pkg.name}@${pkg.version}`),
        { head, push: options.pushTags, git },
      );
      // A fresh run (attempt 1) never owns an untagged version on npm: only a
      // re-run of the run that published it may reconcile its tag. Outside CI
      // the variable is unset and the guard is off.
      if (process.env.GITHUB_RUN_ATTEMPT === "1") {
        const untagged = plan.find(({ local, remote }) => local === null && remote === null);
        if (untagged) {
          throw new Error(
            `${untagged.tag} is on npm but has no tag: it was published by another run. ` +
              `Re-run that run ('Re-run failed jobs'), or dispatch a new version.`,
          );
        }
      }
    } catch (error) {
      output({ published: "false", publishedPackages: "[]" });
      console.error(
        `nothing was published or promoted: the versions already on npm belong to another ` +
          `commit's run, and this candidate must not complete their train.\n${error.message}`,
      );
      return 1;
    }
  }

  // One train, one candidate, checked early: before this run publishes
  // anything, every version npm already has must carry THIS candidate's
  // staging tag (which a partial train keeps until it is promoted) or, when
  // the tag is gone, THIS candidate's bytes. A git tag proves the commit, not
  // the bytes, and the RC job sets no git tags at all. Passing here
  // authorises nothing: the byte-identity check after publishing decides,
  // for every candidate, including the all-present case this one skips.
  if (pending.length > 0 && skipped.length > 0) {
    let foreign;
    try {
      foreign = skipped.flatMap((pkg) => {
        const distTags = askAgain(() => distTagsOf(pkg));
        if (distTags[staging] === pkg.version) return [];
        const bytes = registryIntegrity(pkg);
        if (bytes === pkg.integrity) return [];
        const found = Object.entries(distTags)
          .filter(([tag, version]) => tag.startsWith("release-") && version === pkg.version)
          .map(([tag]) => tag);
        return [
          `  ${pkg.name}@${pkg.version} is on npm from another candidate: expected dist-tag ` +
            `${staging}, found ${found.length > 0 ? found.join(", ") : "none"}; ` +
            `expected integrity ${pkg.integrity}, found ${bytes ?? "none"}`,
        ];
      });
    } catch (error) {
      // Not knowing is not "foreign": the recovery is to ask npm again.
      output({ published: "false", publishedPackages: "[]" });
      console.error(
        `nothing was published or promoted: could not read npm, re-run this job.\n` +
          lastLine(error.message),
      );
      return 1;
    }
    if (foreign.length > 0) {
      output({ published: "false", publishedPackages: "[]" });
      console.error(
        `nothing was published or promoted: this candidate (${staging}) must not complete ` +
          `a train another candidate started.\n${foreign.join("\n")}\n` +
          `Finish that train with 'Re-run failed jobs' on the run that published it, ` +
          `or dispatch a new version.`,
      );
      return 1;
    }
  }

  // npm gives a package's FIRST-EVER version `latest` whatever `--tag` says,
  // so a brand-new name would be live before the train is complete. None of
  // the 12 published names is new today; warn rather than fail if one is.
  if (!options.dryRun) {
    for (const pkg of pending) {
      if (Object.keys(distTagsOf(pkg)).length === 0) {
        console.warn(
          `warning: ${pkg.name} has no dist-tags on npm, so npm will put its first-ever ` +
            `version on \`latest\` at publish, ahead of the rest of the train`,
        );
      }
    }
  }

  const { published, failed } = publishAll(pending, (pkg) => {
    // The staging tag keeps `latest`/`next` still until the whole set is on
    // npm (except for a first-ever version: see the warning above).
    const args = ["publish", pkg.tarball, "--access", "public", "--tag", staging];
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
    let distTags = {};
    try {
      onNpm = options.dryRun
        ? published.includes(pkg) || !notOnNpm(pkg)
        : published.includes(pkg)
          ? visibleAfterPublish(pkg)
          : !notOnNpm(pkg);
      if (onNpm) distTags = distTagsOf(pkg);
    } catch (error) {
      onNpm = false;
      note += `; npm view failed: ${error.message.split("\n")[0]}`;
    }
    return { ...pkg, onNpm, distTags, onTag: distTags[options.tag] === pkg.version, note };
  });
  const present = rows.filter((row) => row.onNpm);
  const complete = present.length === candidates.length;

  // Byte identity, the invariant that authorises promotion and git tags:
  // every candidate npm has must hold this candidate's bytes, whatever this
  // run did about it. A stale 404 can send a version another candidate
  // published to `npm publish`, which then fails because it exists; a run can
  // find every version present from another candidate. Neither may promote.
  // A dry run's own "publishes" are not on npm, so they are not compared;
  // what npm already has is, so a dry run refuses on foreign bytes too.
  const unverified = present
    .filter((row) => !(options.dryRun && published.some((pkg) => pkg.name === row.name)))
    .flatMap((row) => {
      let found = null;
      let seen = "none";
      try {
        found = registryIntegrity(row);
        if (found !== null) seen = found;
      } catch (error) {
        seen = `none (${lastLine(error.message)})`;
      }
      return found === row.integrity
        ? []
        : [
            {
              differs: found !== null,
              line: `  ${row.name}@${row.version}: expected ${row.integrity}, found ${seen}`,
            },
          ];
    });
  if (unverified.length > 0) {
    output({ published: "false", publishedPackages: "[]" });
    console.log(`release candidate (staged as ${staging})\n${statusTable(rows, options.tag)}`);
    const lines = unverified.map((entry) => entry.line).join("\n");
    // An integrity npm does not show (yet) is not a foreign one: only a
    // different sha512 means another candidate's bytes.
    console.error(
      unverified.some((entry) => entry.differs)
        ? `refusing to promote or tag anything: npm does not hold this candidate's bytes (${staging}).\n` +
            `${lines}\n` +
            "A version on npm can never be replaced. If one other run published all of these, finish " +
            "its train with 'Re-run failed jobs' on that run; if they mix candidates, no run can " +
            "finish them: dispatch a new version."
        : `could not verify this candidate's bytes on npm (${staging}):\n${lines}\n` +
            "npm does not show the integrity yet. Re-run this job; nothing was promoted or tagged.",
    );
    return 1;
  }

  // Promotion: `--tag` moves only for a complete train, package by package,
  // and only where it is not there yet. The staging tag goes once all moved.
  // Never backwards: a stale re-run of an older train must not pull the tag
  // down from a newer release.
  const backwards = rows.filter(
    (row) =>
      row.distTags[options.tag] !== undefined &&
      compareVersions(row.distTags[options.tag], row.version) > 0,
  );
  for (const row of backwards) {
    row.note += `; ${options.tag} is already ${row.distTags[options.tag]}`;
  }
  if (complete && backwards.length > 0) {
    console.error(
      `refusing to move \`${options.tag}\` backwards, for any package:\n` +
        backwards
          .map(
            (row) =>
              `  ${row.name}: ${options.tag} is ${row.distTags[options.tag]}, newer than the candidate's ${row.version}`,
          )
          .join("\n"),
    );
  }
  if (complete && backwards.length === 0) {
    for (const row of rows.filter((entry) => !entry.onTag)) {
      if (options.dryRun) {
        row.onTag = true;
        row.note += `; would move ${options.tag}`;
        continue;
      }
      const add = sh("npm", ["dist-tag", "add", `${row.name}@${row.version}`, options.tag], {
        capture: true,
      });
      row.onTag = add.status === 0;
      row.note += row.onTag
        ? `; ${options.tag} moved`
        : `; npm dist-tag add failed: ${(add.stderr || add.stdout).trim().split("\n")[0]}`;
    }
    if (rows.every((row) => row.onTag) && !options.dryRun) {
      // Every staging tag that names the promoted version goes: this
      // candidate's, and an older candidate's with the same bytes that a
      // fresh-run recovery completed.
      for (const row of rows) {
        const stale = Object.entries(row.distTags)
          .filter(([tag, version]) => tag.startsWith("release-") && version === row.version)
          .map(([tag]) => tag);
        for (const tag of stale) {
          const rm = sh("npm", ["dist-tag", "rm", row.name, tag], { capture: true });
          if (rm.status !== 0) console.log(`(could not remove ${tag} from ${row.name}; harmless)`);
        }
      }
    }
  }
  const promoted = rows.every((row) => row.onTag);
  console.log(
    `release candidate: ${present.length} of ${candidates.length} on npm, ` +
      `${rows.filter((row) => row.onTag).length} on ${options.tag} ` +
      `(staged as ${staging})\n${statusTable(rows, options.tag)}`,
  );

  let tagError = null;
  if (tagging) {
    const tags = present.map((pkg) => `${pkg.name}@${pkg.version}`);
    // The release tag names the whole, promoted set, so it waits for it.
    if (complete && promoted) tags.push(releaseTag);
    try {
      reconcileTags(tags, { head, push: options.pushTags, git });
    } catch (error) {
      tagError = error.message;
    }
  } else {
    for (const pkg of published) console.log(`New tag: ${pkg.name}@${pkg.version}`);
  }

  const done = complete && promoted && tagError === null;
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
  } else if (!promoted && backwards.length === 0) {
    console.error(
      `every candidate is on npm, but not every one is on \`${options.tag}\` yet. Re-run this ` +
        `job: it moves \`${options.tag}\` for the rest and leaves the moved ones alone.`,
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
