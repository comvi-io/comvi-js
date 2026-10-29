#!/usr/bin/env node
/**
 * The R3-21 gate for Vue: after a server render the browser requests NO catalog the server
 * rendered, and hydration changes no text (no flicker). A built app (Vite: a client bundle
 * and an SSR bundle over the BUILT @comvi/vue and @comvi/core) served by a small Node server
 * that also plays the CDN, driven in Chromium:
 *
 *   gate "html"        plain-HTTP `/` already carries the uk text, `shop` too (a standalone
 *                      `<T ns>` loads its namespace during the server's render);
 *   gate "requests"    0 requests to /cdn from the browser up to hydration and network idle
 *                      (`legal`, which the server rendered through the fallback chain because
 *                      uk:legal is a 404, included);
 *   gate "flicker"     every text the page shows from first paint through hydration equals
 *                      the server's, and Vue reports no hydration mismatch;
 *   gate "later"       what the server did not send is requested, and only that: a later
 *                      view's namespace (help: uk, en), another locale (de: default,
 *                      account, help, legal);
 *
 *   node e2e/run.mjs                    the gate (exit 1 on a failed gate)
 *   node e2e/run.mjs --red no-handover  the same gates on a page without the payload; exits
 *                                       0 only if "requests" and "flicker" FAIL (a gate never
 *                                       seen red is unverified)
 *
 * Needs `pnpm build` of @comvi/core and @comvi/vue (turbo builds them first) and Chromium
 * (`pnpm exec playwright install chromium`). No wall-clock thresholds: the gates count
 * requests and compare texts.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG = path.resolve(HERE, "..");
const require = createRequire(path.join(PKG, "package.json"));
const { build } = await import(pathToFileURL(require.resolve("vite")).href);
const playwright = await import(
  pathToFileURL(createRequire(path.resolve(PKG, "../../package.json")).resolve("playwright")).href
);
const { chromium } = playwright.default ?? playwright;

const args = process.argv.slice(2);
const red = args.includes("--red") ? args[args.indexOf("--red") + 1] : undefined;
if (red && red !== "no-handover") throw new Error(`--red: unknown variant "${red}" (no-handover)`);

for (const f of ["dist/comvi-vue.js", "../core/dist/comvi-core.js"])
  if (!fs.existsSync(path.join(PKG, f))) throw new Error(`${f} is missing — run \`pnpm build\``);

// ── build: a client bundle and an SSR bundle over the built packages ──────
// Inside the package (gitignored `dist`), so the SSR bundle resolves `vue` and `@comvi/*`.
const out = path.join(HERE, "dist");
const shared = {
  configFile: false,
  logLevel: "warn",
  root: HERE,
  resolve: { alias: { "@comvi/vue": path.join(PKG, "dist/comvi-vue.js") } },
};
await build({
  ...shared,
  build: {
    outDir: path.join(out, "client"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(HERE, "entry-client.ts"),
      output: { entryFileNames: "client.js", chunkFileNames: "[name]-[hash].js" },
    },
  },
});
await build({
  ...shared,
  build: { outDir: path.join(out, "server"), ssr: path.join(HERE, "entry-server.ts") },
});
const { render } = await import(pathToFileURL(path.join(out, "server/entry-server.js")).href);

// ── the server: SSR pages, the client bundle, and the CDN ────────────────
const LOCALE = "uk";
const page = (html, payload) => `<!doctype html>
<html lang="${LOCALE}"><head><meta charset="utf-8"></head><body>
<div id="app">${html}</div>
${payload ? `<script>window.__I18N__ = ${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>` : ""}
<script type="module" src="/client.js"></script>
</body></html>`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/cdn/")) {
      const file = path.join(HERE, "cdn", url.pathname.slice(5));
      if (!file.startsWith(path.join(HERE, "cdn")) || !fs.existsSync(file)) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" }).end(fs.readFileSync(file));
      return;
    }
    if (url.pathname === "/") {
      const { html, payload } = await render(LOCALE, `http://127.0.0.1:${port}/cdn`);
      res
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end(page(html, red === "no-handover" ? undefined : payload));
      return;
    }
    const file = path.join(out, "client", url.pathname);
    if (file.startsWith(path.join(out, "client")) && fs.existsSync(file)) {
      res.writeHead(200, { "content-type": "text/javascript" }).end(fs.readFileSync(file));
      return;
    }
    res.writeHead(404).end();
  } catch (e) {
    res.writeHead(500).end(String(e?.stack || e));
  }
});
await new Promise((y) => server.listen(0, "127.0.0.1", y));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;

const results = {};
const gate = async (id, f) => {
  try {
    await f();
    results[id] = "ok";
  } catch (e) {
    results[id] = `FAIL ${e.message.split("\n")[0]}`;
  }
};

const TEXTS = ["greeting", "only", "title", "legal", "terms", "cart", "locale"];
const browser = await chromium.launch();
try {
  const serverHtml = await (await fetch(`${origin}/`)).text();
  await gate("html", () => {
    assert.match(serverHtml, /data-testid="greeting">Привіт, Ann!</, "the server HTML is uk");
    // `<T ns="shop">` loaded its namespace during the render: no route preloaded it.
    assert.match(serverHtml, /data-testid="cart">(<!--\[-->)?Кошик/, "the server rendered shop");
  });

  const tab = await browser.newPage();
  const cdnRequests = [];
  tab.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/cdn/")) cdnRequests.push(u.pathname);
  });
  const consoleErrors = [];
  tab.on("console", (m) => {
    if (m.type() === "error" || /hydrat/i.test(m.text())) consoleErrors.push(m.text());
  });
  tab.on("pageerror", (e) => consoleErrors.push(String(e)));
  // Every text the page shows, from the first parse on: one entry per change.
  await tab.addInitScript((ids) => {
    const seen = [];
    window.__seen = seen;
    const read = () =>
      ids.map((id) => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null);
    const record = () => {
      const now = JSON.stringify(read());
      if (seen[seen.length - 1] !== now) seen.push(now);
    };
    new MutationObserver(record).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    document.addEventListener("DOMContentLoaded", record);
  }, TEXTS);
  await tab.goto(`${origin}/`);
  await tab.waitForFunction(() => window.__hydrated === true);
  await tab.waitForLoadState("networkidle");

  const serverTexts = await tab.evaluate(
    ({ html, ids }) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return ids.map((id) => doc.querySelector(`[data-testid="${id}"]`)?.textContent ?? null);
    },
    { html: serverHtml, ids: TEXTS },
  );
  await gate("requests", () =>
    assert.deepEqual(cdnRequests, [], "catalog requests from the browser after hydration"),
  );
  await gate("flicker", async () => {
    const seen = (await tab.evaluate(() => window.__seen)).map((s) => JSON.parse(s));
    for (const texts of seen)
      assert.deepEqual(texts, serverTexts, "a text that is not the server's");
    assert.deepEqual(consoleErrors, [], "console errors or hydration warnings");
  });

  if (!red) {
    await gate("later", async () => {
      await tab.getByTestId("help-open").click();
      await tab.getByTestId("help").filter({ hasText: "Питання" }).waitFor();
      assert.deepEqual([...cdnRequests].sort(), ["/cdn/help/en.json", "/cdn/help/uk.json"]);
      cdnRequests.length = 0;
      await tab.getByTestId("to-de").click();
      await tab.getByTestId("locale").filter({ hasText: "de" }).waitFor();
      assert.deepEqual(
        [...cdnRequests].sort(),
        [
          "/cdn/account/de.json",
          "/cdn/de.json",
          "/cdn/help/de.json",
          "/cdn/legal/de.json",
          "/cdn/shop/de.json",
        ],
        "a switch to de asks for de only: en came with the payload",
      );
      assert.equal(await tab.getByTestId("greeting").textContent(), "Hallo, Ann!");
    });
  }
} finally {
  await browser.close();
  server.close();
  fs.rmSync(out, { recursive: true, force: true });
}

console.log(`vue ssr handover e2e${red ? ` (RED: ${red})` : ""}, node ${process.version}`);
for (const [id, r] of Object.entries(results)) console.log(`${r === "ok" ? "+" : "x"} ${id}: ${r}`);
const failed = Object.keys(results).filter((id) => results[id] !== "ok");
if (red) {
  const want = ["requests", "flicker"];
  const caught = want.every((g) => failed.includes(g));
  console.log(
    caught
      ? `RED run (${red}): failed ${failed.join(", ")} — the ${want.join("/")} gates see it`
      : `RED run (${red}): the ${want.join("/")} gates PASSED without the handover — blind`,
  );
  process.exitCode = caught ? 0 : 1;
} else process.exitCode = failed.length ? 1 : 0;
