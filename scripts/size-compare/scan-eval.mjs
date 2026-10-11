// Scans the published JavaScript of every package in this comparison for `eval(` and
// `new Function(`, the two constructs a Content Security Policy without 'unsafe-eval' blocks.
// Run: node scan-eval.mjs   (after pnpm install --ignore-workspace)
import { readdirSync, readFileSync, statSync, realpathSync } from "node:fs";
import { join } from "node:path";

const PACKAGES = [
  "@comvi/core",
  "@comvi/react",
  "@comvi/vue",
  "@comvi/next",
  "@comvi/nuxt",
  "@comvi/plugin-fetch-loader",
  "i18next",
  "react-i18next",
  "i18next-icu",
  "intl-messageformat",
  "use-intl",
  "next-intl",
  "vue-i18n",
];
const PATTERN = /\bnew\s+Function\s*\(|\beval\s*\(/;

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(m?js|cjs)$/.test(entry)) yield p;
  }
}
for (const name of PACKAGES) {
  const root = realpathSync(join("node_modules", name));
  const hits = [];
  for (const f of files(root)) {
    if (f.includes("/node_modules/", root.length)) continue; // the package's own files only
    const src = readFileSync(f, "utf8");
    const m = PATTERN.exec(src);
    if (m) hits.push(`${f.slice(root.length + 1)}:${src.slice(0, m.index).split("\n").length}`);
  }
  console.log(`${name.padEnd(28)} ${hits.length === 0 ? "none" : hits.join(", ")}`);
}
