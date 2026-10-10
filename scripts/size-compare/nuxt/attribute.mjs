// Attribute minified bytes of every client chunk to source packages via the Vite sourcemaps.
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function decodeVLQ(str) {
  const out = [];
  let shift = 0,
    value = 0;
  for (const ch of str) {
    const d = B64.indexOf(ch);
    const cont = d & 32;
    value += (d & 31) << shift;
    if (cont) shift += 5;
    else {
      const neg = value & 1;
      value >>= 1;
      out.push(neg ? -value : value);
      shift = 0;
      value = 0;
    }
  }
  return out;
}
function pkgOf(src) {
  src = src.replace(/^\.\.\/+/g, "");
  const m = src.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);
  if (m) return m[1];
  if (src.startsWith("virtual:") || src.startsWith("\0")) return "(virtual) " + src.slice(0, 40);
  if (src.includes(".nuxt/")) return "(.nuxt generated)";
  if (src.startsWith("app/") || src.includes("/app/")) return "(app source)";
  return "(other) " + src.slice(0, 40);
}
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}
// Usage: node attribute.mjs [<sourcemapBuildDir> ...]; defaults to sm-bare sm-nuxt-i18n sm-comvi-nuxt.
const builds =
  process.argv.length > 2 ? process.argv.slice(2) : ["sm-bare", "sm-nuxt-i18n", "sm-comvi-nuxt"];
for (const app of builds) {
  const root = join(app, ".output/public/_nuxt");
  const totals = new Map();
  let total = 0,
    unmapped = 0;
  for (const file of walk(root)) {
    const code = readFileSync(file, "utf8");
    total += Buffer.byteLength(code);
    if (!existsSync(file + ".map")) {
      unmapped += Buffer.byteLength(code);
      continue;
    }
    const map = JSON.parse(readFileSync(file + ".map", "utf8"));
    const lines = code.split("\n");
    const mapLines = map.mappings.split(";");
    let srcIdx = 0;
    for (let li = 0; li < lines.length; li++) {
      const lineLen = Buffer.byteLength(lines[li]) + (li < lines.length - 1 ? 1 : 0);
      const segs = (mapLines[li] || "").split(",").filter(Boolean);
      let col = 0;
      const parsed = [];
      for (const s of segs) {
        const v = decodeVLQ(s);
        col += v[0];
        if (v.length > 1) srcIdx += v[1];
        parsed.push({ col, src: v.length > 1 ? srcIdx : -1 });
      }
      if (!parsed.length) {
        unmapped += lineLen;
        continue;
      }
      // bytes before first segment are unmapped
      unmapped += Buffer.byteLength(lines[li].slice(0, parsed[0].col));
      for (let i = 0; i < parsed.length; i++) {
        const start = parsed[i].col,
          end = i + 1 < parsed.length ? parsed[i + 1].col : lines[li].length;
        const bytes =
          Buffer.byteLength(lines[li].slice(start, end)) +
          (i + 1 === parsed.length && li < lines.length - 1 ? 1 : 0);
        const key = parsed[i].src >= 0 ? pkgOf(map.sources[parsed[i].src] || "") : "(unmapped)";
        if (parsed[i].src < 0) unmapped += bytes;
        totals.set(key, (totals.get(key) || 0) + bytes);
      }
    }
  }
  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n### ${app}: total client JS ${total} B (unmapped ${unmapped} B)`);
  console.log("| package | min bytes |");
  console.log("|---|---|");
  for (const [k, v] of rows) if (v >= 300) console.log(`| ${k} | ${v} |`);
}
