#!/usr/bin/env node
// Usage: node measure.mjs <bareDir> <appDir> [<appDir> ...]
// Each dir must contain a built Nuxt app (.output/public/_nuxt/). The first dir is the baseline.
// Prints: per-app totals (all .js under _nuxt, recursive), entry-chunk table (the largest chunk,
// cross-checked against <script type="module" src> in .output/public/index.html when present),
// deltas vs baseline, per-chunk listing with marker attribution.
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";

const apps = process.argv.slice(2);
if (apps.length < 2) {
  console.error("usage: node measure.mjs <bareDir> <appDir> [...]");
  process.exit(1);
}
const markers = ["intlify", "vue-i18n", "comvi", "Hello, {name}"];
const gz = (b) => gzipSync(b, { level: 9 }).length;
const br = (b) =>
  brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const sign = (n) => (n >= 0 ? "+" : "") + n;
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}
const results = {};
for (const app of apps) {
  const root = join(app, ".output/public/_nuxt");
  if (!existsSync(root)) {
    console.error(`${app}: no ${root} (run nuxi build first)`);
    process.exit(1);
  }
  const files = walk(root)
    .map((p) => {
      const buf = readFileSync(p);
      const src = buf.toString("utf8");
      return {
        file: p.slice(root.length + 1),
        min: buf.length,
        gz: gz(buf),
        br: br(buf),
        markers: markers.filter((m) => src.includes(m)),
      };
    })
    .sort((a, b) => b.min - a.min);
  const sum = (k) => files.reduce((a, f) => a + f[k], 0);
  let entry = files[0];
  const html = join(app, ".output/public/index.html");
  if (existsSync(html)) {
    const m = readFileSync(html, "utf8").match(/<script type="module" src="[^"]*\/_nuxt\/([^"]+)"/);
    if (m) entry = files.find((f) => f.file === m[1]) || entry;
  }
  results[app] = {
    files: files.length,
    min: sum("min"),
    gz: sum("gz"),
    br: sum("br"),
    list: files,
    entry,
  };
}
const base = results[apps[0]];
const name = (a) => basename(a);
console.log("## All client JS under .output/public/_nuxt/\n");
console.log(
  "| app | JS files | min bytes | gzip-9 bytes | brotli-11 bytes | Δ min vs base | Δ gzip vs base | Δ brotli vs base |",
);
console.log("|---|---|---|---|---|---|---|---|");
for (const app of apps) {
  const r = results[app];
  console.log(
    `| ${name(app)} | ${r.files} | ${r.min} | ${r.gz} | ${r.br} | ${sign(r.min - base.min)} | ${sign(r.gz - base.gz)} | ${sign(r.br - base.br)} |`,
  );
}
console.log("\n## Entry chunk only (what the home page loads)\n");
console.log(
  "| app | entry chunk | min | gzip-9 | brotli-11 | Δ min vs base | Δ gzip vs base | Δ brotli vs base |",
);
console.log("|---|---|---|---|---|---|---|---|");
for (const app of apps) {
  const e = results[app].entry,
    b = base.entry;
  console.log(
    `| ${name(app)} | ${e.file} | ${e.min} | ${e.gz} | ${e.br} | ${sign(e.min - b.min)} | ${sign(e.gz - b.gz)} | ${sign(e.br - b.br)} |`,
  );
}
for (const app of apps) {
  console.log(`\n## ${name(app)} — chunks (largest first)\n`);
  console.log("| file | min | gzip-9 | brotli-11 | markers |");
  console.log("|---|---|---|---|---|");
  for (const f of results[app].list)
    console.log(`| ${f.file} | ${f.min} | ${f.gz} | ${f.br} | ${f.markers.join(", ") || "—"} |`);
}
