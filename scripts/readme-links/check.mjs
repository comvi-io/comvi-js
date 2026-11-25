#!/usr/bin/env node
/**
 * Every `https://comvi.io/docs/…` link in this repo's READMEs must be a PAGE of
 * a given site build.
 *
 *   pnpm check:readme-links <site build dir> [--root <repo>]
 *
 *     <site build dir>  the www app's build output (`apps/www/dist` of the
 *                       platform repo). The Cloudflare build keeps the pages in
 *                       `dist/client/`; that subdirectory is used when present.
 *     --root            the checkout whose READMEs are read (default: this one)
 *
 * READMEs: every tracked file named `README.md` (`git ls-files`).
 *
 * A link passes only when all of these hold:
 *
 *   - it is spelled `https://comvi.io/…` (another scheme or `www.` is a hop);
 *   - the path has no trailing slash and no `.html`: the site is
 *     `trailingSlash: "never"` + `build.format: "directory"`, and its worker
 *     answers both spellings with a 301 to the bare path, which is a redirect,
 *     not a page;
 *   - the path is not the source of a redirect — a `_redirects` rule, or an
 *     Astro redirect page (`<meta http-equiv="refresh">`) — even when a page
 *     also sits there, because the redirect is what the reader gets;
 *   - the build has the page: `<path>/index.html` (or `<path>.html`);
 *   - a `#fragment`, when the link has one, is an `id` (or `name`) in that
 *     page's HTML. Starlight renders heading ids at build time, so the static
 *     HTML is the full list; an anchor added only by client script would be
 *     missed (none of the README anchors is one).
 *
 * The query string is ignored. Exit 1 on any finding, 2 on a usage error.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Repo-relative paths of every tracked `README.md`, sorted. */
export function readmeFiles(root) {
  return execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter((file) => file && path.basename(file) === "README.md")
    .sort();
}

