import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const published = JSON.parse(process.env.PUBLISHED_PACKAGES ?? "[]");
if (published.length === 0) {
  console.log("No packages were published — skipping combined release.");
  process.exit(0);
}

const packagesRoot = "packages";
const nameToPath = {};
for (const entry of readdirSync(packagesRoot)) {
  const dir = `${packagesRoot}/${entry}`;
  if (!statSync(dir).isDirectory()) continue;
  try {
    const { name } = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
    if (name) nameToPath[name] = dir;
  } catch {
    // ignore packages without parsable package.json
  }
}

const sorted = [...published].sort((a, b) => {
  if (a.name === "@comvi/core") return -1;
  if (b.name === "@comvi/core") return 1;
  return a.name.localeCompare(b.name);
});

const version = sorted[0].version;
const tag = `v${version}`;
const allSameVersion = sorted.every((p) => p.version === version);

function extractVersionSection(changelog, v) {
  const escaped = v.replace(/\./g, "\\.");
  const re = new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  const match = changelog.match(re);
  return match ? match[1].trim() : "";
}

let body = "";
if (allSameVersion) {
  body += `Released \`${version}\` across all \`@comvi/*\` packages.\n\n`;
} else {
  body += "Released packages:\n";
  for (const pkg of sorted) {
    body += `- \`${pkg.name}@${pkg.version}\`\n`;
  }
  body += "\n";
}

for (const pkg of sorted) {
  const dir = nameToPath[pkg.name];
  if (!dir) continue;
  let changelog;
  try {
    changelog = readFileSync(`${dir}/CHANGELOG.md`, "utf8");
  } catch {
    continue;
  }
  const section = extractVersionSection(changelog, pkg.version);
  if (!section) continue;
  const demoted = section.replace(/^(#{1,5}) /gm, "#$1 ");
  body += `### \`${pkg.name}\`\n\n${demoted}\n\n`;
}

if (!body.trim()) {
  body = `Released packages: ${sorted.map((p) => `\`${p.name}@${p.version}\``).join(", ")}`;
}

console.log(`Creating GitHub Release: ${tag}`);
console.log("---BODY---");
console.log(body);
console.log("---END BODY---");

const result = spawnSync("gh", ["release", "create", tag, "--title", tag, "--notes-file", "-"], {
  input: body,
  stdio: ["pipe", "inherit", "inherit"],
  encoding: "utf8",
});

if (result.status !== 0) {
  console.error(`gh release create exited with code ${result.status}`);
  process.exit(result.status ?? 1);
}
