import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  anchorsIn,
  checkLink,
  checkReadmes,
  extractLinks,
  pageRoot,
  parseArgs,
  siteRoutes,
} from "./check.mjs";

/** An Astro Cloudflare build in miniature: `dist/client/<route>/index.html`, `_redirects`. */
function fixtureBuild() {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "readme-links-test-"));
  const put = (rel, content) => {
    const abs = path.join(dist, "client", rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  put("index.html", "<html><body>home</body></html>");
  put("404.html", "<html>not found</html>");
  put("docs/i18n/index.html", '<h1 id="_top">Comvi i18n</h1>');
  put(
    "docs/i18n/ssr/index.html",
    '<h2 id="nuxt">Nuxt</h2><h2 id="sveltekit-and-solidstart">SvelteKit</h2><a name="legacy"></a>',
  );
  put("docs/i18n/ssr.md", "# the Markdown twin, not a page");
  put("docs/i18n/guides/next-routing/index.html", "<h1>Routing</h1>");
  // A page that ALSO has a redirect rule: the rule is what the reader gets.
  put("docs/i18n/old/index.html", "<h1>stale</h1>");
  put(
    "docs/i18n/moved/index.html",
    '<!doctype html><title>Redirecting</title><meta http-equiv="refresh" content="0;url=/docs/i18n/ssr">',
  );
  put(
    "_redirects",
    [
      "# comment",
      "/docs/i18n/next/routing   /docs/i18n/guides/next-routing   301",
      "/docs/i18n/old            /docs/i18n                       301",
      "/docs/legacy/*            /docs/i18n                       301",
      "",
    ].join("\n"),
  );
  fs.mkdirSync(path.join(dist, "server"));
  return dist;
}

test("extractLinks: Markdown, angle and bare links, with their lines, punctuation trimmed", () => {
  const text = [
    "See [the docs](https://comvi.io/docs/i18n/ssr#nuxt).",
    "Bare: https://comvi.io/docs/i18n/react, then more.",
    "Angle <https://comvi.io/docs/cli> and `https://comvi.io/docs/i18n/vue`.",
    "Not docs: https://comvi.io/pricing and https://comvi.io/docsearch",
    "Root: https://comvi.io/docs",
    "Host: https://www.comvi.io/docs/i18n and http://comvi.io/docs/i18n",
  ].join("\n");
  assert.deepEqual(extractLinks(text), [
    { url: "https://comvi.io/docs/i18n/ssr#nuxt", line: 1 },
    { url: "https://comvi.io/docs/i18n/react", line: 2 },
    { url: "https://comvi.io/docs/cli", line: 3 },
    { url: "https://comvi.io/docs/i18n/vue", line: 3 },
    { url: "https://comvi.io/docs", line: 5 },
    { url: "https://www.comvi.io/docs/i18n", line: 6 },
    { url: "http://comvi.io/docs/i18n", line: 6 },
  ]);
});

test("anchorsIn: id and name attributes, either quote, entities decoded", () => {
  assert.deepEqual(
    [...anchorsIn(`<h2 id="a">x</h2><a name='b'></a><div data-id="no"></div><p id="c&amp;d">`)],
    ["a", "b", "c&d"],
  );
});

test("pageRoot / siteRoutes: the client directory, pages, redirect pages and _redirects", () => {
  const dist = fixtureBuild();
  assert.equal(pageRoot(dist), path.join(dist, "client"));
  const site = siteRoutes(dist);
  assert.deepEqual([...site.pages.keys()].sort(), [
    "/",
    "/docs/i18n",
    "/docs/i18n/guides/next-routing",
    "/docs/i18n/old",
    "/docs/i18n/ssr",
  ]);
  assert.deepEqual(
    site.redirects.map((rule) => `${rule.from} -> ${rule.to} (${rule.source})`),
    [
      "/docs/i18n/moved -> /docs/i18n/ssr (docs/i18n/moved/index.html)",
      "/docs/i18n/next/routing -> /docs/i18n/guides/next-routing (_redirects:2)",
      "/docs/i18n/old -> /docs/i18n (_redirects:3)",
      "/docs/legacy/* -> /docs/i18n (_redirects:4)",
    ],
  );
  assert.throws(() => siteRoutes(path.join(dist, "nope")), /no site build/);
});

test("checkLink: a page passes; a missing page, a redirect and a slashed spelling fail", () => {
  const site = siteRoutes(fixtureBuild());
  assert.equal(checkLink("https://comvi.io/docs/i18n", site), null);
  assert.equal(checkLink("https://comvi.io/docs/i18n/ssr?ref=readme", site), null);
  assert.match(
    checkLink("https://comvi.io/docs/i18n/missing", site),
    /no page at \/docs\/i18n\/missing/,
  );
  // The Markdown twin is a file in the build, not a page.
  assert.match(checkLink("https://comvi.io/docs/i18n/ssr.md", site), /no page/);
  assert.match(
    checkLink("https://comvi.io/docs/i18n/next/routing", site),
    /a redirect to \/docs\/i18n\/guides\/next-routing \(_redirects:2\)/,
  );
  // A redirect rule wins over a page at the same path.
  assert.match(checkLink("https://comvi.io/docs/i18n/old", site), /a redirect to \/docs\/i18n /);
  assert.match(checkLink("https://comvi.io/docs/legacy/a/b", site), /a redirect .*_redirects:4/);
  assert.match(
    checkLink("https://comvi.io/docs/i18n/moved", site),
    /a redirect to \/docs\/i18n\/ssr/,
  );
  assert.match(
    checkLink("https://comvi.io/docs/i18n/ssr/", site),
    /trailing slash: .*301 to \/docs\/i18n\/ssr .*; \/docs\/i18n\/ssr is a page, link it/,
  );
  assert.match(checkLink("https://comvi.io/docs/i18n/gone/", site), /has no page either/);
  assert.match(checkLink("https://comvi.io/docs/i18n/ssr.html", site), /`\.html` spelling/);
  assert.match(checkLink("https://www.comvi.io/docs/i18n", site), /is not https:\/\/comvi\.io/);
  assert.match(checkLink("http://comvi.io/docs/i18n", site), /is not https:\/\/comvi\.io/);
});

test("checkLink: an anchor must be an id or name on the target page", () => {
  const site = siteRoutes(fixtureBuild());
  assert.equal(checkLink("https://comvi.io/docs/i18n/ssr#nuxt", site), null);
  assert.equal(checkLink("https://comvi.io/docs/i18n/ssr#sveltekit-and-solidstart", site), null);
  assert.equal(checkLink("https://comvi.io/docs/i18n/ssr#legacy", site), null);
  assert.match(
    checkLink("https://comvi.io/docs/i18n/ssr#next", site),
    /no #next on \/docs\/i18n\/ssr/,
  );
});

test("checkReadmes: tracked README.md files only, every finding with file and line", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "readme-links-repo-"));
  const write = (rel, content) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), content);
  };
  write("README.md", "[docs](https://comvi.io/docs/i18n)\n");
  write(
    "packages/react/README.md",
    "ok https://comvi.io/docs/i18n/ssr#nuxt\nbad https://comvi.io/docs/i18n/nope\n",
  );
  write("notes.md", "https://comvi.io/docs/i18n/not-a-readme\n");
  write("untracked/README.md", "https://comvi.io/docs/i18n/untracked\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "README.md", "packages", "notes.md"], { cwd: repo });

  const { links, findings, files } = checkReadmes(repo, siteRoutes(fixtureBuild()));
  assert.equal(links.length, 3);
  assert.deepEqual([...files], ["README.md", "packages/react/README.md"]);
  assert.deepEqual(findings, [
    {
      file: "packages/react/README.md",
      line: 2,
      url: "https://comvi.io/docs/i18n/nope",
      reason: "no page at /docs/i18n/nope in the site build",
    },
  ]);
});

test("parseArgs: one build directory, required; --root takes a value", () => {
  assert.throws(() => parseArgs([]), /usage/);
  assert.throws(() => parseArgs(["a", "b"]), /a second/);
  assert.throws(() => parseArgs(["a", "--root"]), /--root needs/);
  assert.throws(() => parseArgs(["--json", "a"]), /unknown argument/);
  assert.equal(parseArgs(["dist"]).build, path.resolve("dist"));
});