const LINK = /https?:\/\/(?:www\.)?comvi\.io\/docs(?=$|[\s/?#)\]>"'`<.,;:!])[^\s)\]>"'`<]*/g;

/** `{ url, line }` for every comvi.io docs link in a Markdown text. */
export function extractLinks(text) {
  const links = [];
  text.split("\n").forEach((content, index) => {
    for (const match of content.matchAll(LINK)) {
      // Sentence punctuation after a bare URL is not part of it.
      links.push({ url: match[0].replace(/[.,;:!?]+$/, ""), line: index + 1 });
    }
  });
  return links;
}

const decodeEntities = (value) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Every `id` and `name` attribute value in an HTML document. */
export function anchorsIn(html) {
  const anchors = new Set();
  for (const match of html.matchAll(/\s(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    anchors.add(decodeEntities(match[1] ?? match[2]));
  }
  return anchors;
}

const REFRESH = /<meta\s[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/i;

/** The pattern of a `_redirects` source: `*` is a splat, `:name` one segment. */
function redirectPattern(from) {
  const body = from
    .replace(/\/+$/, "")
    .split(/(\*|:[A-Za-z_][\w]*)/)
    .map((part) =>
      part === "*"
        ? ".*"
        : part.startsWith(":")
          ? "[^/]+"
          : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  return new RegExp(`^${body || ""}/?$`);
}

/** The page directory of a build: `<dir>/client` for the Cloudflare adapter, else `<dir>`. */
export function pageRoot(buildDir) {
  const client = path.join(buildDir, "client");
  if (!fs.existsSync(path.join(buildDir, "index.html")) && fs.existsSync(client)) return client;
  return buildDir;
}

/**
 * The routes of a site build: `{ root, pages: Map<route, file>, redirects: [{ from, to, source }] }`.
 * A route is the bare path (`/docs/i18n/react`; `/` for the home page).
 */
export function siteRoutes(buildDir) {
  const root = pageRoot(buildDir);
  if (!fs.existsSync(root)) throw new Error(`no site build at ${buildDir}`);
  const pages = new Map();
  const redirects = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.name.endsWith(".html")) continue;
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (rel === "404.html") continue;
      const route =
        `/${rel.replace(/(^|\/)index\.html$/, "").replace(/\.html$/, "")}`.replace(/\/$/, "") ||
        "/";
      const html = fs.readFileSync(abs, "utf8");
      if (REFRESH.test(html)) {
        const to = html.match(/url\s*=\s*([^"'>\s;]+)/i)?.[1] ?? "(unknown)";
        redirects.push({ from: route, to, source: rel });
      } else {
        pages.set(route, abs);
      }
    }
  };
  walk(root);

  const rules = path.join(root, "_redirects");
  if (fs.existsSync(rules)) {
    fs.readFileSync(rules, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const [from, to] = line.replace(/#.*/, "").trim().split(/\s+/);
        if (from && to) redirects.push({ from, to, source: `_redirects:${index + 1}` });
      });
  }
  return { root, pages, redirects };
}

/** Why a link is not a page of `site`, or `null` when it is. */
export function checkLink(url, site, anchorCache = new Map()) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "not a valid URL";
  }
  if (parsed.protocol !== "https:" || parsed.host !== "comvi.io") {
    return `${parsed.protocol}//${parsed.host} is not https://comvi.io: a redirect, not a page`;
  }
  const pathname = decodeURI(parsed.pathname);
  if (pathname !== "/" && pathname.endsWith("/")) {
    const bare = pathname.replace(/\/+$/, "");
    return (
      `trailing slash: the site answers ${pathname} with a 301 to ${bare} (a redirect, not a page)` +
      (site.pages.has(bare) ? `; ${bare} is a page, link it` : `; and ${bare} has no page either`)
    );
  }
  if (pathname.endsWith(".html")) {
    return `\`.html\` spelling: the site answers it with a 301 (a redirect, not a page)`;
  }
  const redirect = site.redirects.find((rule) => redirectPattern(rule.from).test(pathname));
  if (redirect) {
    return `a redirect to ${redirect.to} (${redirect.source}), not a page`;
  }
  const page = site.pages.get(pathname);
  if (!page) return `no page at ${pathname} in the site build`;

  const fragment = parsed.hash.slice(1);
  if (fragment) {
    let anchors = anchorCache.get(page);
    if (!anchors) {
      anchors = anchorsIn(fs.readFileSync(page, "utf8"));
      anchorCache.set(page, anchors);
    }
    const id = decodeURIComponent(fragment);
    if (!anchors.has(id)) return `no #${id} on ${pathname} (the page has no element with that id)`;
  }
  return null;
}

/** Every README link checked against `site`: `{ links, findings, files }`. */
export function checkReadmes(root, site) {
  const links = [];
  const files = readmeFiles(root);
  for (const file of files) {
    for (const link of extractLinks(fs.readFileSync(path.join(root, file), "utf8"))) {
      links.push({ file, ...link });
    }
  }
  const anchorCache = new Map();
  const findings = [];
  for (const link of links) {
    const reason = checkLink(link.url, site, anchorCache);
    if (reason) findings.push({ ...link, reason });
  }
  return { links, findings, files: new Set(links.map((link) => link.file)) };
}

export function parseArgs(argv) {
  const options = { build: null, root: REPO_ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--root needs a directory");
      options.root = path.resolve(value);
    } else if (arg.startsWith("--")) throw new Error(`unknown argument "${arg}"`);
    else if (options.build) throw new Error(`one site build directory, got a second: "${arg}"`);
    else options.build = path.resolve(arg);
  }
  if (!options.build) {
    throw new Error(
      "usage: check:readme-links <site build dir, e.g. apps/www/dist> [--root <repo>]",
    );
  }
  return options;
}

function main(argv) {
  const options = parseArgs(argv);
  const site = siteRoutes(options.build);
  const { links, findings, files } = checkReadmes(options.root, site);
  const unique = new Set(links.map((link) => link.url));
  const anchored = links.filter((link) => link.url.includes("#")).length;
  console.log(
    `readme-links: ${links.length} link(s) (${unique.size} distinct, ${anchored} with an anchor) ` +
      `in ${files.size} README(s), against ${site.pages.size} page(s) and ` +
      `${site.redirects.length} redirect(s) in ${site.root}`,
  );
  for (const finding of findings) {
    console.log(`  ${finding.file}:${finding.line}  ${finding.url}\n      ${finding.reason}`);
  }
  if (findings.length > 0) {
    console.log(`readme-links: FAIL — ${findings.length} link(s) are not a page of the build.`);
    return 1;
  }
  console.log("readme-links: OK — every link is a page, every anchor is on it.");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`readme-links: ${error.message}`);
    process.exitCode = 2;
  }
}
