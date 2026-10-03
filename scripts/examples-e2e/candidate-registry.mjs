#!/usr/bin/env node
/**
 * A registry for the `@comvi` scope that knows only the candidate's tarballs.
 *
 * `pnpm.overrides` pins every `@comvi/*` DEPENDENCY to a local tarball, but
 * not a PEER that nothing in the example declares. `@comvi/plugin-fetch-loader`
 * peers on `@comvi/core`; the Nuxt example declares the plugin and not core
 * (the binding brings core), and pnpm's peer de-duplication then asks the
 * registry for `@comvi/core@<version>` by version, past the override. With
 * today's version already on npm that lookup silently succeeds; with a release
 * candidate's version it fails the install (`ERR_PNPM_NO_MATCHING_VERSION`).
 *
 * So the temp install's `.npmrc` points the whole `@comvi` scope here:
 * `@comvi:registry=<url>`. Every `@comvi/*` lookup pnpm makes — dependency,
 * peer or de-duplication — is answered from the candidate, and a name the
 * candidate does not have is a 404 that fails the install. Nothing in the
 * scope can come from npmjs.org. The overrides stay, so the lockfile still
 * records each package as the candidate's `file:` tarball, which the
 * provenance assertions check.
 *
 * In-process (`startCandidateRegistry`) for `examples:e2e`, whose children run
 * asynchronously; as a child process (the CLI below) for `examples:verify`,
 * whose `spawnSync` installs would block an in-process server:
 *
 *   node candidate-registry.mjs --url-file <file> <tarball>...
 */

import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import url from "node:url";
import { execFileSync } from "node:child_process";

/** The `package.json` inside a packed tarball. */
export function packedManifest(tarball) {
  return JSON.parse(
    execFileSync("tar", ["-xOzf", tarball, "package/package.json"], { encoding: "utf8" }),
  );
}

/**
 * Serve `tarballs` as the only versions of their packages. `requests` logs
 * every lookup as `{ path, status }`.
 */
export async function startCandidateRegistry(tarballs, { host = "127.0.0.1" } = {}) {
  const byName = new Map();
  for (const tarball of tarballs) {
    const manifest = packedManifest(tarball);
    const bytes = fs.readFileSync(tarball);
    byName.set(manifest.name, {
      manifest,
      tarball,
      file: path.basename(tarball),
      integrity: `sha512-${crypto.createHash("sha512").update(bytes).digest("base64")}`,
    });
  }
  const requests = [];
  let base = "";
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://registry").pathname);
    } catch {
      requests.push({ path: req.url ?? "", status: 400 });
      res.writeHead(400, { "content-type": "application/json" }).end("{}");
      return;
    }
    const reply = (status, body, type = "application/json") => {
      requests.push({ path: pathname, status });
      res.writeHead(status, { "content-type": type }).end(body);
    };
    if (pathname.startsWith("/-/tarballs/")) {
      const entry = [...byName.values()].find((item) => item.file === path.basename(pathname));
      if (entry) return reply(200, fs.readFileSync(entry.tarball), "application/octet-stream");
      return reply(404, "{}");
    }
    const entry = byName.get(pathname.slice(1));
    if (!entry) return reply(404, JSON.stringify({ error: "not in the candidate" }));
    const { version } = entry.manifest;
    return reply(
      200,
      JSON.stringify({
        name: entry.manifest.name,
        "dist-tags": { latest: version },
        versions: {
          [version]: {
            ...entry.manifest,
            dist: { tarball: `${base}/-/tarballs/${entry.file}`, integrity: entry.integrity },
          },
        },
      }),
    );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  base = `http://${host}:${server.address().port}`;
  return {
    url: `${base}/`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/** The temp install's `.npmrc` line that sends the whole scope to the candidate. */
export function scopeRegistryLine(registryUrl) {
  return `@comvi:registry=${registryUrl}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--url-file");
  if (at === -1 || !args[at + 1]) {
    console.error("usage: candidate-registry.mjs --url-file <file> <tarball>...");
    process.exit(2);
  }
  const urlFile = args[at + 1];
  const tarballs = args.filter((_, index) => index !== at && index !== at + 1);
  const registry = await startCandidateRegistry(tarballs);
  // Written whole, then renamed: a reader polling for the file never sees it
  // half-written.
  fs.writeFileSync(`${urlFile}.tmp`, registry.url);
  fs.renameSync(`${urlFile}.tmp`, urlFile);
  // Lives until the parent kills it.
}
